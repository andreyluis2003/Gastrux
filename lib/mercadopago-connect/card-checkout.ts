import { prisma } from '@/lib/prisma';
import { createCheckoutPreference } from '@/lib/mercado-pago';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { isUnauthorizedError, unauthorizedReason, notificationUrlFor, toMpDate } from './payments';
import { CARD_LINK_VALIDITY_MS, CHECKOUT_IN_PROGRESS, claimCardPayment } from './card-claim';
import { isDefiniteRejection, ONLINE_PAYMENT_UNAVAILABLE } from './pix-service';
import { MP_FAILED_STATUS } from './http-status';
import type { ResolvedPixTarget } from './pix-target';

/**
 * The customer comes back to this origin from Mercado Pago, so it must be an
 * absolute http(s) URL. Checked BEFORE anything is written: a missing or
 * malformed NEXTAUTH_URL would otherwise leave a Payment row and a failed
 * preference behind for a problem the customer cannot fix.
 */
export function resolveBaseUrl(): string | null {
  const base = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '');
  try {
    const { protocol } = new URL(base);
    return protocol === 'http:' || protocol === 'https:' ? base : null;
  } catch {
    return null;
  }
}

export type CardCheckoutResult = { ok: true; paymentId: string; initPoint: string } | { ok: false; status: number; error: string; code?: string };

/**
 * A Checkout Pro link, with the RESTAURANT's own token, for a delivery order or one part of a table bill
 * (stage 3). The restaurant and the amount come from the target, resolved on the server. Shared by
 * app/api/pagamentos/mp/delivery-checkout and app/api/public/table/[qrToken]/pay.
 */
export async function createCardCheckout(input: {
  target: ResolvedPixTarget;
  payer: { email: string; name?: string };
  backUrl: (paymentId: string, result: 'success' | 'failure' | 'pending') => string;
  itemId: string;
  excludedPaymentTypes: string[];
}): Promise<CardCheckoutResult> {
  const { target, payer } = input;
  // A table part is claimed per phone: without its key it could take another phone's checkout
  if (target.sessionId && !target.payerKey) return { ok: false, status: 422, error: 'Recarregue a página e tente de novo.' };

  // The restaurant's own client only. There is deliberately no fallback to the
  // platform token: without a usable connection the card option is unavailable.
  const client = await getMpClientForRestaurant(target.restaurantId);
  if (!client) return { ok: false, status: 409, error: ONLINE_PAYMENT_UNAVAILABLE, code: 'ONLINE_PAYMENT_UNAVAILABLE' };

  // One live checkout per order, or per phone and part at the table: find-or-create under a lock, so a
  // double tap cannot create two payable links (see card-claim.ts).
  const claim = await claimCardPayment(target, payer);
  if (claim.kind === 'in-progress') return { ok: false, status: 409, error: CHECKOUT_IN_PROGRESS, code: 'CHECKOUT_IN_PROGRESS' };
  if (claim.kind === 'reuse') return { ok: true, paymentId: claim.payment.id, initPoint: claim.initPoint };
  const payment = claim.payment;

  let preference: any;
  try {
    preference = await createCheckoutPreference(
      {
        // Not sent to Mercado Pago (the external reference identifies the payment); a table part has no order
        orderId: target.orderId ?? payment.id,
        items: [{ id: input.itemId, title: target.description, quantity: 1, unitPrice: target.amount }],
        payer: { email: payer.email, name: payer.name },
        backUrls: { success: input.backUrl(payment.id, 'success'), failure: input.backUrl(payment.id, 'failure'), pending: input.backUrl(payment.id, 'pending') },
        notificationUrl: notificationUrlFor(target.restaurantId),
        externalReference: payment.id,
        autoReturn: 'approved',
        excludedPaymentTypes: input.excludedPaymentTypes,
        // The link stops working after CARD_LINK_VALIDITY_MS, which is what makes
        // the reuse window in card-claim.ts safe: an older checkout is dead, so
        // creating a new one cannot leave two payable links for long.
        expires: true,
        // Backdated a minute: a clock a few seconds ahead of ours must not make the link "not active yet".
        expirationDateFrom: toMpDate(new Date(Date.now() - 60_000)),
        expirationDateTo: toMpDate(new Date(Date.now() + CARD_LINK_VALIDITY_MS)),
      },
      client
    );
  } catch (error) {
    // Cancel only when Mercado Pago DEFINITELY rejected the request (a 4xx):
    // then no preference exists. A timeout, a socket error or a 5xx is
    // ambiguous - the preference may have been created server-side - and a
    // CANCELLED row can no longer transition to APPROVED, so a real payment
    // would go unrecorded. In that case the row stays PENDING and the
    // webhook (external_reference = this Payment id) reconciles it.
    if (isDefiniteRejection(error)) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});
    }
    if (isUnauthorizedError(error)) {
      await markNeedsReconnect(target.restaurantId, unauthorizedReason(error));
      return { ok: false, status: 409, error: ONLINE_PAYMENT_UNAVAILABLE, code: 'ONLINE_PAYMENT_UNAVAILABLE' };
    }
    console.error('[card-checkout] preference creation failed:', error);
    return { ok: false, status: MP_FAILED_STATUS, error: 'Não foi possível iniciar o pagamento. Tente novamente.' };
  }

  // Mercado Pago accepted: the preference exists and carries this Payment id
  // as external_reference. From here the row must NEVER be cancelled, even if
  // a local write fails: the customer can still pay through the link we
  // return, and the webhook needs a PENDING row to record it.
  try {
    await prisma.mercadoPagoTransaction.create({
      data: {
        paymentId: payment.id,
        preferenceId: preference.id,
        externalReference: payment.id,
        initPoint: preference.init_point,
        sandboxInitPoint: preference.sandbox_init_point,
      },
    });
  } catch (error) {
    console.error(`[card-checkout] preference created but its transaction row was not stored (payment ${payment.id}):`, error);
  }

  return { ok: true, paymentId: payment.id, initPoint: preference.init_point };
}
