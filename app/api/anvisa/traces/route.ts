// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anvisa/traces
 * Get traceability records (ingredient usage)
 */
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const batchId = searchParams.get('batchId');
    const orderId = searchParams.get('orderId');
    const movementType = searchParams.get('movementType');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};

    if (batchId) where.batchId = batchId;
    if (orderId) where.orderId = orderId;
    if (movementType) where.movementType = movementType;

    const [traces, total] = await Promise.all([
      prisma.ingredientTrace.findMany({
        where,
        include: {
          batch: {
            select: {
              batchNumber: true,
              ingredient: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.ingredientTrace.count({ where }),
    ]);

    return NextResponse.json({
      traces,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching traces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch traces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/anvisa/traces
 * Record ingredient usage (trace)
 */
export async function POST(request: NextRequest) {
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


    const body = await request.json();
    const {
      batchId,
      movementType,
      quantity,
      unit,
      orderId,
      orderSessionItemId,
      reference,
      notes,
    } = body;

    // Validate
    if (!batchId || !movementType || !quantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get batch
    const batch = await prisma.ingredientBatch.findUnique({
      where: { id: batchId },
    });

    if (!batch) {
      return NextResponse.json(
        { error: 'Batch not found' },
        { status: 404 }
      );
    }

    // Create trace
    const trace = await prisma.ingredientTrace.create({
      data: {
        batchId,
        movementType,
        quantity: new Decimal(quantity),
        unit: unit || batch.unit,
        orderId,
        orderSessionItemId,
        reference,
        notes,
        recordedBy: session.user?.id,
      },
      include: {
        batch: {
          select: {
            ingredient: { select: { name: true } },
            batchNumber: true,
          },
        },
      },
    });

    // Update batch current quantity if used
    if (movementType === 'used' || movementType === 'discarded') {
      const newQuantity = batch.currentQuantity.minus(new Decimal(quantity));
      await prisma.ingredientBatch.update({
        where: { id: batchId },
        data: {
          currentQuantity: newQuantity,
        },
      });
    }

    return NextResponse.json(trace, { status: 201 });
  } catch (error) {
    console.error('Error creating trace:', error);
    return NextResponse.json(
      { error: 'Failed to create trace' },
      { status: 500 }
    );
  }
}
