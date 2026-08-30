// @ts-nocheck
// Feature: Multi-unidade - Consolidação de dados entre filiais
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const userId = (session as any).user?.id || (session as any).id;
    const restaurantUsers = await prisma.restaurantUser.findMany({
      where: { userId },
      include: { restaurant: { select: { id: true, name: true, address: true, city: true, status: true } } },
    });

    const restaurants = restaurantUsers.map((ru) => ru.restaurant);
    const restaurantIds = restaurants.map((r) => r.id);

    if (restaurantIds.length === 0) return NextResponse.json({ restaurants: [], consolidated: null });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Consolidate per restaurant
    const perUnit: any[] = [];
    for (const rest of restaurants) {
      const orders = await prisma.order.findMany({
        where: { restaurantId: rest.id, createdAt: { gte: thirtyDaysAgo }, status: { in: ['COMPLETED', 'READY'] } },
        select: { total: true, orderType: true },
      });
      const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
      const orderCount = orders.length;

      const staffCount = await prisma.staffMember.count({ where: { restaurantId: rest.id, status: 'ACTIVE' } });
      const lowStock = await prisma.stock.count({
        where: { restaurantId: rest.id, ingredient: { minimumStock: { gt: 0 } }, currentQuantity: { lte: 0 } },
      });

      perUnit.push({
        id: rest.id, name: rest.name, city: rest.city, status: rest.status,
        revenue, orderCount, staffCount, lowStockItems: lowStock,
        avgTicket: orderCount > 0 ? revenue / orderCount : 0,
      });
    }

    const consolidated = {
      totalRevenue: perUnit.reduce((s, u) => s + u.revenue, 0),
      totalOrders: perUnit.reduce((s, u) => s + u.orderCount, 0),
      totalStaff: perUnit.reduce((s, u) => s + u.staffCount, 0),
      totalLowStock: perUnit.reduce((s, u) => s + u.lowStockItems, 0),
      unitCount: restaurants.length,
    };

    return NextResponse.json({ restaurants: perUnit, consolidated });
  } catch (error) {
    console.error('Error fetching multi-unit data:', error);
    return NextResponse.json({ error: 'Erro ao consolidar dados' }, { status: 500 });
  }
}
