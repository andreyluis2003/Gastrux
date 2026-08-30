// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status');
  const outcome = url.searchParams.get('outcome');
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  const where: any = { restaurantId };
  if (status) where.status = status;
  if (outcome) where.outcome = outcome;

  const [calls, total, stats] = await Promise.all([
    prisma.voiceCall.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: limit,
      include: {
        reservation: {
          select: { id: true, guestName: true, partySize: true, reservedAt: true, status: true },
        },
      },
    }),
    prisma.voiceCall.count({ where: { restaurantId } }),
    prisma.voiceCall.groupBy({
      by: ['outcome'],
      where: { restaurantId },
      _count: { _all: true },
    }),
  ]);

  const byOutcome: Record<string, number> = {};
  stats.forEach((s) => { if (s.outcome) byOutcome[s.outcome] = s._count._all; });

  return NextResponse.json({ calls, total, byOutcome });
}
