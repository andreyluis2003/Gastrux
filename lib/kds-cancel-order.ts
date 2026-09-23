// @ts-nocheck
import { prisma } from './prisma';

/** Order statuses in which the kitchen has already started (ingredients are being or were used). */
const KITCHEN_STARTED = ['PREPARING', 'READY'];

/** Statuses an order can still be cancelled from. COMPLETED (stock already deducted) cannot. */
const CANCELLABLE = ['PENDING', 'PREPARING', 'READY', 'ON_HOLD'];

export type CancelOutcome =
  | { kind: 'not-found' }
  | { kind: 'already-cancelled'; order: any }
  | { kind: 'completed'; order: any }
  | { kind: 'cancelled'; order: any; loss: { recorded: boolean; ingredients: number; estimatedCost: number } };

/**
 * Cancels an order and, when the kitchen had already started it, records the ingredients it
 * consumed as a LOSS (WasteLog reason PREPARATION + a LOSS stock movement + the stock decrement),
 * exactly like a manual waste entry (app/api/waste) so it shows in the waste dashboard and in the
 * stock history. Ingredients are computed like the completion deduction does (recipe quantity x
 * item quantity), so cancelling and completing an order consume the same amount.
 *
 * Idempotent and atomic: the status change is guarded on the current status inside a single
 * transaction, so a second or simultaneous cancel changes nothing and records no second loss, and
 * the status, the items and the loss either all happen or none does.
 */
export async function cancelOrder(
  orderId: string,
  opts: { restaurantId: string; userId?: string; reason?: string }
): Promise<CancelOutcome> {
  const result = await prisma.$transaction(async (tx) => {
    // Scoped to the caller's restaurant: another restaurant's order is "not found", never cancelled.
    const order = await tx.order.findFirst({
      where: { id: orderId, restaurantId: opts.restaurantId },
      include: { items: { include: { recipe: { include: { ingredients: { include: { ingredient: true } } } } } } },
    });
    if (!order) return { kind: 'not-found' } as CancelOutcome;
    if (order.status === 'CANCELLED') return { kind: 'already-cancelled', order } as CancelOutcome;
    if (!CANCELLABLE.includes(order.status)) return { kind: 'completed', order } as CancelOutcome;

    const moved = await tx.order.updateMany({
      where: { id: orderId, restaurantId: opts.restaurantId, status: { in: CANCELLABLE } },
      data: { status: 'CANCELLED' },
    });
    // A simultaneous cancel won between the read and the update: nothing more to do.
    if (moved.count === 0) return { kind: 'already-cancelled', order } as CancelOutcome;

    await tx.orderItem.updateMany({ where: { orderId }, data: { status: 'CANCELLED' } });

    const loss = { recorded: false, ingredients: 0, estimatedCost: 0 };
    if (KITCHEN_STARTED.includes(order.status)) {
      const used = new Map<string, { quantity: number; ingredient: any }>();
      for (const item of order.items) {
        for (const ri of item.recipe?.ingredients ?? []) {
          const entry = used.get(ri.ingredientId) ?? { quantity: 0, ingredient: ri.ingredient };
          entry.quantity += ri.quantity * item.quantity;
          used.set(ri.ingredientId, entry);
        }
      }
      for (const [ingredientId, { quantity, ingredient }] of used) {
        const estimatedCost = quantity * (ingredient?.referenceCost ?? 0);
        await tx.wasteLog.create({
          data: {
            restaurantId: order.restaurantId,
            ingredientId,
            quantity,
            unit: ingredient.standardUnit,
            estimatedCost,
            reason: 'PREPARATION',
            notes: `Pedido #${order.orderNumber} cancelado depois de iniciado o preparo${opts.reason ? `: ${opts.reason}` : ''}`,
          },
        });
        await tx.stockMovement.create({
          data: {
            restaurantId: order.restaurantId,
            ingredientId,
            movementType: 'LOSS',
            quantity: -quantity,
            reason: `Pedido #${order.orderNumber} cancelado após iniciar o preparo`,
            referenceId: order.id,
            referenceType: 'ORDER_CANCELLED',
          },
        });
        await tx.stock.updateMany({
          where: { ingredientId, restaurantId: order.restaurantId },
          data: { currentQuantity: { decrement: quantity }, lastUpdated: new Date() },
        });
        loss.recorded = true;
        loss.ingredients++;
        loss.estimatedCost += estimatedCost;
      }
    }

    const updated = await tx.order.findUnique({ where: { id: orderId } });
    return { kind: 'cancelled', order: updated, loss, previousStatus: order.status } as any;
  });

  // Who cancelled, from what, and what it cost. Best effort: a failed log must never block or undo
  // a cancellation that the kitchen needs.
  if (result.kind === 'cancelled' && opts.userId) {
    await prisma.auditLog
      .create({
        data: {
          userId: opts.userId,
          restaurantId: result.order.restaurantId,
          action: 'STATUS_CHANGE',
          entityType: 'Order',
          entityId: orderId,
          changes: JSON.stringify({
            from: (result as any).previousStatus,
            to: 'CANCELLED',
            reason: opts.reason ?? null,
            lossRecorded: result.loss.recorded,
            lossIngredients: result.loss.ingredients,
            lossEstimatedCost: result.loss.estimatedCost,
          }),
        },
      })
      .catch((error) => console.error('Could not write the order cancellation audit log:', error));
  }

  return result;
}
