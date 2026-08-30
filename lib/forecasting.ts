// @ts-nocheck
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from './prisma';

const OVERALL_PATTERN_DAY = -1; // Special value for overall pattern

/**
 * Calculate consumption pattern and stock forecast for an ingredient
 */
export async function calculateStockForecast(ingredientId: string) {
  try {
    // Get stock movements from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const movements = await prisma.stockMovement.findMany({
      where: {
        ingredientId,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get current stock
    const stock = await prisma.stock.findUnique({
      where: { ingredientId },
      include: { ingredient: true },
    });

    if (!stock) {
      return null;
    }

    // Calculate daily consumption pattern
    const dailyMovements: Map<string, number> = new Map();

    movements.forEach((movement) => {
      if (movement.movementType === 'AUTO_DEDUCTION' || movement.movementType === 'MANUAL_DEDUCTION') {
        const dateKey = movement.createdAt.toISOString().split('T')[0];
        const current = dailyMovements.get(dateKey) || 0;
        dailyMovements.set(dateKey, current + movement.quantity);
      }
    });

    // Calculate statistics
    const consumptions = Array.from(dailyMovements.values());
    const avgConsumption = consumptions.length > 0
      ? consumptions.reduce((a, b) => a + b, 0) / consumptions.length
      : 0;
    const minConsumption = consumptions.length > 0 ? Math.min(...consumptions) : 0;
    const maxConsumption = consumptions.length > 0 ? Math.max(...consumptions) : 0;
    const stdDeviation = calculateStdDev(consumptions, avgConsumption);

    // Calculate days until empty
    const currentStockNum = Number(stock.currentQuantity);
    const daysUntilEmpty = avgConsumption > 0 ? currentStockNum / avgConsumption : 999;

    // Determine risk level
    let riskLevel = 'LOW';
    if (daysUntilEmpty < 7) riskLevel = 'CRITICAL';
    else if (daysUntilEmpty < 15) riskLevel = 'HIGH';
    else if (daysUntilEmpty < 30) riskLevel = 'MEDIUM';

    // Calculate suggested reorder quantity (cover 30 days of consumption)
    const safetyStock = avgConsumption * 5; // 5 days buffer
    const suggestedReorder = (avgConsumption * 30) + safetyStock - currentStockNum;

    // Save consumption pattern
    await prisma.consumptionPattern.upsert({
      where: {
        ingredientId_dayOfWeek: {
          ingredientId,
          dayOfWeek: OVERALL_PATTERN_DAY,
        },
      },
      create: {
        ingredientId,
        dayOfWeek: OVERALL_PATTERN_DAY,
        avgDailyConsumption: new Decimal(avgConsumption),
        minConsumption: new Decimal(minConsumption),
        maxConsumption: new Decimal(maxConsumption),
        stdDeviation: new Decimal(stdDeviation),
        samplesCount: consumptions.length,
      },
      update: {
        avgDailyConsumption: new Decimal(avgConsumption),
        minConsumption: new Decimal(minConsumption),
        maxConsumption: new Decimal(maxConsumption),
        stdDeviation: new Decimal(stdDeviation),
        samplesCount: consumptions.length,
        lastUpdatedAt: new Date(),
      },
    });

    // Save forecast
    const forecast = await prisma.stockForecast.upsert({
      where: {
        ingredientId_forecastDate: {
          ingredientId,
          forecastDate: new Date(),
        },
      },
      create: {
        ingredientId,
        currentStock: new Decimal(currentStockNum),
        dailyConsumptionAvg: new Decimal(avgConsumption),
        daysUntilEmpty,
        confidenceLevel: new Decimal('0.95'),
        riskLevel: riskLevel as any,
        suggestedReorderQty: new Decimal(Math.max(suggestedReorder, 0)),
        forecastDate: new Date(),
      },
      update: {
        currentStock: new Decimal(currentStockNum),
        dailyConsumptionAvg: new Decimal(avgConsumption),
        daysUntilEmpty,
        riskLevel: riskLevel as any,
        suggestedReorderQty: new Decimal(Math.max(suggestedReorder, 0)),
        forecastDate: new Date(),
      },
    });

    return forecast;
  } catch (error) {
    console.error(`Error calculating forecast for ${ingredientId}:`, error);
    return null;
  }
}

/**
 * Calculate all forecasts
 */
export async function calculateAllForecasts() {
  const ingredients = await prisma.ingredient.findMany({
    where: { active: true },
    select: { id: true },
  });

  const results = [];
  for (const ingredient of ingredients) {
    const forecast = await calculateStockForecast(ingredient.id);
    if (forecast) {
      results.push(forecast);
    }
  }

  return results;
}

/**
 * Helper: Calculate standard deviation
 */
function calculateStdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const squareDiffs = values.map((value) => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Get risk level color
 */
export function getRiskLevelColor(riskLevel: string): string {
  switch (riskLevel) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    case 'HIGH':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
    case 'MEDIUM':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400';
    default:
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  }
}
