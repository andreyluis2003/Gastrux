// @ts-nocheck
// GET: Retrieve orders with filtering and pagination
// POST: Create new orders from external sources or reservations

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { broadcastOrderCreated } from '@/lib/socket';
import { notifyNewOrder } from '@/lib/notification-utils';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { KITCHEN_VISIBLE_ORDER_WHERE } from '@/lib/kds-visibility';

export const dynamic = 'force-dynamic';

const ORDER_STATUSES = ['PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED', 'ON_HOLD'];

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const station = searchParams.get('station');
    const limit = parseInt(searchParams.get('limit') || '50');
    const skip = parseInt(searchParams.get('skip') || '0');

    // An online (PIX/card) order reaches the kitchen only once its payment is APPROVED.
    // Only THIS restaurant's orders: the list used to be unscoped and showed every restaurant's kitchen.
    const where: any = { restaurantId, AND: [KITCHEN_VISIBLE_ORDER_WHERE] };
    // The KDS screen asks for several statuses at once (?status=PENDING,PREPARING,READY); the whole
    // string used to be passed as ONE status, so the kitchen screen listed nothing
    if (status) {
      const statuses = status.split(',').map((st) => st.trim().toUpperCase()).filter(Boolean);
      const unknown = statuses.filter((st) => !ORDER_STATUSES.includes(st));
      if (unknown.length) {
        return NextResponse.json({ error: `Status inválido: ${unknown.join(', ')}` }, { status: 400 });
      }
      where.status = { in: statuses };
    }
    if (priority) where.priority = priority;
    if (station) {
      where.stationAssignments = {
        some: { stationId: station },
      };
    }

    const orders = await prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            recipe: true,
            station: true,
            // the kitchen must see "sem cebola" / "ponto da carne" on the screen too
            modifiers: { include: { modifier: { select: { name: true } } } },
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
        orderSession: { select: { tableNumber: true, customerName: true, table: { select: { number: true } } } },
      },
      orderBy: [
        { priority: 'desc' }, // URGENT first
        { createdAt: 'asc' }, // Then oldest first
      ],
      take: limit,
      skip,
    });

    const total = await prisma.order.count({ where });

    return NextResponse.json({
      orders,
      total,
      limit,
      skip,
      hasMore: skip + limit < total,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }


    const body = await req.json();
    const {
      orderType,
      externalOrderId,
      reservationId,
      items,
      priority = 'NORMAL',
      estimatedPrepTime,
      specialInstructions,
    } = body;

    if (!items || items.length === 0) {
      return NextResponse.json(
        { error: 'Order must have at least one item' },
        { status: 400 }
      );
    }

    // Generate order number
    const lastOrder = await prisma.order.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { orderNumber: true },
    });

    let orderNumber = 'KDS-0001';
    if (lastOrder) {
      const num = parseInt(lastOrder.orderNumber.split('-')[1]) + 1;
      orderNumber = `KDS-${String(num).padStart(4, '0')}`;
    }

    // Create order with items
    const order = await prisma.order.create({
      data: {
        orderNumber,
        orderType,
        externalOrderId: externalOrderId || undefined,
        reservationId: reservationId || undefined,
        priority,
        estimatedPrepTime,
        specialInstructions,
        totalItems: items.length,
        items: {
          create: items.map((item: any) => ({
            recipeId: item.recipeId,
            quantity: item.quantity || 1,
            specialInstructions: item.specialInstructions,
          })),
        },
      },
      include: {
        items: {
          include: {
            recipe: true,
          },
        },
      },
    });

    // Broadcast to kitchen display
    broadcastOrderCreated(order);

    // Send notifications to cooks and kitchen staff
    const kitchenStaff = await prisma.user.findMany({
      where: {
        role: { in: ['COOK', 'MANAGER', 'OWNER'] },
        active: true,
      },
      select: { id: true },
    });

    const kitchenStaffIds = kitchenStaff.map((s) => s.id);
    if (kitchenStaffIds.length > 0) {
      await notifyNewOrder(order.id, order.orderNumber, order.totalItems, kitchenStaffIds);
    }

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error('Error creating order:', error);
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    );
  }
}
