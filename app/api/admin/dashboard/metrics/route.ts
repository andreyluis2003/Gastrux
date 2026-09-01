// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dashboard/metrics
 * Retorna métricas detalhadas para o dashboard admin
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7d';

    let days = 7;
    if (period === '30d') days = 30;
    else if (period === '90d') days = 90;
    else if (period === '1d') days = 1;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await prisma.metricSnapshot.findMany({
      where: { restaurantId, snapshotDate: { gte: startDate } },
      orderBy: { snapshotDate: 'asc' },
    });

    // Calcular tendências
    const totalRevenue = snapshots.reduce((sum, s) => sum + Number(s.totalRevenue), 0);
    const totalCost = snapshots.reduce((sum, s) => sum + Number(s.totalCost), 0);
    const totalOrders = snapshots.reduce((sum, s) => sum + s.totalOrders, 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const avgMargin = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + Number(s.profitMargin), 0) / snapshots.length
      : 0;

    // Métricas de staff
    const staffMetrics = await prisma.staffMember.findMany({
      where: { restaurantId, status: 'ACTIVE' },
      include: {
        user: { select: { name: true, email: true } },
        commissions: {
          where: { period: { gte: startDate } },
          orderBy: { period: 'desc' },
          take: 1,
        },
      },
    });

    // Métricas de clientes
    const customerStats = await prisma.customer.groupBy({
      by: ['status'],
      where: { restaurantId },
      _count: { id: true },
    });

    // Segmentação de clientes
    const segmentStats = await prisma.customerSegment.groupBy({
      by: ['segment'],
      where: { customer: { restaurantId } },
      _count: { id: true },
      _sum: { totalSpent: true },
    });

    return NextResponse.json({
      period,
      snapshots: snapshots.map((s) => ({
        date: s.snapshotDate,
        revenue: Number(s.totalRevenue),
        cost: Number(s.totalCost),
        orders: s.totalOrders,
        avgTicket: Number(s.averageTicket),
        margin: Number(s.profitMargin),
        newCustomers: s.newCustomers,
        staffWorking: s.totalStaffWorking,
        lowStock: s.ingredientsLowStock,
      })),
      summary: {
        totalRevenue,
        totalCost,
        totalOrders,
        avgTicket,
        avgMargin,
        profit: totalRevenue - totalCost,
      },
      staff: staffMetrics.map((s) => ({
        id: s.id,
        name: s.user?.name || s.user?.email,
        role: s.role,
        status: s.status,
        ordersProcessed: s.totalOrdersProcessed,
        avgPrepTime: s.averagePreparationTime,
        satisfaction: s.customerSatisfactionScore,
        lastCommission: s.commissions[0] ? Number(s.commissions[0].totalEarned) : 0,
      })),
      customers: {
        byStatus: customerStats.map((c) => ({ status: c.status, count: c._count.id })),
        bySegment: segmentStats.map((s) => ({
          segment: s.segment,
          count: s._count.id,
          totalSpent: Number(s._sum.totalSpent || 0),
        })),
      },
    });
  } catch (error) {
    console.error('[Admin Metrics] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
