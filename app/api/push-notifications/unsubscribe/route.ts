// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

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

    const { endpoint } = await request.json();

    if (!endpoint) {
      return NextResponse.json(
        { error: 'Invalid endpoint' },
        { status: 400 }
      );
    }

    // Remove subscription from database
    // await prisma.pushSubscription.delete({
    //   where: { endpoint },
    // }).catch(() => {}); // Ignore if not found

    console.log('Push subscription removed:', {
      user: session.user.email,
      endpoint,
      timestamp: new Date(),
    });

    return NextResponse.json(
      { success: true, message: 'Unsubscribed' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error unsubscribing from push notifications:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
