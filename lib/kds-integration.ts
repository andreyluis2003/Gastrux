// @ts-nocheck
// KDS Integration with Delivery and Reservation Systems
import { prisma } from './prisma';
import { broadcastOrderCreated, broadcastOrderUpdate } from './socket';
import { KITCHEN_VISIBLE_ORDER_WHERE } from './kds-visibility';

/**
 * Create a KDS order from an external delivery order
 */
export async function createOrderFromExternalOrder(
  externalOrderId: string
) {
  try {
    const externalOrder = await prisma.externalOrder.findUnique({
      where: { id: externalOrderId },
      include: { integration: true },
    });

    if (!externalOrder) {
      throw new Error('External order not found');
    }

    // Parse items from JSON string
    let items: any[] = [];
    try {
      items = JSON.parse(externalOrder.items);
    } catch (e) {
      console.error('Failed to parse items:', e);
      await alertDeliveryProblem(externalOrder, {
        kind: 'unreadable',
        severity: 'CRITICAL',
        title: 'Pedido de plataforma ilegível',
        message: `O pedido ${externalOrder.externalOrderId} chegou com os itens ilegíveis e NÃO foi para a cozinha. Confira o pedido na plataforma.`,
      });
      return null;
    }

    // Find matching recipes (ONLY this restaurant's own: a recipe of another restaurant must
    // never end up on this kitchen's order)
    const orderItems = [];
    const unmapped: Array<{ name: string; quantity: number }> = [];
    for (const item of items) {
      // A missing name or id must not become an empty filter (Prisma treats `contains: undefined`
      // as "no condition", which would match ANY recipe of the restaurant).
      const matchers: any[] = [];
      if (item.externalItemId) {
        matchers.push({
          menuMappings: { some: { integrationId: externalOrder.integrationId, externalItemId: item.externalItemId } },
        });
      }
      if (typeof item.name === 'string' && item.name.trim()) {
        matchers.push({ name: { contains: item.name.trim(), mode: 'insensitive' } });
      }
      const recipe = matchers.length
        ? await prisma.recipe.findFirst({ where: { restaurantId: externalOrder.restaurantId, OR: matchers } })
        : null;

      if (recipe) {
        orderItems.push({
          recipeId: recipe.id,
          quantity: item.quantity || 1,
          specialInstructions: item.specialInstructions,
        });
      } else {
        unmapped.push({ name: String(item.name || item.externalItemId || 'item sem nome'), quantity: item.quantity || 1 });
      }
    }

    const unmappedList = unmapped.map((u) => `${u.quantity}x ${u.name}`).join('; ');

    if (orderItems.length === 0) {
      console.warn('No matching recipes found');
      await alertDeliveryProblem(externalOrder, {
        kind: 'no-items-matched',
        severity: 'CRITICAL',
        title: 'Pedido de plataforma NÃO foi para a cozinha',
        message: `O pedido ${externalOrder.externalOrderId} não teve nenhum item reconhecido (${unmappedList || 'sem itens'}). Cadastre o mapeamento dos itens ou prepare-o manualmente.`,
        items: unmapped,
      });
      return null;
    }

    // Determine priority
    let priority: 'NORMAL' | 'HIGH' | 'URGENT' | 'LOW' = 'NORMAL';
    if (
      externalOrder.customerEmail?.toLowerCase().includes('vip') ||
      externalOrder.specialInstructions?.toLowerCase().includes('urgente')
    ) {
      priority = 'HIGH';
    }

    // Create KDS order. Order.orderNumber is unique across ALL restaurants, so the next KDS number
    // comes from the last KDS-#### order globally, and a concurrent writer that took the same number
    // is retried with a fresh one.
    let order: any = null;
    for (let attempt = 0; attempt < 5 && !order; attempt++) {
      try {
        order = await createKdsOrder(externalOrder, externalOrderId, orderItems, priority, unmappedList);
      } catch (error: any) {
        const numberTaken = error?.code === 'P2002' && String(error?.meta?.target ?? '').includes('orderNumber');
        if (!numberTaken || attempt === 4) throw error;
      }
    }

    await prisma.externalOrder.update({
      where: { id: externalOrderId },
      data: { internalOrderId: order.id },
    });

    if (unmapped.length) {
      await alertDeliveryProblem(externalOrder, {
        kind: 'partial',
        severity: 'HIGH',
        title: 'Pedido de plataforma com itens não reconhecidos',
        message: `O pedido ${externalOrder.externalOrderId} foi para a cozinha SEM: ${unmappedList}. Prepare esses itens manualmente ou cadastre o mapeamento.`,
        items: unmapped,
      });
    }

    broadcastOrderCreated(order);
    return order;
  } catch (error) {
    console.error('Error creating order from external order:', error);
    return null;
  }
}

/** Next free "KDS-####" number: ignores orders numbered in any other format. */
async function nextKdsOrderNumber(): Promise<string> {
  const last = await prisma.order.findFirst({
    where: { orderNumber: { startsWith: 'KDS-' } },
    orderBy: { createdAt: 'desc' },
    select: { orderNumber: true },
  });
  const current = last ? parseInt(last.orderNumber.slice(4), 10) : 0;
  return `KDS-${String((Number.isFinite(current) ? current : 0) + 1).padStart(4, '0')}`;
}

/**
 * Tells the restaurant that a delivery-platform order did not reach the kitchen complete: a
 * notification, once per external order and kind (a platform replay must not raise it again).
 * Never throws: the order handling must not fail because the alert could not be stored.
 */
async function alertDeliveryProblem(
  externalOrder: { id: string; restaurantId: string; externalOrderId: string },
  alert: { kind: string; severity?: 'HIGH' | 'CRITICAL'; title: string; message: string; items?: Array<{ name: string; quantity: number }> }
) {
  try {
    const dedupeKey = `delivery-${alert.kind}:${externalOrder.id}`;
    const existing = await prisma.notification.findFirst({
      where: { restaurantId: externalOrder.restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: {
        restaurantId: externalOrder.restaurantId,
        type: 'SYSTEM_ERROR',
        severity: alert.severity ?? 'HIGH',
        title: alert.title,
        message: alert.message,
        data: {
          kind: 'delivery_order_problem',
          problem: alert.kind,
          dedupeKey,
          externalOrderId: externalOrder.id,
          platformOrderId: externalOrder.externalOrderId,
          items: alert.items ?? [],
        },
      },
    });
  } catch (error) {
    console.error('Could not store the delivery order alert:', error);
  }
}

async function createKdsOrder(externalOrder: any, externalOrderId: string, orderItems: any[], priority: any, unmappedList = '') {
  const orderNumber = await nextKdsOrderNumber();
  return prisma.order.create({
    data: {
      restaurantId: externalOrder.restaurantId,
      orderNumber,
      orderType: 'DELIVERY',
      externalOrderId: externalOrderId,
      priority,
      estimatedPrepTime: 30,
      // Items that could not be matched are written on the ticket so the kitchen does not
      // silently prepare an incomplete order.
      specialInstructions:
        [externalOrder.specialInstructions, unmappedList && `ATENÇÃO - ITENS NÃO MAPEADOS (não estão neste pedido): ${unmappedList}`]
          .filter(Boolean)
          .join(' | ') || undefined,
      totalItems: orderItems.length,
      items: {
        create: orderItems,
      },
    },
    include: {
      items: {
        include: { recipe: true },
      },
    },
  });
}

/**
 * Create a KDS order from a reservation
 */
export async function createOrderFromReservation(
  reservationId: string,
  orderItems: Array<{ recipeId: string; quantity: number }>
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new Error('Reservation not found');
    }

    if (orderItems.length === 0) {
      throw new Error('Order must have at least one item');
    }

    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    let orderNumber = 'KDS-0001';
    if (lastOrder?.orderNumber) {
      const num = parseInt(lastOrder.orderNumber.split('-')[1]) + 1;
      orderNumber = `KDS-${String(num).padStart(4, '0')}`;
    }

    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderType: 'DINE_IN',
        reservationId,
        priority: 'NORMAL',
        estimatedPrepTime: 25,
        totalItems: orderItems.length,
        items: {
          create: orderItems,
        },
      },
      include: {
        items: {
          include: { recipe: true },
        },
      },
    });

    broadcastOrderCreated(order);
    return order;
  } catch (error) {
    console.error('Error creating order from reservation:', error);
    return null;
  }
}

/**
 * Sync KDS order status back to external order
 */
export async function syncOrderStatusToExternal(
  orderId: string,
  status: string
) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { externalOrder: true },
    });

    if (!order?.externalOrder) {
      return;
    }

    const statusMap: Record<string, string> = {
      PENDING: 'PENDING',
      PREPARING: 'CONFIRMED',
      READY: 'READY',
      COMPLETED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
      ON_HOLD: 'PENDING',
    };

    const externalStatus = statusMap[status] || 'PENDING';

    await prisma.externalOrder.update({
      where: { id: order.externalOrder.id },
      data: {
        status: externalStatus as any,
        ...(status === 'COMPLETED' && { deliveredAt: new Date() }),
      },
    });

    try {
      await prisma.deliveryLog.create({
        data: {
          externalOrderId: order.externalOrder.id,
          eventType: 'STATUS_CHANGED' as any,
          newStatus: externalStatus as any,
          previousStatus: order.externalOrder.status,
          message: `Order status changed to ${status}`,
          eventTimestamp: new Date(),
        },
      });
    } catch (logError) {
      console.error('Failed to create delivery log:', logError);
    }

    broadcastOrderUpdate(orderId, status, { synced: true });
  } catch (error) {
    console.error('Error syncing order status:', error);
  }
}

/**
 * Get KDS orders for a specific kitchen station
 */
export async function getStationOrders(stationId: string) {
  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['PENDING', 'PREPARING', 'READY'] },
        items: {
          some: { stationId },
        },
        // Unpaid online orders never reach the kitchen.
        AND: [KITCHEN_VISIBLE_ORDER_WHERE],
      },
      include: {
        items: {
          include: { recipe: true },
        },
        stationAssignments: {
          include: { station: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    return orders;
  } catch (error) {
    console.error('Error getting station orders:', error);
    return [];
  }
}

/**
 * Calculate average prep time
 */
export async function getAveragePrepTime(days: number = 7) {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const completedOrders = await prisma.order.findMany({
      where: {
        status: 'COMPLETED',
        completedAt: { gte: since },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
    });

    if (completedOrders.length === 0) {
      return 0;
    }

    const totalTime = completedOrders.reduce((acc, order) => {
      if (!order.completedAt) return acc;
      const time =
        (order.completedAt.getTime() - order.createdAt.getTime()) / 1000 / 60;
      return acc + time;
    }, 0);

    return Math.round(totalTime / completedOrders.length);
  } catch (error) {
    console.error('Error calculating average prep time:', error);
    return 0;
  }
}
