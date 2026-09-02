// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminSession } from '@/lib/admin-helpers';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/dashboard/alerts
 * Retorna alertas ativos do sistema
 */
export async function GET(request: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });
  }

  try {
    const alerts: {
      id: string;
      type: string;
      message: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      details?: any;
      createdAt: string;
    }[] = [];

    // 1. Ingredientes com estoque baixo (será implementado com Stock model)
    // Placeholder for now
    const lowStock: any[] = [];

    // 2. Pedidos pendentes há mais de 30 min
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const pendingOrders = await prisma.order.count({
      where: {
        restaurantId,
        status: { in: ['PENDING', 'PREPARING'] },
        createdAt: { lt: thirtyMinAgo },
      },
    });
    if (pendingOrders > 0) {
      alerts.push({
        id: 'pending-orders',
        type: 'PENDING_ORDERS',
        message: `${pendingOrders} pedido(s) pendente(s) há mais de 30 minutos`,
        severity: pendingOrders > 3 ? 'HIGH' : 'MEDIUM',
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Pagamentos com falha recentes
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const failedPayments = await prisma.payment.count({
      where: {
        restaurantId,
        status: 'DECLINED',
        createdAt: { gte: today },
      },
    });
    if (failedPayments > 0) {
      alerts.push({
        id: 'failed-payments',
        type: 'FAILED_PAYMENTS',
        message: `${failedPayments} pagamento(s) recusado(s) hoje`,
        severity: failedPayments > 5 ? 'HIGH' : 'LOW',
        createdAt: new Date().toISOString(),
      });
    }

    // 4. Staff sem turno agendado amanhã
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const activeStaff = await prisma.staffMember.count({ where: { restaurantId, status: 'ACTIVE' } });
    const staffWithShift = await prisma.staffShift.findMany({
      where: {
        staffMember: { restaurantId },
        shiftDate: { gte: tomorrow, lte: tomorrowEnd },
        shiftType: { not: 'OFF_DAY' },
      },
      select: { staffMemberId: true },
      distinct: ['staffMemberId'],
    });
    const unscheduled = activeStaff - staffWithShift.length;
    if (unscheduled > 0 && activeStaff > 0) {
      alerts.push({
        id: 'staff-unscheduled',
        type: 'STAFF_UNSCHEDULED',
        message: `${unscheduled} funcionário(s) sem turno agendado para amanhã`,
        severity: 'LOW',
        createdAt: new Date().toISOString(),
      });
    }

    // 5. Comissões pendentes de aprovação
    const pendingCommissions = await prisma.staffCommission.count({
      where: { staffMember: { restaurantId }, status: 'PENDING' },
    });
    if (pendingCommissions > 0) {
      alerts.push({
        id: 'pending-commissions',
        type: 'PENDING_COMMISSIONS',
        message: `${pendingCommissions} comissão(ões) aguardando aprovação`,
        severity: 'LOW',
        createdAt: new Date().toISOString(),
      });
    }

    // Ordenar por severidade
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return NextResponse.json({ alerts, total: alerts.length });
  } catch (error) {
    console.error('[Admin Alerts] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
