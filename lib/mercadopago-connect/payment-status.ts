/**
 * Allowed Payment status transitions for payments driven by Mercado Pago
 * notifications. A notification that would repeat the current status, go
 * backwards, or leave a terminal state is ignored, which makes duplicate and
 * out-of-order webhooks harmless (no double credit).
 *
 * DECLINED -> APPROVED/PROCESSING is allowed because Checkout Pro lets the
 * customer retry after a rejected attempt.
 *
 * CANCELLED -> APPROVED is allowed so that money Mercado Pago really received
 * after we gave up on a payment is RECORDED (and can be refunded through the
 * refund route, which needs an APPROVED payment) instead of being dropped
 * silently. payment-sync raises a critical operator alert whenever it happens.
 */
const ALLOWED: Record<string, string[]> = {
  PENDING: ['PROCESSING', 'APPROVED', 'DECLINED', 'CANCELLED'],
  PROCESSING: ['APPROVED', 'DECLINED', 'CANCELLED'],
  DECLINED: ['PROCESSING', 'APPROVED'],
  CANCELLED: ['APPROVED'],
  APPROVED: ['REFUNDED', 'CHARGEBACK'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'CHARGEBACK'],
};

export function canTransition(from: string, to: string): boolean {
  return from !== to && (ALLOWED[from] ?? []).includes(to);
}
