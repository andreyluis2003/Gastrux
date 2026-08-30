// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET all menu items
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });
    }

    const items = await prisma.menuItem.findMany({
      where: {
        active: true,
        restaurantId,
      },
      include: {
        category: true,
        images: true,
        recipe: { select: { id: true, name: true, sellingPrice: true } },
      },
      orderBy: [{ category: { position: 'asc' } }, { position: 'asc' }],
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create menu item
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { categoryId, name, description, price, recipeId, position } = body;

    if (!categoryId || !name || price === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 400 });

    // Verify category exists and belongs to this restaurant
    const category = await prisma.menuCategory.findFirst({
      where: { id: categoryId, restaurantId },
    });

    if (!category) {
      return NextResponse.json(
        { error: 'Category not found' },
        { status: 404 }
      );
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name,
        description,
        price: parseFloat(price),
        recipeId: recipeId || null,
        position: position || 0,
        restaurantId,
      },
      include: {
        category: true,
        images: true,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating menu item:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
