// @ts-nocheck
/**
 * Mercado Pago Refund API
 * POST /api/pagamentos/mp/refund
 *
 * Refunds a Mercado Pago payment (full or partial)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { refundPayment } from '@/lib/mercado-pago';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { refundConnectPayment } from '@/lib/mercadopago-connect/payments';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only OWNER, ADMIN, MANAGER can process refunds
    if (!['OWNER', 'ADMIN', 'MANAGER'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Insufficient permissions to process refunds' },
        { status: 403 }
      );
    }

    const { paymentId, amount, reason, description } = await request.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // A provided amount must be a positive number: 0 or garbage must never fall through to a full refund.
    if (amount !== undefined && amount !== null && amount !== '') {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ error: 'Valor de reembolso inválido' }, { status: 400 });
      }
    }

    // The payment must belong to the caller's own restaurant - otherwise
    // any OWNER/ADMIN/MANAGER could refund another restaurant's payment.
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    // Find the payment
    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, restaurantId },
      include: { mercadoPagoData: true, refunds: true },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (payment.status !== 'APPROVED' && payment.status !== 'SETTLED') {
      return NextResponse.json(
        { error: `Cannot refund payment with status: ${payment.status}` },
        { status: 400 }
      );
    }

    const totalRefunded = payment.refunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const remainingAmount = Number(payment.amount) - totalRefunded;

    if (amount && Number(amount) > remainingAmount) {
      return NextResponse.json(
        { error: `Refund amount exceeds remaining balance: ${remainingAmount}` },
        { status: 400 }
      );
    }

    const refundAmount = amount ? Number(amount) : remainingAmount;

    // Nothing left to refund. Without this guard a third call after a full
    // refund computed refundAmount = 0 and reached refundConnectPayment /
    // refundPayment with an undefined amount, which is a FULL refund request
    // against the restaurant's account. Mirrors lib/payment-unified.ts.
    if (!(refundAmount > 0)) {
      return NextResponse.json({ error: 'Nada a reembolsar' }, { status: 400 });
    }

    // Counted against what was ALREADY refunded: refunding 60 of 100 and then
    // the remaining 40 must end as REFUNDED, not PARTIALLY_REFUNDED.
    const isFullRefund = totalRefunded + refundAmount >= Number(payment.amount);

    // An identical repeated request (double click, client retry after a
    // timeout) maps to the SAME key, so Mercado Pago refunds only once.
    const idempotencyKey = `refund:${payment.id}:${totalRefunded}:${refundAmount}`;

    // Get MP payment ID. Payments received by a restaurant through its own
    // Mercado Pago account (MERCADO_PAGO_CONNECT) keep it in gatewayPaymentId.
    const isConnect = payment.gateway === 'MERCADO_PAGO_CONNECT';
    const mpPaymentId = isConnect ? payment.gatewayPaymentId : payment.mercadoPagoData?.mpPaymentId;
    if (!mpPaymentId) {
      return NextResponse.json(
        { error: 'Mercado Pago payment ID not found' },
        { status: 400 }
      );
    }

    // Process refund via MP API - with the restaurant's own token for Connect payments.
    let mpRefund;
    if (isConnect) {
      const client = await getMpClientForRestaurant(restaurantId);
      if (!client) {
        return NextResponse.json(
          { error: 'Conexão com o Mercado Pago indisponível. Reconecte sua conta para reembolsar.' },
          { status: 409 }
        );
      }
      mpRefund = await refundConnectPayment(
        client,
        mpPaymentId,
        amount ? Number(amount) : undefined,
        idempotencyKey
      );
    } else {
      mpRefund = await refundPayment(mpPaymentId, amount ? Number(amount) : undefined);
    }

    // Create refund record
    const refund = await prisma.paymentRefund.create({
      data: {
        paymentId: payment.id,
        amount: refundAmount,
        currency: payment.currency,
        reason: reason || 'requested_by_customer',
        gateway: payment.gateway,
        gatewayRefundId: String(mpRefund.id),
        status: 'completed',
        description: description || `Refund for payment ${payment.id}`,
        processedById: session.user.id,
        completedAt: new Date(),
      },
    });

    // Update payment status
    const newStatus = isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus,
        amountRefunded: totalRefunded + refundAmount,
        refundedAt: new Date(),
      },
    });

    // A fully refunded payment must not leave its order showing as paid in the
    // KDS/POS. Idempotent and restaurantId-scoped, and only from APPROVED; a
    // PARTIAL refund keeps the order APPROVED.
    if (newStatus === 'REFUNDED' && payment.orderId) {
      await prisma.order.updateMany({
        where: { id: payment.orderId, restaurantId, paymentStatus: 'APPROVED' },
        data: { paymentStatus: 'REFUNDED' },
      });
    }

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/refund', 200, duration);

    return NextResponse.json({
      refundId: refund.id,
      paymentId: payment.id,
      amount: refundAmount,
      status: newStatus,
      gatewayRefundId: mpRefund.id,
      remainingBalance: Number(payment.amount) - totalRefunded - refundAmount,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/refund', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/refund',
    });
    console.error('[MP Refund] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
