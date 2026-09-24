import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withKdsOrderNumber } from '@/lib/kds/order-number';

/**
 * Sends to the kitchen what a comanda has that the kitchen does not have yet (market practice:
 * "enviar novos itens"): the lines added since the last send, with their modifiers. Re-sending used
 * to send EVERY line again, so the kitchen made them twice; the modifiers ("sem cebola") were lost.
 * Shared by POST /api/comanda/sessions/[id]/send-to-kitchen and the counter sale.
 */
export async function sendSessionToKitchen(restaurantId: string, sessionId: string): Promise<Response> {
  const orderSession = await prisma.orderSession.findFirst({
    where: { id: sessionId, restaurantId },
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
    where: { id: sessionId },
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
}
