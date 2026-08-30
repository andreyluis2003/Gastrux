// @ts-nocheck
// KDS Integration with Delivery and Reservation Systems
import { prisma } from './prisma';
import { broadcastOrderCreated, broadcastOrderUpdate } from './socket';

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
      return null;
    }

    // Generate order number
    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    let orderNumber = 'KDS-0001';
    if (lastOrder?.orderNumber) {
      const num = parseInt(lastOrder.orderNumber.split('-')[1]) + 1;
      orderNumber = `KDS-${String(num).padStart(4, '0')}`;
    }

    // Find matching recipes
    const orderItems = [];
    for (const item of items) {
      const recipe = await prisma.recipe.findFirst({
        where: {
          OR: [
            {
              menuMappings: {
                some: {
                  integrationId: externalOrder.integrationId,
                  externalItemId: item.externalItemId,
                },
              },
            },
            {
              name: {
                contains: item.name,
                mode: 'insensitive',
              },
            },
          ],
        },
      });

      if (recipe) {
        orderItems.push({
          recipeId: recipe.id,
          quantity: item.quantity || 1,
          specialInstructions: item.specialInstructions,
        });
      }
    }

    if (orderItems.length === 0) {
      console.warn('No matching recipes found');
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

    // Create KDS order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderType: 'DELIVERY',
        externalOrderId: externalOrderId,
        priority,
        estimatedPrepTime: 30,
        specialInstructions: externalOrder.specialInstructions || undefined,
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

    await prisma.externalOrder.update({
      where: { id: externalOrderId },
      data: { internalOrderId: order.id },
    });

    broadcastOrderCreated(order);
    return order;
  } catch (error) {
    console.error('Error creating order from external order:', error);
    return null;
  }
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
