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


    const searchParams = request.nextUrl.searchParams;
    const ingredientId = searchParams.get('ingredientId');
    const days = parseInt(searchParams.get('days') || '90');

    if (!ingredientId) {
      return NextResponse.json(
        { error: 'ingredientId is required' },
        { status: 400 }
      );
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all price trends for this ingredient
    const priceTrends = await prisma.priceTrend.findMany({
      where: {
        restaurantId,
        recordedDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: { supplier: true },
      orderBy: { recordedDate: 'asc' },
    });

    // Get ingredient details
    const ingredient = await prisma.ingredient.findUnique({
      where: { id: ingredientId },
        restaurantId,
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    // Group by date and calculate daily average
    const trendsByDate: Record<string, any> = {};

    priceTrends.forEach((trend) => {
      const dateKey = trend.recordedDate.toISOString().split('T')[0];
      if (!trendsByDate[dateKey]) {
        trendsByDate[dateKey] = {
          date: dateKey,
          prices: [],
          suppliers: new Set(),
        };
      }
      trendsByDate[dateKey].prices.push(trend.price);
      if (trend.supplier) {
        trendsByDate[dateKey].suppliers.add(trend.supplier.supplierName);
      }
    });

    // Calculate daily statistics
    const dailyTrends = Object.values(trendsByDate)
      .map((entry: any) => ({
        date: entry.date,
        avgPrice: entry.prices.reduce((a: number, b: number) => a + b, 0) / entry.prices.length,
        minPrice: Math.min(...entry.prices),
        maxPrice: Math.max(...entry.prices),
        count: entry.prices.length,
        suppliers: Array.from(entry.suppliers),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Fill gaps with the last known price
    const filledTrends = [];
    let lastPrice = ingredient.referenceCost;

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      const trendData = dailyTrends.find((t) => t.date === dateKey);

      if (trendData) {
        lastPrice = trendData.avgPrice;
        filledTrends.push(trendData);
      } else if (filledTrends.length > 0) {
        filledTrends.push({
          date: dateKey,
          avgPrice: lastPrice,
          minPrice: lastPrice,
          maxPrice: lastPrice,
          count: 0,
          suppliers: [],
        });
      }
    }

    return NextResponse.json({
      ingredient: {
        id: ingredient.id,
        name: ingredient.name,
        code: ingredient.code,
        category: ingredient.category.name,
        referenceCost: ingredient.referenceCost,
        maxAcceptablePrice: ingredient.maxAcceptablePrice,
      },
      period: { startDate, endDate, days },
      trends: filledTrends,
      statistics: {
        avgPrice: filledTrends.reduce((a, b) => a + b.avgPrice, 0) / filledTrends.length,
        minPrice: Math.min(...filledTrends.map((t) => t.minPrice)),
        maxPrice: Math.max(...filledTrends.map((t) => t.maxPrice)),
      },
    });
  } catch (error) {
    console.error('Error fetching price trends:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price trends' },
      { status: 500 }
    );
  }
}
