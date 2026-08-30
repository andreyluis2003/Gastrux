// @ts-nocheck
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Estrutura de resposta para KPIs
 */
export interface KPIData {
  // Monthly Recurring Revenue
  mrr: number;
  mrrTrend: number;
  mrrPreviousMonth: number;

  // Subscription metrics
  activeSubscriptions: number;
  newSubscriptionsThisMonth: number;
  subscriptionsLastMonth: number;
  subscriptionGrowthMoM: number;

  // Revenue metrics
  totalRevenueThisMonth: number;
  totalRevenueLast30Days: number;
  revenueTrend: number;

  // Conversion metrics
  conversionRate: number;
  totalSignups: number;
  totalConverted: number;
  avgDaysToConversion: number;

  // Churn metrics
  churnRateThisMonth: number;
  cancelledSubscriptionsThisMonth: number;

  // ARPU
  arpu: number;
  arpuTrend: number;

  // Payment success
  paymentSuccessRate: number;
  totalPaymentAttempts: number;
  successfulPayments: number;
  failedPayments: number;

  // Plan distribution
  planDistribution: {
    [key: string]: number;
  };

  // Revenue by day (last 30 days)
  revenueTrendData: Array<{
    date: string;
    revenue: number;
  }>;

  // Subscription trend (last 30 days)
  subscriptionTrendData: Array<{
    date: string;
    activeCount: number;
  }>;
}

/**
 * Calcula MRR (Monthly Recurring Revenue)
 */
export async function calculateMRR(): Promise<{
  mrr: number;
  mrrPreviousMonth: number;
  trend: number;
}> {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  );
  const lastMonthEnd = new Date(currentMonthStart);
  lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);

  const planPrices: { [key: string]: number } = {
    starter: 2900,
    pro: 9900,
    business: 29900,
  };

  const currentMonthUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: 'active',
      billingCycleStart: {
        lte: now,
      },
      OR: [
        { billingCycleEnd: null },
        { billingCycleEnd: { gte: now } },
      ],
    },
    select: {
      subscriptionTier: true,
    },
  });

  const mrr = currentMonthUsers.reduce((total, user) => {
    const price = planPrices[user.subscriptionTier] || 0;
    return total + price;
  }, 0);

  const previousMonthUsers = await prisma.user.findMany({
    where: {
      billingCycleStart: {
        lte: lastMonthEnd,
      },
      OR: [
        { billingCycleEnd: null },
        { billingCycleEnd: { gte: lastMonthStart } },
      ],
    },
    select: {
      subscriptionTier: true,
    },
  });

  const mrrPreviousMonth = previousMonthUsers.reduce((total, user) => {
    const price = planPrices[user.subscriptionTier] || 0;
    return total + price;
  }, 0);

  const trend =
    mrrPreviousMonth > 0
      ? ((mrr - mrrPreviousMonth) / mrrPreviousMonth) * 100
      : 0;

  return { mrr, mrrPreviousMonth, trend };
}

/**
 * Calcula taxa de conversao
 */
export async function calculateConversionRate(): Promise<{
  conversionRate: number;
  totalSignups: number;
  totalConverted: number;
  avgDaysToConversion: number;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const totalSignups = await prisma.user.count();

  const converted = await prisma.user.count({
    where: {
      convertedToProAt: {
        not: null,
      },
    },
  });

  const conversions = await prisma.user.findMany({
    where: {
      convertedToProAt: {
        not: null,
      },
    },
    select: {
      createdAt: true,
      convertedToProAt: true,
    },
  });

  const avgDaysToConversion =
    conversions.length > 0
      ? conversions.reduce((sum, user) => {
          const days = Math.floor(
            (user.convertedToProAt!.getTime() - user.createdAt.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          return sum + days;
        }, 0) / conversions.length
      : 0;

  const conversionRate =
    totalSignups > 0 ? (converted / totalSignups) * 100 : 0;

  return {
    conversionRate,
    totalSignups,
    totalConverted: converted,
    avgDaysToConversion: Math.round(avgDaysToConversion),
  };
}

/**
 * Calcula taxa de churn
 */
export async function calculateChurnRate(): Promise<{
  churnRate: number;
  cancelledCount: number;
}> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const activeAtMonthStart = await prisma.user.count({
    where: {
      subscriptionStatus: 'active',
      billingCycleStart: {
        lte: monthStart,
      },
    },
  });

  const cancelledThisMonth = await prisma.user.count({
    where: {
      subscriptionStatus: 'cancelled',
      updatedAt: {
        gte: monthStart,
        lte: monthEnd,
      },
    },
  });

  const churnRate =
    activeAtMonthStart > 0
      ? (cancelledThisMonth / activeAtMonthStart) * 100
      : 0;

  return {
    churnRate,
    cancelledCount: cancelledThisMonth,
  };
}

/**
 * Calcula ARPU
 */
export async function calculateARPU(mrr: number): Promise<number> {
  const activeUsers = await prisma.user.count({
    where: {
      subscriptionStatus: 'active',
    },
  });

  return activeUsers > 0 ? mrr / activeUsers : 0;
}

/**
 * Calcula taxa de sucesso de pagamento
 */
export async function calculatePaymentSuccessRate(): Promise<{
  successRate: number;
  totalAttempts: number;
  successfulCount: number;
  failedCount: number;
}> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const totalAttempts = await prisma.emailDeliveryLog.count({
    where: {
      sentAt: {
        gte: thirtyDaysAgo,
      },
    },
  });

  const successful = await prisma.emailDeliveryLog.count({
    where: {
      sentAt: {
        gte: thirtyDaysAgo,
      },
      status: {
        in: ['DELIVERED', 'OPENED', 'CLICKED'],
      },
    },
  });

  const failed = totalAttempts - successful;
  const successRate = totalAttempts > 0 ? (successful / totalAttempts) * 100 : 0;

  return {
    successRate,
    totalAttempts,
    successfulCount: successful,
    failedCount: failed,
  };
}

/**
 * Calcula distribuição de planos
 */
export async function calculatePlanDistribution(): Promise<{
  [key: string]: number;
}> {
  const distribution = await prisma.user.groupBy({
    by: ['subscriptionTier'],
    _count: true,
  });

  const result: { [key: string]: number } = {};
  distribution.forEach((item) => {
    result[item.subscriptionTier] = item._count;
  });

  return result;
}

/**
 * Gera dados de tendencia de revenue
 */
export async function generateRevenueTrendData(): Promise<
  Array<{ date: string; revenue: number }>
> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const planPrices: { [key: string]: number } = {
    starter: 2900,
    pro: 9900,
    business: 29900,
  };

  const trendData: Array<{ date: string; revenue: number }> = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const activeUsers = await prisma.user.findMany({
      where: {
        subscriptionStatus: 'active',
        billingCycleStart: {
          lte: dayEnd,
        },
        OR: [
          { billingCycleEnd: null },
          { billingCycleEnd: { gte: dayStart } },
        ],
      },
      select: {
        subscriptionTier: true,
      },
    });

    const dayRevenue = activeUsers.reduce((total, user) => {
      const price = planPrices[user.subscriptionTier] || 0;
      return total + price / 30;
    }, 0);

    trendData.push({
      date: date.toLocaleDateString('pt-BR'),
      revenue: Math.round(dayRevenue),
    });
  }

  return trendData;
}

/**
 * Gera dados de tendencia de subscriptions
 */
export async function generateSubscriptionTrendData(): Promise<
  Array<{ date: string; activeCount: number }>
> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const trendData: Array<{ date: string; activeCount: number }> = [];

  for (let i = 29; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const activeCount = await prisma.user.count({
      where: {
        subscriptionStatus: 'active',
        billingCycleStart: {
          lte: dayEnd,
        },
        OR: [
          { billingCycleEnd: null },
          { billingCycleEnd: { gte: dayEnd } },
        ],
      },
    });

    trendData.push({
      date: date.toLocaleDateString('pt-BR'),
      activeCount,
    });
  }

  return trendData;
}

/**
 * Calcula subscriptions do mes
 */
export async function calculateMonthlySubscriptions(): Promise<{
  newThisMonth: number;
  lastMonth: number;
  growthMoM: number;
}> {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1
  );
  const lastMonthEnd = new Date(currentMonthStart);
  lastMonthEnd.setDate(lastMonthEnd.getDate() - 1);

  const newThisMonth = await prisma.user.count({
    where: {
      subscriptionStatus: 'active',
      convertedToProAt: {
        gte: currentMonthStart,
      },
    },
  });

  const lastMonth = await prisma.user.count({
    where: {
      subscriptionStatus: 'active',
      convertedToProAt: {
        gte: lastMonthStart,
        lte: lastMonthEnd,
      },
    },
  });

  const growthMoM = lastMonth > 0 ? ((newThisMonth - lastMonth) / lastMonth) * 100 : 0;

  return {
    newThisMonth,
    lastMonth,
    growthMoM,
  };
}

/**
 * Calcula revenue do mes
 */
export async function calculateMonthlyRevenue(): Promise<{
  thisMonth: number;
  last30Days: number;
}> {
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const planPrices: { [key: string]: number } = {
    starter: 2900,
    pro: 9900,
    business: 29900,
  };

  const thisMonthUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: 'active',
      convertedToProAt: {
        gte: currentMonthStart,
      },
    },
    select: {
      subscriptionTier: true,
    },
  });

  const thisMonth = thisMonthUsers.reduce((total, user) => {
    const price = planPrices[user.subscriptionTier] || 0;
    return total + price;
  }, 0);

  const last30DaysUsers = await prisma.user.findMany({
    where: {
      subscriptionStatus: 'active',
      convertedToProAt: {
        gte: thirtyDaysAgo,
      },
    },
    select: {
      subscriptionTier: true,
    },
  });

  const last30Days = last30DaysUsers.reduce((total, user) => {
    const price = planPrices[user.subscriptionTier] || 0;
    return total + price;
  }, 0);

  return {
    thisMonth,
    last30Days,
  };
}
