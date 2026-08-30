// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for subscribing to real-time notifications
 * Clients will receive Server-Sent Events with new notifications
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  const userId = (session.user as any).id;

  // Create a ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Send initial connection confirmation
        controller.enqueue(`data: ${JSON.stringify({ type: 'connected', userId })}\n\n`);

        // Send current unread count
        const unreadCount = await prisma.notification.count({
          where: { restaurantId, userId, read: false, archived: false },
        });
        controller.enqueue(`data: ${JSON.stringify({ type: 'unreadCount', count: unreadCount })}\n\n`);

        // Get initial notifications
        const initialNotifications = await prisma.notification.findMany({
          where: { restaurantId, userId, archived: false },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        controller.enqueue(`data: ${JSON.stringify({ type: 'initialNotifications', notifications: initialNotifications })}\n\n`);

        // Heartbeat every 30 seconds to keep connection alive
        const heartbeatInterval = setInterval(() => {
          try {
            controller.enqueue(`:heartbeat\n\n`);
          } catch (e) {
            clearInterval(heartbeatInterval);
          }
        }, 30000);

        return () => {
          clearInterval(heartbeatInterval);
        };
      } catch (error) {
        console.error('SSE connection error:', error);
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
