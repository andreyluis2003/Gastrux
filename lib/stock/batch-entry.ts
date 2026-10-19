import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { parseDecimal } from '@/lib/utility-bills/rules';

/**
 * Entrada em lote (2026-10-18 UX research, proposal 3; Consumer's "alterar estoque em lote"): the quantity bought
 * and, when given, the cost per unit of many insumos, confirmed at once. Same rules as Compras received
 * (lib/stock/receive-shopping-list.ts): the first entry creates the Stock row, the cost becomes the insumo's
 * reference cost, and each line enters once (referenceType BATCH_ENTRY, referenceId = batch + insumo), so a double
 * tap or a retry of the same batch adds nothing. All or nothing: one wrong line writes nothing.
 */
export class StockBatchError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface BatchLine { ingredientId: unknown; quantity: unknown; unitCost?: unknown }

const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

export async function batchEntry(member: RestaurantMember, body: { batchId?: unknown; items?: unknown }): Promise<{ entered: number }> {
  const batchId = typeof body.batchId === 'string' && /^[\w-]{6,80}$/.test(body.batchId) ? body.batchId : null;
  if (!batchId) throw new StockBatchError('Lote inválido');
  const lines = (Array.isArray(body.items) ? body.items : []) as BatchLine[];
  if (lines.length > 500) throw new StockBatchError('No máximo 500 insumos por vez');
  const filled = lines.filter((l) => !blank(l.quantity));
  if (!filled.length) throw new StockBatchError('Informe a quantidade de pelo menos um insumo');

  const ids = filled.map((l) => String(l.ingredientId));
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ids }, restaurantId: member.restaurantId, active: true },
    select: { id: true, name: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  const parsed = filled.map((l) => {
    const ing = byId.get(String(l.ingredientId));
    if (!ing) throw new StockBatchError('Insumo não encontrado', 404);
    const quantity = parseDecimal(l.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) throw new StockBatchError(`Quantidade inválida em ${ing.name}`);
    let unitCost: number | null = null;
    if (!blank(l.unitCost)) {
      unitCost = parseDecimal(l.unitCost);
      if (!Number.isFinite(unitCost) || unitCost <= 0 || unitCost > 1_000_000) throw new StockBatchError(`Custo inválido em ${ing.name}`);
    }
    return { ing, quantity, unitCost };
  });

  const { restaurantId } = member;
  const entered = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-batch:' + restaurantId + ':' + batchId}))`;
    const refs = parsed.map((p) => `${batchId}:${p.ing.id}`);
    const done = new Set(
      (await tx.stockMovement.findMany({ where: { restaurantId, referenceType: 'BATCH_ENTRY', referenceId: { in: refs } }, select: { referenceId: true } }))
        .map((m) => m.referenceId),
    );
    let n = 0;
    for (const p of parsed) {
      const ref = `${batchId}:${p.ing.id}`;
      if (done.has(ref)) continue;
      await tx.stockMovement.create({
        data: { restaurantId, ingredientId: p.ing.id, quantity: p.quantity, movementType: 'ENTRY', reason: 'Entrada em lote', referenceType: 'BATCH_ENTRY', referenceId: ref },
      });
      await tx.stock.upsert({
        where: { restaurantId_ingredientId: { restaurantId, ingredientId: p.ing.id } },
        create: { restaurantId, ingredientId: p.ing.id, currentQuantity: p.quantity },
        update: { currentQuantity: { increment: p.quantity }, lastUpdated: new Date() },
      });
      if (p.unitCost !== null) {
        await tx.ingredient.update({ where: { id: p.ing.id }, data: { referenceCost: p.unitCost, lastCostUpdate: new Date() } });
      }
      n++;
    }
    return n;
  });
  if (entered) {
    await recordAudit(member, { action: 'CREATE', entityType: 'StockBatchEntry', entityId: batchId, changes: { lines: parsed.map((p) => ({ ingredientId: p.ing.id, quantity: p.quantity, unitCost: p.unitCost })) } });
  }
  return { entered };
}
