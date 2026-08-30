// @ts-nocheck
/**
 * Stripe Connect - Express Account Management
 * POST /api/pagamentos/stripe/connect - Create account
 * GET  /api/pagamentos/stripe/connect - Get account status
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  createExpressAccount,
  createAccountLink,
  getAccount,
  isStripeConnectConfigured,
} from '@/lib/stripe-connect';
import { captureException, trackApiCall } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

// POST - Create Express Account
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
    const { restaurantName, country = 'BR', businessType = 'company' } = body;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { restaurants: { include: { restaurant: true } } },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Only OWNER can setup Stripe Connect
    if (!['OWNER', 'ADMIN'].includes(session.user.role || '')) {
      return NextResponse.json(
        { error: 'Only OWNER or ADMIN can setup payment accounts' },
        { status: 403 }
      );
    }

    const restaurant = user.restaurants?.[0]?.restaurant;
    if (!restaurant) {
      return NextResponse.json(
        { error: 'No restaurant associated with user' },
        { status: 400 }
      );
    }

    // Check if already connected
    if (restaurant.stripeAccountId) {
      const existingAccount = await getAccount(restaurant.stripeAccountId);
      if (existingAccount) {
        const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || '';
        const accountLink = await createAccountLink(
          restaurant.stripeAccountId,
          `${origin}/dashboard/billing/connect?status=refresh`,
          `${origin}/dashboard/billing/connect?status=success`
        );

        return NextResponse.json({
          accountId: restaurant.stripeAccountId,
          onboardingUrl: accountLink.url,
          status: existingAccount.details_submitted ? 'active' : 'pending',
          detailsSubmitted: existingAccount.details_submitted,
          chargesEnabled: existingAccount.charges_enabled,
          payoutsEnabled: existingAccount.payouts_enabled,
        });
      }
    }

    // Create new Express account
    const account = await createExpressAccount({
      email: user.email,
      restaurantName: restaurantName || restaurant.name,
      country,
      businessType,
      restaurantId: restaurant.id,
    });

    // Update restaurant with Stripe account ID
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { stripeAccountId: account.id },
    });

    // Create onboarding link
    const origin = request.headers.get('origin') || process.env.NEXTAUTH_URL || '';
    const accountLink = await createAccountLink(
      account.id,
      `${origin}/dashboard/billing/connect?status=refresh`,
      `${origin}/dashboard/billing/connect?status=success`
    );

    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/stripe/connect', 201, duration);

    return NextResponse.json({
      accountId: account.id,
      onboardingUrl: accountLink.url,
      status: 'pending',
      detailsSubmitted: false,
      chargesEnabled: false,
      payoutsEnabled: false,
    }, { status: 201 });
  } catch (error) {
    const duration = Date.now() - startTime;
    trackApiCall('POST', '/api/pagamentos/stripe/connect', 500, duration);
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/stripe/connect',
    });
    console.error('[Stripe Connect] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create Stripe Connect account' },
      { status: 500 }
    );
  }
}

// GET - Get account status
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

    const restaurant = user.restaurants?.[0]?.restaurant;
    if (!restaurant?.stripeAccountId) {
      return NextResponse.json({ connected: false });
    }

    const account = await getAccount(restaurant.stripeAccountId);

    return NextResponse.json({
      connected: true,
      accountId: restaurant.stripeAccountId,
      status: account.details_submitted ? 'active' : 'pending',
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirements: account.requirements,
    });
  } catch (error) {
    console.error('[Stripe Connect] Status error:', error);
    return NextResponse.json(
      { error: 'Failed to get account status' },
      { status: 500 }
    );
  }
}
