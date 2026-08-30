// @ts-nocheck
// GET: Retrieve all kitchen stations
// POST: Create new kitchen station

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json([]);

    const stations = await prisma.kitchenStation.findMany({
      where: { active: true, restaurantId },
      orderBy: { position: 'asc' },
      include: {
        items: {
          where: {
            order: {
              status: { in: ['PENDING', 'PREPARING'] },
            },
          },
        },
        assignments: {
          where: {
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
        },
      },
    });

    return NextResponse.json(stations);
  } catch (error) {
    console.error('Error fetching stations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stations' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });

    const body = await req.json();
    const { name, description, displayColor, position } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Station name is required' },
        { status: 400 }
      );
    }

    const station = await prisma.kitchenStation.create({
      data: {
        name,
        description,
        restaurantId,
        displayColor: displayColor || '#3b82f6',
        position: position || 0,
      },
    });

    return NextResponse.json(station, { status: 201 });
  } catch (error) {
    console.error('Error creating station:', error);
    return NextResponse.json(
      { error: 'Failed to create station' },
      { status: 500 }
    );
  }
}
