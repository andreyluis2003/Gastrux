// @ts-nocheck
/**
 * Server-side verification for /billing/success (Stripe branch) - the
 * previous version of that page trusted the redirect alone with no check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import Stripe from 'stripe';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return stripe;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sessionId = request.nextUrl.searchParams.get('session_id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const checkoutSession = await getStripe().checkout.sessions.retrieve(sessionId, {
      expand: ['subscription'],
    });

    // Don't let one user probe another user's checkout session.
    if (checkoutSession.metadata?.userId && checkoutSession.metadata.userId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const subscription = checkoutSession.subscription as Stripe.Subscription | null;

    return NextResponse.json({
      paymentStatus: checkoutSession.payment_status,
      sessionStatus: checkoutSession.status,
      subscriptionStatus: subscription?.status ?? null,
      complete: checkoutSession.status === 'complete',
    });
  } catch (error) {
    console.error('[checkout-session/status] Error:', error);
    return NextResponse.json({ error: 'Failed to verify checkout session' }, { status: 500 });
  }
}
