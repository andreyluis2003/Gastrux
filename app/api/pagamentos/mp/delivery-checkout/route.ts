import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCheckoutPreference } from '@/lib/mercado-pago';
import { getMpClientForRestaurant, markNeedsReconnect } from '@/lib/mercadopago-connect/connection-service';
import { isUnauthorizedError, notificationUrlFor, toMpDate } from '@/lib/mercadopago-connect/payments';
import { CARD_LINK_VALIDITY_MS, CHECKOUT_IN_PROGRESS, claimCardPayment } from '@/lib/mercadopago-connect/card-claim';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { isDefiniteRejection, normalizePayer, ONLINE_PAYMENT_UNAVAILABLE } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/** Boleto and ATM/bank-slip payments take days to clear: unsuitable for a delivery order. */
const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm'];

/**
 * The customer comes back to this origin from Mercado Pago, so it must be an
 * absolute http(s) URL. Checked BEFORE anything is written: a missing or
 * malformed NEXTAUTH_URL would otherwise leave a Payment row and a failed
 * preference behind for a problem the customer cannot fix.
 */
function resolveBaseUrl(): string | null {
  const base = (process.env.NEXTAUTH_URL || '').trim().replace(/\/+$/, '');
  try {
    const { protocol } = new URL(base);
    return protocol === 'http:' || protocol === 'https:' ? base : null;
  } catch {
    return null;
  }
}

/**
 * POST /api/pagamentos/mp/delivery-checkout
 * Public (the customer has no login). Creates a Checkout Pro preference, with
 * the RESTAURANT's own token, for a delivery order the customer chose to pay
 * by card online. The restaurant and the amount come from the order on the
 * server; the browser only names the order.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) || {};

    const resolved = await resolvePixTarget({ orderId: body.orderId });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const target = resolved.target;
    if (!target.orderId) return NextResponse.json({ error: 'Informe orderId' }, { status: 400 });

    const order = await prisma.order.findUnique({
      where: { id: target.orderId },
      select: { orderNumber: true, paymentMethod: true },
    });
    if (!order || order.paymentMethod !== 'ONLINE_CARD') {
      return NextResponse.json({ error: 'Este pedido não usa pagamento com cartão online' }, { status: 409 });
    }

    // The restaurant's own client only. There is deliberately no fallback to the
    // platform token: without a usable connection the card option is unavailable.
    const client = await getMpClientForRestaurant(target.restaurantId);
    if (!client) {
      return NextResponse.json({ error: ONLINE_PAYMENT_UNAVAILABLE, code: 'ONLINE_PAYMENT_UNAVAILABLE' }, { status: 409 });
    }

    const base = resolveBaseUrl();
    if (!base) {
      console.error('[delivery-checkout] NEXTAUTH_URL is missing or not an absolute http(s) URL; no checkout was created.');
      return NextResponse.json({ error: 'Pagamento com cartão indisponível no momento. Tente novamente mais tarde.' }, { status: 500 });
    }

    const payer = normalizePayer({ payerEmail: body.payerEmail, payerName: body.payerName });

    // One live checkout per order: find-or-create under a per-order lock, so a
    // double tap cannot create two payable links (see card-claim.ts).
    const claim = await claimCardPayment(target, payer);
    if (claim.kind === 'in-progress') {
      return NextResponse.json({ error: CHECKOUT_IN_PROGRESS, code: 'CHECKOUT_IN_PROGRESS' }, { status: 409 });
    }
    if (claim.kind === 'reuse') {
      return NextResponse.json({ success: true, paymentId: claim.payment.id, initPoint: claim.initPoint });
    }
    const payment = claim.payment;

    const back = (result: string) =>
      `${base}/delivery/${target.restaurantId}?payment=${payment.id}&n=${encodeURIComponent(order.orderNumber)}&result=${result}`;

    let preference: any;
    try {
      preference = await createCheckoutPreference(
        {
          orderId: target.orderId,
          items: [{ id: order.orderNumber, title: target.description, quantity: 1, unitPrice: target.amount }],
          payer: { email: payer.email, name: payer.name },
          backUrls: { success: back('success'), failure: back('failure'), pending: back('pending') },
          notificationUrl: notificationUrlFor(target.restaurantId),
          externalReference: payment.id,
          autoReturn: 'approved',
          excludedPaymentTypes: EXCLUDED_PAYMENT_TYPES,
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
        await markNeedsReconnect(target.restaurantId, 'Mercado Pago rejeitou o token (401)');
        return NextResponse.json({ error: ONLINE_PAYMENT_UNAVAILABLE, code: 'ONLINE_PAYMENT_UNAVAILABLE' }, { status: 409 });
      }
      console.error('[delivery-checkout] preference creation failed:', error);
      return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, { status: 502 });
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
      console.error(`[delivery-checkout] preference created but its transaction row was not stored (payment ${payment.id}):`, error);
    }

    return NextResponse.json({ success: true, paymentId: payment.id, initPoint: preference.init_point });
  } catch (error) {
    console.error('[delivery-checkout] error:', error);
    return NextResponse.json({ error: 'Erro ao iniciar pagamento com cartão' }, { status: 500 });
  }
}
