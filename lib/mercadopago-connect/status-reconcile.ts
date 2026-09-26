/**
 * Decides when the payment status route may ask Mercado Pago directly instead
 * of waiting for the webhook. Pure (no I/O) so the rules are unit-testable.
 */

/** Only ask Mercado Pago directly once the webhook has had time to arrive. */
export const RECONCILE_AFTER_MS = 30 * 1000;

/** Mercado Pago payment ids are numeric; cap the length so nothing odd reaches the API call. */
const MP_PAYMENT_ID_PATTERN = /^[0-9]{1,20}$/;

/** Statuses a webhook could still move forward; anything else is settled or terminal. */
const RECONCILABLE_STATUSES = ['PENDING', 'PROCESSING'];

/** Returns the id when it looks like a Mercado Pago payment id, otherwise null (never throws). */
export function parseMpPaymentId(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  return MP_PAYMENT_ID_PATTERN.test(raw) ? raw : null;
}

export interface ReconcileCandidate {
  status: string;
  restaurantId: string | null;
  gatewayPaymentId: string | null;
  createdAt: Date;
}

/**
 * The Mercado Pago payment id to re-sync, or null when nothing should be asked.
 * The id recorded on our own row always wins; the id from the customer's return
 * URL (already validated by parseMpPaymentId) is only a fallback for a card
 * payment whose first webhook never arrived. Either way the sync itself
 * re-fetches the payment with the restaurant's own token and requires it to
 * carry our Payment.id as external_reference, so a forged id approves nothing.
 */
export function reconcileTarget(
  payment: ReconcileCandidate,
  mpPaymentIdFromReturn: string | null,
  now: number = Date.now()
): string | null {
  if (!payment.restaurantId) return null;
  if (!RECONCILABLE_STATUSES.includes(payment.status)) return null;
  if (now - payment.createdAt.getTime() <= RECONCILE_AFTER_MS) return null;
  return payment.gatewayPaymentId || mpPaymentIdFromReturn || null;
}
