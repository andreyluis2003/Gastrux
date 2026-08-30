// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // KPIs paralelos
    const [
      totalUsers,
      activeUsers,
      totalOrders,
      totalPayments,
      recentSnapshots,
      staffCount,
      lowStockCount,
      recentLogs,
      todayRevenue,
      restaurantInfo,
    ] = await Promise.all([
      // Total de usuários
      prisma.user.count(),
      // Usuários ativos
      prisma.user.count({ where: { active: true } }),
      // Total de pedidos no período
      prisma.order.count({
        where: { createdAt: { gte: startDate } },
      }),
      // Pagamentos aprovados no período
      prisma.payment.findMany({
        where: {
          status: { in: ['APPROVED', 'PROCESSING'] },
          createdAt: { gte: startDate },
        },
        select: { amount: true, method: true, createdAt: true },
      }),
      // Snapshots de métricas
      prisma.metricSnapshot.findMany({
        where: { snapshotDate: { gte: startDate } },
        orderBy: { snapshotDate: 'desc' },
        take: 30,
      }),
      // Staff ativo
      prisma.staffMember.count({ where: { status: 'ACTIVE' } }),
      // Ingredientes com estoque baixo (placeholder - será calculado com stock model)
      Promise.resolve(0),
      // Últimos logs de auditoria
      prisma.adminLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true, email: true, role: true } } },
      }),
      // Receita de hoje
      (async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const payments = await prisma.payment.findMany({
          where: {
            status: { in: ['APPROVED'] },
            createdAt: { gte: today },
          },
          select: { amount: true },
        });
        return payments.reduce((sum, p) => sum + Number(p.amount), 0);
      })(),
      // Info do restaurante
      prisma.restaurant.findFirst({ where: { status: 'ACTIVE' } }),
    ]);

    // Calcular KPIs
    const totalRevenue = totalPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const profitMargin = totalRevenue > 0 ? ((totalRevenue * 0.3) / totalRevenue) * 100 : 0;

    // Receita por método de pagamento
    const revenueByMethod: Record<string, number> = {};
    totalPayments.forEach((p) => {
      const method = p.method || 'OUTROS';
      revenueByMethod[method] = (revenueByMethod[method] || 0) + Number(p.amount);
    });

    // Receita diária (últimos 7 dias)
    const dailyRevenue: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const snapshot = recentSnapshots.find(
        (s) => s.snapshotDate.toISOString().split('T')[0] === dateStr
      );
      dailyRevenue.push({
        date: dateStr,
        revenue: snapshot ? Number(snapshot.totalRevenue) : 0,
        orders: snapshot ? snapshot.totalOrders : 0,
      });
    }

    // Alertas ativos
    const alerts: { type: string; message: string; severity: string }[] = [];
    if (lowStockCount > 0) {
      alerts.push({
        type: 'LOW_STOCK',
        message: `${lowStockCount} ingrediente(s) com estoque abaixo do mínimo`,
        severity: lowStockCount > 5 ? 'HIGH' : 'MEDIUM',
      });
    }
    if (totalOrders === 0 && days <= 1) {
      alerts.push({
        type: 'NO_ORDERS',
        message: 'Nenhum pedido registrado hoje',
        severity: 'LOW',
      });
    }

    return NextResponse.json({
      kpis: {
        totalRevenue,
        todayRevenue,
        totalOrders,
        avgTicket,
        profitMargin,
        totalUsers,
        activeUsers,
        staffCount,
        lowStockCount,
      },
      revenueByMethod,
      dailyRevenue,
      recentSnapshots: recentSnapshots.slice(0, 7),
      recentLogs,
      alerts,
      restaurant: restaurantInfo,
    });
  } catch (error) {
    console.error('[Admin Dashboard] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
