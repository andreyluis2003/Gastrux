import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DELIVERY_ROLES } from '@/lib/delivery-orders/roles';
import { loadBoard } from '@/lib/orders/board';
import { storeState } from '@/lib/orders/store-open';

export const dynamic = 'force-dynamic';

/** GET /api/pedidos/quadro - every open order of every channel, and whether the store is open (spec 2026-11-07) */
export async function GET() {
  const auth = await requireRestaurantRole([...DELIVERY_ROLES], 'Todos os pedidos é da equipe do salão e do caixa');
  if (!auth.ok) return auth.response;
  const [cards, store] = await Promise.all([loadBoard(auth.member.restaurantId), storeState(auth.member.restaurantId)]);
  return NextResponse.json({ cards, store }, { headers: { 'Cache-Control': 'no-store' } });
}
