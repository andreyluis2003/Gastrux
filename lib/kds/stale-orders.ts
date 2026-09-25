import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { KITCHEN_VISIBLE_ORDER_WHERE } from '@/lib/kds-visibility';

/**
 * An order the kitchen can see but nobody started for too long usually means the kitchen screen is
 * off, frozen or on the wrong page (or the printer did not print): market KDS systems flag such
 * orders as late. One notification per order, for the floor/manager, so someone goes to check.
 * Run by POST /api/kds/stale-check (CRON_SECRET), every minute or two.
 */
export const STALE_AFTER_MINUTES = 10;

export async function alertStaleKitchenOrders(now = new Date(), afterMinutes = STALE_AFTER_MINUTES) {
  const cutoff = new Date(now.getTime() - afterMinutes * 60_000);
  const stale = await prisma.order.findMany({
    // the visibility rule is declared readonly (as const); Prisma wants a mutable input
    where: { status: 'PENDING', createdAt: { lte: cutoff }, AND: [KITCHEN_VISIBLE_ORDER_WHERE as unknown as Prisma.OrderWhereInput] },
    select: { id: true, restaurantId: true, orderNumber: true, createdAt: true, orderType: true },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  let alerted = 0;
  for (const order of stale) {
    if (!order.restaurantId) continue;
    const dedupeKey = `kitchen-stale:${order.id}`;
    const existing = await prisma.notification.findFirst({
      where: { restaurantId: order.restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) continue;
    const minutes = Math.floor((now.getTime() - order.createdAt.getTime()) / 60_000);
    await prisma.notification.create({
      data: {
        restaurantId: order.restaurantId,
        type: 'SYSTEM_ERROR',
        severity: 'HIGH',
        title: `Pedido ${order.orderNumber} sem início na cozinha há ${minutes} min`,
        message:
          'A cozinha ainda não começou este pedido. Confira se a tela da cozinha está ligada e atualizada (ou se a impressora imprimiu) e avise a cozinha.',
        actionUrl: '/admin/kds',
        actionLabel: 'Abrir cozinha',
        data: { kind: 'kitchen_stale_order', dedupeKey, orderId: order.id, minutes },
      },
    });
    alerted++;
  }
  return { checked: stale.length, alerted };
}
