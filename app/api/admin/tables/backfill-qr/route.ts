// FASE 50: Backfill qrToken for all existing tables that don't have one
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

function generateToken(): string {
  return randomBytes(16).toString('hex');
}

// POST /api/admin/tables/backfill-qr - Generate qrToken for all tables missing one
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if ((session.user as any)?.role === 'COOK') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const tables = await prisma.table.findMany({
      where: { restaurantId, qrToken: null },
      select: { id: true },
    });

    let updated = 0;
    for (const t of tables) {
      let token = generateToken();
      let attempts = 0;
      while (attempts < 5) {
        const exists = await prisma.table.findUnique({ where: { qrToken: token } });
        if (!exists) break;
        token = generateToken();
        attempts++;
      }
      await prisma.table.update({ where: { id: t.id }, data: { qrToken: token } });
      updated++;
    }

    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error('Error backfilling qrTokens:', error);
    return NextResponse.json({ error: 'Failed to backfill' }, { status: 500 });
  }
}
