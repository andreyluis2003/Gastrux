// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forecasts/consumption-patterns - Get consumption patterns
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const { searchParams } = new URL(req.url);
    const ingredientId = searchParams.get('ingredientId');

    const where: any = { restaurantId };
    if (ingredientId) where.ingredientId = ingredientId;

    const patterns = await prisma.consumptionPattern.findMany({
      where,
      include: {
        ingredient: true,
      },
      orderBy: [{ ingredientId: 'asc' }, { dayOfWeek: 'asc' }],
    });

    return NextResponse.json(patterns);
  } catch (error) {
    console.error('Error fetching consumption patterns:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patterns' },
      { status: 500 }
    );
  }
}
