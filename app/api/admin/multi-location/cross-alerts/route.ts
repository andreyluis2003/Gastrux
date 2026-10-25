// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { formatPercent } from '@/lib/formatters';
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

    // Only the stores where this person is the owner or a manager: the alerts compare revenue and CMV
    const userRestaurants = await prisma.restaurantUser.findMany({
      where: { userId, isActive: true, role: { in: MANAGER_ROLES } },
      include: { restaurant: { select: { id: true, name: true } } },
    });

    if (userRestaurants.length < 2) {
      return NextResponse.json({ alerts: [], message: 'Necessário ter pelo menos 2 unidades para alertas cruzados' });
    }

    // Last 30 days with the numbers of the DRE and the Caixa (lib/multi-location/metrics.ts, 2026-10-20: they
    // came from every kitchen order and from CMV snapshots only the CMV screen writes)
    const metrics = await Promise.all(userRestaurants.map((ur) => storeMetrics(ur.restaurant.id, 30)));
    const byStore = userRestaurants.map((ur, i) => ({ id: ur.restaurant.id, name: ur.restaurant.name, ...metrics[i] }));
    const selling = byStore.filter((m) => m.sales > 0);

    const alerts: Array<{
      id: string;
      type: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      message: string;
      locations: string[];
    }> = [];

    // 1. CMV Disparity Alert
    if (selling.length >= 2) {
      const maxCmv = selling.reduce((a, b) => a.cmvPercent > b.cmvPercent ? a : b);
      const minCmv = selling.reduce((a, b) => a.cmvPercent < b.cmvPercent ? a : b);
      const diff = maxCmv.cmvPercent - minCmv.cmvPercent;

      if (diff > 5) {
        alerts.push({
          id: `cmv-disparity-${Date.now()}`,
          type: 'CMV_DISPARITY',
          severity: diff > 10 ? 'critical' : 'warning',
          title: 'Disparidade de CMV entre unidades',
          message: `${maxCmv.name} tem CMV de ${formatPercent(maxCmv.cmvPercent, 1)} enquanto ${minCmv.name} está em ${formatPercent(minCmv.cmvPercent, 1)} (diferença de ${formatPercent(diff, 1).replace('%', '')} pontos percentuais). Investigue custos e processos na unidade com maior CMV.`,
          locations: [maxCmv.name, minCmv.name],
        });
      }
    }

    // Any location with CMV > 40%
    for (const c of selling) {
      if (c.cmvPercent > 40) {
        alerts.push({
          id: `cmv-critical-${c.id}`,
          type: 'CMV_CRITICAL',
          severity: 'critical',
          title: `CMV crítico em ${c.name}`,
          message: `${c.name} está com CMV de ${formatPercent(c.cmvPercent, 1)} nos últimos 30 dias, acima de 40%. Confira os preços, as fichas técnicas e o custo dos insumos.`,
          locations: [c.name],
        });
      }
    }

    // 2. Revenue Disparity
    if (selling.length >= 2) {
      const maxRev = selling.reduce((a, b) => a.revenue > b.revenue ? a : b);
      const minRev = selling.reduce((a, b) => a.revenue < b.revenue ? a : b);

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

    // 3. Sales Volume Disparity
    if (selling.length >= 2) {
      const maxOrd = selling.reduce((a, b) => a.sales > b.sales ? a : b);
      const minOrd = selling.reduce((a, b) => a.sales < b.sales ? a : b);
      const ratio = maxOrd.sales / minOrd.sales;
      if (ratio > 2.5) {
        alerts.push({
          id: `orders-gap-${Date.now()}`,
          type: 'ORDERS_GAP',
          severity: 'info',
          title: 'Diferença grande de vendas',
          message: `${maxOrd.name} fez ${maxOrd.sales} vendas e ${minOrd.name} ${minOrd.sales} (${ratio.toFixed(1)}x mais). Considere rebalancear marketing ou horários de funcionamento.`,
          locations: [maxOrd.name, minOrd.name],
        });
      }
    }

    // 4. Insumos below the minimum (the Estoque screen rule)
    for (const { name, lowStock } of byStore) {
      if (lowStock >= 5) {
        alerts.push({
          id: `stock-concentration-${name}`,
          type: 'STOCK_CONCENTRATION',
          severity: 'warning',
          title: `Muitos insumos em falta em ${name}`,
          message: `${name} tem ${lowStock} insumos abaixo do estoque mínimo. Considere transferir insumos de outra unidade ou agilizar compras.`,
          locations: [name],
        });
      }
    }

    // 5. Location without recent sales
    for (const m of byStore) {
      if (m.sales === 0) {
        alerts.push({
          id: `no-orders-${m.id}`,
          type: 'NO_RECENT_ORDERS',
          severity: 'critical',
          title: `${m.name} sem vendas recentes`,
          message: `${m.name} não registrou vendas nos últimos 30 dias. Verifique se a unidade está operando normalmente.`,
          locations: [m.name],
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
