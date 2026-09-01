// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });
  }

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
      // Total de usuários deste restaurante
      prisma.restaurantUser.count({ where: { restaurantId } }),
      // Usuários ativos deste restaurante
      prisma.restaurantUser.count({ where: { restaurantId, isActive: true, user: { active: true } } }),
      // Total de pedidos no período
      prisma.order.count({
        where: { restaurantId, createdAt: { gte: startDate } },
      }),
      // Pagamentos aprovados no período
      prisma.payment.findMany({
        where: {
          restaurantId,
          status: { in: ['APPROVED', 'PROCESSING'] },
          createdAt: { gte: startDate },
        },
        select: { amount: true, method: true, createdAt: true },
      }),
      // Snapshots de métricas
      prisma.metricSnapshot.findMany({
        where: { restaurantId, snapshotDate: { gte: startDate } },
        orderBy: { snapshotDate: 'desc' },
        take: 30,
      }),
      // Staff ativo
      prisma.staffMember.count({ where: { restaurantId, status: 'ACTIVE' } }),
      // Ingredientes com estoque baixo
      (async () => {
        const stocks = await prisma.stock.findMany({
          where: { restaurantId, ingredient: { active: true } },
          select: { currentQuantity: true, ingredient: { select: { minimumStock: true } } },
        });
        return stocks.filter((s) => Number(s.currentQuantity) < Number(s.ingredient.minimumStock)).length;
      })(),
      // Últimos logs de auditoria deste restaurante
      prisma.auditLog.findMany({
        where: { restaurantId },
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
            restaurantId,
            status: { in: ['APPROVED'] },
            createdAt: { gte: today },
          },
          select: { amount: true },
        });
        return payments.reduce((sum, p) => sum + Number(p.amount), 0);
      })(),
      // Info do restaurante
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
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
