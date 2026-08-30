// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET /api/comanda/sessions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const sessions = await prisma.orderSession.findMany({
      where: { restaurantId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } },
      include: {
        user: { select: { id: true, name: true } },
        table: { include: { section: { select: { name: true } } } },
        items: { include: { recipe: { select: { name: true, sellingPrice: true } } } },
        order: { select: { orderNumber: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST /api/comanda/sessions
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { tableId, customerName, tableNumber, notes } = await request.json();

    const newSession = await prisma.orderSession.create({
      data: {
        userId: session.user.id,
        tableId: tableId || null,
        customerName: customerName || null,
        tableNumber: tableNumber || null,
        notes: notes || null,
        status: 'OPEN',
      },
      include: {
        user: { select: { name: true } },
        table: { include: { section: { select: { name: true } } } },
        items: { include: { recipe: { select: { name: true, sellingPrice: true } } } },
      },
    });

    return NextResponse.json(newSession, { status: 201 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
