// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { withKdsOrderNumber } from '@/lib/kds/order-number';

export const dynamic = 'force-dynamic';

/**
 * POST /api/comanda/sessions/[id]/send-to-kitchen
 * Sends to the kitchen what the comanda has that the kitchen does not have yet (market practice:
 * "enviar novos itens"): the lines added since the last send, with their modifiers. Re-sending used
 * to send EVERY line again, so the kitchen made them twice; the modifiers ("sem cebola") were lost.
 */
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

    const orderSession = await prisma.orderSession.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        items: {
          include: {
            recipe: { select: { id: true, name: true, prepTimeMinutes: true } },
            modifiers: { select: { modifierId: true, priceAdjustment: true } },
          },
          orderBy: { addedAt: 'asc' },
        },
      },
    });

    if (!orderSession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (orderSession.status === 'CLOSED' || orderSession.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Comanda fechada ou cancelada' }, { status: 409 });
    }

    // Only what the kitchen does not have yet (same rule as the item removal: addedAt <= sentToKitchenAt)
    const lastSent = orderSession.sentToKitchenAt;
    const newItems = orderSession.items.filter((item) => !lastSent || item.addedAt > lastSent);
    if (newItems.length === 0) {
      return NextResponse.json(
        { error: orderSession.items.length === 0 ? 'No items in session' : 'Nada novo para enviar à cozinha' },
        { status: 400 }
      );
    }

    const estimatedPrepTime = Math.max(...newItems.map((item) => item.recipe.prepTimeMinutes || 10));
    const firstStation = await prisma.kitchenStation.findFirst({ where: { restaurantId, active: true } });

    const order = await withKdsOrderNumber((orderNumber) =>
      prisma.order.create({
        data: {
          restaurantId,
          orderNumber,
          orderType: 'DINE_IN',
          status: 'PENDING',
          priority: 'NORMAL',
          estimatedPrepTime,
          totalItems: newItems.length,
          specialInstructions: orderSession.notes || null,
          items: {
            create: newItems.map((sessionItem) => ({
              recipeId: sessionItem.recipeId,
              quantity: sessionItem.quantity,
              specialInstructions: sessionItem.specialInstructions,
              status: 'PENDING',
              modifiers: {
                create: sessionItem.modifiers.map((m) => ({ modifierId: m.modifierId, priceAdjustment: m.priceAdjustment })),
              },
            })),
          },
          ...(firstStation
            ? {
                stationAssignments: {
                  create: [{ stationId: firstStation.id, status: 'PENDING', totalItems: newItems.length }],
                },
              }
            : {}),
        },
        include: {
          items: { include: { recipe: { select: { name: true } } } },
        },
      })
    );

    // The kitchen now has every line up to the newest one sent (a line added while this request ran
    // has a later addedAt and stays "new" for the next send)
    const sentUpTo = newItems[newItems.length - 1].addedAt;
    await prisma.orderSession.update({
      where: { id: params.id },
      data: {
        orderId: order.id,
        status: 'SENT_TO_KITCHEN',
        sentToKitchenAt: sentUpTo,
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
