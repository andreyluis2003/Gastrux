import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled, restaurantTier } from '@/lib/tier-guard';
import { closeRows, DailyCountError, type ClosedRow } from './compute';
import { nightRows } from './service';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

/** One portion's cost from the ingredients' reference costs (same rule as the label discard, lib/labels/settle.ts) */
async function unitCosts(restaurantId: string, recipeIds: string[]): Promise<Record<string, number>> {
  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, id: { in: recipeIds } },
    select: { id: true, baseYield: true, ingredients: { select: { quantity: true, ingredient: { select: { referenceCost: true } } } } },
  });
  const out: Record<string, number> = {};
  for (const r of recipes) {
    const total = r.ingredients.reduce((s, ri) => s + ri.quantity * (ri.ingredient?.referenceCost ?? 0), 0);
    out[r.id] = r.baseYield > 0 ? total / r.baseYield : 0;
  }
  return out;
}

export function differenceAlertText(lines: { recipeName: string; difference: number; unitCost: number }[]) {
  const missing = lines.filter((l) => l.difference < 0);
  const extra = lines.filter((l) => l.difference > 0);
  if (missing.length === 0 && extra.length === 0) return null;
  const missingValue = missing.reduce((s, l) => s + -l.difference * l.unitCost, 0);
  const parts: string[] = [];
  if (missing.length) parts.push(`${missing.map((l) => `${l.recipeName}: faltam ${-l.difference}`).join(' · ')} (${brl(missingValue)}).`);
  if (extra.length) parts.push(`A mais: ${extra.map((l) => `${l.recipeName}: ${l.difference}`).join(' · ')}.`);
  return { title: 'Contagem com diferença', message: parts.join(' '), missingValue };
}

/**
 * Closes the open night (spec 2026-10-16, 4.5): lock, frozen lines, next night opened at the same
 * instant with each counted leftover as its OPENING entry. A second close at once gets 409.
 */
export async function closeNight(member: RestaurantMember, counts: { recipeId: string; counted: unknown }[], now = new Date(), countId?: unknown) {
  const { restaurantId } = member;
  if (!Array.isArray(counts)) throw new DailyCountError('Envie a contagem de cada item');
  const result = await prisma.$transaction(async (tx) => {
    const open = await tx.dailyCount.findFirst({ where: { restaurantId, status: 'OPEN' }, select: { id: true, openedAt: true } });
    if (!open) throw new DailyCountError('Não há contagem aberta', 409);
    // The night the person looked at (review I1): a stale screen must not close the night that just opened
    if (typeof countId === 'string' && countId !== open.id) throw new DailyCountError('Esta contagem já foi fechada. Atualize a tela.', 409);
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "daily_counts" WHERE "id" = ${open.id} FOR UPDATE`;
    if (locked[0]?.status !== 'OPEN') throw new DailyCountError('Esta contagem acabou de ser fechada', 409);
    const closedAt = new Date(Math.max(now.getTime(), Date.now()));
    const rows = await nightRows(tx, restaurantId, open, closedAt);
    const closed: ClosedRow[] = closeRows(rows, counts);
    const costs = await unitCosts(restaurantId, closed.map((r) => r.recipeId));
    await tx.dailyCountLine.createMany({
      data: closed.map((r) => ({
        countId: open.id, recipeId: r.recipeId, recipeName: r.name, opening: r.opening, mounted: r.mounted, sold: r.sold,
        loss: r.loss, expected: r.expected, counted: r.counted, difference: r.difference, unitCost: costs[r.recipeId] ?? 0,
      })),
    });
    await tx.dailyCount.update({ where: { id: open.id }, data: { status: 'CLOSED', closedAt, closedById: member.userId } });
    const next = await tx.dailyCount.create({ data: { restaurantId, openedAt: closedAt }, select: { id: true } });
    const leftovers = closed.filter((r) => r.counted > 0);
    if (leftovers.length) {
      await tx.dailyCountEntry.createMany({
        data: leftovers.map((r) => ({ countId: next.id, restaurantId, recipeId: r.recipeId, kind: 'OPENING' as const, quantity: r.counted, userId: member.userId })),
      });
    }
    return { closedId: open.id, nextId: next.id, lines: closed, costs };
  }, { timeout: 30_000, maxWait: 10_000 });

  // Pro+: the difference rings the managers' bell (restaurant-wide alert, userId null)
  if (isTierFeatureEnabled(await restaurantTier(restaurantId), 'dailyCountAlert')) {
    const text = differenceAlertText(result.lines.map((l) => ({ recipeName: l.name, difference: l.difference, unitCost: result.costs[l.recipeId] ?? 0 })));
    if (text) {
      try {
        await prisma.notification.create({
          data: {
            restaurantId,
            type: 'SYSTEM_INFO',
            severity: result.lines.some((l) => l.difference < 0) ? 'HIGH' : 'MEDIUM',
            title: text.title,
            message: text.message,
            actionUrl: '/contagem-do-dia?tab=historico',
            actionLabel: 'Ver contagem',
            data: { kind: 'daily_count_difference', countId: result.closedId, missingValue: text.missingValue },
          },
        });
      } catch (error) {
        console.error('[daily-count] alert failed:', error); // the close itself already happened
      }
    }
  }
  return { closedId: result.closedId, nextId: result.nextId, lines: result.lines };
}
