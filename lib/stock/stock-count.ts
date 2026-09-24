import { prisma } from '@/lib/prisma';

/**
 * Physical stock count (market practice for inventory counts):
 * - every difference becomes an ADJUSTMENT movement whose quantity is SIGNED (+ surplus found,
 *   - shortage found), tagged referenceType STOCK_COUNT / referenceId = the count id;
 * - the difference is measured against what the operator saw on the screen when counting
 *   (systemQuantity), and applied as a delta: a sale made between the count and the save keeps
 *   its deduction instead of being overwritten by the counted number;
 * - the same count (count id) is applied once, even if saved twice;
 * - the whole count is validated first and written in one transaction (all or nothing);
 * - who counted is recorded (audit log) and a big difference alerts the restaurant.
 */

export interface CountLine {
  ingredientId: string;
  countedQuantity: unknown;
  /** What the count screen showed for this item when it was loaded. */
  systemQuantity?: unknown;
}

export interface CountResultLine {
  ingredientId: string;
  systemQuantity: number;
  countedQuantity: number;
  difference: number;
  adjusted: boolean;
  alreadyApplied?: boolean;
}

export class StockCountError extends Error {}

/** A difference worth an alert: at least this much money, or this share of what the system had. */
export const ALERT_MIN_VALUE = 50;
export const ALERT_MIN_SHARE = 0.1;
const EPSILON = 0.01;

const asNumber = (value: unknown) => (typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);

export async function applyStockCount(args: {
  restaurantId: string;
  userId: string;
  countId?: string | null;
  counts: CountLine[];
}): Promise<CountResultLine[]> {
  const { restaurantId, userId } = args;
  const countId = args.countId || null;

  // Validate everything before writing anything
  const lines = args.counts.map((line) => {
    const counted = asNumber(line.countedQuantity);
    if (!line.ingredientId || !Number.isFinite(counted) || counted < 0) {
      throw new StockCountError('Quantidade contada inválida: informe um número maior ou igual a zero');
    }
    const seen = asNumber(line.systemQuantity);
    return { ingredientId: line.ingredientId, counted, seen: Number.isFinite(seen) ? seen : null };
  });

  const ingredients = await prisma.ingredient.findMany({
    // Scoped: a client cannot adjust another restaurant's stock (unknown ids are ignored)
    where: { id: { in: lines.map((l) => l.ingredientId) }, restaurantId },
    select: { id: true, name: true, standardUnit: true, referenceCost: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  const alerts: Array<{ name: string; unit: string; difference: number; value: number }> = [];

  const results = await prisma.$transaction(async (tx) => {
    const out: CountResultLine[] = [];
    for (const line of lines) {
      const ingredient = byId.get(line.ingredientId);
      if (!ingredient) continue;

      if (countId) {
        const applied = await tx.stockMovement.findFirst({
          where: { restaurantId, ingredientId: ingredient.id, referenceType: 'STOCK_COUNT', referenceId: countId },
          select: { id: true },
        });
        if (applied) {
          out.push({ ingredientId: ingredient.id, systemQuantity: line.seen ?? 0, countedQuantity: line.counted, difference: 0, adjusted: false, alreadyApplied: true });
          continue;
        }
      }

      const stock = await tx.stock.findUnique({ where: { ingredientId: ingredient.id } });
      const current = stock?.currentQuantity ?? 0;
      // Without a count id the save cannot be told from a repeat: measure against the stock now
      const seen = countId && line.seen !== null ? line.seen : current;
      const difference = line.counted - seen;

      if (Math.abs(difference) > EPSILON) {
        const target = Math.max(0, current + difference);
        const soldMeanwhile = Math.abs(current - seen) > EPSILON;
        await tx.stockMovement.create({
          data: {
            restaurantId,
            ingredientId: ingredient.id,
            quantity: difference,
            movementType: 'ADJUSTMENT',
            referenceType: 'STOCK_COUNT',
            referenceId: countId,
            reason:
              `Contagem física: ${seen} → ${line.counted} (dif: ${difference > 0 ? '+' : ''}${difference.toFixed(2)})` +
              (soldMeanwhile ? `; movimentos desde a contagem preservados (estoque ${current} → ${target})` : ''),
          },
        });
        if (stock) {
          await tx.stock.update({
            where: { ingredientId: ingredient.id },
            data: { currentQuantity: target, lastUpdated: new Date(), lastAuditedAt: new Date() },
          });
        } else {
          await tx.stock.create({
            data: { restaurantId, ingredientId: ingredient.id, currentQuantity: target, lastAuditedAt: new Date() },
          });
        }

        const value = Math.abs(difference) * (ingredient.referenceCost || 0);
        if (value >= ALERT_MIN_VALUE || (seen > 0 && Math.abs(difference) / seen >= ALERT_MIN_SHARE)) {
          alerts.push({ name: ingredient.name, unit: ingredient.standardUnit, difference, value });
        }
      } else if (stock) {
        await tx.stock.update({ where: { ingredientId: ingredient.id }, data: { lastAuditedAt: new Date() } });
      }

      out.push({ ingredientId: ingredient.id, systemQuantity: seen, countedQuantity: line.counted, difference, adjusted: Math.abs(difference) > EPSILON });
    }

    const adjusted = out.filter((r) => r.adjusted);
    if (out.length > 0) {
      await tx.auditLog.create({
        data: {
          userId,
          restaurantId,
          action: 'UPDATE',
          entityType: 'StockCount',
          entityId: countId || `count-${Date.now()}`,
          changes: JSON.stringify({
            counted: out.length,
            adjusted: adjusted.map((r) => ({ ingredientId: r.ingredientId, from: r.systemQuantity, to: r.countedQuantity, difference: r.difference })),
          }),
        },
      });
    }
    return out;
  });

  if (alerts.length > 0) await alertBigDifferences(restaurantId, countId, alerts);
  return results;
}

/** One notification per count. Never throws: the count is already saved. */
async function alertBigDifferences(
  restaurantId: string,
  countId: string | null,
  alerts: Array<{ name: string; unit: string; difference: number; value: number }>
) {
  try {
    const shortageValue = alerts.filter((a) => a.difference < 0).reduce((sum, a) => sum + a.value, 0);
    const list = alerts
      .map((a) => `${a.name}: ${a.difference > 0 ? '+' : ''}${a.difference.toFixed(2)} ${a.unit} (R$ ${a.value.toFixed(2)})`)
      .join('; ');
    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'SYSTEM_ERROR',
        severity: shortageValue >= ALERT_MIN_VALUE ? 'HIGH' : 'MEDIUM',
        title: `Contagem de estoque com diferença relevante (${alerts.length} ${alerts.length === 1 ? 'item' : 'itens'})`,
        message: `Diferenças acima da tolerância (R$ ${ALERT_MIN_VALUE} ou ${ALERT_MIN_SHARE * 100}% do sistema): ${list}. Confira se houve perda, desperdício não lançado ou erro de contagem.`,
        actionUrl: '/estoque/movimento',
        actionLabel: 'Ver movimentos',
        data: { kind: 'stock_count_difference', countId, shortageValue, items: alerts },
      },
    });
  } catch (error) {
    console.error('Could not store the stock count alert:', error);
  }
}
