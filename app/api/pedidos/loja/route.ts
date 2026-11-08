import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { setStoreClosed, storeState } from '@/lib/orders/store-open';

export const dynamic = 'force-dynamic';
const DENIED = 'Abrir e fechar a loja é da equipe do caixa e do salão';

/** GET - loja aberta ou fechada */
export async function GET() {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  return NextResponse.json(await storeState(auth.member.restaurantId), { headers: { 'Cache-Control': 'no-store' } });
}

/** POST { fechada: boolean } (spec 2026-11-07 quadro-de-pedidos §A) */
export async function POST(req: NextRequest) {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], DENIED);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.fechada !== 'boolean') return NextResponse.json({ error: 'Diga se a loja fica aberta ou fechada' }, { status: 400 });
  const result = await setStoreClosed(auth.member, body.fechada);
  if (!result) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
  // The state after it: opening by hand outside the hours still leaves it closed by the hours (spec 2026-11-08)
  return NextResponse.json({ ...result, state: await storeState(auth.member.restaurantId) }, { headers: { 'Cache-Control': 'no-store' } });
}
