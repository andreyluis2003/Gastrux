import { prisma } from '@/lib/prisma';
import { cancelOrder, recordKitchenLoss } from '@/lib/kds-cancel-order';

const KITCHEN_STARTED = ['PREPARING', 'READY'];
const norm = (s: string | null | undefined) => (s ?? '').trim();

export type WithdrawOutcome = 'withdrawn' | 'order-cancelled' | 'kitchen-done' | 'not-found';

/**
 * A line the kitchen has, removed or reduced on the comanda, leaves the kitchen too (prod 2026-10-12: the
 * removed item stayed on the KDS, the kitchen kept cooking it and "Cancelar comanda" stayed blocked).
 *
 * The comanda line and the kitchen item are not linked: the send (lib/kds/send-session.ts) copies the new
 * lines into one kitchen order created just before it stamps them `sentAt`. So the kitchen item is found in
 * the comanda's orders created in the two minutes up to `sentAt`, by recipe and note, with at least the
 * quantity being taken out. The quantity leaves that item (the whole item is cancelled when it is all of
 * it); if it was the order's only live item the whole order is cancelled through the kitchen's own rule.
 * When the kitchen had started, the ingredients of what left are recorded as a loss, like a kitchen cancel.
 * An order the kitchen already completed is left as it is (the dish was made).
 */
export async function withdrawFromKitchen(input: {
  restaurantId: string;
  sessionId: string;
  line: { recipeId: string; specialInstructions: string | null; sentAt: Date | null };
  quantity: number;
  userId?: string;
  reason?: string;
}): Promise<WithdrawOutcome> {
  const { restaurantId, sessionId, line, quantity } = input;
  if (!line.sentAt || !(quantity > 0)) return 'not-found';
  const sentAt = new Date(line.sentAt).getTime();

  const orders = await prisma.order.findMany({
    where: { restaurantId, orderSessionId: sessionId, createdAt: { gte: new Date(sentAt - 120_000), lte: new Date(sentAt + 5_000) } },
    include: { items: { include: { recipe: { include: { ingredients: { include: { ingredient: true } } } } } } },
    orderBy: { createdAt: 'desc' },
  });
  for (const order of orders) {
    const item = order.items.find((i) => i.recipeId === line.recipeId && norm(i.specialInstructions) === norm(line.specialInstructions) && i.status !== 'CANCELLED' && i.quantity >= quantity);
    if (!item) continue;
    if (order.status === 'COMPLETED' || order.status === 'CANCELLED') return 'kitchen-done';

    const live = order.items.filter((i) => i.status !== 'CANCELLED');
    if (live.length === 1 && item.quantity === quantity) {
      const out = await cancelOrder(order.id, { restaurantId, userId: input.userId, reason: input.reason });
      return out.kind === 'cancelled' || out.kind === 'already-cancelled' ? 'order-cancelled' : 'kitchen-done';
    }

    return prisma.$transaction(async (tx) => {
      // Guarded on what was read: a change in between (the kitchen, another device) leaves this one undone
      const moved = item.quantity === quantity
        ? await tx.orderItem.updateMany({ where: { id: item.id, status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } })
        : await tx.orderItem.updateMany({ where: { id: item.id, quantity: item.quantity, status: { not: 'CANCELLED' } }, data: { quantity: item.quantity - quantity } });
      if (moved.count === 0) return 'not-found' as const;
      if (KITCHEN_STARTED.includes(order.status)) {
        await recordKitchenLoss(tx, { restaurantId, orderId: order.id, orderNumber: order.orderNumber, items: [{ ...item, quantity }], reason: input.reason, userId: input.userId });
      }
      return 'withdrawn' as const;
    });
  }
  return 'not-found';
}
