import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getRestaurantMember, MANAGER_ROLES } from '@/lib/auth/restaurant-role';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // A manager of the restaurant being worked in (session.user.currentRestaurantId never existed)
  const member = await getRestaurantMember();
  if (!member || !MANAGER_ROLES.includes(member.role)) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const restaurantId = member.restaurantId;

  const config = await prisma.nFeConfig.findUnique({
    where: { restaurantId },
  });
  if (!config) return NextResponse.json({ logs: [] });

  const logs = await prisma.nFeLog.findMany({
    where: { configId: config.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return NextResponse.json({ logs });
}
