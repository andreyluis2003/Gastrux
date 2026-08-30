// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export const dynamic = 'force-dynamic';

/**
 * GET /api/comanda/sessions/[id]/items/[itemId]/modifiers
 * Get modifiers for an order session item
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const modifiers = await prisma.orderSessionItemModifier.findMany({
      where: { sessionItemId: params.itemId },
      include: {
        modifier: true,
      },
    });

    return NextResponse.json(modifiers);
  } catch (error) {
    console.error('Error fetching modifiers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modifiers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/comanda/sessions/[id]/items/[itemId]/modifiers
 * Add a modifier to an order session item
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { modifierId } = body;

    if (!modifierId) {
      return NextResponse.json(
        { error: 'modifierId is required' },
        { status: 400 }
      );
    }

    // Verify session item exists
    const sessionItem = await prisma.orderSessionItem.findUnique({
      where: { id: params.itemId },
    });

    if (!sessionItem) {
      return NextResponse.json(
        { error: 'Session item not found' },
        { status: 404 }
      );
    }

    // Get modifier
    const modifier = await prisma.itemModifier.findUnique({
      where: { id: modifierId },
    });

    if (!modifier) {
      return NextResponse.json(
        { error: 'Modifier not found' },
        { status: 404 }
      );
    }

    // Create session item modifier
    const sessionItemModifier = await prisma.orderSessionItemModifier.create({
      data: {
        sessionItemId: params.itemId,
        modifierId,
        priceAdjustment: modifier.priceAdjustment,
      },
      include: {
        modifier: true,
      },
    });

    return NextResponse.json(sessionItemModifier, { status: 201 });
  } catch (error) {
    console.error('Error adding modifier:', error);
    return NextResponse.json(
      { error: 'Failed to add modifier' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/comanda/sessions/[id]/items/[itemId]/modifiers/[modifierId]
 * Remove a modifier from a session item
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { sessionItemModifierId } = body;

    if (!sessionItemModifierId) {
      return NextResponse.json(
        { error: 'sessionItemModifierId is required' },
        { status: 400 }
      );
    }

    const modifier = await prisma.orderSessionItemModifier.findUnique({
      where: { id: sessionItemModifierId },
    });

    if (!modifier || modifier.sessionItemId !== params.itemId) {
      return NextResponse.json(
        { error: 'Modifier not found' },
        { status: 404 }
      );
    }

    await prisma.orderSessionItemModifier.delete({
      where: { id: sessionItemModifierId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing modifier:', error);
    return NextResponse.json(
      { error: 'Failed to remove modifier' },
      { status: 500 }
    );
  }
}
