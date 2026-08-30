// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const subscription = await request.json();

    if (!subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription' },
        { status: 400 }
      );
    }

    // Store subscription in database or use localStorage
    // For now, we'll just log and acknowledge
    console.log('Push subscription received:', {
      user: session.user.email,
      endpoint: subscription.endpoint,
      timestamp: new Date(),
    });

    // Optional: Store in database for sending push notifications
    // await prisma.pushSubscription.upsert({
    //   where: { endpoint: subscription.endpoint },
    //   update: { user: { connect: { email: session.user.email } } },
    //   create: {
    //     endpoint: subscription.endpoint,
    //     auth: subscription.keys.auth,
    //     p256dh: subscription.keys.p256dh,
    //     user: { connect: { email: session.user.email } },
    //   },
    // });

    return NextResponse.json(
      { success: true, message: 'Subscription saved' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error subscribing to push notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
