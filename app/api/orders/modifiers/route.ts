// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      where: { orderItemId },
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

    const body = await request.json();
    const { orderItemId, modifierId } = body;

    if (!orderItemId || !modifierId) {
      return NextResponse.json(
        { error: 'orderItemId and modifierId required' },
        { status: 400 }
      );
    }

    const orderItem = await prisma.orderItem.findUnique({
      where: { id: orderItemId },
    });

    if (!orderItem) {
      return NextResponse.json({ error: 'Order item not found' }, { status: 404 });
    }

    const modifier = await prisma.itemModifier.findUnique({
      where: { id: modifierId },
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
