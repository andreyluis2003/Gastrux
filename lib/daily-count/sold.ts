import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sold per recipe in [from, to): what was SOLD, sent to the kitchen or not (final review of the spec
 * 2026-10-16, 4.4: a counter sale is not sent by default and a bill can close with unsent lines, so the
 * kitchen copy alone gave false "faltam"):
 * - comanda lines (table, counter, QR, WhatsApp) of comandas not cancelled, by when they were added;
 *   merging moves the lines and cancels the source, and removal deletes the line, so each counts once;
 * - kitchen orders without a comanda (site delivery, delivery integrations), items and orders not cancelled.
 */
export async function soldByRecipe(db: Db, restaurantId: string, recipeIds: string[], from: Date, to: Date): Promise<Record<string, number>> {
  if (recipeIds.length === 0) return {};
  const [lines, kitchen] = await Promise.all([
    db.orderSessionItem.groupBy({
      by: ['recipeId'],
      where: {
        recipeId: { in: recipeIds },
        addedAt: { gte: from, lt: to },
        session: { restaurantId, status: { not: 'CANCELLED' } },
      },
      _sum: { quantity: true },
    }),
    db.orderItem.groupBy({
      by: ['recipeId'],
      where: {
        recipeId: { in: recipeIds },
        status: { not: 'CANCELLED' },
        createdAt: { gte: from, lt: to },
        order: { restaurantId, status: { not: 'CANCELLED' }, orderSessionId: null },
      },
      _sum: { quantity: true },
    }),
  ]);
  const out: Record<string, number> = {};
  for (const r of [...lines, ...kitchen]) if (r._sum.quantity) out[r.recipeId] = (out[r.recipeId] ?? 0) + r._sum.quantity;
  return out;
}
