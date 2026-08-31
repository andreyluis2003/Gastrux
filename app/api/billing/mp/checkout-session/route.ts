// @ts-nocheck
/**
 * SaaS billing checkout via Mercado Pago (PreApproval / recurring subscription).
 * Mirrors app/api/billing/checkout-session/route.ts (the Stripe equivalent) -
 * NOT the restaurant-order-payment routes under app/api/pagamentos/mp/*.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getTierById } from '@/lib/stripe-config';
import { createPreApproval, getMPAutoRecurringForBillingCycle, MP_IS_PRODUCTION } from '@/lib/mercado-pago';

export const dynamic = 'force-dynamic';

const TRIAL_DAYS = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tierId, billing } = await request.json();
    if (!tierId) {
      return NextResponse.json({ error: 'Missing tierId' }, { status: 400 });
    }

    const tier = getTierById(tierId);
    if (!tier) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    if (tierId === 'starter') {
      return NextResponse.json(
        { error: 'The free tier does not require checkout' },
        { status: 400 }
      );
    }

    const isAnnual = billing === 'annual';
    const amount = isAnnual ? tier.priceAnnual : tier.priceMonthly;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://gastrux.com';
    const billingCycle: 'monthly' | 'annual' = isAnnual ? 'annual' : 'monthly';

    const subscription = await prisma.subscription.create({
      data: {
        restaurantId: user.currentRestaurantId,
        userId: user.id,
        tier: tier.id,
        planName: tier.name,
        billingCycle,
        gateway: 'MERCADO_PAGO',
        amount,
        currency: 'BRL',
        status: 'incomplete',
        trialStart: new Date(),
        trialEnd: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });

    let preApproval;
    try {
      preApproval = await createPreApproval({
        payerEmail: user.email,
        backUrl: `${origin}/billing/success?subscription_id=${subscription.id}`,
        reason: `Assinatura ${tier.name} - Gastrux`,
        externalReference: subscription.id,
        autoRecurring: {
          ...getMPAutoRecurringForBillingCycle(billingCycle),
          transactionAmount: amount,
          currencyId: 'BRL',
          billingDayProportional: true,
          freeTrial: { frequency: TRIAL_DAYS, frequencyType: 'days' },
        },
      });
    } catch (mpError) {
      // Clean up the incomplete row rather than leaving an orphaned Subscription
      // with no gatewaySubscriptionId if Mercado Pago rejects the request.
      await prisma.subscription.delete({ where: { id: subscription.id } }).catch(() => {});
      throw mpError;
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { gatewaySubscriptionId: preApproval.id },
    });

    return NextResponse.json({
      subscriptionId: subscription.id,
      // Mirrors Stripe's checkout-session route response shape ({ url }) so
      // the frontend doesn't need to know which gateway it called.
      url: MP_IS_PRODUCTION ? preApproval.init_point : preApproval.sandbox_init_point,
    });
  } catch (error) {
    console.error('[MP checkout-session] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create Mercado Pago checkout session' },
      { status: 500 }
    );
  }
}
