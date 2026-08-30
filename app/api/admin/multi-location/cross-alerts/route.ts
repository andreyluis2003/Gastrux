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
      include: { restaurant: { select: { id: true, name: true } } },
    });

    if (userRestaurants.length < 2) {
      return NextResponse.json({ alerts: [], message: 'Necessário ter pelo menos 2 unidades para alertas cruzados' });
    }

    const restaurantIds = userRestaurants.map(ur => ur.restaurant.id);
    const nameMap = Object.fromEntries(userRestaurants.map(ur => [ur.restaurant.id, ur.restaurant.name]));

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Fetch data for cross-comparison
    const [cmvSnapshots, orderCounts, revenueSums, stockAlerts] = await Promise.all([
      prisma.cMVSnapshot.findMany({
        where: { restaurantId: { in: restaurantIds } },
        orderBy: { periodEnd: 'desc' },
        distinct: ['restaurantId'],
        select: { restaurantId: true, cmvPercent: true, alertLevel: true, revenue: true, totalCMV: true },
      }),
      prisma.order.groupBy({
        by: ['restaurantId'],
        where: { restaurantId: { in: restaurantIds }, createdAt: { gte: thirtyDaysAgo }, status: { notIn: ['CANCELLED'] } },
        _count: true,
      }),
      prisma.order.groupBy({
        by: ['restaurantId'],
        where: { restaurantId: { in: restaurantIds }, createdAt: { gte: thirtyDaysAgo }, status: { notIn: ['CANCELLED'] } },
        _sum: { total: true },
      }),
      prisma.alert.findMany({
        where: { restaurantId: { in: restaurantIds }, type: 'LOW_STOCK', dismissed: false },
        select: { restaurantId: true, title: true, message: true },
      }),
    ]);

    const alerts: Array<{
      id: string;
      type: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      message: string;
      locations: string[];
    }> = [];

    // 1. CMV Disparity Alert
    if (cmvSnapshots.length >= 2) {
      const cmvValues = cmvSnapshots.map(s => ({ name: nameMap[s.restaurantId], cmv: s.cmvPercent, id: s.restaurantId }));
      const maxCmv = cmvValues.reduce((a, b) => a.cmv > b.cmv ? a : b);
      const minCmv = cmvValues.reduce((a, b) => a.cmv < b.cmv ? a : b);
      const diff = maxCmv.cmv - minCmv.cmv;

      if (diff > 5) {
        alerts.push({
          id: `cmv-disparity-${Date.now()}`,
          type: 'CMV_DISPARITY',
          severity: diff > 10 ? 'critical' : 'warning',
          title: 'Disparidade de CMV entre unidades',
          message: `${maxCmv.name} tem CMV de ${maxCmv.cmv.toFixed(1)}% enquanto ${minCmv.name} está em ${minCmv.cmv.toFixed(1)}% (diferença de ${diff.toFixed(1)}pp). Investigue custos e processos na unidade com maior CMV.`,
          locations: [maxCmv.name, minCmv.name],
        });
      }

      // Any location with CMV > 40%
      for (const c of cmvValues) {
        if (c.cmv > 40) {
          alerts.push({
            id: `cmv-critical-${c.id}`,
            type: 'CMV_CRITICAL',
            severity: 'critical',
            title: `CMV crítico em ${c.name}`,
            message: `${c.name} está com CMV de ${c.cmv.toFixed(1)}%, acima do limite saudável de 35%. Ação urgente necessária.`,
            locations: [c.name],
          });
        }
      }
    }

    // 2. Revenue Disparity
    if (revenueSums.length >= 2) {
      const revValues = revenueSums.map(r => ({
        name: nameMap[r.restaurantId],
        revenue: Number(r._sum?.total || 0),
      }));
      const maxRev = revValues.reduce((a, b) => a.revenue > b.revenue ? a : b);
      const minRev = revValues.reduce((a, b) => a.revenue < b.revenue ? a : b);

      if (maxRev.revenue > 0 && minRev.revenue > 0) {
        const ratio = maxRev.revenue / minRev.revenue;
        if (ratio > 3) {
          alerts.push({
            id: `revenue-gap-${Date.now()}`,
            type: 'REVENUE_GAP',
            severity: 'warning',
            title: 'Grande diferença de faturamento',
            message: `${maxRev.name} faturou ${ratio.toFixed(1)}x mais que ${minRev.name} nos últimos 30 dias. Analise se há oportunidades de melhoria na unidade com menor faturamento.`,
            locations: [maxRev.name, minRev.name],
          });
        }
      }
    }

    // 3. Order Volume Disparity
    if (orderCounts.length >= 2) {
      const ordValues = orderCounts.map(o => ({ name: nameMap[o.restaurantId], count: o._count }));
      const maxOrd = ordValues.reduce((a, b) => a.count > b.count ? a : b);
      const minOrd = ordValues.reduce((a, b) => a.count < b.count ? a : b);

      if (maxOrd.count > 0 && minOrd.count > 0) {
        const ratio = maxOrd.count / minOrd.count;
        if (ratio > 2.5) {
          alerts.push({
            id: `orders-gap-${Date.now()}`,
            type: 'ORDERS_GAP',
            severity: 'info',
            title: 'Diferença significativa de pedidos',
            message: `${maxOrd.name} processou ${maxOrd.count} pedidos vs ${minOrd.count} em ${minOrd.name} (${ratio.toFixed(1)}x mais). Considere rebalancear marketing ou horários de funcionamento.`,
            locations: [maxOrd.name, minOrd.name],
          });
        }
      }
    }

    // 4. Stock Alerts concentration
    const stockByLoc: Record<string, number> = {};
    for (const a of stockAlerts) {
      const name = nameMap[a.restaurantId] || a.restaurantId;
      stockByLoc[name] = (stockByLoc[name] || 0) + 1;
    }
    for (const [name, count] of Object.entries(stockByLoc)) {
      if (count >= 5) {
        alerts.push({
          id: `stock-concentration-${name}`,
          type: 'STOCK_CONCENTRATION',
          severity: 'warning',
          title: `Muitos alertas de estoque em ${name}`,
          message: `${name} tem ${count} alertas de estoque baixo ativos. Considere transferir insumos de outra unidade ou agilizar compras.`,
          locations: [name],
        });
      }
    }

    // 5. Location without recent orders
    for (const ur of userRestaurants) {
      const hasOrders = orderCounts.find(o => o.restaurantId === ur.restaurant.id);
      if (!hasOrders || hasOrders._count === 0) {
        alerts.push({
          id: `no-orders-${ur.restaurant.id}`,
          type: 'NO_RECENT_ORDERS',
          severity: 'critical',
          title: `${ur.restaurant.name} sem pedidos recentes`,
          message: `${ur.restaurant.name} não registrou pedidos nos últimos 30 dias. Verifique se a unidade está operando normalmente.`,
          locations: [ur.restaurant.name],
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return NextResponse.json({ alerts, totalLocations: userRestaurants.length });
  } catch (error) {
    console.error('Cross-alerts error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
