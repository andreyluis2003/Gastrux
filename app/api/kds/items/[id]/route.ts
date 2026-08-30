// @ts-nocheck
// PUT: Update order item status and station assignment

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { broadcastOrderUpdate } from '@/lib/socket';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await req.json();
    const { status, stationId, startedAt, completedAt } = body;

    const update: any = {};
    if (status) update.status = status;
    if (stationId) update.stationId = stationId;
    if (startedAt) update.startedAt = new Date(startedAt);
    if (completedAt) update.completedAt = new Date(completedAt);

    const item = await prisma.orderItem.update({
      where: { id: params.id },
      data: update,
      include: {
        recipe: true,
        station: true,
        order: true,
      },
    });

    // Update station assignment status if item is ready/completed
    if (status === 'COMPLETED' && item.stationId) {
      const order = await prisma.order.findUnique({
        where: { id: item.orderId },
          restaurantId,
      });

      if (order) {
        const completedItems = order.items.filter(
          (i) => i.status === 'COMPLETED' || i.id === params.id
        ).length;

        await prisma.orderStationAssignment.updateMany({
          where: {
            orderId: item.orderId,
            stationId: item.stationId,
          },
          data: {
            completedItems,
            status: completedItems === order.items.length ? 'COMPLETED' : 'IN_PROGRESS',
          },
        });
      }
    }

    // Broadcast update
    broadcastOrderUpdate(item.orderId, 'item-updated', { item, itemId: params.id });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      { error: 'Failed to update item' },
      { status: 500 }
    );
  }
}
