/**
 * What the table menu needs from the URL the customer lands on after the card checkout (stage 3). Pure.
 * Only ?payment (our Payment id) identifies the payment; Mercado Pago's payment_id / collection_id is a hint
 * for our status route. Approval is never read from the URL: only `result=failure` is shown as such.
 */
const DIGITS = /^[0-9]{1,20}$/;

export function readTableCardReturn(search: string): { paymentId: string; mpPaymentId: string | null; failed: boolean } | null {
  const q = new URLSearchParams(search);
  const paymentId = q.get('payment');
  if (!paymentId) return null;
  const mp = q.get('payment_id') || q.get('collection_id');
  return { paymentId, mpPaymentId: mp && DIGITS.test(mp) ? mp : null, failed: q.get('result') === 'failure' };
}
