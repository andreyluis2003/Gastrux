import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { buildCashEntryTicket } from '@/lib/caixa/print';

export const dynamic = 'force-dynamic';

/** GET /api/print/cash-entry/[id] - the receipt of a sangria / suprimento / despesa / ajuste of THIS restaurant. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  const ticket = await buildCashEntryTicket(auth.member.restaurantId, params.id);
  if (!ticket) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 });
  return NextResponse.json(ticket);
}
