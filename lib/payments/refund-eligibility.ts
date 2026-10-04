/**
 * Which payments the dashboard may refund, shared by the refund route and the "Estornar" button so the
 * two can never disagree. Only Mercado Pago payments: the refund route talks to Mercado Pago alone.
 */

export const REFUNDABLE_GATEWAYS = ['MERCADO_PAGO', 'MERCADO_PAGO_CONNECT'] as const;

/** PARTIALLY_REFUNDED stays refundable: refunding 60 of 100 and later the other 40 must be possible. */
export const REFUNDABLE_STATUSES = ['APPROVED', 'SETTLED', 'PARTIALLY_REFUNDED'] as const;

export interface RefundablePayment {
  gateway: string;
  status: string;
  amount: number | string;
  refunds?: Array<{ amount: number | string; status: string }>;
}

/** What is still refundable, in reais with 2 decimals (completed refunds only). */
export function refundableAmount(payment: RefundablePayment): number {
  const refunded = (payment.refunds || [])
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + Number(r.amount), 0);
  return Math.max(0, Math.round((Number(payment.amount) - refunded) * 100) / 100);
}

export function isRefundable(payment: RefundablePayment): boolean {
  return (
    (REFUNDABLE_GATEWAYS as readonly string[]).includes(payment.gateway) &&
    (REFUNDABLE_STATUSES as readonly string[]).includes(payment.status) &&
    refundableAmount(payment) > 0
  );
}
