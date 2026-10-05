import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { buildCashCloseTicket } from '@/lib/caixa/print';

export const dynamic = 'force-dynamic';

/** GET /api/print/cash-session/[id] - the closing report of a CLOSED shift of THIS restaurant. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  const ticket = await buildCashCloseTicket(auth.member.restaurantId, params.id);
  if (!ticket) return NextResponse.json({ error: 'Fechamento não encontrado' }, { status: 404 });
  return NextResponse.json(ticket);
}
