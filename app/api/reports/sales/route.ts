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

    const totalSales = orders.reduce(
      (sum, order) =>
        sum +
        order.items.reduce(
          (itemSum, item) => itemSum + Number(item.recipe.sellingPrice || 0) * item.quantity,
          0
        ),
      0
    );

    const totalOrders = orders.length;
    const averageTicket = totalOrders > 0 ? totalSales / totalOrders : 0;

    const topDishes = new Map();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const key = item.recipe.name;
        if (!topDishes.has(key)) {
          topDishes.set(key, {
            name: key,
            quantity: 0,
            revenue: 0,
          });
        }
        const dish = topDishes.get(key);
        dish.quantity += item.quantity;
        dish.revenue += Number(item.recipe.sellingPrice || 0) * item.quantity;
      });
    });

    const byCategory = new Map();
    orders.forEach((order) => {
      order.items.forEach((item) => {
        const category = 'Pratos';
        if (!byCategory.has(category)) {
          byCategory.set(category, { category, sales: 0, percentage: 0 });
        }
        const cat = byCategory.get(category);
        cat.sales += Number(item.recipe.sellingPrice || 0) * item.quantity;
      });
    });

    byCategory.forEach((cat) => {
      cat.percentage = totalSales > 0 ? (cat.sales / totalSales) * 100 : 0;
    });

    return NextResponse.json({
      period: `${startDate.toLocaleDateString('pt-BR')} a ${endDate.toLocaleDateString('pt-BR')}`,
      totalSales,
      totalOrders,
      averageTicket,
      topDishes: Array.from(topDishes.values()).sort((a, b) => b.revenue - a.revenue),
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.sales - a.sales),
    });
  } catch (error) {
    console.error('Error generating sales report:', error);
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
