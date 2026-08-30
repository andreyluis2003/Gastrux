// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

  const userId = (session.user as any).id;
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;
  if (!restaurantId) return NextResponse.json({ commissions: [] });

  const commissions = await prisma.staffCommission.findMany({
    where: { staffMember: { restaurantId } },
    include: {
      staffMember: {
        include: { user: { select: { name: true } } },
      },
    },
    orderBy: { period: 'desc' },
    take: 50,
  });

  return NextResponse.json({ commissions });
}
