import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recipeCost } from './cost';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Cost of one item sold of each ficha, computed now from its insumos (lib/recipes/cost.ts). The stored
 * Recipe.costPerPortion is never written by the app, so every screen that read it (DRE CMV, menu engineering,
 * production plans, reports, alerts, AI) saw zero (found 2026-10-19). `recipeIds` null = every recipe.
 */
export async function recipeCostMap(restaurantId: string, recipeIds: string[] | null = null, db: Db = prisma): Promise<Map<string, number>> {
  if (recipeIds && recipeIds.length === 0) return new Map();
  const recipes = await db.recipe.findMany({
    where: { restaurantId, ...(recipeIds ? { id: { in: recipeIds } } : {}) },
    select: {
      id: true, baseYield: true,
      ingredients: { select: { quantity: true, unit: true, ingredient: { select: { name: true, referenceCost: true, standardUnit: true, conversionFactor: true } } } },
    },
  });
  return new Map(recipes.map((r) => [r.id, recipeCost(r).cost]));
}

/**
 * Replaces costPerPortion on recipe rows with the cost computed now, so the screens
 * that read it keep their code. Rows of another restaurant are never priced (they get 0).
 */
export async function withLiveCost<T extends { id: string; costPerPortion?: number | null }>(restaurantId: string, rows: T[], db: Db = prisma): Promise<T[]> {
  const costs = await recipeCostMap(restaurantId, Array.from(new Set(rows.map((r) => r.id))), db);
  for (const r of rows) r.costPerPortion = costs.get(r.id) ?? 0;
  return rows;
}
