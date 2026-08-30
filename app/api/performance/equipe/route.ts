// @ts-nocheck
// Feature: Dashboard de Performance - KPIs de equipe
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get('days') || '30');
    const start = new Date();
    start.setDate(start.getDate() - days);

    const restaurantUser = await prisma.restaurantUser.findFirst({ where: { userId: (session as any).user?.id || (session as any).id } });
    const restaurantId = restaurantUser?.restaurantId;
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante n\u00e3o encontrado' }, { status: 404 });

    // Staff members
    const staff = await prisma.staffMember.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      include: { user: { select: { name: true, email: true, image: true } } },
    });

    // Order completion metrics
    const completedOrders = await prisma.order.findMany({
      where: { restaurantId, createdAt: { gte: start }, status: 'COMPLETED' },
      select: { id: true, createdAt: true, completedAt: true, totalItems: true, total: true, orderType: true },
    });

    const totalOrders = completedOrders.length;
    const avgPrepTime = completedOrders.filter((o) => o.completedAt).reduce((sum, o) => {
      const diff = (new Date(o.completedAt!).getTime() - new Date(o.createdAt).getTime()) / 60000;
      return sum + diff;
    }, 0) / (completedOrders.filter((o) => o.completedAt).length || 1);

    const totalRevenue = completedOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Prep time distribution
    const prepTimes = await prisma.orderPrepTime.findMany({
      where: { createdAt: { gte: start }, isCompleted: true },
      select: { estimatedMinutes: true, actualMinutes: true },
    });
    const avgEstimated = prepTimes.reduce((s, p) => s + p.estimatedMinutes, 0) / (prepTimes.length || 1);
    const avgActual = prepTimes.reduce((s, p) => s + (p.actualMinutes || 0), 0) / (prepTimes.length || 1);
    const onTimeRate = prepTimes.filter((p) => (p.actualMinutes || 999) <= p.estimatedMinutes).length / (prepTimes.length || 1) * 100;

    // Orders by hour
    const ordersByHour: Record<number, number> = {};
    completedOrders.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      ordersByHour[h] = (ordersByHour[h] || 0) + 1;
    });

    // Daily performance
    const dailyPerformance: Record<string, { orders: number; revenue: number }> = {};
    completedOrders.forEach((o) => {
      const day = o.createdAt.toISOString().slice(0, 10);
      if (!dailyPerformance[day]) dailyPerformance[day] = { orders: 0, revenue: 0 };
      dailyPerformance[day].orders++;
      dailyPerformance[day].revenue += Number(o.total || 0);
    });

    return NextResponse.json({
      summary: {
        totalOrders, totalRevenue, avgTicket: Math.round(avgTicket * 100) / 100,
        avgPrepTimeMinutes: Math.round(avgPrepTime * 10) / 10,
        staffCount: staff.length, period: days,
      },
      prepTime: {
        avgEstimated: Math.round(avgEstimated * 10) / 10,
        avgActual: Math.round(avgActual * 10) / 10,
        onTimeRate: Math.round(onTimeRate * 10) / 10,
        totalMeasured: prepTimes.length,
      },
      staff: staff.map((s) => ({
        id: s.id, name: s.user.name, role: s.role, image: s.user.image,
        ordersProcessed: s.totalOrdersProcessed,
        avgPrepTime: s.averagePreparationTime,
        satisfaction: s.customerSatisfactionScore,
      })),
      ordersByHour: Object.entries(ordersByHour).map(([h, count]) => ({ hour: parseInt(h), count })).sort((a, b) => a.hour - b.hour),
      dailyPerformance: Object.entries(dailyPerformance).map(([date, data]) => ({ date, ...data })).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error) {
    console.error('Error fetching performance data:', error);
    return NextResponse.json({ error: 'Erro ao carregar performance' }, { status: 500 });
  }
}
