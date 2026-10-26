import { prisma } from '@/lib/prisma';
import { lineUnits } from '@/lib/comanda/weight';

export interface ItemSales {
  recipeId: string;
  name: string;
  category: string;
  /** Units, or kg for an item sold by weight */
  quantity: number;
  revenue: number;
  /** Sold by weight (spec 2026-10-25 venda-por-peso): quantity is the kg sold */
  byWeight?: boolean;
}

/**
 * What was sold per item in [from, to) (owner 2026-10-16, Relatórios › Vendas): comanda lines of
 * comandas not cancelled, at the price charged, plus kitchen orders without a comanda (site delivery,
 * integrations) at the recipe's selling price. Same sources as the daily count's "vendidos".
 */
export async function itemSalesInRange(restaurantId: string, from: Date, to: Date): Promise<ItemSales[]> {
  const [lines, kitchen] = await Promise.all([
    prisma.orderSessionItem.findMany({
      where: { addedAt: { gte: from, lt: to }, session: { restaurantId, status: { not: 'CANCELLED' } } },
      select: { recipeId: true, quantity: true, weightGrams: true, price: true, recipe: { select: { name: true } } },
    }),
    prisma.orderItem.findMany({
      where: {
        status: { not: 'CANCELLED' },
        createdAt: { gte: from, lt: to },
        order: { restaurantId, status: { not: 'CANCELLED' }, orderSessionId: null },
      },
      select: { recipeId: true, quantity: true, recipe: { select: { name: true, sellingPrice: true } } },
    }),
  ]);
  const byRecipe = new Map<string, ItemSales>();
  const add = (recipeId: string, name: string, quantity: number, revenue: number, byWeight = false) => {
    const it = byRecipe.get(recipeId) ?? { recipeId, name, category: 'Sem categoria', quantity: 0, revenue: 0 };
    it.quantity += quantity;
    it.revenue += revenue;
    if (byWeight) it.byWeight = true;
    byRecipe.set(recipeId, it);
  };
  for (const l of lines) add(l.recipeId, l.recipe.name, lineUnits(l), Number(l.price) * l.quantity, !!l.weightGrams);
  for (const k of kitchen) add(k.recipeId, k.recipe.name, k.quantity, Number(k.recipe.sellingPrice ?? 0) * k.quantity);
  if (byRecipe.size) {
    const menu = await prisma.menuItem.findMany({
      where: { restaurantId, recipeId: { in: [...byRecipe.keys()] } },
      select: { recipeId: true, active: true, category: { select: { name: true } } },
      orderBy: { active: 'desc' },
    });
    for (const m of menu) {
      const it = m.recipeId ? byRecipe.get(m.recipeId) : undefined;
      if (it && it.category === 'Sem categoria' && m.category?.name) it.category = m.category.name;
    }
  }
  for (const it of byRecipe.values()) {
    it.revenue = Math.round(it.revenue * 100) / 100;
    it.quantity = Math.round(it.quantity * 1000) / 1000;
  }
  return [...byRecipe.values()].sort((a, b) => b.revenue - a.revenue);
}
