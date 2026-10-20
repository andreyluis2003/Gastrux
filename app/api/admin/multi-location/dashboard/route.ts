// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MANAGER_ROLES } from '@/lib/auth/restaurant-role';
import { storeMetrics } from '@/lib/multi-location/metrics';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;

    // Only the stores where this person is the owner or a manager: the numbers are revenue and CMV
    const userRestaurants = await prisma.restaurantUser.findMany({
      where: { userId, isActive: true, role: { in: MANAGER_ROLES } },
      include: {
        restaurant: {
          select: {
            id: true, name: true, city: true, state: true, status: true,
            subscriptionTier: true, logoUrl: true,
          },
        },
      },
    });

    if (userRestaurants.length < 1) {
      return NextResponse.json({ locations: [], consolidated: null });
    }

    const restaurantIds = userRestaurants.map(ur => ur.restaurant.id);
    const period = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get('period'))) ? Number(req.nextUrl.searchParams.get('period')) : 30;

    const [metrics, allRecipeCounts, allIngredientCounts] = await Promise.all([
      Promise.all(restaurantIds.map((rid) => storeMetrics(rid, period))),
      prisma.recipe.groupBy({
        by: ['restaurantId'],
        where: { restaurantId: { in: restaurantIds }, active: true },
        _count: true,
      }),
      prisma.ingredient.groupBy({
        by: ['restaurantId'],
        where: { restaurantId: { in: restaurantIds }, active: true },
        _count: true,
      }),
    ]);

    const locations = userRestaurants.map((ur, i) => {
      const r = ur.restaurant;
      const m = metrics[i];
      return {
        id: r.id,
        name: r.name,
        city: r.city,
        state: r.state,
        status: r.status,
        logoUrl: r.logoUrl,
        role: ur.role,
        metrics: {
          totalRevenue: m.revenue,
          totalOrders: m.sales,
          ordersToday: m.salesToday,
          avgTicket: m.avgTicket,
          cmvPercent: m.cmvPercent,
          lowStock: m.lowStock,
          recipes: allRecipeCounts.find(c => c.restaurantId === r.id)?._count || 0,
          ingredients: allIngredientCounts.find(c => c.restaurantId === r.id)?._count || 0,
        },
      };
    });

    // Sort by revenue descending (ranking)
    locations.sort((a, b) => b.metrics.totalRevenue - a.metrics.totalRevenue);

    // Consolidated
    const consolidated = {
      totalRevenue: locations.reduce((s, l) => s + l.metrics.totalRevenue, 0),
      totalOrders: locations.reduce((s, l) => s + l.metrics.totalOrders, 0),
      totalOrdersToday: locations.reduce((s, l) => s + l.metrics.ordersToday, 0),
      avgCmv: locations.length > 0 ? locations.reduce((s, l) => s + l.metrics.cmvPercent, 0) / locations.length : 0,
      avgTicket: locations.reduce((s, l) => s + l.metrics.totalOrders, 0) > 0
        ? locations.reduce((s, l) => s + l.metrics.totalRevenue, 0) / locations.reduce((s, l) => s + l.metrics.totalOrders, 0)
        : 0,
      totalLocations: locations.length,
      bestLocation: locations[0]?.name || '-',
      worstCmv: locations.length > 0 ? locations.reduce((a, b) => a.metrics.cmvPercent > b.metrics.cmvPercent ? a : b).name : '-',
    };

    return NextResponse.json({ locations, consolidated, period });
  } catch (error) {
    console.error('Multi-location dashboard error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
