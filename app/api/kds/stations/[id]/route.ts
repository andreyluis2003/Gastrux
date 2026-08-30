// @ts-nocheck
// GET: Retrieve specific station
// PUT: Update station
// DELETE: Deactivate station

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

    const station = await prisma.kitchenStation.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        items: true,
        assignments: true,
      },
    });

    if (!station) {
      return NextResponse.json(
        { error: 'Station not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(station);
  } catch (error) {
    console.error('Error fetching station:', error);
    return NextResponse.json(
      { error: 'Failed to fetch station' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

    const owned = await prisma.kitchenStation.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

    const body = await req.json();
    const { name, description, displayColor, position, active } = body;

    const update: any = {};
    if (name) update.name = name;
    if (description !== undefined) update.description = description;
    if (displayColor) update.displayColor = displayColor;
    if (position !== undefined) update.position = position;
    if (active !== undefined) update.active = active;

    const station = await prisma.kitchenStation.update({
      where: { id: params.id },
      data: update,
    });

    return NextResponse.json(station);
  } catch (error) {
    console.error('Error updating station:', error);
    return NextResponse.json(
      { error: 'Failed to update station' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

    const owned = await prisma.kitchenStation.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Station not found' }, { status: 404 });

    const station = await prisma.kitchenStation.update({
      where: { id: params.id },
      data: { active: false },
    });

    return NextResponse.json({ message: 'Station deactivated', station });
  } catch (error) {
    console.error('Error deleting station:', error);
    return NextResponse.json(
      { error: 'Failed to delete station' },
      { status: 500 }
    );
  }
}
