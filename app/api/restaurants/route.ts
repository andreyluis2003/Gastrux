// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = (session as any).user?.id || (session as any).id;
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: { userId },
      include: {
        restaurant: {
          select: { id: true, name: true, logoUrl: true, address: true, phone: true, status: true },
        },
      },
    });

    const restaurants = restaurantUsers.map((ru) => ru.restaurant);
    return NextResponse.json(restaurants);
  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
