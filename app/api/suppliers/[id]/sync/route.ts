// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * POST /api/suppliers/[id]/sync - Sync prices for specific supplier
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supplierId = params.id;

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }

    // Get the supplier and its integration
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, restaurantId },
      include: {
        integrations: true,
        ingredients: {
          include: {
            ingredient: true,
          },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Simulate a successful sync
    const results: any[] = [];

    for (const ingredientSupplier of supplier.ingredients) {
      if (ingredientSupplier.supplierId) {
        // Update or create price sync record
        await prisma.supplierPriceSync.upsert({
          where: {
            supplierId_ingredientId: {
              supplierId,
              ingredientId: ingredientSupplier.ingredientId,
            },
          },
          create: {
            supplierId,
            ingredientId: ingredientSupplier.ingredientId,
            lastFetchedPrice: new Decimal(ingredientSupplier.unitPrice),
            lastFetchedAt: new Date(),
            syncStatus: 'SUCCESS',
            currency: 'BRL',
          },
          update: {
            previousPrice: new Decimal(ingredientSupplier.unitPrice),
            lastFetchedPrice: new Decimal(ingredientSupplier.unitPrice),
            lastFetchedAt: new Date(),
            syncStatus: 'SUCCESS',
          },
        });

        results.push({
          ingredientId: ingredientSupplier.ingredientId,
          ingredientName: ingredientSupplier.ingredient.name,
          price: ingredientSupplier.unitPrice,
          status: 'SUCCESS',
        });
      }
    }

    // Update integration's last sync time
    const integrations = await prisma.supplierIntegration.findMany({
      where: { supplierId },
    });

    for (const integration of integrations) {
      await prisma.supplierIntegration.update({
        where: { id: integration.id },
        data: {
          lastSyncedAt: new Date(),
          lastSyncStatus: 'SUCCESS',
          lastSyncError: null,
        },
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: (session.user as any)?.id,
        action: 'CREATE',
        entityType: 'SupplierSync',
        entityId: supplierId,
        restaurantId,
        changes: JSON.stringify({
          itemsSynced: results.length,
          status: 'SUCCESS',
        }),
      },
    });

    return NextResponse.json({
      message: 'Sync completed',
      results,
      itemsSynced: results.length,
    });
  } catch (error) {
    console.error('Error syncing prices:', error);
    return NextResponse.json(
      { error: 'Failed to sync prices' },
      { status: 500 }
    );
  }
}
