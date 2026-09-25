// @ts-nocheck
/**
 * GET /api/admin/transaction-stats
 * Retorna estatísticas globais de uso de transações
 * Requer autenticação de admin
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Nao autenticado' },
        { status: 401 }
      );
    }

    if (!isPlatformAdminIdentity((session.user as any)?.role, session.user?.email)) {
      return NextResponse.json(
        { error: 'Nao autorizado' },
        { status: 403 }
      );
    }

    // Buscar stats de todos os users
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await prisma.dailyTransactionCount.findMany({
      where: { date: today },
      include: {
        user: {
          select: { id: true, email: true, subscriptionTier: true },
        },
      },
    });

    // Calcular totais
    const totalTransactions = todayStats.reduce((sum: number, s: any) => sum + s.count, 0);
    const averagePerUser = todayStats.length > 0
      ? totalTransactions / todayStats.length
      : 0;

    // Stats por tier
    const statsByTier: Record<string, any> = {};
    for (const stat of todayStats) {
      const tier = stat.user.subscriptionTier;
      if (!statsByTier[tier]) {
        statsByTier[tier] = {
          count: 0,
          transactions: 0,
          users: 0,
        };
      }
      statsByTier[tier].count += 1;
      statsByTier[tier].transactions += stat.count;
      statsByTier[tier].users += 1;
    }

    return NextResponse.json(
      {
        date: today.toISOString().split('T')[0],
        totalUsers: todayStats.length,
        totalTransactions,
        averagePerUser: Math.round(averagePerUser * 100) / 100,
        statsByTier,
        details: todayStats.map((stat: any) => ({
          userId: stat.user.id,
          email: stat.user.email,
          tier: stat.user.subscriptionTier,
          transactions: stat.count,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Erro ao buscar stats:', error);
    return NextResponse.json(
      {
        error: 'Erro ao buscar estatisticas',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
