// @ts-nocheck
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// POST: Check and trigger smart alerts
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const alerts = await prisma.smartAlert.findMany({
      where: { restaurantId, enabled: true },
    });

    const triggeredAlerts = [];

    for (const alert of alerts) {
      const conditions = JSON.parse(alert.conditions);
      const triggered = await checkAlertCondition(alert.triggerType, conditions, restaurantId);

      if (triggered.length > 0) {
        // Check cooldown
        if (alert.lastTriggeredAt) {
          const timeSinceLastTrigger =
            (Date.now() - alert.lastTriggeredAt.getTime()) / 1000 / 60; // minutes
          if (timeSinceLastTrigger < alert.cooldownMinutes) {
            continue; // Skip if cooldown not passed
          }
        }

        // Create alert logs
        for (const item of triggered) {
          await prisma.smartAlertLog.create({
            data: {
              alertId: alert.id,
              triggeredAt: new Date(),
              ingredientId: item.ingredientId,
              triggerValue: item.triggerValue,
              thresholdValue: item.thresholdValue,
              notified: alert.shouldNotify,
            },
          });

          triggeredAlerts.push({
            alertName: alert.name,
            triggerType: alert.triggerType,
            ...item,
          });
        }

        // Update last triggered time
        await prisma.smartAlert.update({
          where: { id: alert.id },
          data: { lastTriggeredAt: new Date() },
        });
      }
    }

    return NextResponse.json({
      success: true,
      triggeredCount: triggeredAlerts.length,
      alerts: triggeredAlerts,
    });
  } catch (error) {
    console.error('Check smart alerts error:', error);
    return NextResponse.json(
      { error: 'Failed to check alerts' },
      { status: 500 }
    );
  }
}

async function checkAlertCondition(
  triggerType: string,
  conditions: any,
  restaurantId: string
): Promise<any[]> {
  const triggered = [];

  switch (triggerType) {
    case 'LOW_STOCK_CRITICAL':
      // Check for items with < 2 days of stock remaining
      const criticalItems = await prisma.ingredient.findMany({
        where: { restaurantId, active: true },
        include: { currentStock: true },
      });

      for (const item of criticalItems) {
        if (!item.currentStock) continue;

        // Get avg daily consumption
        const movements = await prisma.stockMovement.findMany({
          where: {
            restaurantId,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            },
          },
        });

        const avgDaily =
          movements.length > 0
            ? movements.reduce((sum, m) => sum + m.quantity, 0) / 7
            : 0;
        const daysRemaining =
          avgDaily > 0 ? item.currentStock.currentQuantity / avgDaily : 999;

        if (daysRemaining < 2) {
          triggered.push({
            ingredientId: item.id,
            triggerValue: daysRemaining,
            thresholdValue: 2,
          });
        }
      }
      break;

    case 'LOW_MARGIN':
      // Check for recipes with margin < 25%
      const lowMarginRecipes = await prisma.recipe.findMany({
        where: { restaurantId, active: true, sellingPrice: { gt: 0 } },
      });

      for (const recipe of lowMarginRecipes) {
        if (!recipe.sellingPrice) continue;
        const margin = (
          ((recipe.sellingPrice - recipe.costPerPortion) /
            recipe.sellingPrice) *
          100
        ).toFixed(2);
        const marginNum = parseFloat(margin);

        if (marginNum < 25) {
          triggered.push({
            recipeId: recipe.id,
            triggerValue: marginNum,
            thresholdValue: 25,
          });
        }
      }
      break;
  }

  return triggered;
}
