// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { MovementType } from '@prisma/client';
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


    // Parse query parameters
    const searchParams = request.nextUrl.searchParams;
    const periodDays = searchParams.get('period') || '30';
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 20);
    const movementTypesParam = searchParams.get('types');

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodDays));

    // Parse filters
    const movementTypes = movementTypesParam
      ? movementTypesParam.split(',')
      : ['MANUAL_DEDUCTION'];

    // Build where clause
    const where = {
      ingredient: { restaurantId },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      movementType: {
        in: movementTypes as MovementType[],
      },
    };

    // Get raw movements
    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        ingredient: {
          include: {
            category: true,
          },
        },
      },
    });

    // Group and aggregate
    const aggregated: {
      [key: string]: {
        ingredientId: string;
        ingredientName: string;
        categoryName: string;
        unit: string;
        totalQuantity: number;
        totalCost: number;
        frequency: number;
        minQuantity: number;
        maxQuantity: number;
      };
    } = {};

    movements.forEach((m: any) => {
      if (!aggregated[m.ingredientId]) {
        aggregated[m.ingredientId] = {
          ingredientId: m.ingredientId,
          ingredientName: m.ingredient.name,
          categoryName: m.ingredient.category?.name || 'Sem categoria',
          unit: m.ingredient.standardUnit || 'un',
          totalQuantity: 0,
          totalCost: 0,
          frequency: 0,
          minQuantity: m.quantity,
          maxQuantity: m.quantity,
        };
      }

      const item = aggregated[m.ingredientId];
      item.totalQuantity += m.quantity;
      item.totalCost += (m.ingredient.referenceCost || 0) * m.quantity;
      item.frequency += 1;
      item.minQuantity = Math.min(item.minQuantity, m.quantity);
      item.maxQuantity = Math.max(item.maxQuantity, m.quantity);
    });

    const topIngredients = Object.values(aggregated)
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, limit)
      .map((item) => ({
        ...item,
        totalQuantity: parseFloat(item.totalQuantity.toFixed(2)),
        totalCost: parseFloat(item.totalCost.toFixed(2)),
        minQuantity: parseFloat(item.minQuantity.toFixed(2)),
        maxQuantity: parseFloat(item.maxQuantity.toFixed(2)),
      }));

    return NextResponse.json({
      period: {
        days: parseInt(periodDays),
        startDate,
        endDate,
      },
      topIngredients,
      total: topIngredients.length,
    });
  } catch (error) {
    console.error('[TOP INGREDIENTS]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
