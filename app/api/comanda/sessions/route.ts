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

    if (tableId) {
      const table = await prisma.table.findFirst({ where: { id: tableId, restaurantId }, select: { id: true } });
      if (!table) {
        return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
      }
    }

    const include = {
      user: { select: { name: true } },
      table: { include: { section: { select: { name: true } } } },
      items: { include: { recipe: { select: { name: true, sellingPrice: true } } } },
    };

    // A table has one open comanda: tapping it opens that one. Two waiters tapping a free table at the
    // same time must not open two (spec 2026-10-07, 7): a per-table lock serialises them.
    const result = await prisma.$transaction(async (tx) => {
      if (tableId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-table:' + tableId}))`;
        const existing = await tx.orderSession.findFirst({
          where: { restaurantId, tableId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } },
          include,
          orderBy: { openedAt: 'asc' },
        });
        if (existing) return { session: existing, created: false };
      }
      const created = await tx.orderSession.create({
        data: {
          restaurantId,
          userId: session.user.id,
          tableId: tableId || null,
          customerName: customerName || null,
          tableNumber: tableNumber || null,
          notes: notes || null,
          status: 'OPEN',
          // A table or a named comanda gets the service charge (the counter and WhatsApp never do)
          serviceChargeEligible: !!(tableId || customerName),
        },
        include,
      });
      return { session: created, created: true };
    });

    return NextResponse.json(result.session, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
