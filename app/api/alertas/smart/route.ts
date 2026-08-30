// @ts-nocheck
// Feature: Notificações/Alertas automáticos - estoque baixo, pedidos novos
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantUser = await prisma.restaurantUser.findFirst({ where: { userId: (session as any).user?.id || (session as any).id } });
    const restaurantId = restaurantUser?.restaurantId;
    if (!restaurantId) return NextResponse.json({ alerts: [] });

    const alerts: any[] = [];

    // 1. Low stock alerts
    const stocks = await prisma.stock.findMany({
      where: { restaurantId },
      include: { ingredient: { select: { name: true, minimumStock: true, standardUnit: true } } },
    });
    for (const stock of stocks) {
      if (stock.currentQuantity <= stock.ingredient.minimumStock && stock.ingredient.minimumStock > 0) {
        alerts.push({
          type: 'LOW_STOCK', severity: stock.currentQuantity <= 0 ? 'CRITICAL' : 'HIGH',
          title: `Estoque baixo: ${stock.ingredient.name}`,
          message: `Atual: ${stock.currentQuantity} ${stock.ingredient.standardUnit} (m\u00ednimo: ${stock.ingredient.minimumStock})`,
          category: 'estoque',
        });
      }
    }

    // 2. Pending orders
    const pendingOrders = await prisma.order.count({
      where: { restaurantId, status: 'PENDING' },
    });
    if (pendingOrders > 0) {
      alerts.push({
        type: 'NEW_ORDERS', severity: pendingOrders > 5 ? 'HIGH' : 'MEDIUM',
        title: `${pendingOrders} pedido${pendingOrders > 1 ? 's' : ''} pendente${pendingOrders > 1 ? 's' : ''}`,
        message: 'H\u00e1 pedidos aguardando prepara\u00e7\u00e3o',
        category: 'pedidos',
      });
    }

    // 3. Waste alerts (high waste in last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentWaste = await prisma.wasteLog.aggregate({
      where: { restaurantId, date: { gte: weekAgo } },
      _sum: { estimatedCost: true },
      _count: true,
    });
    if ((recentWaste._sum.estimatedCost || 0) > 100) {
      alerts.push({
        type: 'HIGH_WASTE', severity: 'MEDIUM',
        title: `Desperd\u00edcio elevado na semana`,
        message: `R$ ${(recentWaste._sum.estimatedCost || 0).toFixed(2)} em ${recentWaste._count} registros nos \u00faltimos 7 dias`,
        category: 'desperdicio',
      });
    }

    // 4. Unprocessed invoices
    const pendingInvoices = await prisma.invoice.count({
      where: { restaurantId, status: 'PENDING' },
    });
    if (pendingInvoices > 0) {
      alerts.push({
        type: 'PENDING_INVOICES', severity: 'LOW',
        title: `${pendingInvoices} nota${pendingInvoices > 1 ? 's' : ''} fiscal${pendingInvoices > 1 ? 'is' : ''} pendente${pendingInvoices > 1 ? 's' : ''}`,
        message: 'Notas fiscais aguardando processamento',
        category: 'fiscal',
      });
    }

    // 5. Existing DB alerts (non-dismissed)
    const dbAlerts = await prisma.alert.findMany({
      where: { restaurantId, dismissed: false },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    for (const a of dbAlerts) {
      alerts.push({
        id: a.id, type: a.type, severity: a.severity,
        title: a.title, message: a.message, category: 'sistema', createdAt: a.createdAt,
      });
    }

    alerts.sort((a, b) => {
      const sev = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return (sev[a.severity] || 3) - (sev[b.severity] || 3);
    });

    return NextResponse.json({ alerts, total: alerts.length });
  } catch (error) {
    console.error('Error fetching smart alerts:', error);
    return NextResponse.json({ alerts: [], total: 0 });
  }
}
