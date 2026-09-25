// @ts-nocheck
// GET: Retrieve specific order
// PUT: Update order status and other details
// DELETE: Cancel order

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getOrCreateLoyaltyProgram } from '@/lib/loyalty/get-program';
import { broadcastOrderUpdate, broadcastOrderCompleted } from '@/lib/socket';
import { notifyOrderReady } from '@/lib/notification-utils';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const order = await prisma.order.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        items: {
          include: {
            recipe: true,
            station: true,
          },
        },
        stationAssignments: {
          include: {
            station: true,
          },
        },
        prepTimes: true,
        externalOrder: true,
        reservation: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const owned = await prisma.order.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const body = await req.json();
    const { status, priority, actualStartTime, completedAt, specialInstructions } = body;

    const update: any = {};
    if (status) update.status = status;
    if (priority) update.priority = priority;
    if (actualStartTime) update.actualStartTime = new Date(actualStartTime);
    if (completedAt) update.completedAt = new Date(completedAt);
    if (specialInstructions !== undefined) update.specialInstructions = specialInstructions;

    const order = await prisma.order.update({
      where: { id: params.id },
      data: update,
      include: {
        items: {
          include: {
            recipe: true,
            station: true,
          },
        },
        stationAssignments: {
          include: {
            station: true,
          },
        },
      },
    });

    // Broadcast status change
    broadcastOrderUpdate(params.id, status || order.status, { order });

    // If order is completed, notify all kitchen stations and managers
    if (status === 'COMPLETED' || status === 'READY') {
      broadcastOrderCompleted(params.id);

      // Send notification to managers and cashiers
      const staff = await prisma.user.findMany({
        where: {
          role: { in: ['MANAGER', 'OWNER', 'CASHIER'] },
          active: true,
          restaurants: { some: { restaurantId, isActive: true } },
        },
        select: { id: true },
      });

      const staffIds = staff.map((s) => s.id);
      if (staffIds.length > 0) {
        await notifyOrderReady(order.id, order.orderNumber, staffIds);
      }

      // Auto-deduct stock on completion
      if (status === 'COMPLETED') {
        try {
          const fullOrder = await prisma.order.findUnique({
            where: { id: params.id },
            include: { items: { include: { recipe: { include: { ingredients: { include: { ingredient: true } } } } } } },
          });
          if (fullOrder) {
            const aggregated = new Map();
            for (const item of fullOrder.items) {
              if (!item.recipe?.ingredients) continue;
              for (const ri of item.recipe.ingredients) {
                const qty = ri.quantity * item.quantity;
                const existing = aggregated.get(ri.ingredientId);
                if (existing) { existing.total += qty; } else { aggregated.set(ri.ingredientId, { total: qty }); }
              }
            }
            for (const [ingredientId, data] of aggregated) {
              const stock = await prisma.stock.findFirst({ where: { ingredientId } });
              if (stock) {
                await prisma.stock.update({ where: { id: stock.id }, data: { currentQuantity: { decrement: data.total }, lastUpdated: new Date() } });
              }
              await prisma.stockMovement.create({
                data: { restaurantId: fullOrder.restaurantId, ingredientId, quantity: -data.total, movementType: 'AUTO_DEDUCTION', reason: `Pedido #${fullOrder.orderNumber}`, referenceId: fullOrder.id, referenceType: 'ORDER' },
              });
            }
          }
        } catch (stockErr) { console.error('Auto stock deduction error:', stockErr); }

        // Auto-credit cashback
        if (order.customerId) {
          try {
            const total = Number(order.total || 0);
            if (total > 0) {
              const program = await getOrCreateLoyaltyProgram(order.restaurantId);
              let account = await prisma.customerLoyaltyAccount.findFirst({ where: { customerId: order.customerId, programId: program.id } });
              if (!account) { account = await prisma.customerLoyaltyAccount.create({ data: { customerId: order.customerId, programId: program.id } }); }
              const cashback = Math.floor(total * 5 / 100);
              if (cashback > 0) {
                await prisma.loyaltyTransaction.create({ data: { customerId: order.customerId, accountId: account.id, programId: program.id, type: 'EARNING', amount: cashback, reason: 'Cashback 5%', orderId: order.id, balanceBefore: account.currentPoints, balanceAfter: account.currentPoints + cashback } });
                await prisma.customerLoyaltyAccount.update({ where: { id: account.id }, data: { currentPoints: { increment: cashback }, totalPointsEarned: { increment: cashback }, lastActivityAt: new Date() } });
              }
            }
          } catch (cashbackErr) { console.error('Auto cashback error:', cashbackErr); }
        }
      }
    }

    return NextResponse.json(order);
  } catch (error) {
    console.error('Error updating order:', error);
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== 'OWNER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const owned = await prisma.order.findFirst({ where: { id: params.id, restaurantId }, select: { id: true } });
    if (!owned) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const order = await prisma.order.update({
      where: { id: params.id },
      data: { status: 'CANCELLED' },
    });

    broadcastOrderUpdate(params.id, 'CANCELLED', { reason: 'Order cancelled' });

    return NextResponse.json({ message: 'Order cancelled', order });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
