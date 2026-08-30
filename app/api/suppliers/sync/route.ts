// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';

/**
 * POST /api/suppliers/sync - Manually trigger price sync for a supplier
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { supplierId } = body;

    if (!supplierId) {
      return NextResponse.json(
        { error: 'Supplier ID is required' },
        { status: 400 }
      );
    }

    // Get the supplier and its integration
    const supplier = await prisma.supplier.findUnique({
      where: { id: supplierId },
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

    // For now, simulate a successful sync
    // In production, this would call the supplier's API
    const results: any[] = [];

    for (const ingredientSupplier of supplier.ingredients) {
      if (ingredientSupplier.supplierId) {
        // Update or create price sync record
        const sync = await prisma.supplierPriceSync.upsert({
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

/**
 * GET /api/suppliers/sync - Get sync status for all suppliers
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const syncStatuses = await prisma.supplierIntegration.findMany({
      include: {
        supplier: true,
      },
      orderBy: { lastSyncedAt: 'desc' },
    });

    return NextResponse.json(syncStatuses);
  } catch (error) {
    console.error('Error fetching sync statuses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sync statuses' },
      { status: 500 }
    );
  }
}
