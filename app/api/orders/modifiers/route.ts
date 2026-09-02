// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const orderItemId = searchParams.get('orderItemId');

    if (!orderItemId) {
      return NextResponse.json(
        { error: 'orderItemId parameter required' },
        { status: 400 }
      );
    }

    const modifiers = await prisma.orderItemModifier.findMany({
      where: { orderItemId, orderItem: { order: { restaurantId } } },
      include: { modifier: true },
    });

    return NextResponse.json(modifiers);
  } catch (error) {
    console.error('Error fetching modifiers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modifiers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const body = await request.json();
    const { orderItemId, modifierId } = body;

    if (!orderItemId || !modifierId) {
      return NextResponse.json(
        { error: 'orderItemId and modifierId required' },
        { status: 400 }
      );
    }

    const orderItem = await prisma.orderItem.findFirst({
      where: { id: orderItemId, order: { restaurantId } },
    });

    if (!orderItem) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 });
    }

    const modifier = await prisma.itemModifier.findFirst({
      where: { id: modifierId, restaurantId },
    });

    if (!modifier) {
      return NextResponse.json({ error: 'Modifier not found' }, { status: 404 });
    }

    const orderItemModifier = await prisma.orderItemModifier.create({
      data: {
        orderItemId,
        modifierId,
        priceAdjustment: modifier.priceAdjustment,
      },
      include: { modifier: true },
    });

    return NextResponse.json(orderItemModifier, { status: 201 });
  } catch (error) {
    console.error('Error adding modifier:', error);
    return NextResponse.json(
      { error: 'Failed to add modifier' },
      { status: 500 }
    );
  }
}
