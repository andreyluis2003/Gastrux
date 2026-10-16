import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sold per recipe in [from, to): every kitchen item (comanda send, counter sale, QR, WhatsApp, site
 * delivery) not cancelled, of an order not cancelled, of this restaurant (spec 2026-10-16, 4.4).
 */
export async function soldByRecipe(db: Db, restaurantId: string, recipeIds: string[], from: Date, to: Date): Promise<Record<string, number>> {
  if (recipeIds.length === 0) return {};
  const rows = await db.orderItem.groupBy({
    by: ['recipeId'],
    where: {
      recipeId: { in: recipeIds },
      status: { not: 'CANCELLED' },
      createdAt: { gte: from, lt: to },
      order: { restaurantId, status: { not: 'CANCELLED' } },
    },
    _sum: { quantity: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (r._sum.quantity) out[r.recipeId] = r._sum.quantity;
  return out;
}
