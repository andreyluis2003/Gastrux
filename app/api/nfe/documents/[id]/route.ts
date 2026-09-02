// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/nfe/documents/[id]
 * Retrieve a specific NF-e/NFC-e document
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

    const document = await prisma.nFeDocument.findFirst({
      where: { id: params.id, config: { restaurantId } },
      include: {
        items: true,
        logs: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(document);
  } catch (error) {
    console.error('Error fetching NF-e document:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/nfe/documents/[id]
 * Update NF-e/NFC-e document (only in pending status)
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

    const document = await prisma.nFeDocument.findFirst({
      where: { id: params.id, config: { restaurantId } },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    if (document.status !== 'pending') {
      return NextResponse.json(
        { error: 'Can only edit pending documents' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { customerName, customerEmail, totalAmount } = body;

    const updated = await prisma.nFeDocument.update({
      where: { id: params.id },
      data: {
        customerName: customerName || document.customerName,
        customerEmail: customerEmail || document.customerEmail,
        totalAmount: totalAmount ? Number(totalAmount) : document.totalAmount,
      },
      include: {
        items: true,
      },
    });

    await prisma.nFeLog.create({
      data: {
        documentId: document.id,
        eventType: 'update',
        description: 'Document updated',
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating NF-e document:', error);
    return NextResponse.json(
      { error: 'Failed to update document' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nfe/documents/[id]
 * Cancel a NF-e/NFC-e document
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 400 });
    }

    const document = await prisma.nFeDocument.findFirst({
      where: { id: params.id, config: { restaurantId } },
    });

    if (!document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.nFeDocument.update({
      where: { id: params.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });

    await prisma.nFeLog.create({
      data: {
        documentId: document.id,
        eventType: 'cancel',
        description: 'Document cancelled',
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error cancelling NF-e document:', error);
    return NextResponse.json(
      { error: 'Failed to cancel document' },
      { status: 500 }
    );
  }
}
