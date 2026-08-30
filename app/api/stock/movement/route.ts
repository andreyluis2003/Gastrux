// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeHandler } from '@/lib/api/safe-handler';
import { ApiErrors } from '@/lib/api/api-response';
import { checkTransactionLimit, incrementTransactionCount } from '@/lib/transaction-limiter';
import { notifyLowStock } from '@/lib/notification-utils';

export const dynamic = 'force-dynamic';

export const POST = safeHandler(async (req, context) => {
  if (context.role === 'COOK') {
    return ApiErrors.FORBIDDEN();
  }

  // Check transaction limit BEFORE processing
  const limitCheck = await checkTransactionLimit(context.userId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      {
        error: 'Limite de transações atingido',
        message: limitCheck.message,
        tier: limitCheck.tier,
        limit: limitCheck.limit,
        remaining: limitCheck.remaining,
        suggestUpgrade: limitCheck.tier === 'starter',
      },
      { status: 429 }
    );
  }

  const body = await req.json();

  // Create movement record
  const movement = await prisma.stockMovement.create({
    data: {
      restaurantId: context.restaurantId,
      ingredientId: body.ingredientId,
      quantity: body.quantity,
      movementType: body.movementType,
      reason: body.reason,
    },
  });

  // Get ingredient data for notifications
  const ingredient = await prisma.ingredient.findUnique({
    where: {
      id: body.ingredientId,
      restaurantId: context.restaurantId,
    },
  });

  // Update stock
  const stock = await prisma.stock.findUnique({
    where: {
      restaurantId_ingredientId: {
        restaurantId: context.restaurantId,
        ingredientId: body.ingredientId,
      },
    },
  });

  if (stock && ingredient) {
    const newQuantity =
      body.movementType === 'ENTRY'
        ? stock.currentQuantity + body.quantity
        : stock.currentQuantity - body.quantity;

    await prisma.stock.update({
      where: {
        restaurantId_ingredientId: {
          restaurantId: context.restaurantId,
          ingredientId: body.ingredientId,
        },
      },
      data: {
        currentQuantity: newQuantity,
        lastUpdated: new Date(),
      },
    });

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

  // Increment transaction counter ONLY after success
  await incrementTransactionCount(context.userId);

  return NextResponse.json(
    {
      ...movement,
      _transactionLimit: {
        limit: limitCheck.limit,
        remaining: limitCheck.remaining - 1,
        tier: limitCheck.tier,
      },
    },
    { status: 201 }
  );
});
