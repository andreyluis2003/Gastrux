// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { STRIPE_PRICING_TIERS } from '@/lib/stripe-config';

export const dynamic = 'force-dynamic';

// Validate Stripe credentials at initialization
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is not set');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2026-04-22.dahlia',
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { tierId } = await request.json();
    if (!tierId) {
      return NextResponse.json(
        { error: 'Missing tierId' },
        { status: 400 }
      );
    }

    const tier = Object.values(STRIPE_PRICING_TIERS).find(t => t.id === tierId);
    if (!tier) {
      return NextResponse.json(
        { error: 'Invalid tier' },
        { status: 400 }
      );
    }

    // Validate Stripe Price ID for paid tiers
    if (tierId !== 'starter' && !tier.stripePriceId) {
      return NextResponse.json(
        { error: `Stripe Price ID not configured for tier: ${tierId}` },
        { status: 500 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        preferred_locales: ['pt-BR'],
        address: { country: 'BR' },
        metadata: {
          userId: user.id,
        },
      });
      stripeCustomerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId },
      });
    }

    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || 'https://gastrux.com';

    const isSubscription = tierId !== 'starter';

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: isSubscription ? 'subscription' : 'setup',
      payment_method_types: ['card'],
      locale: 'pt-BR',
      billing_address_collection: 'auto',
      line_items: isSubscription
        ? [{ price: tier.stripePriceId || '', quantity: 1 }]
        : undefined,
      ...(isSubscription
        ? {
            subscription_data: {
              trial_period_days: 30,
              metadata: { userId: user.id, tierId },
            },
          }
        : {}),
      success_url: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing`,
      metadata: {
        userId: user.id,
        tierId: tierId,
      },
    });

    return NextResponse.json({
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    });
  } catch (error) {
    console.error('Checkout session error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
