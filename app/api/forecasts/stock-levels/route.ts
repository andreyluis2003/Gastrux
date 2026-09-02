// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateStockForecast, calculateAllForecasts } from '@/lib/forecasting';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/forecasts/stock-levels - Get stock forecasts for all ingredients
 * Query params:
 *   - riskLevel: Filter by risk level (LOW, MEDIUM, HIGH, CRITICAL)
 *   - ingredientId: Get forecast for specific ingredient
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
    const riskLevel = searchParams.get('riskLevel');
    const ingredientId = searchParams.get('ingredientId');

    const where: any = { restaurantId };

    if (riskLevel) {
      where.riskLevel = riskLevel;
    }

    if (ingredientId) {
      where.ingredientId = ingredientId;
    } else {
      // For bulk requests, get today's forecasts
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      where.forecastDate = {
        gte: today,
        lt: tomorrow,
      };
    }

    const forecasts = await prisma.stockForecast.findMany({
      where,
      include: {
        ingredient: {
          include: {
            currentStock: true,
            category: true,
          },
        },
      },
      orderBy: [{ riskLevel: 'desc' }, { daysUntilEmpty: 'asc' }],
    });

    return NextResponse.json(forecasts);
  } catch (error) {
    console.error('Error fetching forecasts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch forecasts' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/forecasts/stock-levels - Calculate or recalculate forecasts
 * Body:
 *   - ingredientId?: string (specific ingredient, or all if not provided)
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    if ((session.user as any)?.role === 'COOK') {
      return NextResponse.json(
        { error: 'COOKs cannot trigger forecasts' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { ingredientId } = body;

    let results;

    if (ingredientId) {
      // Verify the ingredient belongs to the caller's restaurant
      const ingredient = await prisma.ingredient.findFirst({
        where: { id: ingredientId, restaurantId },
        select: { id: true },
      });
      if (!ingredient) {
        return NextResponse.json({ error: 'Ingredient not found' }, { status: 404 });
      }
      const forecast = await calculateStockForecast(ingredientId);
      results = forecast ? [forecast] : [];
    } else {
      // Calculate for all ingredients of this restaurant
      results = await calculateAllForecasts(restaurantId);
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: (session.user as any)?.id,
        action: 'CREATE',
        entityType: 'StockForecast',
        entityId: ingredientId || 'all',
        changes: JSON.stringify({
          forecastsCalculated: results.length,
          timestamp: new Date(),
        }),
      },
    });

    return NextResponse.json({
      message: `Forecasts calculated for ${results.length} ingredients`,
      results,
    });
  } catch (error) {
    console.error('Error calculating forecasts:', error);
    return NextResponse.json(
      { error: 'Failed to calculate forecasts' },
      { status: 500 }
    );
  }
}
