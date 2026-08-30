// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { archiveNotification, archiveReadNotifications } from '@/lib/notification-utils';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/archive
 * Archive a specific notification or all read notifications
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  const userId = (session.user as any).id;

  try {
    const body = await request.json();
    const { notificationId, archiveRead } = body;

    if (archiveRead) {
      await archiveReadNotifications(userId);
      return NextResponse.json({ success: true });
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId or archiveRead required' }, { status: 400 });
    }

    // Verify the notification belongs to the user
    const notification = await prisma.notification.findFirst({
      where: { restaurantId, id: notificationId, userId },
    });

    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    const archived = await archiveNotification(notificationId);
    return NextResponse.json({ success: true, notification: archived });
  } catch (error) {
    console.error('Error archiving notification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
