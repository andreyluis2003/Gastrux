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

    // Verify the ingredient belongs to this restaurant before exposing its
    // suppliers' pricing data
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
      include: { category: true },
    });
    if (!ingredient) {
      return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
    }

    // Get all suppliers for this ingredient
    const suppliers = await prisma.ingredientSupplier.findMany({
      where: { ingredientId },
      include: { ingredient: true },
    });

    // Get price trends by supplier
    const supplierComparison = await Promise.all(
      suppliers.map(async (supplier) => {
        const priceTrends = await prisma.priceTrend.findMany({
          where: {
            restaurantId,
            supplierId: supplier.id,
            recordedDate: {
              gte: startDate,
              lte: endDate,
            },
          },
          orderBy: { recordedDate: 'desc' },
        });

        const prices = priceTrends.map((t) => t.price);
        const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : supplier.unitPrice;

        return {
          supplierId: supplier.id,
          supplierName: supplier.supplierName,
          supplierCode: supplier.supplierCode,
          unitPrice: supplier.unitPrice,
          avgPrice,
          minPrice: prices.length > 0 ? Math.min(...prices) : supplier.unitPrice,
          maxPrice: prices.length > 0 ? Math.max(...prices) : supplier.unitPrice,
          totalRecords: prices.length,
          lastPrice: prices.length > 0 ? prices[0] : supplier.unitPrice,
          priceChangePercentage: prices.length > 1 ? ((prices[0] - prices[prices.length - 1]) / prices[prices.length - 1]) * 100 : 0,
          leadDays: supplier.leadDays,
          active: supplier.active,
        };
      })
    );

    return NextResponse.json({
      ingredient: {
        id: ingredient.id,
        name: ingredient.name,
        code: ingredient.code,
        category: ingredient.category?.name,
      },
      period: { startDate, endDate, days },
      suppliers: supplierComparison.sort((a, b) => a.avgPrice - b.avgPrice),
    });
  } catch (error) {
    console.error('Error fetching supplier comparison:', error);
    return NextResponse.json(
      { error: 'Failed to fetch supplier comparison' },
      { status: 500 }
    );
  }
}
