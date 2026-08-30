// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/modifiers/[id]
 * Get a specific modifier
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
    const modifier = restaurantId
      ? await prisma.itemModifier.findFirst({
          where: { id: params.id, restaurantId },
        })
      : null;

    if (!modifier) {
      return NextResponse.json(
        { error: 'Modifier not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(modifier);
  } catch (error) {
    console.error('Error fetching modifier:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modifier' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/modifiers/[id]
 * Update a modifier
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
    const modifier = restaurantId
      ? await prisma.itemModifier.findFirst({
          where: { id: params.id, restaurantId },
        })
      : null;

    if (!modifier) {
      return NextResponse.json(
        { error: 'Modifier not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { name, category, description, priceAdjustment, active, position } =
      body;

    const updated = await prisma.itemModifier.update({
      where: { id: params.id },
      data: {
        name: name || modifier.name,
        category: category !== undefined ? category : modifier.category,
        description: description !== undefined ? description : modifier.description,
        priceAdjustment: priceAdjustment
          ? new Decimal(priceAdjustment)
          : modifier.priceAdjustment,
        active: active !== undefined ? active : modifier.active,
        position: position !== undefined ? position : modifier.position,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating modifier:', error);
    return NextResponse.json(
      { error: 'Failed to update modifier' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/modifiers/[id]
 * Deactivate a modifier (soft delete)
 */
export async function DELETE(
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
    const modifier = restaurantId
      ? await prisma.itemModifier.findFirst({
          where: { id: params.id, restaurantId },
        })
      : null;

    if (!modifier) {
      return NextResponse.json(
        { error: 'Modifier not found' },
        { status: 404 }
      );
    }

    const updated = await prisma.itemModifier.update({
      where: { id: params.id },
      data: { active: false },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error deleting modifier:', error);
    return NextResponse.json(
      { error: 'Failed to delete modifier' },
      { status: 500 }
    );
  }
}
