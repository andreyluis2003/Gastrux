import type { Prisma, PrismaClient } from '@prisma/client';
import { combosCountingAs } from './count-parts';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sold per recipe in [from, to): what was SOLD, sent to the kitchen or not (final review of the spec
 * 2026-10-16, 4.4: a counter sale is not sent by default and a bill can close with unsent lines, so the
 * kitchen copy alone gave false "faltam"):
 * - comanda lines (table, counter, QR, WhatsApp) of comandas not cancelled, by when they were added;
 *   merging moves the lines and cancels the source, and removal deletes the line, so each counts once;
 * - kitchen orders without a comanda (site delivery, delivery integrations), items and orders not cancelled.
 */
export async function soldByRecipe(db: Db, restaurantId: string, recipeIds: string[] | null, from: Date, to: Date): Promise<Record<string, number>> {
  // null = every recipe (the DRE estimated CMV); an empty list = nothing to count
  if (recipeIds && recipeIds.length === 0) return {};
  const recipeFilter = recipeIds ? { recipeId: { in: recipeIds } } : {};
  const [lines, kitchen] = await Promise.all([
    db.orderSessionItem.groupBy({
      by: ['recipeId'],
      where: {
        ...recipeFilter,
        addedAt: { gte: from, lt: to },
        // An encomenda is sold at the pickup (spec 2026-10-26)
        session: { restaurantId, status: { notIn: ['CANCELLED', 'ENCOMENDA'] } },
      },
      _sum: { quantity: true },
    }),
    db.orderItem.groupBy({
      by: ['recipeId'],
      where: {
        ...recipeFilter,
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

/**
 * Sold for the daily count: each counted recipe's own sales plus the sales of the recipes that count as it
 * (combos, a cento: spec 2026-10-26 lanchonete) times their quantity.
 */
export async function soldForCount(db: Db, restaurantId: string, recipeIds: string[], from: Date, to: Date): Promise<Record<string, number>> {
  const combos = await combosCountingAs(db, restaurantId, recipeIds);
  const sold = await soldByRecipe(db, restaurantId, [...new Set([...recipeIds, ...combos.keys()])], from, to);
  const out: Record<string, number> = {};
  for (const id of recipeIds) if (sold[id]) out[id] = sold[id];
  for (const [comboId, parts] of combos) {
    const n = sold[comboId] ?? 0;
    if (n) for (const p of parts) out[p.partRecipeId] = (out[p.partRecipeId] ?? 0) + n * p.quantity;
  }
  return out;
}
