// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role === 'COOK') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const platform = searchParams.get('platform');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = { restaurantId };
    if (status) where.status = status;
    if (platform) {
      where.integration = { platform };
    }

    const orders = await prisma.externalOrder.findMany({
      where,
      include: {
        integration: true,
        deliveryLogs: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { orderReceivedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.externalOrder.count({ where });

    return NextResponse.json({
      orders,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('[External Orders] Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}
