import { prisma } from '@/lib/prisma';
import { getConnectPayment } from '@/lib/mercadopago-connect/payments';

/** Statuses a refund may write over; a chargeback or a cancelled payment is never turned into a refund */
const REFUND_WRITABLE = ['APPROVED', 'SETTLED', 'PARTIALLY_REFUNDED', 'REFUNDED'];

/**
 * Records, once, a refund Mercado Pago has already made. The "Estornar" button and the Mercado Pago notice
 * may both report the same refund, in either order (prod 2026-10-12: the notice arrived alone and the
 * payment became REFUNDED with no refund record and amountRefunded 0). Under a per-payment lock: a refund
 * whose Mercado Pago id is already recorded is not recorded again, and what Mercado Pago says was refunded
 * in total but is not recorded yet becomes one refund record. The payment's amountRefunded, refundedAt and
 * status follow what is recorded.
 */
export async function recordGatewayRefund(input: {
  paymentId: string;
  /** What Mercado Pago says was refunded in total for this payment, in reais */
  refundedTotal: number;
  /** Mercado Pago's id of the refund being reported (null when unknown) */
  gatewayRefundId: string | null;
  processedById?: string | null;
  reason?: string;
  description?: string;
}): Promise<{ status: 'REFUNDED' | 'PARTIALLY_REFUNDED'; refundId: string | null; created: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'refund-record:' + input.paymentId}))`;
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: input.paymentId }, include: { refunds: true } });
    const completed = payment.refunds.filter((r) => r.status === 'completed');
    const recordedCents = completed.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);
    const totalCents = Math.min(Math.round(input.refundedTotal * 100), Math.round(Number(payment.amount) * 100));
    const known = input.gatewayRefundId ? completed.find((r) => r.gatewayRefundId === input.gatewayRefundId) : undefined;

    let refundId = known?.id ?? null;
    let created = false;
    const missingCents = totalCents - recordedCents;
    if (missingCents > 0) {
      const refund = await tx.paymentRefund.create({
        data: {
          paymentId: payment.id,
          amount: missingCents / 100,
          currency: payment.currency,
          reason: input.reason ?? 'requested_by_restaurant',
          gateway: payment.gateway,
          // An id already recorded belongs to another record: this one is the rest Mercado Pago reports
          gatewayRefundId: known ? null : input.gatewayRefundId,
          status: 'completed',
          description: input.description ?? `Refund for payment ${payment.id}`,
          processedById: input.processedById ?? null,
          completedAt: new Date(),
        },
      });
      refundId = refund.id;
      created = true;
    }

    const nowCents = Math.max(recordedCents, totalCents);
    const status = nowCents >= Math.round(Number(payment.amount) * 100) ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await tx.payment.updateMany({
      where: { id: payment.id, status: { in: REFUND_WRITABLE as any } },
      data: { status, amountRefunded: nowCents / 100, refundedAt: payment.refundedAt ?? new Date() },
    });
    return { status, refundId, created };
  });
}

/**
 * After a refund call that failed, asks Mercado Pago whether the payment is refunded up to `expectedTotal`
 * anyway (the refund may be done and only the answer lost). Returns the id of its latest refund, or null
 * when it is not refunded, or when Mercado Pago cannot be asked: then the error stands.
 */
export async function refundAlreadyDone(client: any, mpPaymentId: string, expectedTotal: number): Promise<{ refundId: string | null } | null> {
  try {
    const mp: any = await getConnectPayment(client, mpPaymentId);
    const refundedCents = Math.round(Number(mp?.transaction_amount_refunded ?? 0) * 100);
    if (refundedCents <= 0 || refundedCents < Math.round(expectedTotal * 100)) return null;
    const last = Array.isArray(mp?.refunds) && mp.refunds.length ? mp.refunds[mp.refunds.length - 1] : null;
    return { refundId: last?.id != null ? String(last.id) : null };
  } catch {
    return null;
  }
}
