import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { createCardCheckout, resolveBaseUrl } from '@/lib/mercadopago-connect/card-checkout';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { normalizePayer, ONLINE_PAYMENT_UNAVAILABLE } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/** Boleto and ATM/bank-slip payments take days to clear: unsuitable for a delivery order. */
const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm'];

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

    // The claim, the preference and its transaction row: lib/mercadopago-connect/card-checkout.ts
    const out = await createCardCheckout({
      target,
      payer,
      backUrl: (id, result) => `${base}/delivery/${target.restaurantId}?payment=${id}&n=${encodeURIComponent(order.orderNumber)}&result=${result}`,
      itemId: order.orderNumber,
      excludedPaymentTypes: EXCLUDED_PAYMENT_TYPES,
    });
    if (!out.ok) return NextResponse.json({ error: out.error, ...(out.code ? { code: out.code } : {}) }, { status: out.status });
    return NextResponse.json({ success: true, paymentId: out.paymentId, initPoint: out.initPoint });
  } catch (error) {
    console.error('[delivery-checkout] error:', error);
    return NextResponse.json({ error: 'Erro ao iniciar pagamento com cartão' }, { status: 500 });
  }
}
