// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anvisa/batches/[id]
 * Get batch details including trace history
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const batch = await prisma.ingredientBatch.findFirst({
      where: { id: params.id, ingredient: { restaurantId } },
      include: {
        ingredient: true,
        supplier: true,
        traces: {
          orderBy: { createdAt: 'desc' },
          include: {
            batch: {
              select: {
                batchNumber: true,
                expirationDate: true,
              },
            },
          },
        },
        orderTraces: {
          orderBy: { recordedAt: 'desc' },
          take: 10,
          include: {
            order: { select: { orderNumber: true } },
            orderItem: { select: { id: true } },
          },
        },
      },
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(batch);
  } catch (error) {
    console.error('Error fetching batch:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batch' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/anvisa/batches/[id]
 * Update batch (e.g., adjust quantity, mark as expired)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const batch = await prisma.ingredientBatch.findFirst({
      where: { id: params.id, ingredient: { restaurantId } },
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { currentQuantity, active, expirationDate } = body;

    const updated = await prisma.ingredientBatch.update({
      where: { id: params.id },
      data: {
        currentQuantity: currentQuantity ? new Decimal(currentQuantity) : batch.currentQuantity,
        active: active !== undefined ? active : batch.active,
        expirationDate: expirationDate ? new Date(expirationDate) : batch.expirationDate,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating batch:', error);
    return NextResponse.json(
      { error: 'Failed to update batch' },
      { status: 500 }
    );
  }
}
