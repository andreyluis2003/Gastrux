// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isPlatformAdminIdentity } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isPlatformAdminIdentity(session.user.role, session.user.email)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    // Get query parameters
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get all users created in the period
    const allUsers = await prisma.user.findMany({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        id: true,
        email: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        createdAt: true,
        convertedToProAt: true,
        convertedToPlan: true,
        conversionSource: true,
      },
    });

    // Calculate conversion metrics
    const totalSignups = allUsers.length;
    const conversions = allUsers.filter(u => u.subscriptionTier !== 'starter').length;
    const conversionRate = totalSignups > 0 ? (conversions / totalSignups) * 100 : 0;

    // Group by plan
    const byPlan = {
      starter: allUsers.filter(u => u.subscriptionTier === 'starter').length,
      pro: allUsers.filter(u => u.subscriptionTier === 'pro').length,
      business: allUsers.filter(u => u.subscriptionTier === 'business').length,
      enterprise: allUsers.filter(u => u.subscriptionTier === 'enterprise').length,
    };

    // Group by conversion source (email, direct, etc)
    const conversionsBySource = allUsers.reduce((acc: Record<string, number>, user) => {
      if (user.conversionSource) {
        acc[user.conversionSource] = (acc[user.conversionSource] || 0) + 1;
      }
      return acc;
    }, {});

    // Calculate daily conversion rate
    const dailyConversions = [];
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - (days - i - 1));
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const daySignups = allUsers.filter(
        u => u.createdAt >= date && u.createdAt < nextDate
      ).length;
      
      const dayConversions = allUsers.filter(
        u =>
          u.createdAt >= date &&
          u.createdAt < nextDate &&
          u.subscriptionTier !== 'starter'
      ).length;

      if (daySignups > 0 || dayConversions > 0) {
        dailyConversions.push({
          date: date.toISOString().split('T')[0],
          signups: daySignups,
          conversions: dayConversions,
          conversionRate: daySignups > 0 ? (dayConversions / daySignups) * 100 : 0,
        });
      }
    }

    // Calculate average conversion time (days from signup to paid conversion)
    const conversionTimes = allUsers
      .filter(u => u.convertedToProAt && u.createdAt)
      .map(u => {
        const timeDiff = u.convertedToProAt!.getTime() - u.createdAt.getTime();
        return Math.floor(timeDiff / (1000 * 60 * 60 * 24)); // Convert to days
      });

    const avgConversionTime = 
      conversionTimes.length > 0
        ? conversionTimes.reduce((a, b) => a + b, 0) / conversionTimes.length
        : 0;

    // MRR (Monthly Recurring Revenue) by plan
    const mrrByPlan = {
      pro: byPlan.pro * 99,
      business: byPlan.business * 249,
      enterprise: byPlan.enterprise * 499,
      total: byPlan.pro * 99 + byPlan.business * 249 + byPlan.enterprise * 499,
    };

    return NextResponse.json({
      period: {
        days,
        startDate: startDate.toISOString(),
        endDate: new Date().toISOString(),
      },
      metrics: {
        totalSignups,
        conversions,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgConversionTimeDays: Math.round(avgConversionTime * 100) / 100,
      },
      byPlan,
      mrrByPlan,
      conversionsBySource: Object.entries(conversionsBySource).map(([source, count]) => ({
        source,
        count,
        percentage: totalSignups > 0 ? ((count as number) / totalSignups) * 100 : 0,
      })),
      dailyConversions,
    });
  } catch (error) {
    console.error('Conversion analytics error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conversion analytics' },
      { status: 500 }
    );
  }
}
