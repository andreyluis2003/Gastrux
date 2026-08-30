// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  if (!session || !userId) {
    return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  }

  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { take: 1, select: { restaurantId: true } } },
  });
  const restaurantId = u?.currentRestaurantId || u?.restaurants?.[0]?.restaurantId;

  if (!restaurantId) {
    return NextResponse.json({
      platforms: [],
      totals: { orders: 0, revenue: 0, avgTicket: 0, orders7d: 0, revenue7d: 0 },
      statusBreakdown: {},
      integrationsCount: 0,
      integrationsActive: 0,
    });
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [integrations, orders30d, orders7d, byStatus30d] = await Promise.all([
    prisma.deliveryIntegration.findMany({ where: {} }),
    prisma.externalOrder.findMany({
      where: { restaurantId, orderReceivedAt: { gte: thirtyDaysAgo } },
      include: { integration: { select: { platform: true } } },
    }),
    prisma.externalOrder.findMany({
      where: { restaurantId, orderReceivedAt: { gte: sevenDaysAgo } },
      include: { integration: { select: { platform: true } } },
    }),
    prisma.externalOrder.groupBy({
      by: ['status'],
      where: { restaurantId, orderReceivedAt: { gte: thirtyDaysAgo } },
      _count: true,
    }),
  ]);

  const platformMap: Record<string, { orders: number; revenue: number; avgTicket: number }> = {};
  for (const integ of integrations) {
    platformMap[integ.platform] = { orders: 0, revenue: 0, avgTicket: 0 };
  }
  let totalRevenue30d = 0;
  for (const o of orders30d) {
    const p = o.integration?.platform;
    if (!p) continue;
    if (!platformMap[p]) platformMap[p] = { orders: 0, revenue: 0, avgTicket: 0 };
    platformMap[p].orders += 1;
    platformMap[p].revenue += Number(o.totalAmount || 0);
    totalRevenue30d += Number(o.totalAmount || 0);
  }
  for (const k of Object.keys(platformMap)) {
    const p = platformMap[k];
    p.avgTicket = p.orders ? p.revenue / p.orders : 0;
  }

  // 7d trend
  const revenue7d = orders7d.reduce((acc: number, o: any) => acc + Number(o.totalAmount || 0), 0);
  const orders7dCount = orders7d.length;

  // Status breakdown
  const statusBreakdown: Record<string, number> = {};
  for (const s of byStatus30d) {
    statusBreakdown[s.status] = (s as any)._count;
  }

  return NextResponse.json({
    platforms: Object.entries(platformMap).map(([platform, v]) => ({ platform, ...v })),
    totals: {
      orders: orders30d.length,
      revenue: totalRevenue30d,
      avgTicket: orders30d.length ? totalRevenue30d / orders30d.length : 0,
      orders7d: orders7dCount,
      revenue7d,
    },
    statusBreakdown,
    integrationsCount: integrations.length,
    integrationsActive: integrations.filter((i: any) => i.isActive).length,
  });
}
