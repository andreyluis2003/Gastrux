// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatBRL } from '@/lib/formatters';
import { MovementType } from '@prisma/client';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

interface ConsumptionFilter {
  ingredientIds?: string[];
  movementTypes?: string[];
  startDate?: Date;
  endDate?: Date;
}

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
    const ingredientIdsParam = searchParams.get('ingredients');
    const movementTypesParam = searchParams.get('types');

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodDays));

    // Parse filters
    const ingredientIds = ingredientIdsParam
      ? ingredientIdsParam.split(',')
      : undefined;
    const movementTypes = movementTypesParam
      ? movementTypesParam.split(',')
      : ['MANUAL_DEDUCTION']; // Default to consumption only

    // Build where clause
    const where: any = {
      ingredient: { restaurantId },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      movementType: {
        in: movementTypes as MovementType[],
      },
    };

    if (ingredientIds && ingredientIds.length > 0) {
      where.ingredientId = {
        in: ingredientIds,
      };
    }

    // Get all movements in the period
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

    // Calculate aggregations
    const totalQuantity = movements.reduce(
      (sum, m) => sum + m.quantity,
      0
    );

    const totalCost = movements.reduce((sum, m) => {
      const cost = (m.ingredient.referenceCost || 0) * m.quantity;
      return sum + cost;
    }, 0);

    const daysInPeriod = Math.max(1, parseInt(periodDays));
    const averageDaily = totalQuantity / daysInPeriod;

    // Group by ingredient
    const byIngredient: {
      [key: string]: {
        ingredientId: string;
        ingredientName: string;
        categoryName: string;
        unit: string;
        totalQuantity: number;
        totalCost: number;
        frequency: number;
        averageDaily: number;
      };
    } = {};

    movements.forEach((m: any) => {
      if (!byIngredient[m.ingredientId]) {
        byIngredient[m.ingredientId] = {
          ingredientId: m.ingredientId,
          ingredientName: m.ingredient.name,
          categoryName: m.ingredient.category?.name || 'Sem categoria',
          unit: m.ingredient.standardUnit || 'un',
          totalQuantity: 0,
          totalCost: 0,
          frequency: 0,
          averageDaily: 0,
        };
      }

      const item = byIngredient[m.ingredientId];
      item.totalQuantity += m.quantity;
      item.totalCost += (m.ingredient.referenceCost || 0) * m.quantity;
      item.frequency += 1;
      item.averageDaily = item.totalQuantity / daysInPeriod;
    });

    const ingredientStats = Object.values(byIngredient).sort(
      (a, b) => b.totalQuantity - a.totalQuantity
    );

    return NextResponse.json({
      period: {
        days: parseInt(periodDays),
        startDate,
        endDate,
      },
      summary: {
        totalQuantity,
        totalCost: parseFloat(totalCost.toFixed(2)),
        averageDailyQuantity: parseFloat(averageDaily.toFixed(2)),
        uniqueIngredients: ingredientStats.length,
        totalMovements: movements.length,
      },
      byIngredient: ingredientStats,
      raw: movements,
    });
  } catch (error) {
    console.error('[CONSUMPTION SUMMARY]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
