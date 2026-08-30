import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const user = session.user as any;
  const restaurantId = user.currentRestaurantId;
  if (!restaurantId) return NextResponse.json({ error: 'Sem restaurante' }, { status: 400 });

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
