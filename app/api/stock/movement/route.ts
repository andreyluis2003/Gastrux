// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { notifyLowStock } from '@/lib/notification-utils';

export const dynamic = 'force-dynamic';

export const POST = safeHandler(async (req, context) => {
  if (context.role === 'COOK') {
    return ApiErrors.FORBIDDEN();
  }

  const body = await req.json();

  // The ingredient must belong to this restaurant BEFORE anything is written (the movement used to
  // be created first, for any ingredient id)
  const ingredient = await prisma.ingredient.findFirst({
    where: {
      id: body.ingredientId,
      restaurantId: context.restaurantId,
    },
  });
  if (!ingredient) {
    return NextResponse.json({ error: 'Ingrediente não encontrado' }, { status: 404 });
  }

  // Create movement record. ADJUSTMENT quantities are signed (+ in, - out): an adjustment made
  // here removes stock, like any non-ENTRY movement of this route
  const movement = await prisma.stockMovement.create({
    data: {
      restaurantId: context.restaurantId,
      ingredientId: body.ingredientId,
      quantity: body.movementType === 'ADJUSTMENT' ? -Math.abs(body.quantity) : body.quantity,
      movementType: body.movementType,
      reason: body.reason,
    },
  });

  // Update stock. Atomic increment/decrement - computing newQuantity from a prior read and writing it back
  // loses updates when two movements for the same ingredient happen concurrently. The first movement of an
  // ingredient starts its control (2026-10-13: an ENTRY on an ingredient without a Stock row was recorded
  // but never counted, so a new account's first purchase vanished from Estoque).
  const signed = body.movementType === 'ENTRY' ? body.quantity : -body.quantity;
  {
    const updatedStock = await prisma.stock.upsert({
      where: {
        restaurantId_ingredientId: {
          restaurantId: context.restaurantId,
          ingredientId: body.ingredientId,
        },
      },
      create: { restaurantId: context.restaurantId, ingredientId: body.ingredientId, currentQuantity: signed },
      update: { currentQuantity: { increment: signed }, lastUpdated: new Date() },
    });
    const newQuantity = updatedStock.currentQuantity;

    // Trigger low stock notification if below minimum
    if (newQuantity < ingredient.minimumStock) {
      const managers = await prisma.restaurantUser.findMany({
        where: {
          restaurantId: context.restaurantId,
          role: { in: ['OWNER', 'MANAGER'] },
        },
        select: { userId: true },
      });

      const managerIds = managers.map((m) => m.userId);
      if (managerIds.length > 0) {
        await notifyLowStock(
          ingredient.id,
          ingredient.name,
          newQuantity,
          ingredient.minimumStock,
          managerIds
        );
      }
    }
  }

  // Log audit
  await prisma.auditLog.create({
    data: {
      userId: context.userId,
      action: 'STOCK_ENTRY',
      entityType: 'StockMovement',
      entityId: movement.id,
      changes: JSON.stringify(movement),
    },
  });

  return NextResponse.json(
    {
      ...movement,
    },
    { status: 201 }
  );
});
