// @ts-nocheck
/**
 * Stripe Payment Intent (for connected accounts)
 * POST /api/pagamentos/stripe/payment-intent
 * GET  /api/pagamentos/stripe/payment-intent?id=pi_xxx
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  createPaymentIntent,
  retrievePaymentIntent,
  isStripeConnectConfigured,
  mapStripePaymentStatus,
} from '@/lib/stripe-connect';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStripeConnectConfigured()) {
      return NextResponse.json(
        { error: 'Stripe Connect not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      amount,
      description,
      customerEmail,
      customerName,
      metadata,
      paymentMethodTypes,
      applicationFeePercent = 2.9,
    } = body;

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be greater than 0' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { restaurants: { include: { restaurant: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const restaurant = user.restaurants?.[0]?.restaurant;
    if (!restaurant?.stripeAccountId) {
      return NextResponse.json(
        { error: 'Restaurant not connected to Stripe' },
        { status: 400 }
      );
    }

    const amountInCents = Math.round(amount * 100);
    const applicationFeeAmount = Math.round(amountInCents * (applicationFeePercent / 100));

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        restaurantId: restaurant.id,
        gateway: 'STRIPE_CONNECT',
        amount: amount,
        currency: 'BRL',
        method: 'STRIPE',
        status: 'PENDING',
        description: description || 'Stripe payment',
        customerEmail: customerEmail || user.email,
        customerName: customerName || user.name,
        platformFee: applicationFeeAmount / 100,
        metadata: JSON.stringify({
          ...metadata,
          stripeAccountId: restaurant.stripeAccountId,
          applicationFeePercent,
        }),
      },
    });

    // Create Stripe Payment Intent
    const paymentIntent = await createPaymentIntent({
      amount: amountInCents,
      currency: 'brl',
      connectedAccountId: restaurant.stripeAccountId,
      applicationFeeAmount,
      description: description || `Payment ${payment.id}`,
      metadata: {
        paymentId: payment.id,
        restaurantId: restaurant.id,
        ...metadata,
      },
      paymentMethodTypes: paymentMethodTypes || ['card', 'pix'],
      receiptEmail: customerEmail || user.email,
    });

    // Create StripeTransaction record
    await prisma.stripeTransaction.create({
      data: {
        paymentId: payment.id,
        stripePaymentIntentId: paymentIntent.id,
        stripeStatus: paymentIntent.status,
        paymentMethodType: paymentMethodTypes?.[0] || 'card',
      },
    });

    // Update payment with gateway ID
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId: paymentIntent.id,
        netAmount: amount - (applicationFeeAmount / 100),
      },
    });

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/stripe/payment-intent', 201, duration);

    return NextResponse.json({
      paymentId: payment.id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountInCents / 100,
      currency: 'BRL',
      status: paymentIntent.status,
    }, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/stripe/payment-intent', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/stripe/payment-intent',
    });
    console.error('[Stripe Payment Intent] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment intent' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const paymentIntentId = url.searchParams.get('id');

    if (!paymentIntentId) {
      return NextResponse.json(
        { error: 'Payment intent ID required' },
        { status: 400 }
      );
    }

    const paymentIntent = await retrievePaymentIntent(paymentIntentId);

    return NextResponse.json({
      id: paymentIntent.id,
      status: paymentIntent.status,
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency,
      clientSecret: paymentIntent.client_secret,
    });
  } catch (error) {
    console.error('[Stripe Payment Intent] Retrieve error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve payment intent' },
      { status: 500 }
    );
  }
}
