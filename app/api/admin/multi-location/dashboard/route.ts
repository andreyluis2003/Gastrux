// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = (session.user as any).id;

    const userRestaurants = await prisma.restaurantUser.findMany({
      where: { userId, isActive: true },
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
    const period = parseInt(req.nextUrl.searchParams.get('period') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch data for all locations in parallel
    const [allOrders, allExternalOrders, allCmvSnapshots, allRecipeCounts, allIngredientCounts, allStaffCounts] = await Promise.all([
      prisma.order.findMany({
        where: { restaurantId: { in: restaurantIds }, createdAt: { gte: startDate }, status: { notIn: ['CANCELLED'] } },
        select: { restaurantId: true, total: true, createdAt: true },
      }),
      prisma.externalOrder.findMany({
        where: { restaurantId: { in: restaurantIds }, orderReceivedAt: { gte: startDate }, status: { in: ['DELIVERED', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP'] } },
        select: { restaurantId: true, totalAmount: true, orderReceivedAt: true },
      }),
      prisma.cMVSnapshot.findMany({
        where: { restaurantId: { in: restaurantIds } },
        orderBy: { periodEnd: 'desc' },
        distinct: ['restaurantId'],
        select: { restaurantId: true, cmvPercent: true, alertLevel: true, totalCMV: true, revenue: true },
      }),
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
      prisma.staffMember.groupBy({
        by: ['restaurantId'],
        where: { restaurantId: { in: restaurantIds }, active: true },
        _count: true,
      }),
    ]);

    // Build per-location metrics
    const locations = userRestaurants.map(ur => {
      const r = ur.restaurant;
      const rid = r.id;

      // Direct orders
      const directOrders = allOrders.filter(o => o.restaurantId === rid);
      const directRevenue = directOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const todayOrders = directOrders.filter(o => new Date(o.createdAt) >= today);

      // External orders
      const extOrders = allExternalOrders.filter(o => o.restaurantId === rid);
      const extRevenue = extOrders.reduce((s, o) => s + o.totalAmount, 0);

      const totalRevenue = directRevenue + extRevenue;
      const totalOrders = directOrders.length + extOrders.length;
      const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // CMV
      const cmv = allCmvSnapshots.find(c => c.restaurantId === rid);

      // Counts
      const recipes = allRecipeCounts.find(c => c.restaurantId === rid)?._count || 0;
      const ingredients = allIngredientCounts.find(c => c.restaurantId === rid)?._count || 0;
      const staff = allStaffCounts.find(c => c.restaurantId === rid)?._count || 0;

      return {
        id: rid,
        name: r.name,
        city: r.city,
        state: r.state,
        status: r.status,
        logoUrl: r.logoUrl,
        role: ur.role,
        metrics: {
          totalRevenue,
          directRevenue,
          externalRevenue: extRevenue,
          totalOrders,
          directOrders: directOrders.length,
          externalOrders: extOrders.length,
          ordersToday: todayOrders.length,
          avgTicket,
          cmvPercent: cmv?.cmvPercent || 0,
          cmvAlertLevel: cmv?.alertLevel || 'NORMAL',
          recipes,
          ingredients,
          staff,
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
