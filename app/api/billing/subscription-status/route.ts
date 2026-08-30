import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        email: true,
        name: true,
        currentRestaurantId: true,
        stripeCustomerId: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Try to get subscription data from the restaurant first (source of truth)
    let subscriptionData: {
      subscriptionTier: string;
      subscriptionStatus: string;
      trialEndsAt: Date | null;
      billingCycleStart?: Date | null;
      billingCycleEnd?: Date | null;
      stripeCustomerId?: string | null;
    } | null = null;

    if (user.currentRestaurantId) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { id: user.currentRestaurantId },
        select: {
          subscriptionTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
        },
      });

      if (restaurant) {
        subscriptionData = {
          subscriptionTier: restaurant.subscriptionTier,
          subscriptionStatus: restaurant.subscriptionStatus,
          trialEndsAt: restaurant.trialEndsAt,
          stripeCustomerId: user.stripeCustomerId,
        };
      }
    }

    // Fallback to user-level subscription data
    if (!subscriptionData) {
      const userSub = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          subscriptionTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          billingCycleStart: true,
          billingCycleEnd: true,
          stripeCustomerId: true,
        },
      });

      if (userSub) {
        subscriptionData = userSub;
      }
    }

    if (!subscriptionData) {
      return NextResponse.json({
        subscriptionTier: 'starter',
        subscriptionStatus: 'inactive',
        trialEndsAt: null,
      });
    }

    return NextResponse.json(subscriptionData);
  } catch (error) {
    console.error('Subscription status error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscription status' },
      { status: 500 }
    );
  }
}
