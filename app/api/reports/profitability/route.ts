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

    const { searchParams } = new URL(request.url);
    const startDate = new Date(searchParams.get('startDate') || '');
    const endDate = new Date(searchParams.get('endDate') || '');

    const recipes = await prisma.recipe.findMany({
      where: { restaurantId },
      include: {
        ingredients: true,
      },
    });

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: {
          include: {
            recipe: true,
          },
        },
      },
    });

    const dishMetrics = new Map();

    orders.forEach((order) => {
      order.items.forEach((item) => {
        const key = item.recipe.id;
        if (!dishMetrics.has(key)) {
          dishMetrics.set(key, {
            id: key,
            name: item.recipe.name,
            costPrice: Number(item.recipe.costPerPortion || 0),
            sellingPrice: Number(item.recipe.sellingPrice || 0),
            quantitySold: 0,
            totalRevenue: 0,
            totalCost: 0,
          });
        }
        const metric = dishMetrics.get(key);
        metric.quantitySold += item.quantity;
        metric.totalRevenue += Number(item.recipe.sellingPrice || 0) * item.quantity;
        metric.totalCost += (Number(item.recipe.costPerPortion || 0)) * item.quantity;
      });
    });

    const dishes = Array.from(dishMetrics.values()).map((dish) => ({
      ...dish,
      profit: dish.totalRevenue - dish.totalCost,
      margin: dish.sellingPrice - dish.costPrice,
      marginPercentage:
        dish.sellingPrice > 0
          ? ((dish.sellingPrice - dish.costPrice) / dish.sellingPrice) * 100
          : 0,
    }));

    const totalProfit = dishes.reduce((sum, dish) => sum + dish.profit, 0);
    const averageMargin =
      dishes.length > 0
        ? dishes.reduce((sum, dish) => sum + dish.marginPercentage, 0) /
          dishes.length
        : 0;

    const topProfitable = [...dishes].sort((a, b) => b.profit - a.profit);
    const lowMargin = [...dishes]
      .filter((d) => d.marginPercentage < 20)
      .sort((a, b) => a.marginPercentage - b.marginPercentage);

    return NextResponse.json({
      period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
      totalProfit,
      averageMargin,
      dishes,
      topProfitable,
      lowMargin,
    });
  } catch (error) {
    console.error('Error generating profitability report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
