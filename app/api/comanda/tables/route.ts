// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET /api/comanda/tables
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const tables = await prisma.table.findMany({
      where: { restaurantId, isAvailable: true },
      include: {
        section: { select: { id: true, name: true } },
        orderSessions: {
          where: { status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } },
          select: { id: true, status: true },
        },
      },
      orderBy: [{ section: { name: 'asc' } }, { number: 'asc' }],
    });

    return NextResponse.json(tables);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
