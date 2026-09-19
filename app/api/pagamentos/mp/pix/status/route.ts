import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncRestaurantPayment } from '@/lib/mercadopago-connect/payment-sync';

export const dynamic = 'force-dynamic';

/** Only ask Mercado Pago directly once the webhook has had time to arrive. */
const RECONCILE_AFTER_MS = 30 * 1000;

const SELECT = { id: true, status: true, restaurantId: true, gatewayPaymentId: true, createdAt: true } as const;

/**
 * GET /api/pagamentos/mp/pix/status?paymentId=<our Payment.id>
 * Reads OUR database (updated by the webhook). Returns only the status:
 * no payer data, and no Mercado Pago lookup by a caller-supplied id.
 */
export async function GET(request: NextRequest) {
  const paymentId = new URL(request.url).searchParams.get('paymentId');
  if (!paymentId) return NextResponse.json({ error: 'paymentId obrigatório' }, { status: 400 });

  let payment = await prisma.payment.findFirst({
    where: { id: paymentId, gateway: 'MERCADO_PAGO_CONNECT' },
    select: SELECT,
  });
  if (!payment) return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });

  const webhookIsLate =
    payment.status === 'PENDING' &&
    payment.restaurantId &&
    payment.gatewayPaymentId &&
    Date.now() - payment.createdAt.getTime() > RECONCILE_AFTER_MS;

  if (webhookIsLate) {
    try {
      await syncRestaurantPayment(payment.restaurantId!, payment.gatewayPaymentId!);
      payment = (await prisma.payment.findUnique({ where: { id: payment.id }, select: SELECT })) ?? payment;
    } catch (error) {
      console.error('[mp-connect] status reconcile failed:', error);
    }
  }

  const approved = payment.status === 'APPROVED';
  return NextResponse.json({ status: approved ? 'approved' : payment.status.toLowerCase(), approved });
}
