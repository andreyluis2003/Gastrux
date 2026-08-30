import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Webhook receiver for POS providers.
 * Receives sale transactions from Stone, Saipos, TOTVS, etc.
 * 
 * Headers:
 *  - x-webhook-secret: matches POSSettings.webhookSecret
 *  - x-pos-provider: STONE | SAIPOS | TOTVS | GENERIC
 * 
 * Body format (normalized):
 * {
 *   transactionId: string,
 *   amount: number,
 *   discount?: number,
 *   tax?: number,
 *   paymentMethod: string,
 *   customerName?: string,
 *   customerCPF?: string,
 *   tableNumber?: string,
 *   operatorName?: string,
 *   transactionDate?: string (ISO),
 *   items: [{ name, quantity, unitPrice, totalPrice, recipeCode?, menuItemId? }]
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-webhook-secret');
    const provider = (req.headers.get('x-pos-provider') || 'GENERIC').toUpperCase();

    if (!secret) {
      return NextResponse.json({ error: 'Missing webhook secret' }, { status: 401 });
    }

    // Find POS settings by webhook secret
    const settings = await prisma.pOSSettings.findFirst({
      where: { webhookSecret: secret, isConfigured: true },
    });

    if (!settings) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 });
    }

    const body = await req.json();

    if (!body.transactionId || body.amount === undefined) {
      return NextResponse.json({ error: 'transactionId and amount are required' }, { status: 400 });
    }

    // Check duplicate
    const exists = await prisma.pOSTransaction.findUnique({
      where: { transactionId: body.transactionId },
    });
    if (exists) {
      return NextResponse.json({ message: 'Transaction already processed', id: exists.id }, { status: 200 });
    }

    const amount = Number(body.amount) || 0;
    const discount = Number(body.discount) || 0;
    const tax = Number(body.tax) || 0;
    const netAmount = amount - discount + tax;

    // Resolve recipe codes to recipe IDs
    const itemsData = body.items || [];
    const recipeCodes = itemsData.filter((i: any) => i.recipeCode).map((i: any) => i.recipeCode);

    let recipeMap: Record<string, string> = {};
    if (recipeCodes.length > 0) {
      const recipes = await prisma.recipe.findMany({
        where: { restaurantId: settings.restaurantId, code: { in: recipeCodes } },
        select: { id: true, code: true },
      });
      recipeMap = Object.fromEntries(recipes.map((r: any) => [r.code, r.id]));
    }

    // Create transaction with items
    const transaction = await prisma.pOSTransaction.create({
      data: {
        restaurantId: settings.restaurantId,
        transactionId: body.transactionId,
        provider: settings.provider,
        amount,
        discount,
        tax,
        netAmount,
        paymentMethod: body.paymentMethod || 'CARD',
        customerName: body.customerName || null,
        customerCPF: body.customerCPF || null,
        tableNumber: body.tableNumber || null,
        operatorName: body.operatorName || null,
        transactionDate: body.transactionDate ? new Date(body.transactionDate) : new Date(),
        items: JSON.stringify(itemsData),
        saleItems: {
          create: itemsData.map((item: any) => ({
            name: item.name || 'Item',
            quantity: Number(item.quantity) || 1,
            unitPrice: Number(item.unitPrice) || 0,
            totalPrice: Number(item.totalPrice) || Number(item.unitPrice) * Number(item.quantity) || 0,
            recipeId: item.recipeCode ? recipeMap[item.recipeCode] || null : null,
            menuItemId: item.menuItemId || null,
            notes: item.notes || null,
          })),
        },
      },
      include: { saleItems: true },
    });

    // Auto-reconcile: deduct stock based on recipe ingredients
    if (settings.autoReconcile) {
      try {
        await reconcileStock(settings.restaurantId, transaction.saleItems);
        await prisma.pOSTransaction.update({
          where: { id: transaction.id },
          data: { reconciled: true, reconciledAt: new Date() },
        });
      } catch (err) {
        console.error('[POS Webhook] Auto-reconcile failed:', err);
      }
    }

    // Update last sync
    await prisma.pOSSettings.update({
      where: { id: settings.id },
      data: { lastSyncAt: new Date() },
    });

    return NextResponse.json({
      success: true,
      id: transaction.id,
      reconciled: transaction.reconciled,
    }, { status: 201 });
  } catch (error: any) {
    console.error('[POS Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/**
 * Auto-reconcile: deduct ingredients from stock based on sale items linked to recipes.
 */
async function reconcileStock(restaurantId: string, saleItems: any[]) {
  const recipeIds = saleItems.filter((si) => si.recipeId).map((si) => si.recipeId);
  if (recipeIds.length === 0) return;

  // Get recipe ingredients
  const recipeIngredients = await prisma.recipeIngredient.findMany({
    where: { recipeId: { in: recipeIds } },
    include: { ingredient: { select: { id: true, name: true } } },
  });

  // Group by recipeId
  const byRecipe: Record<string, any[]> = {};
  for (const ri of recipeIngredients) {
    if (!byRecipe[ri.recipeId]) byRecipe[ri.recipeId] = [];
    byRecipe[ri.recipeId].push(ri);
  }

  // For each sale item, deduct stock
  for (const saleItem of saleItems) {
    if (!saleItem.recipeId || !byRecipe[saleItem.recipeId]) continue;

    const ingredients = byRecipe[saleItem.recipeId];
    for (const ri of ingredients) {
      const deduction = ri.quantity * saleItem.quantity;

      // Find or create stock
      const stock = await prisma.stock.findFirst({
        where: { ingredientId: ri.ingredientId },
      });

      if (stock) {
        await prisma.stock.update({
          where: { id: stock.id },
          data: { currentQuantity: { decrement: deduction } },
        });

        // Create stock movement
        await prisma.stockMovement.create({
          data: {
            restaurantId,
            ingredientId: ri.ingredientId,
            movementType: 'AUTO_DEDUCTION',
            quantity: -Math.abs(deduction),
            reason: `Venda PDV - ${saleItem.name} x${saleItem.quantity}`,
          },
        });
      }
    }
  }
}
