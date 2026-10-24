import { prisma } from '@/lib/prisma';
import { creditSale, recordPurchase } from '@/lib/cashback/service';
import { notifyOrderStatus } from '@/lib/delivery-orders/callback';

/**
 * Kitchen order status changes (PUT /api/kds/orders/[id]).
 *
 * Before: any status could be written over any other, so a CANCELLED order could be completed, and
 * every COMPLETED (a double tap, a retry, two screens) took the ingredients out of stock again and
 * credited the 5% cashback again. Now:
 * - COMPLETED and CANCELLED are final. Completing a completed order changes nothing; anything else
 *   on a final order is refused (409).
 * - Cancelling goes through DELETE (manager, loss record, payments), never through a status write.
 * - The move to COMPLETED is claimed with a conditional update, and the stock leaves in the same
 *   transaction: it happens once, whatever the number of calls.
 */
export const ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'ON_HOLD'] as const;
export const OPEN_STATUSES = ['PENDING', 'PREPARING', 'READY', 'ON_HOLD'];

export type StatusChange =
  | { kind: 'not-found' }
  | { kind: 'invalid'; error: string }
  | { kind: 'conflict'; error: string; code: string; currentStatus: string }
  | { kind: 'unchanged'; order: any }
  | { kind: 'changed'; order: any; from: string };

export async function changeOrderStatus(restaurantId: string, orderId: string, status: string): Promise<StatusChange> {
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) {
    return { kind: 'invalid', error: `Status inválido: ${status}` };
  }
  if (status === 'CANCELLED') {
    return { kind: 'invalid', error: 'Para cancelar um pedido use o cancelamento (exige um gerente)' };
  }

  const current = await prisma.order.findFirst({ where: { id: orderId, restaurantId }, select: { status: true, orderSessionId: true } });
  if (!current) return { kind: 'not-found' };

  const outcome = await prisma.$transaction(async (tx) => {
    // The comanda's stock lock (lib/stock/session-stock.ts): a close settling it at the same time finishes
    // first and the kitchen sees it CLOSED, or the close waits and counts this deduction
    if (status === 'COMPLETED' && current.orderSessionId) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-session:' + current.orderSessionId}))`;
    }
    const data: any = { status };
    if (status === 'COMPLETED') data.completedAt = new Date();
    if (status === 'PREPARING') data.actualStartTime = new Date();

    // Only an open order moves, and only if it is not already in that status
    const moved = await tx.order.updateMany({
      where: { id: orderId, restaurantId, status: { in: OPEN_STATUSES.filter((s) => s !== status) as any } },
      data,
    });
    if (moved.count === 0) return null;

    if (status === 'COMPLETED') {
      // A comanda already closed settled its stock at the close (lib/stock/session-stock.ts): the kitchen takes nothing more
      const link = await tx.order.findUnique({ where: { id: orderId }, select: { comanda: { select: { status: true } } } });
      if (link?.comanda?.status !== 'CLOSED') await deductOrderStock(tx, restaurantId, orderId);
    }
    return true;
  });

  const order = await prisma.order.findFirst({
    where: { id: orderId, restaurantId },
    include: { items: { include: { recipe: true, station: true } }, stationAssignments: { include: { station: true } } },
  });

  if (!outcome) {
    if (order?.status === status) return { kind: 'unchanged', order };
    return {
      kind: 'conflict',
      code: order?.status === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_COMPLETED',
      error: order?.status === 'CANCELLED' ? 'Este pedido foi cancelado' : 'Este pedido já foi concluído',
      currentStatus: order?.status ?? 'UNKNOWN',
    };
  }

  if (status === 'COMPLETED' && order) await creditCashback(order);
  // An order of the Gastrux order API: the sender hears the new status (plan 2026-10-23 api-de-pedidos)
  if (order?.externalOrderId) void notifyOrderStatus(order.externalOrderId);
  return { kind: 'changed', order, from: current.status };
}

/** The recipes' ingredients leave this restaurant's stock; the movement is recorded for the CMV. */
async function deductOrderStock(tx: any, restaurantId: string, orderId: string) {
  const items = await tx.orderItem.findMany({
    // An item withdrawn from the comanda was not made (its loss, if any, was recorded then: lib/kds/withdraw-line.ts)
    where: { orderId, status: { not: 'CANCELLED' } },
    select: { quantity: true, recipe: { select: { restaurantId: true, ingredients: { select: { ingredientId: true, quantity: true } } } } },
  });
  const totals = new Map<string, number>();
  for (const item of items) {
    if (!item.recipe || item.recipe.restaurantId !== restaurantId) continue;
    for (const ri of item.recipe.ingredients) {
      totals.set(ri.ingredientId, (totals.get(ri.ingredientId) ?? 0) + Number(ri.quantity) * Number(item.quantity));
    }
  }
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  for (const [ingredientId, total] of Array.from(totals)) {
    if (total <= 0) continue;
    await tx.stock.updateMany({
      where: { restaurantId, ingredientId },
      data: { currentQuantity: { decrement: total }, lastUpdated: new Date() },
    });
    await tx.stockMovement.create({
      data: {
        restaurantId, ingredientId, quantity: -total, movementType: 'AUTO_DEDUCTION',
        reason: `Pedido #${order?.orderNumber ?? ''}`, referenceId: orderId, referenceType: 'ORDER',
      },
    });
  }
}

/**
 * Cashback and CRM purchase of an identified delivery customer (spec 2026-10-23 §7.3), once: only after this call
 * claimed the completion. A comanda's kitchen order is not a sale: its bill credits when it closes. The base is the
 * items (subtotal), never the delivery fee. It replaced 5% in loyalty points that no screen ever used.
 */
async function creditCashback(order: any) {
  if (!order.customerId || order.orderSessionId) return;
  try {
    const subtotalCents = Math.round(Number(order.subtotal ?? order.total ?? 0) * 100);
    const totalCents = Math.round(Number(order.total ?? 0) * 100);
    await prisma.$transaction(async (tx) => {
      await recordPurchase(tx, order.customerId, totalCents, new Date());
      await creditSale(tx, { restaurantId: order.restaurantId, customerId: order.customerId, baseCents: subtotalCents, orderId: order.id });
    });
  } catch (err) {
    console.error('Auto cashback error:', err);
  }
}

/**
 * The staff of THIS restaurant with one of these roles here, plus the owner. Kitchen notices (new
 * order, "pedido pronto") used to read the global User.role, so an owner without a membership row
 * was left out and a person's role in another restaurant decided who was told.
 */
export async function restaurantStaffIds(restaurantId: string, roles: string[]): Promise<string[]> {
  const [restaurant, members] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { ownerId: true } }),
    prisma.restaurantUser.findMany({
      where: { restaurantId, isActive: true, role: { in: roles as any }, user: { active: true } },
      select: { userId: true },
    }),
  ]);
  const ids = new Set(members.map((m) => m.userId));
  if (restaurant?.ownerId) ids.add(restaurant.ownerId);
  const existing = await prisma.user.findMany({ where: { id: { in: Array.from(ids) }, active: true }, select: { id: true } });
  return existing.map((u) => u.id);
}
