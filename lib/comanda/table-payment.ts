import { prisma } from '@/lib/prisma';
import { lockComanda } from '@/lib/comanda/add-item';
import { emitClosedBillFor, loadBill } from '@/lib/comanda/bill-service';
import { onlinePaidCents } from '@/lib/comanda/bill';
import { alertOnlineWithoutShift, alertTableOverpaid, alertTablePaid } from './table-payment-alerts';

export type ApplyOutcome = 'applied' | 'closed' | 'already-applied' | 'not-a-table-payment' | 'bill-closed';

/**
 * Pay at the table (spec 2026-10-10 §5.4): an online payment approved by Mercado Pago is added to the bill of
 * its comanda, once, under the comanda lock. The payment that reaches the total closes the bill exactly as a
 * cash-register payment does (lib/comanda/bill-service.ts recordBillPayment). A payment already approved is
 * never refused: over the total, or for a bill already closed, the manager is told to refund it.
 */
export async function applyTablePayment(restaurantId: string, paymentId: string): Promise<{ outcome: ApplyOutcome; overpaidCents: number; withoutShift: boolean }> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, restaurantId, gateway: 'MERCADO_PAGO_CONNECT' },
    select: { id: true, orderSessionId: true, status: true, amount: true, amountRefunded: true },
  });
  if (!payment || !payment.orderSessionId || payment.status !== 'APPROVED') {
    return { outcome: 'not-a-table-payment', overpaidCents: 0, withoutShift: false };
  }
  const sessionId = payment.orderSessionId;

  const result = await prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const before = await loadBill(tx, restaurantId, sessionId);
    const shift = await tx.cashSession.findFirst({ where: { restaurantId, status: 'OPEN' }, orderBy: { openedAt: 'asc' }, select: { id: true } });
    const marked = await tx.payment.updateMany({
      where: { id: payment.id, appliedToBillAt: null },
      data: { appliedToBillAt: new Date(), cashSessionId: shift?.id ?? null },
    });
    if (marked.count === 0) return { outcome: 'already-applied' as const, overpaidCents: 0, withoutShift: false, label: '', totalCents: 0 };
    const withoutShift = !shift;
    const label = before?.label ?? 'Mesa';

    if (!before || before.status === 'CLOSED' || before.status === 'CANCELLED') {
      return { outcome: 'bill-closed' as const, overpaidCents: onlinePaidCents(payment), withoutShift, label, totalCents: 0 };
    }

    await tx.orderSession.update({ where: { id: sessionId }, data: { payAtWaiterRequestedAt: null } });
    const after = (await loadBill(tx, restaurantId, sessionId))!;
    const overpaidCents = Math.max(0, after.paidCents - after.totalCents);
    if (after.remainingCents > 0) return { outcome: 'applied' as const, overpaidCents, withoutShift, label, totalCents: after.totalCents };

    const guard = await tx.orderSession.updateMany({
      where: { id: sessionId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: after.serviceCents, payAtWaiterRequestedAt: null },
    });
    return { outcome: guard.count === 1 ? ('closed' as const) : ('applied' as const), overpaidCents, withoutShift, label, totalCents: after.totalCents };
  });

  if (result.outcome === 'already-applied') return { outcome: result.outcome, overpaidCents: 0, withoutShift: false };

  if (result.outcome === 'closed') {
    try {
      const withCpf = await prisma.payment.findFirst({
        where: { restaurantId, orderSessionId: sessionId, appliedToBillAt: { not: null }, customerDocument: { not: null } },
        orderBy: { appliedToBillAt: 'desc' },
        select: { customerDocument: true },
      });
      const session = await prisma.orderSession.findUnique({ where: { id: sessionId }, select: { customerName: true } });
      await emitClosedBillFor(restaurantId, sessionId, withCpf?.customerDocument ?? null, session?.customerName ?? null);
    } catch (error) {
      // The note never fails the close: the fiscal alert of autoEmitNFCe covers a rejection
      console.error('[table-payment] NFC-e after an online close failed:', error);
    }
    await alertTablePaid(restaurantId, sessionId, result.label, result.totalCents);
  }
  if (result.overpaidCents > 0) await alertTableOverpaid(restaurantId, sessionId, result.label, result.overpaidCents, payment.id);
  if (result.withoutShift) await alertOnlineWithoutShift(restaurantId, sessionId, result.label, onlinePaidCents(payment), payment.id);

  return { outcome: result.outcome, overpaidCents: result.overpaidCents, withoutShift: result.withoutShift };
}
