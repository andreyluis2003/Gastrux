// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const ingredientId = searchParams.get('ingredientId');
    const enabledOnly = searchParams.get('enabledOnly') === 'true';

    // Only this restaurant's alerts: the list used to show every restaurant's (isolation sweep, 2026-10-06)
    const where: any = { restaurantId };
    if (ingredientId) {
      where.ingredientId = ingredientId;
    }
    if (enabledOnly) {
      where.enabled = true;
    }

    const priceAlerts = await prisma.priceAlert.findMany({
      where,
      include: {
        ingredient: { include: { category: true } },
        supplier: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      count: priceAlerts.length,
      data: priceAlerts,
    });
  } catch (error) {
    console.error('Error fetching price alerts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch price alerts' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 403 });
    }

    const body = await request.json();
    const { ingredientId, supplierId, maxPrice, minPrice, alertType } = body;

    if (!ingredientId || !alertType) {
      return NextResponse.json(
        { error: 'ingredientId and alertType are required' },
        { status: 400 }
      );
    }

    // Verify ingredient exists
    // An ingredient of this restaurant only (another restaurant's is "not found")
    const ingredient = await prisma.ingredient.findFirst({
      where: { id: ingredientId, restaurantId },
    });

    if (!ingredient) {
      return NextResponse.json(
        { error: 'Ingredient not found' },
        { status: 404 }
      );
    }

    // Verify supplier exists if provided
    if (supplierId) {
      // A supplier link of that same ingredient only
      const supplier = await prisma.ingredientSupplier.findFirst({
        where: { id: supplierId, ingredientId },
      });
      if (!supplier) {
        return NextResponse.json(
          { error: 'Supplier not found' },
          { status: 404 }
        );
      }
    }

    // Create or update price alert
    const priceAlert = await prisma.priceAlert.upsert({
      where: {
        ingredientId_supplierId_alertType: {
          ingredientId,
          supplierId: supplierId || null,
          alertType,
        },
      },
      create: {
        restaurantId,
        ingredientId,
        supplierId,
        maxPrice,
        minPrice,
        alertType,
        enabled: true,
      },
      update: {
        maxPrice,
        minPrice,
        enabled: true,
      },
      include: {
        ingredient: { include: { category: true } },
        supplier: true,
      },
    });

    return NextResponse.json(priceAlert, { status: 201 });
  } catch (error) {
    console.error('Error creating price alert:', error);
    return NextResponse.json(
      { error: 'Failed to create price alert' },
      { status: 500 }
    );
  }
}
