// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/audit-logs/stats
 * Estatísticas de logs de auditoria
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [byAction, byUser, byEntity, totalLogs, recentCount] = await Promise.all([
      // Por tipo de ação
      prisma.adminLog.groupBy({
        by: ['action'],
        _count: { id: true },
        where: { createdAt: { gte: startDate } },
        orderBy: { _count: { id: 'desc' } },
      }),
      // Por usuário
      prisma.adminLog.groupBy({
        by: ['userId'],
        _count: { id: true },
        where: { createdAt: { gte: startDate } },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      // Por tipo de entidade
      prisma.adminLog.groupBy({
        by: ['entityType'],
        _count: { id: true },
        where: { createdAt: { gte: startDate } },
        orderBy: { _count: { id: 'desc' } },
      }),
      // Total geral
      prisma.adminLog.count(),
      // Contagem recente (últimas 24h)
      prisma.adminLog.count({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      }),
    ]);

    // Buscar nomes dos usuários
    const userIds = byUser.map((u) => u.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });

    // Atividade por dia
    const dailyActivity: Record<string, number> = {};
    const allLogs = await prisma.adminLog.findMany({
      where: { createdAt: { gte: startDate } },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    allLogs.forEach((log) => {
      const day = log.createdAt.toISOString().split('T')[0];
      dailyActivity[day] = (dailyActivity[day] || 0) + 1;
    });

    // Impacto financeiro total
    const financialLogs = await prisma.adminLog.findMany({
      where: {
        createdAt: { gte: startDate },
        financialImpact: { not: null },
      },
      select: { financialImpact: true, action: true },
    });
    const totalFinancialImpact = financialLogs.reduce((sum, l) => sum + Number(l.financialImpact || 0), 0);

    return NextResponse.json({
      period: { days },
      totalLogs,
      recentCount,
      totalFinancialImpact,
      byAction: byAction.map((a) => ({ action: a.action, count: a._count.id })),
      byUser: byUser.map((u) => {
        const user = users.find((usr) => usr.id === u.userId);
        return {
          userId: u.userId,
          name: user?.name || user?.email || 'Desconhecido',
          count: u._count.id,
        };
      }),
      byEntity: byEntity.map((e) => ({ entityType: e.entityType, count: e._count.id })),
      dailyActivity: Object.entries(dailyActivity).map(([date, count]) => ({ date, count })),
    });
  } catch (error) {
    console.error('[Admin Audit Stats] Erro:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
