import { prisma } from '@/lib/prisma';

/** Closed nights of the last N weeks, newest first, and the totals per item (spec 2026-10-16, 4.7) */
export async function loadHistory(restaurantId: string, weeks: number, now = new Date()) {
  const since = new Date(now.getTime() - Math.min(Math.max(weeks, 1), 12) * 7 * 864e5);
  const nights = await prisma.dailyCount.findMany({
    where: { restaurantId, status: 'CLOSED', closedAt: { gte: since } },
    orderBy: { closedAt: 'desc' },
    include: { lines: { orderBy: { recipeName: 'asc' } }, closedBy: { select: { name: true } } },
  });
  // Missing and extra apart (review I4): netting them let a night with missing espetos read as 0.
  // One row per recipe under its latest name: nights come newest first (pendências M11, a renamed recipe made two)
  const byItem = new Map<string, { recipeName: string; sold: number; loss: number; difference: number; missing: number; extra: number }>();
  for (const n of nights) {
    for (const l of n.lines) {
      // A deleted recipe leaves recipeId null: those go by the name they were frozen with
      const key = l.recipeId ?? `name:${l.recipeName}`;
      const it = byItem.get(key) ?? { recipeName: l.recipeName, sold: 0, loss: 0, difference: 0, missing: 0, extra: 0 };
      it.sold += l.sold; it.loss += l.loss; it.difference += l.difference;
      if (l.difference < 0) it.missing += -l.difference; else it.extra += l.difference;
      byItem.set(key, it);
    }
  }
  return {
    nights: nights.map((n) => ({
      id: n.id,
      openedAt: n.openedAt.toISOString(),
      closedAt: n.closedAt!.toISOString(),
      closedBy: n.closedBy?.name ?? null,
      sold: n.lines.reduce((s, l) => s + l.sold, 0),
      loss: n.lines.reduce((s, l) => s + l.loss, 0),
      difference: n.lines.reduce((s, l) => s + l.difference, 0),
      differenceValue: n.lines.reduce((s, l) => s + l.difference * l.unitCost, 0),
      missing: n.lines.reduce((s, l) => s + (l.difference < 0 ? -l.difference : 0), 0),
      missingValue: n.lines.reduce((s, l) => s + (l.difference < 0 ? -l.difference * l.unitCost : 0), 0),
      extra: n.lines.reduce((s, l) => s + (l.difference > 0 ? l.difference : 0), 0),
      lines: n.lines.map((l) => ({ recipeName: l.recipeName, opening: l.opening, mounted: l.mounted, sold: l.sold, loss: l.loss, expected: l.expected, counted: l.counted, difference: l.difference })),
    })),
    byItem: [...byItem.values()].sort((a, b) => b.sold - a.sold),
  };
}
