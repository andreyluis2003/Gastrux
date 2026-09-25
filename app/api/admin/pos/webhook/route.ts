import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reconcilePOSTransaction } from '@/lib/pos/reconcile';

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
      where: {
        restaurantId_provider_transactionId: {
          restaurantId: settings.restaurantId,
          provider: settings.provider,
          transactionId: String(body.transactionId),
        },
      },
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
        transactionId: String(body.transactionId),
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

    // Auto-reconcile: the sale leaves stock once (lib/pos/reconcile.ts); on failure it stays
    // pending for the manual "Reconciliar" button
    let reconciled = false;
    if (settings.autoReconcile) {
      try {
        reconciled = await reconcilePOSTransaction(settings.restaurantId, transaction.id);
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
      reconciled,
    }, { status: 201 });
  } catch (error: any) {
    // The same sale sent twice at once: the second insert hits the unique index
    if (error?.code === 'P2002') {
      return NextResponse.json({ message: 'Transaction already processed' }, { status: 200 });
    }
    console.error('[POS Webhook] Error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

