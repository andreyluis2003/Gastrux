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


    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '30');
    const ingredientIds = searchParams.get('ingredientIds')?.split(',').filter(Boolean) || [];
    const supplierIds = searchParams.get('supplierIds')?.split(',').filter(Boolean) || [];

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build query conditions
    const priceConditions: any = {
      recordedDate: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (ingredientIds.length > 0) {
      priceConditions.ingredientId = { in: ingredientIds };
    }

    if (supplierIds.length > 0) {
      priceConditions.supplierId = { in: supplierIds };
    }

    // Get all price trends in the date range
    const priceTrends = await prisma.priceTrend.findMany({
      where: priceConditions,
      include: {
        ingredient: {
          include: { category: true, suppliers: true },
        },
        supplier: true,
      },
      orderBy: { recordedDate: 'desc' },
    });

    // Calculate aggregated data per ingredient
    const ingredientData: Record<string, any> = {};

    priceTrends.forEach((trend) => {
      const ingredientId = trend.ingredientId;

      if (!ingredientData[ingredientId]) {
        ingredientData[ingredientId] = {
          ingredientId,
          name: trend.ingredient.name,
          code: trend.ingredient.code,
          category: trend.ingredient.category.name,
          prices: [],
          suppliers: new Set(),
          referenceCost: trend.ingredient.referenceCost,
          maxAcceptablePrice: trend.ingredient.maxAcceptablePrice,
        };
      }

      ingredientData[ingredientId].prices.push(trend.price);
      if (trend.supplier) {
        ingredientData[ingredientId].suppliers.add(trend.supplier.supplierName);
      }
    });

    // Calculate statistics for each ingredient
    const summary = Object.values(ingredientData).map((data: any) => {
      const prices = data.prices;
      const avgPrice = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0;
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;
      const priceChange = prices.length > 1 ? ((prices[0] - prices[prices.length - 1]) / prices[prices.length - 1]) * 100 : 0;

      return {
        ingredientId: data.ingredientId,
        name: data.name,
        code: data.code,
        category: data.category,
        avgPrice,
        minPrice,
        maxPrice,
        priceChange,
        totalRecords: prices.length,
        suppliers: Array.from(data.suppliers),
        referenceCost: data.referenceCost,
        maxAcceptablePrice: data.maxAcceptablePrice,
        priceAboveMax: data.maxAcceptablePrice && avgPrice > data.maxAcceptablePrice,
      };
    });

    return NextResponse.json({
      period: { startDate, endDate, days },
      count: summary.length,
      data: summary.sort((a, b) => b.avgPrice - a.avgPrice),
    });
  } catch (error) {
    console.error('Error fetching ingredient cost summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cost summary' },
      { status: 500 }
    );
  }
}
