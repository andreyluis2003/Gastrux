import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { loadBill, setServiceWaived } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

const FRONT = ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'] as const;

/** GET: the bill (items, service charge, payments, what is left) — spec 2026-10-07, 4.3 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...FRONT]);
  if (!auth.ok) return auth.response;
  const bill = await loadBill(prisma, auth.member.restaurantId, params.id);
  if (!bill) return NextResponse.json({ error: 'Comanda não encontrada' }, { status: 404 });
  return NextResponse.json(bill, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** PATCH { serviceChargeWaived }: the customer declines or accepts the service charge */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...FRONT]);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.serviceChargeWaived !== 'boolean') return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  try {
    return NextResponse.json(await setServiceWaived(auth.member, params.id, body.serviceChargeWaived));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
