import { prisma } from '@/lib/prisma';
import { cache, cacheKey, CACHE_TTL } from '@/lib/cache';
import { PaymentStatus } from '@prisma/client';

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'object' && value !== null) {
    const anyV = value as any;
    if (typeof anyV.toNumber === 'function') return toNumber(anyV.toNumber());
    if (typeof anyV.valueOf === 'function') return toNumber(anyV.valueOf());
  }
  return 0;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

export interface PlatformMetrics {
  revenue: {
    mrrCents: number;
    last30DaysCents: number;
    last7DaysCents: number;
    todayCents: number;
    byGateway: Record<string, number>;
    currency: string;
  };
  subscriptions: {
    activeCount: number;
    trialingCount: number;
    pausedCount: number;
    cancelledLast30d: number;
    grossChurnPct: number;
  };
  customers: {
    totalRestaurants: number;
    activeRestaurants: number;
    trialRestaurants: number;
    suspendedRestaurants: number;
    cancelledRestaurants: number;
    archivedRestaurants: number;
    newLast30d: number;
    trialsExpiringNext7d: number;
  };
  issues: {
    failedPayments24h: number;
    refundedPayments7d: number;
    criticalNotificationsOpen: number;
    disputesOpen: number;
  };
  topCustomers: Array<{
    restaurantId: string | null;
    name: string;
    totalRevenueCents: number;
    paymentCount: number;
    subscriptionStatus: string | null;
  }>;
  signupsPerDay: Array<{ date: string; count: number }>;
  trialConversionRate: number;
  revenueByTier: Record<string, number>;
  generatedAt: string;
}

async function computePlatformMetrics(): Promise<PlatformMetrics> {
  const now = new Date();
  const d30 = daysAgo(30);
  const d7 = daysAgo(7);
  const d1 = daysAgo(1);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const [
    activeSubs,
    trialingSubs,
    pausedSubs,
    cancelledSubs30d,
    subsActiveTotal30dAgo,
    restaurants,
    activeRestaurants,
    trialRestaurants,
    suspendedRestaurants,
    cancelledRestaurants,
    archivedRestaurants,
    restaurantsCreated30d,
    trialsExpiring7d,
    failedPayments24h,
    refundedPayments7d,
    criticalNotifications,
    disputesOpen,
    successAgg30d,
    successAgg7d,
    successAggToday,
    mrrRows,
    revenueByGateway,
    topCustomersRaw,
  ] = await Promise.all([
    // subscriptions
    prisma.subscription.count({ where: { status: 'active' } }),
    prisma.subscription.count({ where: { status: 'trialing' } }),
    prisma.subscription.count({ where: { status: 'paused' } }),
    prisma.subscription.count({
      where: { cancelledAt: { gte: d30 }, status: { in: ['cancelled', 'past_due'] } },
    }),
    prisma.subscription.count({
      where: {
        OR: [
          { createdAt: { lt: d30 }, cancelledAt: null },
          { cancelledAt: { gte: d30 } },
        ],
        status: { in: ['active', 'trialing', 'past_due', 'paused', 'cancelled'] },
      },
    }),
    // restaurants
    prisma.restaurant.count(),
    prisma.restaurant.count({ where: { status: 'ACTIVE' } }),
    prisma.restaurant.count({ where: { status: 'TRIAL' } }),
    prisma.restaurant.count({ where: { status: 'SUSPENDED' } }),
    prisma.restaurant.count({ where: { status: 'CANCELLED' } }),
    prisma.restaurant.count({ where: { status: 'ARCHIVED' } }),
    prisma.restaurant.count({ where: { createdAt: { gte: d30 } } }),
    prisma.restaurant.count({
      where: { trialEndsAt: { gte: now, lte: daysFromNow(7) } },
    }),
    // issues
    prisma.payment.count({
      where: {
        status: { in: [PaymentStatus.DECLINED, PaymentStatus.CANCELLED] },
        createdAt: { gte: d1 },
      },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.REFUNDED, createdAt: { gte: d7 } },
    }),
    prisma.notification.count({
      where: { severity: 'CRITICAL', read: false, archived: false },
    }),
    prisma.notification
      .count({
        where: {
          archived: false,
          read: false,
          OR: [
            { title: { contains: 'ispute', mode: 'insensitive' } },
            { title: { contains: 'chargeback', mode: 'insensitive' } },
          ],
        },
      })
      .catch(() => 0 as number),
    // revenue last 30d
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: PaymentStatus.APPROVED, createdAt: { gte: d30 } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: PaymentStatus.APPROVED, createdAt: { gte: d7 } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: PaymentStatus.APPROVED, createdAt: { gte: todayStart } },
    }),
    // mrr sum
    prisma.subscription.findMany({
      where: { status: { in: ['active', 'trialing'] } },
      select: { amount: true, billingCycle: true },
    }),
    prisma.payment.groupBy({
      by: ['gateway'],
      _sum: { amount: true },
      where: { status: PaymentStatus.APPROVED, createdAt: { gte: d30 } },
    }),
    // top customers by revenue (90d)
    prisma.payment.groupBy({
      by: ['restaurantId'],
      _sum: { amount: true },
      _count: { _all: true },
      where: {
        status: PaymentStatus.APPROVED,
        createdAt: { gte: daysAgo(90) },
        restaurantId: { not: null },
      },
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    }),
  ]);

  const last30DaysCents = Math.round(toNumber(successAgg30d._sum.amount) * 100);
  const last7DaysCents = Math.round(toNumber(successAgg7d._sum.amount) * 100);
  const todayCents = Math.round(toNumber(successAggToday._sum.amount) * 100);

  const byGateway: Record<string, number> = {};
  for (const row of revenueByGateway) {
    byGateway[row.gateway] = Math.round(toNumber(row._sum.amount) * 100);
  }

  // MRR: sum subscription amounts normalized to monthly
  let mrrCents = 0;
  for (const sub of mrrRows) {
    const amount = toNumber(sub.amount);
    const normalized =
      sub.billingCycle === 'annual' || sub.billingCycle === 'yearly'
        ? amount / 12
        : sub.billingCycle === 'quarterly'
          ? amount / 3
          : amount;
    mrrCents += Math.round(normalized * 100);
  }

  const grossChurnPct =
    subsActiveTotal30dAgo > 0 ? (cancelledSubs30d / subsActiveTotal30dAgo) * 100 : 0;

  // Enrich top customers with restaurant names
  // === NEW METRICS: signups per day, trial conversion, revenue by tier ===
  // Signups per day (last 30 days) via raw SQL for date grouping
  let signupsPerDay: Array<{ date: string; count: number }> = [];
  try {
    const signupRows: Array<{ day: string; cnt: bigint }> = await prisma.$queryRawUnsafe(
      `SELECT DATE("createdAt") as day, COUNT(*)::bigint as cnt
       FROM "restaurants"
       WHERE "createdAt" >= $1
       GROUP BY DATE("createdAt")
       ORDER BY day ASC`,
      d30
    );
    signupsPerDay = signupRows.map((r) => ({
      date: String(r.day).slice(0, 10),
      count: Number(r.cnt),
    }));
  } catch (e) {
    console.error('signupsPerDay query error:', e);
  }

  // Trial → Active conversion rate
  let trialConversionRate = 0;
  try {
    const totalTrialEver = await prisma.restaurant.count({
      where: { OR: [{ status: 'TRIAL' }, { status: 'ACTIVE' }, { status: 'CANCELLED' }, { status: 'SUSPENDED' }] },
    });
    const convertedToActive = await prisma.restaurant.count({
      where: { status: 'ACTIVE' },
    });
    trialConversionRate = totalTrialEver > 0
      ? Number(((convertedToActive / totalTrialEver) * 100).toFixed(1))
      : 0;
  } catch (e) {
    console.error('trialConversionRate error:', e);
  }

  // Revenue by subscription tier (last 90d payments)
  const revenueByTier: Record<string, number> = {};
  try {
    const tierRows: Array<{ tier: string; total: any }> = await prisma.$queryRawUnsafe(
      `SELECT r."subscriptionTier" as tier, SUM(p."amount") as total
       FROM "payments" p
       JOIN "restaurants" r ON r."id" = p."restaurantId"
       WHERE p."status" = 'APPROVED' AND p."createdAt" >= $1 AND r."subscriptionTier" IS NOT NULL
       GROUP BY r."subscriptionTier"
       ORDER BY total DESC`,
      daysAgo(90)
    );
    for (const row of tierRows) {
      if (row.tier) {
        revenueByTier[row.tier] = Math.round(toNumber(row.total) * 100);
      }
    }
  } catch (e) {
    console.error('revenueByTier error:', e);
  }

  const restaurantIds = topCustomersRaw.map((r) => r.restaurantId).filter(Boolean) as string[];
  const restaurantRows = await prisma.restaurant.findMany({
    where: { id: { in: restaurantIds } },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      subscriptionTier: true,
    },
  });
  const nameMap = new Map(restaurantRows.map((r) => [r.id, r]));

  const topCustomers = topCustomersRaw.map((row) => {
    const rest = row.restaurantId ? nameMap.get(row.restaurantId) : null;
    return {
      restaurantId: row.restaurantId,
      name: rest?.name || 'Desconhecido',
      totalRevenueCents: Math.round(toNumber(row._sum.amount) * 100),
      paymentCount: row._count._all,
      subscriptionStatus: rest?.subscriptionStatus ?? null,
    };
  });

  return {
    revenue: {
      mrrCents,
      last30DaysCents,
      last7DaysCents,
      todayCents,
      byGateway,
      currency: 'BRL',
    },
    subscriptions: {
      activeCount: activeSubs,
      trialingCount: trialingSubs,
      pausedCount: pausedSubs,
      cancelledLast30d: cancelledSubs30d,
      grossChurnPct: Number(grossChurnPct.toFixed(2)),
    },
    customers: {
      totalRestaurants: restaurants,
      activeRestaurants,
      trialRestaurants,
      suspendedRestaurants,
      cancelledRestaurants,
      archivedRestaurants,
      newLast30d: restaurantsCreated30d,
      trialsExpiringNext7d: trialsExpiring7d,
    },
    issues: {
      failedPayments24h,
      refundedPayments7d,
      criticalNotificationsOpen: criticalNotifications,
      disputesOpen,
    },
    topCustomers,
    signupsPerDay,
    trialConversionRate,
    revenueByTier,
    generatedAt: new Date().toISOString(),
  };
}

export async function getPlatformMetrics(bypassCache = false): Promise<PlatformMetrics> {
  const key = cacheKey('platform', 'metrics', 'v1');
  if (bypassCache) {
    const fresh = await computePlatformMetrics();
    await cache.set(key, fresh, CACHE_TTL.MEDIUM);
    return fresh;
  }
  const hit = await cache.get<PlatformMetrics>(key);
  if (hit) return hit;
  const fresh = await computePlatformMetrics();
  await cache.set(key, fresh, CACHE_TTL.MEDIUM);
  return fresh;
}

export async function invalidatePlatformMetrics() {
  const key = cacheKey('platform', 'metrics', 'v1');
  await cache.del(key);
}
