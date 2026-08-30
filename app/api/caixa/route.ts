// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET all cash registers
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json([]);

    const registers = await prisma.cashRegister.findMany({
      where: { restaurantId },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(registers);
  } catch (error) {
    console.error('Error fetching cash registers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create new cash register
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });

    const body = await req.json();
    const { name, description, openingBalance } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const register = await prisma.cashRegister.create({
      data: {
        name,
        description,
        restaurantId,
        openingBalance: openingBalance ? parseFloat(openingBalance) : 0,
        expectedBalance: openingBalance ? parseFloat(openingBalance) : 0,
        actualBalance: openingBalance ? parseFloat(openingBalance) : 0,
        openedAt: new Date(),
      },
    });

    return NextResponse.json(register, { status: 201 });
  } catch (error) {
    console.error('Error creating cash register:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
