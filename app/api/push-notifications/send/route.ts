// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * This endpoint is used to send push notifications to users
 * Can be called by cron jobs or other internal services
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    // Only allow OWNER role to send push notifications
    if (session?.user?.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Unauthorized - Only OWNER can send notifications' },
        { status: 403 }
      );
    }

    const { title, body, url, tag, customData } = await request.json();

    if (!title || !body) {
      return NextResponse.json(
        { error: 'Missing required fields: title, body' },
        { status: 400 }
      );
    }

    const payload = {
      title: title || 'Gastrux',
      body: body || 'Notificação importante',
      url: url || '/dashboard',
      tag: tag || 'alert',
      customData: customData || {},
    };

    console.log('Push notification request:', payload);

    // In a real implementation, you would:
    // 1. Query the database for all subscriptions
    // 2. Send push notifications to each subscription using web-push library
    // Example:
    // const subscriptions = await prisma.pushSubscription.findMany();
    // for (const sub of subscriptions) {
    //   await webpush.sendNotification(sub, JSON.stringify(payload));
    // }

    return NextResponse.json(
      {
        success: true,
        message: 'Notification queued for delivery',
        payload,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending push notification:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
