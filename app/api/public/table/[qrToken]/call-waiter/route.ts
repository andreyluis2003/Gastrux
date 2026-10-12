import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sessionLabel } from '@/lib/vender/rules';
import { alertTableCallsWaiter } from '@/lib/comanda/table-payment-alerts';
import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentPlanAllows } from '@/lib/mercadopago-connect/table-payment-access';

export const dynamic = 'force-dynamic';

const OPEN = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;
const ONE_MINUTE_MS = 60_000;

/**
 * POST: the table asks to pay with the waiter (spec 2026-10-10 §5.4). Stamps the comanda (cleared by a payment
 * or when the bill closes, lib/comanda/table-payment.ts) and alerts the staff, at most once a minute per table:
 * the stamp is written only when it is empty or older than a minute, so taps at the same instant alert once.
 */
export async function POST(_req: NextRequest, { params }: { params: { qrToken: string } }) {
  const table = await prisma.table.findUnique({ where: { qrToken: params.qrToken }, select: { id: true, number: true, restaurantId: true } });
  if (!table) return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
  if (!(await tablePaymentPlanAllows(table.restaurantId))) return NextResponse.json({ error: TABLE_PAYMENT_UNAVAILABLE }, { status: 403 });

  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: [...OPEN] } },
    orderBy: { openedAt: 'desc' },
    select: { id: true, tableNumber: true, customerName: true },
  });
  if (!session) return NextResponse.json({ error: 'Esta mesa ainda não tem conta aberta. Chame o garçom.' }, { status: 409 });

  const now = new Date();
  const stamped = await prisma.orderSession.updateMany({
    where: { id: session.id, OR: [{ payAtWaiterRequestedAt: null }, { payAtWaiterRequestedAt: { lt: new Date(now.getTime() - ONE_MINUTE_MS) } }] },
    data: { payAtWaiterRequestedAt: now },
  });
  if (stamped.count === 0) return NextResponse.json({ called: false, alreadyCalled: true });

  await alertTableCallsWaiter(table.restaurantId, session.id, sessionLabel({ table: { number: table.number }, tableNumber: session.tableNumber, customerName: session.customerName }), now);
  return NextResponse.json({ called: true });
}
