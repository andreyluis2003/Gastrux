import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lineUnits } from '@/lib/comanda/weight';

type Db = Prisma.TransactionClient | typeof prisma;
const EPS = 1e-9;

/**
 * A closed comanda takes its ingredients out of stock (2026-10-13: stock only left when the kitchen screen
 * marked an order COMPLETED, so a counter sale, a drink or a restaurant without the kitchen screen never
 * moved stock). Reconciled, so it can run at every close: target = ficha quantity × units (kg for a line by weight) of the current
 * lines; already taken = the kitchen's movements for this comanda's orders (ORDER) and this comanda's own
 * earlier settlements (ORDER_SESSION). The difference leaves stock; a reopened bill that lost lines gets
 * back only what an earlier settlement took (what the kitchen made is a loss, lib/kds-cancel-order.ts).
 * The quantity changes only for a controlled ingredient (one with a Stock row); the movement is always
 * recorded, for the CMV. A cancelled comanda has no target: its settlements come back (the sale is undone).
 */
export async function settleSessionStock(db: Db, restaurantId: string, sessionId: string): Promise<{ moved: number }> {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-session:' + sessionId}))`;
    const session = await tx.orderSession.findFirst({
      where: { id: sessionId, restaurantId },
      select: {
        status: true, tableNumber: true, customerName: true,
        items: { select: { quantity: true, weightGrams: true, recipe: { select: { restaurantId: true, ingredients: { select: { ingredientId: true, quantity: true } } } } } },
      },
    });
    if (!session || (session.status !== 'CLOSED' && session.status !== 'CANCELLED')) return { moved: 0 };
    const cancelled = session.status === 'CANCELLED';

    const target = new Map<string, number>();
    for (const line of cancelled ? [] : session.items) {
      if (!line.recipe || line.recipe.restaurantId !== restaurantId) continue;
      for (const ri of line.recipe.ingredients) {
        target.set(ri.ingredientId, (target.get(ri.ingredientId) ?? 0) + Number(ri.quantity) * lineUnits(line));
      }
    }

    const orderIds = (await tx.order.findMany({ where: { orderSessionId: sessionId, restaurantId }, select: { id: true } })).map((o) => o.id);
    const moves = await tx.stockMovement.findMany({
      where: {
        restaurantId,
        movementType: 'AUTO_DEDUCTION',
        OR: [
          { referenceType: 'ORDER_SESSION', referenceId: sessionId },
          ...(orderIds.length ? [{ referenceType: 'ORDER', referenceId: { in: orderIds } }] : []),
        ],
      },
      select: { ingredientId: true, quantity: true, referenceType: true },
    });
    const kitchen = new Map<string, number>();
    const settled = new Map<string, number>();
    for (const m of moves) {
      const bucket = m.referenceType === 'ORDER' ? kitchen : settled;
      bucket.set(m.ingredientId, (bucket.get(m.ingredientId) ?? 0) - Number(m.quantity));
    }

    const label = session.tableNumber ? `Mesa ${session.tableNumber}` : session.customerName || 'balcão';
    let moved = 0;
    for (const ingredientId of new Set([...target.keys(), ...settled.keys()])) {
      const diff = (target.get(ingredientId) ?? 0) - (kitchen.get(ingredientId) ?? 0) - (settled.get(ingredientId) ?? 0);
      let change = 0;
      if (diff > EPS) change = -diff;
      else if (diff < -EPS) change = Math.min(-diff, settled.get(ingredientId) ?? 0);
      if (Math.abs(change) <= EPS) continue;
      await tx.stockMovement.create({
        data: {
          restaurantId, ingredientId, quantity: change, movementType: 'AUTO_DEDUCTION',
          reason: change < 0 ? `Venda: ${label}` : cancelled ? `Venda cancelada: ${label}` : `Item retirado da conta: ${label}`,
          referenceType: 'ORDER_SESSION', referenceId: sessionId,
        },
      });
      // Controlled ingredients only (a Stock row exists): never creates one
      await tx.stock.updateMany({
        where: { restaurantId, ingredientId },
        data: { currentQuantity: { increment: change }, lastUpdated: new Date() },
      });
      moved++;
    }
    return { moved };
  };
  return '$transaction' in db ? (db as typeof prisma).$transaction(run) : run(db as Prisma.TransactionClient);
}
