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
    const ingredientIdsParam = searchParams.get('ingredients');
    const movementTypesParam = searchParams.get('types');

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(periodDays));
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Parse filters
    const ingredientIds = ingredientIdsParam
      ? ingredientIdsParam.split(',')
      : undefined;
    const movementTypes = movementTypesParam
      ? movementTypesParam.split(',')
      : ['MANUAL_DEDUCTION'];

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

    // Get all movements
    const movements = await prisma.stockMovement.findMany({
      where,
      include: {
        ingredient: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by date
    const byDate: {
      [key: string]: {
        date: string;
        totalQuantity: number;
        totalCost: number;
        movements: number;
        ingredients: { [key: string]: number };
      };
    } = {};

    // Initialize all dates in range
    const current = new Date(startDate);
    while (current <= endDate) {
      const dateStr = current.toISOString().split('T')[0];
      byDate[dateStr] = {
        date: dateStr,
        totalQuantity: 0,
        totalCost: 0,
        movements: 0,
        ingredients: {},
      };
      current.setDate(current.getDate() + 1);
    }

    // Aggregate by date
    movements.forEach((m) => {
      const dateStr = m.createdAt.toISOString().split('T')[0];
      if (byDate[dateStr]) {
        byDate[dateStr].totalQuantity += m.quantity;
        byDate[dateStr].totalCost +=
          (m.ingredient.referenceCost || 0) * m.quantity;
        byDate[dateStr].movements += 1;

        if (!byDate[dateStr].ingredients[m.ingredient.name]) {
          byDate[dateStr].ingredients[m.ingredient.name] = 0;
        }
        byDate[dateStr].ingredients[m.ingredient.name] += m.quantity;
      }
    });

    const trends = Object.values(byDate)
      .map((d) => ({
        ...d,
        totalCost: parseFloat(d.totalCost.toFixed(2)),
        totalQuantity: parseFloat(d.totalQuantity.toFixed(2)),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json({
      period: {
        days: parseInt(periodDays),
        startDate,
        endDate,
      },
      trends,
    });
  } catch (error) {
    console.error('[CONSUMPTION TRENDS]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
