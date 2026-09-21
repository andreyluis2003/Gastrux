import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncRestaurantPayment } from '@/lib/mercadopago-connect/payment-sync';
import { parseMpPaymentId, reconcileTarget } from '@/lib/mercadopago-connect/status-reconcile';

export const dynamic = 'force-dynamic';

const SELECT = { id: true, status: true, restaurantId: true, gatewayPaymentId: true, createdAt: true } as const;

/**
 * GET /api/pagamentos/mp/pix/status?paymentId=<our Payment.id>[&mpPaymentId=<digits>]
 * Reads OUR database (updated by the webhook). Returns only the status:
 * no payer data, and nothing from the query is ever echoed back.
 *
 * mpPaymentId is the payment id Mercado Pago puts on the card checkout's return
 * URL. It only matters for a card payment whose webhook never arrived (our row
 * has no Mercado Pago id yet): the sync fetches that id with the RESTAURANT's
 * token and applies it only if its external_reference is this very payment, so
 * the id is a hint, never proof.
 */
export async function GET(request: NextRequest) {
  const paymentId = new URL(request.url).searchParams.get('paymentId');
  if (!paymentId) return NextResponse.json({ error: 'paymentId obrigatório' }, { status: 400 });

  let payment = await prisma.payment.findFirst({
    where: { id: paymentId, gateway: 'MERCADO_PAGO_CONNECT' },
    select: SELECT,
  });
  if (!payment) return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });

  const mpPaymentId = reconcileTarget(payment, parseMpPaymentId(new URL(request.url).searchParams.get('mpPaymentId')));

  if (mpPaymentId) {
    try {
      // The restaurant comes from OUR row, never from the query.
      await syncRestaurantPayment(payment.restaurantId!, mpPaymentId);
      payment = (await prisma.payment.findUnique({ where: { id: payment.id }, select: SELECT })) ?? payment;
    } catch (error) {
      console.error('[mp-connect] status reconcile failed:', error);
    }
  }

  const approved = payment.status === 'APPROVED';
  return NextResponse.json({ status: approved ? 'approved' : payment.status.toLowerCase(), approved });
}
