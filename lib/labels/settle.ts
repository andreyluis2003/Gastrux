import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';
import { LabelError } from './service';

/** Settling food labels and the expiry board (spec 2026-10-09 etiquetas, 4.3, 5.3) */

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function getLabel(restaurantId: string, id: string) {
  return prisma.foodLabel.findFirst({
    where: { id, restaurantId },
    include: { printedBy: { select: { name: true } }, settledBy: { select: { name: true } }, batch: { select: { batchNumber: true } } },
  });
}

/**
 * Used or discarded, once. A discard with a quantity goes to the waste log: the ingredient itself,
 * or each ingredient of the recipe in proportion to the label's quantity over the recipe's yield,
 * so the cost of what was thrown away counts in the waste report and the CMV.
 */
export async function settleLabel(member: RestaurantMember, id: string, action: 'USED' | 'DISCARDED', now = new Date()) {
  if (action !== 'USED' && action !== 'DISCARDED') throw new LabelError('Ação inválida');
  return prisma.$transaction(async (tx) => {
    const label = await tx.foodLabel.findFirst({ where: { id, restaurantId: member.restaurantId } });
    if (!label) throw new LabelError('Etiqueta não encontrada', 404);
    const guard = await tx.foodLabel.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: action, settledAt: now, settledById: member.userId },
    });
    if (guard.count === 0) throw new LabelError('Esta etiqueta já teve baixa', 409);

    let wasteLogs = 0;
    if (action === 'DISCARDED' && label.quantity && label.quantity > 0) {
      const expired = label.expiresAt.getTime() <= now.getTime();
      const reason = expired ? 'EXPIRED' : 'OTHER';
      const notes = expired ? `Etiqueta vencida: ${label.itemName}` : `Descartado antes do vencimento (etiqueta): ${label.itemName}`;
      const lines: Array<{ ingredientId: string; quantity: number; unit: any; cost: number }> = [];
      if (label.itemType === 'INGREDIENT' && label.ingredientId) {
        const ing = await tx.ingredient.findUnique({ where: { id: label.ingredientId }, select: { standardUnit: true, referenceCost: true } });
        if (ing) lines.push({ ingredientId: label.ingredientId, quantity: label.quantity, unit: ing.standardUnit, cost: label.quantity * ing.referenceCost });
      } else if (label.itemType === 'RECIPE' && label.recipeId) {
        const recipe = await tx.recipe.findUnique({
          where: { id: label.recipeId },
          select: { baseYield: true, ingredients: { select: { ingredientId: true, quantity: true, ingredient: { select: { referenceCost: true, standardUnit: true } } } } },
        });
        // A recipe with no yield cannot be split: the label is discarded without waste lines
        if (recipe && recipe.baseYield > 0) {
          const share = label.quantity / recipe.baseYield;
          for (const ri of recipe.ingredients) {
            const q = ri.quantity * share;
            // Recipe lines hold the ingredient's standard unit (as lib/kds-cancel-order.ts), as does its cost
            lines.push({ ingredientId: ri.ingredientId, quantity: q, unit: ri.ingredient.standardUnit, cost: q * ri.ingredient.referenceCost });
          }
        }
      }
      for (const line of lines) {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
        await tx.wasteLog.create({
          data: {
            restaurantId: member.restaurantId,
            ingredientId: line.ingredientId,
            quantity: round(line.quantity, 4),
            unit: line.unit,
            estimatedCost: Number.isFinite(line.cost) ? round(line.cost, 2) : 0,
            reason,
            notes,
            date: now,
          },
        });
        wasteLogs++;
      }
    }
    return { status: action, wasteLogs };
  });
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);

/** Active labels expired / expiring today / tomorrow (Brasília days), and the last 30 days settled */
export async function expiryBoard(restaurantId: string, now = new Date()) {
  const today = brtDay(now);
  const endToday = brtDayStart(nextDay(today));
  const endTomorrow = brtDayStart(nextDay(nextDay(today)));
  const include = { printedBy: { select: { name: true } } };
  const [active, history] = await Promise.all([
    prisma.foodLabel.findMany({ where: { restaurantId, status: 'ACTIVE', expiresAt: { lt: endTomorrow } }, orderBy: { expiresAt: 'asc' }, include }),
    prisma.foodLabel.findMany({
      where: { restaurantId, status: { in: ['USED', 'DISCARDED'] }, settledAt: { gte: new Date(now.getTime() - 30 * 864e5) } },
      orderBy: { settledAt: 'desc' },
      take: 200,
      include,
    }),
  ]);
  return {
    expired: active.filter((l) => l.expiresAt.getTime() <= now.getTime()),
    today: active.filter((l) => l.expiresAt.getTime() > now.getTime() && l.expiresAt < endToday),
    tomorrow: active.filter((l) => l.expiresAt >= endToday),
    history,
  };
}
