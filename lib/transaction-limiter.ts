// @ts-nocheck
import { prisma } from './prisma';
import { STRIPE_PRICING_TIERS } from './stripe-config';

export interface TransactionLimitStatus {
  allowed: boolean;
  remaining: number;
  limit: number;
  tier: string;
  message: string;
  currentCount?: number;
}

/**
 * Check if a user can perform a transaction based on their plan limits
 * @param userId - The user ID
 * @returns Transaction limit status
 */
export async function checkTransactionLimit(
  userId: string
): Promise<TransactionLimitStatus> {
  try {
    // 1. Obter dados do usuário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionTier: true },
    });

    if (!user) {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        tier: 'unknown',
        message: 'Usuário não encontrado',
      };
    }

    // 2. Obter limites do plano
    const tierConfig = Object.values(STRIPE_PRICING_TIERS).find(
      t => t.id === user.subscriptionTier
    );
    
    if (!tierConfig) {
      console.warn(`Invalid subscription tier: ${user.subscriptionTier}, using Starter limits`);
    }
    
    const dailyLimit = tierConfig?.limits.dailyTransactions || 50;

    // 3. Contar transações de hoje
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayCount = await prisma.dailyTransactionCount.findUnique({
      where: {
        userId_date: {
          userId,
          date: today,
        },
      },
    });

    const currentCount = todayCount?.count || 0;
    const remaining = Math.max(0, dailyLimit - currentCount);
    const isAllowed = currentCount < dailyLimit;

    return {
      allowed: isAllowed,
      remaining,
      limit: dailyLimit,
      tier: user.subscriptionTier,
      currentCount,
      message: isAllowed
        ? `Você tem ${remaining} transações restantes hoje`
        : `Limite de ${dailyLimit} transações atingido para hoje`,
    };
  } catch (error) {
    console.error('Erro ao verificar limite de transações:', error);
    return {
      allowed: false,
      remaining: 0,
      limit: 0,
      tier: 'error',
      message: 'Erro ao verificar limite de transações',
    };
  }
}

/**
 * Increment the transaction count for a user on the current day
 * @param userId - The user ID
 */
export async function incrementTransactionCount(userId: string): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await prisma.dailyTransactionCount.upsert({
    where: {
      userId_date: {
        userId,
        date: today,
      },
    },
    update: {
      count: {
        increment: 1,
      },
    },
    create: {
      userId,
      date: today,
      count: 1,
    },
  });
}

/**
 * Reset old daily counters (cleanup function for cron jobs)
 * This should be executed daily to remove old entries
 */
export async function resetDailyCounters(): Promise<number> {
  const yesterday = new Date();
  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 30); // Keep 30 days of history

  const result = await prisma.dailyTransactionCount.deleteMany({
    where: {
      date: {
        lt: yesterday,
      },
    },
  });

  console.log(`Deleted ${result.count} old daily transaction records`);
  return result.count;
}

/**
 * Get transaction usage statistics for a user
 */
export async function getUserTransactionStats(
  userId: string,
  days: number = 7
): Promise<
  Array<{
    date: Date;
    count: number;
    limit: number;
    percentage: number;
  }>
> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true },
  });

  if (!user) return [];

  const tierConfig = Object.values(STRIPE_PRICING_TIERS).find(
    t => t.id === user.subscriptionTier
  );
  
  if (!tierConfig) {
    console.warn(`Invalid subscription tier: ${user.subscriptionTier}, using Starter limits`);
  }
  
  const dailyLimit = tierConfig?.limits.dailyTransactions || 50;

  const records = await prisma.dailyTransactionCount.findMany({
    where: {
      userId,
      date: {
        gte: startDate,
      },
    },
    orderBy: {
      date: 'asc',
    },
  });

  return records.map((record: any) => ({
    date: record.date,
    count: record.count,
    limit: dailyLimit,
    percentage: (record.count / dailyLimit) * 100,
  }));
}
