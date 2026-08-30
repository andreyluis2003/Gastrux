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
import { refundPayment } from '@/lib/mercado-pago';
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

    // Find the payment
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
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
    const isFullRefund = refundAmount >= Number(payment.amount);

    // Get MP payment ID
    const mpPaymentId = payment.mercadoPagoData?.mpPaymentId;
    if (!mpPaymentId) {
      return NextResponse.json(
        { error: 'Mercado Pago payment ID not found' },
        { status: 400 }
      );
    }

    // Process refund via MP API
    const mpRefund = await refundPayment(
      mpPaymentId,
      amount ? Number(amount) : undefined
    );

    // Create refund record
    const refund = await prisma.paymentRefund.create({
      data: {
        paymentId: payment.id,
        amount: refundAmount,
        currency: payment.currency,
        reason: reason || 'requested_by_customer',
        gateway: 'MERCADO_PAGO',
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
