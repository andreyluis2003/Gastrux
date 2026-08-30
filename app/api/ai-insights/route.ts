// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id;
  if (!session || !userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const where: any = { restaurantId, dismissed: false };
  if (type) where.type = type;

  const items = await prisma.aIInsight.findMany({
    where,
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 50,
    select: {
      id: true, type: true, title: true, summary: true, content: true,
      score: true, tags: true, pinned: true, timeRange: true, createdAt: true,
    },
  });

  return NextResponse.json({ items });
}
