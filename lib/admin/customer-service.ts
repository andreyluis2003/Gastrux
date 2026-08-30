import { prisma } from '@/lib/prisma';
import { cache, cacheKey, invalidate, CACHE_TTL } from '@/lib/cache';
import { PaymentStatus, RestaurantStatus } from '@prisma/client';

function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
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

export interface CustomerListFilters {
  search?: string;
  status?: RestaurantStatus | null;
  tier?: string | null;
  subscriptionStatus?: string | null;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'name' | 'subscriptionTier';
  sortOrder?: 'asc' | 'desc';
}

export async function listCustomers(filters: CustomerListFilters) {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(200, Math.max(1, filters.limit || 25));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.tier) where.subscriptionTier = filters.tier;
  if (filters.subscriptionStatus) where.subscriptionStatus = filters.subscriptionStatus;

  if (filters.search) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { cnpj: { contains: q, mode: 'insensitive' } },
      { id: { equals: q } },
    ];
  }

  const orderBy: any = { [filters.sortBy || 'createdAt']: filters.sortOrder || 'desc' };

  const [rows, totalCount] = await Promise.all([
    prisma.restaurant.findMany({
      where,
      orderBy,
      take: limit,
      skip,
      select: {
        id: true,
        name: true,
        email: true,
        cnpj: true,
        status: true,
        subscriptionTier: true,
        subscriptionStatus: true,
        trialEndsAt: true,
        billingCycleEnd: true,
        ownerId: true,
        city: true,
        state: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.restaurant.count({ where }),
  ]);

  return {
    customers: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      trialEndsAt: r.trialEndsAt ? r.trialEndsAt.toISOString() : null,
      billingCycleEnd: r.billingCycleEnd ? r.billingCycleEnd.toISOString() : null,
    })),
    pagination: {
      page,
      limit,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      hasMore: skip + rows.length < totalCount,
    },
  };
}

export async function getCustomerDetails(id: string) {
  const key = cacheKey('customer', 'details', id);
  const hit = await cache.get<any>(key);
  if (hit) return hit;

  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    include: {
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      users: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              active: true,
              lastSignInAt: true,
              createdAt: true,
            },
          },
        },
        take: 25,
      },
    },
  });

  if (!restaurant) return null;

  const [ownerUser, recentPayments, revenueAgg, paymentCounts, subscriptionsCount, usersCount] =
    await Promise.all([
      restaurant.ownerId
        ? prisma.user.findUnique({
            where: { id: restaurant.ownerId },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              lastSignInAt: true,
              createdAt: true,
            },
          })
        : null,
      prisma.payment.findMany({
        where: { restaurantId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          amount: true,
          currency: true,
          status: true,
          method: true,
          gateway: true,
          customerEmail: true,
          customerName: true,
          description: true,
          createdAt: true,
          processedAt: true,
        },
      }),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { restaurantId: id, status: PaymentStatus.APPROVED },
      }),
      prisma.payment.groupBy({
        by: ['status'],
        _count: { _all: true },
        where: { restaurantId: id },
      }),
      prisma.subscription.count({ where: { restaurantId: id } }),
      prisma.restaurantUser.count({ where: { restaurantId: id } }),
    ]);

  const result = {
    restaurant: {
      ...restaurant,
      createdAt: restaurant.createdAt.toISOString(),
      updatedAt: restaurant.updatedAt.toISOString(),
      trialEndsAt: restaurant.trialEndsAt?.toISOString() || null,
      billingCycleStart: restaurant.billingCycleStart?.toISOString() || null,
      billingCycleEnd: restaurant.billingCycleEnd?.toISOString() || null,
      deletedAt: restaurant.deletedAt?.toISOString() || null,
      subscriptions: restaurant.subscriptions.map((s) => ({
        ...s,
        amount: toNumber(s.amount),
        currentPeriodStart: s.currentPeriodStart?.toISOString() || null,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() || null,
        trialStart: s.trialStart?.toISOString() || null,
        trialEnd: s.trialEnd?.toISOString() || null,
        cancelledAt: s.cancelledAt?.toISOString() || null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      users: restaurant.users.map((ru) => ({
        ...ru.user,
        lastSignInAt: ru.user.lastSignInAt?.toISOString() || null,
        createdAt: ru.user.createdAt.toISOString(),
        restaurantRole: (ru as any).role ?? null,
      })),
    },
    owner: ownerUser
      ? {
          ...ownerUser,
          lastSignInAt: ownerUser.lastSignInAt?.toISOString() || null,
          createdAt: ownerUser.createdAt.toISOString(),
        }
      : null,
    recentPayments: recentPayments.map((p) => ({
      ...p,
      amount: toNumber(p.amount),
      createdAt: p.createdAt.toISOString(),
      processedAt: p.processedAt?.toISOString() || null,
    })),
    stats: {
      lifetimeRevenue: toNumber(revenueAgg._sum.amount),
      paymentCountsByStatus: paymentCounts.reduce(
        (acc, row) => ({ ...acc, [row.status]: row._count._all }),
        {} as Record<string, number>
      ),
      subscriptionsCount,
      usersCount,
    },
  };

  await cache.set(key, result, CACHE_TTL.SHORT);
  return result;
}

export interface UpdateCustomerPayload {
  status?: RestaurantStatus;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  trialEndsAt?: string | null;
  billingCycleEnd?: string | null;
  note?: string;
}

export async function updateCustomer(id: string, payload: UpdateCustomerPayload) {
  const data: any = {};
  if (payload.status) data.status = payload.status;
  if (payload.subscriptionTier) data.subscriptionTier = payload.subscriptionTier;
  if (payload.subscriptionStatus) data.subscriptionStatus = payload.subscriptionStatus;
  if (payload.trialEndsAt !== undefined) {
    data.trialEndsAt = payload.trialEndsAt ? new Date(payload.trialEndsAt) : null;
  }
  if (payload.billingCycleEnd !== undefined) {
    data.billingCycleEnd = payload.billingCycleEnd ? new Date(payload.billingCycleEnd) : null;
  }

  const updated = await prisma.restaurant.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      status: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      billingCycleEnd: true,
      updatedAt: true,
    },
  });

  // invalidate caches
  await invalidate(cacheKey('customer', 'details', id));
  await invalidate(cacheKey('platform', 'metrics', 'v1'));

  return {
    ...updated,
    trialEndsAt: updated.trialEndsAt?.toISOString() || null,
    billingCycleEnd: updated.billingCycleEnd?.toISOString() || null,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

export async function extendTrial(id: string, days: number) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id },
    select: { trialEndsAt: true },
  });
  if (!restaurant) return null;
  const base = restaurant.trialEndsAt && restaurant.trialEndsAt > new Date()
    ? restaurant.trialEndsAt
    : new Date();
  const newEnd = new Date(base);
  newEnd.setDate(newEnd.getDate() + days);
  return updateCustomer(id, {
    trialEndsAt: newEnd.toISOString(),
    status: 'TRIAL' as RestaurantStatus,
  });
}
