import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { CASHIER_PLUS, isManager } from '@/lib/caixa/roles';
import { buildCashCloseTicket } from '@/lib/caixa/print';

export const dynamic = 'force-dynamic';

/**
 * GET /api/print/cash-session/[id] - the closing report of a CLOSED shift of THIS restaurant. A manager any shift; a
 * cashier only the one he closed (it prints on close), never another operator's expected and difference (2026-10-26).
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  if (!isManager(auth.member.role)) {
    const s = await prisma.cashSession.findFirst({ where: { id: params.id, restaurantId: auth.member.restaurantId }, select: { closedById: true } });
    if (s && s.closedById !== auth.member.userId) return NextResponse.json({ error: 'O histórico de caixas é do gerente' }, { status: 403 });
  }
  const ticket = await buildCashCloseTicket(auth.member.restaurantId, params.id);
  if (!ticket) return NextResponse.json({ error: 'Fechamento não encontrado' }, { status: 404 });
  return NextResponse.json(ticket);
}
