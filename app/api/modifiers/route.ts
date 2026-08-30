// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

/**
 * GET /api/modifiers
 * List all item modifiers (sem cebola, bem feito, etc)
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
    const category = searchParams.get('category');
    const onlyActive = searchParams.get('active') !== 'false';
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ modifiers: [], total: 0, limit, offset });
    }

    const where: any = { restaurantId };
    if (onlyActive) where.active = true;
    if (category) where.category = category;

    const [modifiers, total] = await Promise.all([
      prisma.itemModifier.findMany({
        where,
        orderBy: [{ category: 'asc' }, { position: 'asc' }],
        take: limit,
        skip: offset,
      }),
      prisma.itemModifier.count({ where }),
    ]);

    return NextResponse.json({
      modifiers,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching modifiers:', error);
    return NextResponse.json(
      { error: 'Failed to fetch modifiers' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/modifiers
 * Create a new item modifier
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
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });

    const body = await request.json();
    const { name, category, description, priceAdjustment, position } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Modifier name is required' },
        { status: 400 }
      );
    }

    const modifier = await prisma.itemModifier.create({
      data: {
        name,
        category,
        description,
        restaurantId,
        priceAdjustment: priceAdjustment ? new Decimal(priceAdjustment) : new Decimal(0),
        position: position || 0,
      },
    });

    return NextResponse.json(modifier, { status: 201 });
  } catch (error) {
    console.error('Error creating modifier:', error);
    return NextResponse.json(
      { error: 'Failed to create modifier' },
      { status: 500 }
    );
  }
}
