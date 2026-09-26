// @ts-nocheck
import { prisma } from './prisma';
import { getMpClientForRestaurant } from './mercadopago-connect/connection-service';
import { cancelConnectPayment } from './mercadopago-connect/payments';
import { createPaymentAlert } from './payment-alert-service';

/** Order statuses in which the kitchen has already started (ingredients are being or were used). */
const KITCHEN_STARTED = ['PREPARING', 'READY'];

/** Statuses an order can still be cancelled from. COMPLETED (stock already deducted) cannot. */
const CANCELLABLE = ['PENDING', 'PREPARING', 'READY', 'ON_HOLD'];

/** Payments of a cancelled order: what was called off and what still holds the customer's money. */
export interface CancelPayments {
  /** PENDING / PROCESSING payments that were cancelled (the customer can no longer pay them). */
  cancelled: Array<{ id: string; gateway: string; gatewayPaymentId: string | null }>;
  /** Approved online payments: the money is still with the restaurant and must be refunded or kept on purpose. */
  refundPending: Array<{ id: string; amount: number; gateway: string; method: string }>;
}

export type CancelOutcome =
  | { kind: 'not-found' }
  | { kind: 'already-cancelled'; order: any }
  | { kind: 'completed'; order: any }
  | { kind: 'cancelled'; order: any; loss: { recorded: boolean; ingredients: number; estimatedCost: number }; payments: CancelPayments };

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

    // Payments of this order: a pending one is called off (a late PIX must not be accepted for a dead
    // order); an approved online one still holds the customer's money and is reported below.
    const payments: CancelPayments = { cancelled: [], refundPending: [] };
    const orderPayments = await tx.payment.findMany({
      where: { orderId, restaurantId: opts.restaurantId },
      select: { id: true, status: true, amount: true, gateway: true, method: true, gatewayPaymentId: true },
    });
    const open = orderPayments.filter((p) => p.status === 'PENDING' || p.status === 'PROCESSING');
    if (open.length) {
      await tx.payment.updateMany({
        where: { id: { in: open.map((p) => p.id) }, restaurantId: opts.restaurantId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELLED' },
      });
      payments.cancelled = open.map((p) => ({ id: p.id, gateway: p.gateway, gatewayPaymentId: p.gatewayPaymentId }));
    }
    payments.refundPending = orderPayments
      .filter((p) => ['APPROVED', 'SETTLED', 'PARTIALLY_REFUNDED'].includes(p.status) && p.gateway !== 'MANUAL')
      .map((p) => ({ id: p.id, amount: Number(p.amount), gateway: p.gateway, method: p.method }));

    const updated = await tx.order.findUnique({ where: { id: orderId } });
    return { kind: 'cancelled', order: updated, loss, payments, previousStatus: order.status } as any;
  });

  if (result.kind === 'cancelled') await settlePaymentsOfCancelledOrder(result.order, result.payments, opts.restaurantId);

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
            paymentsCancelled: result.payments.cancelled.map((p) => p.id),
            refundPending: result.payments.refundPending.map((p) => p.id),
          }),
        },
      })
      .catch((error) => console.error('Could not write the order cancellation audit log:', error));
  }

  return result;
}

/**
 * After the cancellation is committed: call off the pending Mercado Pago charges (best effort: if one
 * was approved meanwhile, the payment sync records it and raises the late-payment alert) and tell the
 * operator about every approved online payment that still needs a refund. Nothing is refunded
 * automatically: giving money back is a decision, made through the audited refund route. Never throws.
 */
async function settlePaymentsOfCancelledOrder(order: any, payments: CancelPayments, restaurantId: string) {
  for (const p of payments.cancelled) {
    if (p.gateway !== 'MERCADO_PAGO_CONNECT' || !p.gatewayPaymentId) continue;
    try {
      const client = await getMpClientForRestaurant(restaurantId);
      if (client) await cancelConnectPayment(client, p.gatewayPaymentId);
    } catch (error) {
      console.error(`Could not cancel the pending Mercado Pago payment ${p.id} of a cancelled order:`, error);
    }
  }

  for (const p of payments.refundPending) {
    await createPaymentAlert({
      alertType: 'refund',
      severity: 'critical',
      title: 'Pedido cancelado já estava pago: reembolso pendente',
      message: `O pedido #${order.orderNumber} foi cancelado, mas o pagamento de R$ ${p.amount.toFixed(2)} já foi aprovado e continua com o restaurante. Reembolse o cliente ou registre por que o valor será mantido.`,
      paymentId: p.id,
      gateway: p.gateway,
      amount: p.amount,
      restaurantId,
      dedupeKey: `cancelled-paid-order:${p.id}`,
    });
  }
}
