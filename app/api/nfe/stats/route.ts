// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nfe/stats
 * Retorna métricas para o dashboard NFC-e/NFe.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const last7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalDocs,
      authorizedCount,
      rejectedCount,
      pendingCount,
      cancelledCount,
      authorizedToday,
      authorizedLast7,
      authorizedLast30,
      revenueTodayAgg,
      revenueMonthAgg,
      revenueLast30Agg,
      topRejected,
    ] = await Promise.all([
      prisma.nFeDocument.count({ where: { config: { restaurantId } } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: 'authorized' } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: 'rejected' } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: { in: ['pending', 'submitted', 'processing'] } } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: 'cancelled' } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: 'authorized', authorizedAt: { gte: startToday } } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: 'authorized', authorizedAt: { gte: last7 } } }),
      prisma.nFeDocument.count({ where: { config: { restaurantId }, status: 'authorized', authorizedAt: { gte: last30 } } }),
      prisma.nFeDocument.aggregate({
        _sum: { totalAmount: true },
        where: { config: { restaurantId }, status: 'authorized', authorizedAt: { gte: startToday } },
      }),
      prisma.nFeDocument.aggregate({
        _sum: { totalAmount: true },
        where: { config: { restaurantId }, status: 'authorized', authorizedAt: { gte: startOfMonth } },
      }),
      prisma.nFeDocument.aggregate({
        _sum: { totalAmount: true },
        where: { config: { restaurantId }, status: 'authorized', authorizedAt: { gte: last30 } },
      }),
      prisma.nFeDocument.findMany({
        where: { config: { restaurantId }, status: 'rejected', rejectionReason: { not: null } },
        select: { rejectionReason: true },
        take: 50,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Agrupa topRejected por razão (primeiras 80 chars)
    const rejectionCounter: Record<string, number> = {};
    for (const r of topRejected) {
      const key = (r.rejectionReason || '').slice(0, 80).trim() || 'Desconhecido';
      rejectionCounter[key] = (rejectionCounter[key] || 0) + 1;
    }
    const topRejectedSorted = Object.entries(rejectionCounter)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return NextResponse.json({
      totalDocs,
      byStatus: {
        authorized: authorizedCount,
        rejected: rejectedCount,
        pending: pendingCount,
        cancelled: cancelledCount,
      },
      authorized: {
        today: authorizedToday,
        last7d: authorizedLast7,
        last30d: authorizedLast30,
      },
      revenue: {
        today: Number(revenueTodayAgg._sum.totalAmount || 0),
        month: Number(revenueMonthAgg._sum.totalAmount || 0),
        last30d: Number(revenueLast30Agg._sum.totalAmount || 0),
      },
      topRejectedReasons: topRejectedSorted,
    });
  } catch (error: any) {
    console.error('Erro stats NFe:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro' },
      { status: 500 }
    );
  }
}
