/**
 * Reads what the delivery page needs from the URL the customer lands on after
 * Mercado Pago's card checkout. Pure (takes the query string) so it is testable.
 *
 * Only ?payment=<our Payment.id> and ?n=<order number> identify the payment.
 * Mercado Pago also appends payment_id (and collection_id): that id is passed on
 * to our status route as a hint for a card whose webhook never arrived. The
 * query's status/collection_status/result are deliberately NOT read: whether the
 * payment was approved is only ever answered by our own status route.
 */
export interface PaymentReturnParams {
  paymentId: string;
  orderNumber: string;
  /** Mercado Pago's payment id (digits only), or null when the URL has none. */
  mpPaymentId: string | null;
}

const DIGITS = /^[0-9]{1,20}$/;

export function readPaymentReturnParams(search: string): PaymentReturnParams | null {
  const query = new URLSearchParams(search);
  const paymentId = query.get('payment');
  const orderNumber = query.get('n');
  if (!paymentId || !orderNumber) return null;

  const fromUrl = query.get('payment_id') || query.get('collection_id');
  return { paymentId, orderNumber, mpPaymentId: fromUrl && DIGITS.test(fromUrl) ? fromUrl : null };
}

/** URL of the status poll: our payment id, plus Mercado Pago's payment id from the return URL when there is one. */
export function statusPollUrl(paymentId: string, mpPaymentId?: string | null): string {
  const base = `/api/pagamentos/mp/pix/status?paymentId=${encodeURIComponent(paymentId)}`;
  return mpPaymentId ? `${base}&mpPaymentId=${encodeURIComponent(mpPaymentId)}` : base;
}
