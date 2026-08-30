// @ts-nocheck
/**
 * Mercado Pago Pre-Approval / Subscription API
 * POST /api/pagamentos/mp/preapproval - Create subscription
 * GET  /api/pagamentos/mp/preapproval - List subscriptions
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createPreApproval, getPreApproval, updatePreApproval } from '@/lib/mercado-pago';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

// POST - Create subscription
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      tier,
      planName,
      amount,
      billingCycle,
      payerEmail,
      externalReference,
      cardTokenId,
      freeTrialDays = 0,
    } = body;

    if (!tier || !amount || !payerEmail) {
      return NextResponse.json(
        { error: 'tier, amount, and payerEmail are required' },
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

    const restaurantId = user.restaurants?.[0]?.restaurant?.id;
    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://gastrux.com';

    // Create subscription record
    const subscription = await prisma.subscription.create({
      data: {
        restaurantId: restaurantId || null,
        userId: user.id,
        tier,
        planName: planName || tier,
        billingCycle: billingCycle || 'monthly',
        gateway: 'MERCADO_PAGO',
        amount,
        currency: 'BRL',
        status: 'active',
        trialStart: freeTrialDays > 0 ? new Date() : null,
        trialEnd: freeTrialDays > 0 ? new Date(Date.now() + freeTrialDays * 86400000) : null,
      },
    });

    // Create MP pre-approval
    const frequency = billingCycle === 'annual' ? 12 : 1;
    const frequencyType = billingCycle === 'annual' ? 'months' : 'months';

    const preApproval = await createPreApproval({
      payerEmail,
      backUrl: `${origin}/dashboard/billing?subscription_id=${subscription.id}`,
      reason: `Assinatura ${planName || tier} - RestauranteApp`,
      externalReference: subscription.id,
      autoRecurring: {
        frequency,
        frequencyType,
        transactionAmount: amount,
        currencyId: 'BRL',
        billingDayProportional: true,
        ...(freeTrialDays > 0 ? {
          freeTrial: {
            frequency: freeTrialDays,
            frequencyType: 'days',
          },
        } : {}),
      },
      cardTokenId,
    });

    // Update subscription with MP ID
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        gatewaySubscriptionId: preApproval.id,
      },
    });

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/preapproval', 201, duration);

    return NextResponse.json({
      subscriptionId: subscription.id,
      preApprovalId: preApproval.id,
      status: subscription.status,
      initPoint: preApproval.init_point,
      sandboxInitPoint: preApproval.sandbox_init_point,
      amount,
      billingCycle,
      trialEnd: subscription.trialEnd,
    }, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/mp/preapproval', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/preapproval',
    });
    console.error('[MP PreApproval] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create subscription' },
      { status: 500 }
    );
  }
}

// GET - List subscriptions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { restaurants: { include: { restaurant: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const restaurantId = user.restaurants?.[0]?.restaurant?.id;

    const subscriptions = await prisma.subscription.findMany({
      where: { restaurantId: restaurantId || undefined },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(subscriptions);
  } catch (error) {
    console.error('[MP PreApproval] List error:', error);
    return NextResponse.json(
      { error: 'Failed to list subscriptions' },
      { status: 500 }
    );
  }
}
