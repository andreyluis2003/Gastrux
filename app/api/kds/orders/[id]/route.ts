// @ts-nocheck
// GET: Retrieve specific order
// PUT: Update order status and other details
// DELETE: Cancel order

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { changeOrderStatus, OPEN_STATUSES, restaurantStaffIds } from '@/lib/kds/order-status';
import { broadcastOrderUpdate, broadcastOrderCompleted } from '@/lib/socket';
import { notifyOrderReady } from '@/lib/notification-utils';
import { cancelOrder } from '@/lib/kds-cancel-order';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';

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

    // An order of another restaurant is "not found" (404), never readable or changeable.
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

    const body = await req.json().catch(() => ({}));
    const { status, priority, specialInstructions } = body;

    // Details (priority, notes) change only while the order is open
    const details: any = {};
    if (priority) details.priority = priority;
    if (specialInstructions !== undefined) details.specialInstructions = specialInstructions;
    if (Object.keys(details).length > 0) {
      const edited = await prisma.order.updateMany({
        where: { id: params.id, restaurantId, status: { in: OPEN_STATUSES as any } },
        data: details,
      });
      if (edited.count === 0 && !status) {
        return NextResponse.json({ error: 'Este pedido já foi encerrado', code: 'ORDER_CLOSED' }, { status: 409 });
      }
    }

    if (!status) {
      const order = await prisma.order.findFirst({
        where: { id: params.id, restaurantId },
        include: { items: { include: { recipe: true, station: true } }, stationAssignments: { include: { station: true } } },
      });
      return NextResponse.json(order);
    }

    // State machine and stock/cashback once: lib/kds/order-status.ts
    const change = await changeOrderStatus(restaurantId, params.id, status);
    if (change.kind === 'not-found') return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    if (change.kind === 'invalid') return NextResponse.json({ error: change.error }, { status: 400 });
    if (change.kind === 'conflict') {
      return NextResponse.json({ error: change.error, code: change.code, currentStatus: change.currentStatus }, { status: 409 });
    }
    const order = change.order;
    if (change.kind === 'unchanged') return NextResponse.json(order);

    broadcastOrderUpdate(params.id, status, { order });

    // "Pronto" is announced once, when the order reaches READY (or goes straight to COMPLETED),
    // to this restaurant's staff only
    if (status === 'READY' || (status === 'COMPLETED' && change.from !== 'READY')) {
      broadcastOrderCompleted(params.id);
      const staffIds = await restaurantStaffIds(restaurantId, ['OWNER', 'MANAGER', 'CASHIER']);
      if (staffIds.length > 0) {
        await notifyOrderReady(order.id, order.orderNumber, staffIds);
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
    // A manager of THIS restaurant (the owner or a manager membership); it used to be OWNER only,
    // read from the global role in the session
    const auth = await requireRestaurantRole(MANAGER_ROLES, 'Cancelar um pedido da cozinha exige um gerente');
    if (!auth.ok) return auth.response;
    const { restaurantId, userId } = auth.member;

    // Optional reason in the body (a DELETE may come without one).
    let reason: string | undefined;
    try {
      const body = await req.json();
      if (typeof body?.reason === 'string' && body.reason.trim()) reason = body.reason.trim().slice(0, 200);
    } catch {}

    const outcome = await cancelOrder(params.id, { restaurantId, userId, reason });

    if (outcome.kind === 'not-found') {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (outcome.kind === 'completed') {
      return NextResponse.json(
        { error: 'Um pedido concluído não pode ser cancelado', code: 'ORDER_ALREADY_COMPLETED' },
        { status: 409 }
      );
    }
    if (outcome.kind === 'already-cancelled') {
      return NextResponse.json({ message: 'Order already cancelled', order: outcome.order });
    }

    broadcastOrderUpdate(params.id, 'CANCELLED', { reason: 'Order cancelled' });

    return NextResponse.json({ message: 'Order cancelled', order: outcome.order, loss: outcome.loss, payments: outcome.payments });
  } catch (error) {
    console.error('Error cancelling order:', error);
    return NextResponse.json(
      { error: 'Failed to cancel order' },
      { status: 500 }
    );
  }
}
