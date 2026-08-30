// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const priceAlert = await prisma.priceAlert.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        ingredient: { include: { category: true } },
        supplier: true,
      },
    });

    if (!priceAlert) {
      return NextResponse.json(
        { error: 'Price alert not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(priceAlert);
  } catch (error) {
    console.error('Error fetching price alert:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price alert' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedAlert = await prisma.priceAlert.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedAlert) {
      return NextResponse.json({ error: 'Price alert not found' }, { status: 404 });
    }

    const body = await request.json();
    const { maxPrice, minPrice, enabled } = body;

    const priceAlert = await prisma.priceAlert.update({
      where: { id: params.id },
      data: {
        maxPrice,
        minPrice,
        enabled,
      },
      include: {
        ingredient: { include: { category: true } },
        supplier: true,
      },
    });

    return NextResponse.json(priceAlert);
  } catch (error) {
    console.error('Error updating price alert:', error);
    return NextResponse.json(
      { error: 'Failed to update price alert' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedAlert = await prisma.priceAlert.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedAlert) {
      return NextResponse.json({ error: 'Price alert not found' }, { status: 404 });
    }

    await prisma.priceAlert.delete({
      where: { id: params.id },
    });

    return NextResponse.json(
      { message: 'Price alert deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting price alert:', error);
    return NextResponse.json(
      { error: 'Failed to delete price alert' },
      { status: 500 }
    );
  }
}
