// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { markAsRead, markAllAsRead } from '@/lib/notification-utils';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/notifications/read
 * Mark a specific notification or all notifications as read
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
    const { notificationId, markAll } = body;

    if (markAll) {
      await markAllAsRead(userId);
      const unreadCount = await prisma.notification.count({
        where: { restaurantId, userId, read: false, archived: false },
      });
      return NextResponse.json({ success: true, unreadCount });
    }

    if (!notificationId) {
      return NextResponse.json({ error: 'notificationId or markAll required' }, { status: 400 });
    }

    // Verify the notification belongs to the user
    const notification = await prisma.notification.findFirst({
      where: { restaurantId, id: notificationId, userId },
    });

    if (!notification) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    const updated = await markAsRead(notificationId);
    const unreadCount = await prisma.notification.count({
      where: { restaurantId, userId, read: false, archived: false },
    });

    return NextResponse.json({ success: true, notification: updated, unreadCount });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
