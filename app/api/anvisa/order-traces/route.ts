// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';

/**
 * GET /api/anvisa/order-traces
 * Get order traceability (which ingredients in which order)
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

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const batchId = searchParams.get('batchId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: any = {};
    if (orderId) where.orderId = orderId;
    if (batchId) where.batchId = batchId;

    const [traces, total] = await Promise.all([
      prisma.orderTrace.findMany({
        where,
        include: {
          order: { select: { orderNumber: true, createdAt: true } },
          batch: {
            select: {
              batchNumber: true,
              expirationDate: true,
              ingredient: { select: { name: true } },
            },
          },
          orderItem: { select: { quantity: true } },
        },
        orderBy: { recordedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.orderTrace.count({ where }),
    ]);

    return NextResponse.json({
      traces,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching order traces:', error);
    return NextResponse.json(
      { error: 'Failed to fetch traces' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/anvisa/order-traces
 * Record order-level traceability
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

    const body = await request.json();
    const { orderId, batchId, quantity, unit, orderItemId } = body;

    // Validate
    if (!orderId || !batchId || !quantity || !orderItemId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify order and batch exist
    const [order, batch] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId } }),
      prisma.ingredientBatch.findUnique({ where: { id: batchId } }),
    ]);

    if (!order || !batch) {
      return NextResponse.json(
        { error: 'Order or batch not found' },
        { status: 404 }
      );
    }

    const trace = await prisma.orderTrace.create({
      data: {
        orderId,
        batchId,
        quantity: new Decimal(quantity),
        unit: unit || batch.unit,
        orderItemId,
        recordedBy: session.user?.id,
      },
      include: {
        order: true,
        batch: true,
        orderItem: true,
      },
    });

    return NextResponse.json(trace, { status: 201 });
  } catch (error) {
    console.error('Error creating order trace:', error);
    return NextResponse.json(
      { error: 'Failed to create trace' },
      { status: 500 }
    );
  }
}
