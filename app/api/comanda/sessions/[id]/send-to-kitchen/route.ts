// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// POST /api/comanda/sessions/[id]/send-to-kitchen
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    // Get the order session with all items
    const orderSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        items: {
          include: {
            recipe: { select: { id: true, name: true, prepTimeMinutes: true } },
          },
        },
      },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (orderSession.items.length === 0) {
      return NextResponse.json({ error: 'No items in session' }, { status: 400 });
    }

    // Calculate estimated prep time
    const estimatedPrepTime = Math.max(
      ...orderSession.items.map(item => item.recipe.prepTimeMinutes || 10)
    );

    // Generate order number (scoped to this restaurant, not a global count)
    const orderCount = await prisma.order.count({ where: { restaurantId } });
    const orderNumber = `KDS-${String(orderCount + 1).padStart(6, '0')}`;

    const firstStation = await prisma.kitchenStation.findFirst({ where: { restaurantId, active: true } });

    // Create Order with OrderItems from SessionItems
    const order = await prisma.order.create({
      data: {
        restaurantId,
        orderNumber: orderNumber,
        orderType: 'DINE_IN',
        status: 'PENDING',
        priority: 'NORMAL',
        estimatedPrepTime: estimatedPrepTime,
        totalItems: orderSession.items.length,
        specialInstructions: orderSession.notes || null,
        items: {
          create: orderSession.items.map(sessionItem => ({
            recipeId: sessionItem.recipeId,
            quantity: sessionItem.quantity,
            specialInstructions: sessionItem.specialInstructions,
            status: 'PENDING',
          })),
        },
        ...(firstStation
          ? {
              stationAssignments: {
                create: [
                  {
                    stationId: firstStation.id,
                    status: 'PENDING',
                    totalItems: orderSession.items.length,
                  },
                ],
              },
            }
          : {}),
      },
      include: {
        items: { include: { recipe: { select: { name: true } } } },
      },
    });

    // Update OrderSession to link it to the Order
    await prisma.orderSession.update({
      where: { id: params.id },
      data: {
        orderId: order.id,
        status: 'SENT_TO_KITCHEN',
        sentToKitchenAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        itemsCount: order.items.length,
      },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
