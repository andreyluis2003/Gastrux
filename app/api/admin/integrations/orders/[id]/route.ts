// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ExternalOrderStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role === 'COOK') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const order = await prisma.externalOrder.findUnique({
      where: { id: params.id },
      include: {
        integration: true,
        deliveryLogs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('[External Order Detail] Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role === 'COOK') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { status } = await request.json();

    if (!status || !Object.values(ExternalOrderStatus).includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const order = await prisma.externalOrder.findUnique({
      where: { id: params.id },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const updatedOrder = await prisma.externalOrder.update({
      where: { id: params.id },
      data: { status },
      include: {
        deliveryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    await prisma.deliveryLog.create({
      data: {
        externalOrderId: params.id,
        eventType: 'STATUS_CHANGED',
        previousStatus: order.status,
        newStatus: status,
        message: 'Status manually updated by admin',
        eventTimestamp: new Date(),
      },
    });

    return NextResponse.json(updatedOrder);
  } catch (error) {
    console.error('[External Order Update] Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}
