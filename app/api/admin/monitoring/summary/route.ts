// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface Summary {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  newUsersThisWeek: number;
  newUsersThisMonth: number;
  totalRevenue: number;
  avgUserValue: number;
  topPlan: string;
}

/**
 * GET /api/admin/monitoring/summary
 * Retorna resumo executivo dos dados
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !['ADMIN'].includes(session.user?.role as string)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalUsers = await prisma.user.count();

    const activeUsers = await prisma.user.count({
      where: {
        subscriptionStatus: 'active',
      },
    });

    const newUsersThisWeek = await prisma.user.count({
      where: {
        createdAt: { gte: weekAgo },
      },
    });

    const newUsersThisMonth = await prisma.user.count({
      where: {
        createdAt: { gte: monthAgo },
      },
    });

    const planDistribution = await prisma.user.groupBy({
      by: ['subscriptionTier'],
      _count: true,
      where: {
        subscriptionStatus: 'active',
      },
    });

    let topPlan = 'N/A';
    let maxCount = 0;
    planDistribution.forEach((item) => {
      if (item._count > maxCount) {
        maxCount = item._count;
        topPlan = item.subscriptionTier;
      }
    });

    const summary: Summary = {
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      newUsersThisWeek,
      newUsersThisMonth,
      totalRevenue: 0,
      avgUserValue: activeUsers > 0 ? 0 : 0,
      topPlan,
    };

    const response = NextResponse.json(summary);
    response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return response;
  } catch (error) {
    console.error('Error calculating summary:', error);
    return NextResponse.json(
      { error: 'Failed to calculate summary' },
      { status: 500 }
    );
  }
}