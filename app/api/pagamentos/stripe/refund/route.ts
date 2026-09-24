// @ts-nocheck
/**
 * Stripe Refund (for connected accounts)
 * POST /api/pagamentos/stripe/refund
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { createRefund, isStripeConnectConfigured } from '@/lib/stripe-connect';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // A manager of THIS restaurant (the global session role let the owner of another restaurant
    // who is only a cashier here refund)
    const auth = await requireRestaurantRole(MANAGER_ROLES, 'Insufficient permissions to process refunds');
    if (!auth.ok) return auth.response;

    const { paymentId, amount, reason, description } = await request.json();

    if (!paymentId) {
      return NextResponse.json(
        { error: 'Payment ID is required' },
        { status: 400 }
      );
    }

    // The payment must belong to the caller's own restaurant - otherwise
    // any OWNER/ADMIN/MANAGER could refund another restaurant's payment.
    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    const payment = await prisma.payment.findFirst({
      where: { id: paymentId, restaurantId },
      include: { stripeData: true, refunds: true },
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

    const chargeId = payment.stripeData?.stripeChargeId;
    if (!chargeId) {
      return NextResponse.json(
        { error: 'Stripe charge ID not found' },
        { status: 400 }
      );
    }

    const totalRefunded = payment.refunds
      .filter(r => r.status === 'completed')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    const remainingAmount = Number(payment.amount) - totalRefunded;
    const refundAmount = amount ? Number(amount) : remainingAmount;

    if (refundAmount > remainingAmount) {
      return NextResponse.json(
        { error: `Refund amount exceeds remaining balance: ${remainingAmount}` },
        { status: 400 }
      );
    }

    const refundAmountCents = Math.round(refundAmount * 100);
    const isFullRefund = refundAmount >= Number(payment.amount);

    // Process refund via Stripe
    const stripeRefund = await createRefund(
      chargeId,
      amount ? refundAmountCents : undefined,
      (reason || 'requested_by_customer') as any
    );

    // Create refund record
    const refund = await prisma.paymentRefund.create({
      data: {
        paymentId: payment.id,
        amount: refundAmount,
        currency: payment.currency,
        reason: reason || 'requested_by_customer',
        gateway: 'STRIPE_CONNECT',
        gatewayRefundId: stripeRefund.id,
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
    trackApiCall('POST', '/api/pagamentos/stripe/refund', 200, duration);

    return NextResponse.json({
      refundId: refund.id,
      paymentId: payment.id,
      amount: refundAmount,
      status: newStatus,
      gatewayRefundId: stripeRefund.id,
      remainingBalance: remainingAmount - refundAmount,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/stripe/refund', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/stripe/refund',
    });
    console.error('[Stripe Refund] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
