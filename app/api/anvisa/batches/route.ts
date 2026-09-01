// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anvisa/batches
 * List ingredient batches with expiration tracking
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
    const ingredientId = searchParams.get('ingredientId');
    const showExpired = searchParams.get('expired') === 'true';
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {
      active: !showExpired ? true : undefined,
      ingredient: { restaurantId },
    };

    if (ingredientId) {
      where.ingredientId = ingredientId;
    }

    const now = new Date();
    if (showExpired) {
      where.expirationDate = { lt: now };
    } else {
      where.expirationDate = { gte: now };
    }

    const [batches, total] = await Promise.all([
      prisma.ingredientBatch.findMany({
        where,
        include: {
          ingredient: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          supplier: {
            select: {
              id: true,
              supplierName: true,
            },
          },
          traces: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
        orderBy: { expirationDate: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.ingredientBatch.count({ where }),
    ]);

    return NextResponse.json({
      batches,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching ingredient batches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch batches' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/anvisa/batches
 * Register a new ingredient batch (receive shipment)
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
      ingredientId,
      batchNumber,
      manufacturer,
      manufacturingDate,
      expirationDate,
      initialQuantity,
      unit,
      supplierId,
      invoiceNumber,
      nfeKey,
    } = body;

    // Validate required fields
    if (!ingredientId || !batchNumber || !expirationDate || !initialQuantity) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if ingredient exists and belongs to the caller's restaurant
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    // Create batch
    const batch = await prisma.ingredientBatch.create({
      data: {
        ingredientId,
        batchNumber,
        manufacturer,
        manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : null,
        expirationDate: new Date(expirationDate),
        initialQuantity: new Decimal(initialQuantity),
        currentQuantity: new Decimal(initialQuantity),
        unit: unit || ingredient.standardUnit,
        supplierId,
        invoiceNumber,
        nfeKey,
      },
      include: {
        ingredient: {
          select: { code: true, name: true },
        },
      },
    });

    return NextResponse.json(batch, { status: 201 });
  } catch (error) {
    console.error('Error creating ingredient batch:', error);
    return NextResponse.json(
      { error: 'Failed to create batch' },
      { status: 500 }
    );
  }
}
