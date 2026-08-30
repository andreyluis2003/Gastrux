// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    // Get trend data for the last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Daily consumption trends
    const movements = await prisma.stockMovement.findMany({
      where: {
        restaurantId,
        reason: 'CONSUMPTION',
      },
      select: {
        createdAt: true,
        quantity: true,
      },
    });

    // Group by day
    const trendsByDay = new Map<string, number>();
    movements.forEach((m) => {
      const date = new Date(m.createdAt).toISOString().split('T')[0];
      trendsByDay.set(date, (trendsByDay.get(date) || 0) + m.quantity);
    });

    // Get price trends
    const priceTrends = await prisma.priceTrend.findMany({
      where: {
        restaurantId,
      },
      include: {
        ingredient: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group price trends by ingredient
    const priceByIngredient = new Map<string, any[]>();
    priceTrends.forEach((pt) => {
      const key = pt.ingredient.name;
      if (!priceByIngredient.has(key)) {
        priceByIngredient.set(key, []);
      }
      priceByIngredient.get(key)?.push({
        date: pt.createdAt.toISOString().split('T')[0],
        price: parseFloat(pt.price.toString()),
      });
    });

    const trends = {
      consumption: Array.from(trendsByDay.entries())
        .map(([date, quantity]) => ({ date, quantity }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      prices: Object.fromEntries(priceByIngredient),
    };

    return NextResponse.json(trends);
  } catch (error) {
    console.error('Error fetching analytics trends:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
