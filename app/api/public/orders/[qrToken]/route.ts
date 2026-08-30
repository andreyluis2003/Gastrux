// FASE 50: Public endpoint for customers to submit orders via QR code
// No authentication required - creates or appends items to an active OrderSession
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/public/orders/[qrToken] - Get current open session for this table (if any)
export async function GET(
  req: NextRequest,
  { params }: { params: { qrToken: string } }
) {
  try {
    const table = await prisma.table.findUnique({
      where: { qrToken: params.qrToken },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    const openSession = await prisma.orderSession.findFirst({
      where: {
        tableId: table.id,
        status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] },
      },
      include: {
        items: {
          include: { recipe: { select: { name: true, sellingPrice: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ session: openSession });
  } catch (error) {
    console.error('Error fetching public session:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/public/orders/[qrToken] - Submit order items from customer
// Body: { customerName?: string, items: [{ menuItemId, quantity, specialInstructions? }] }
export async function POST(
  req: NextRequest,
  { params }: { params: { qrToken: string } }
) {
  try {
    const { customerName, items } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items submitted' }, { status: 400 });
    }

    // Find the table and restaurant
    const table = await prisma.table.findUnique({
      where: { qrToken: params.qrToken },
      include: { restaurant: true },
    });

    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Get the restaurant owner as the userId (for the session)
    const ownerId = table.restaurant.ownerId;
    if (!ownerId) {
      return NextResponse.json({ error: 'Restaurant owner not configured' }, { status: 500 });
    }

    // Load menu items to get price + recipeId mapping
    const menuItemIds = items.map((i: any) => i.menuItemId).filter(Boolean);
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: menuItemIds }, active: true, available: true },
    });

    const menuItemMap = new Map(menuItems.map((m) => [m.id, m]));

    // Validate each item has a matching menuItem AND that the menuItem is linked to a recipe
    for (const it of items) {
      const mi = menuItemMap.get(it.menuItemId);
      if (!mi) {
        return NextResponse.json({ error: `Menu item ${it.menuItemId} not available` }, { status: 400 });
      }
      if (!mi.recipeId) {
        return NextResponse.json({
          error: `Menu item "${mi.name}" is not linked to a recipe - cannot create comanda item`,
        }, { status: 400 });
      }
    }

    // Check if there's already an open session for this table
    let orderSession = await prisma.orderSession.findFirst({
      where: {
        tableId: table.id,
        status: 'OPEN',
      },
    });

    // Create new session if none exists
    if (!orderSession) {
      orderSession = await prisma.orderSession.create({
        data: {
          restaurantId: table.restaurantId,
          userId: ownerId,
          tableId: table.id,
          tableNumber: table.number,
          customerName: customerName?.trim() || null,
          status: 'OPEN',
        },
      });
    }

    // Add items to the session
    const createdItems = [];
    for (const it of items) {
      const mi = menuItemMap.get(it.menuItemId)!;
      const created = await prisma.orderSessionItem.create({
        data: {
          sessionId: orderSession.id,
          recipeId: mi.recipeId!,
          quantity: Math.max(1, parseInt(it.quantity) || 1),
          price: mi.price,
          specialInstructions: it.specialInstructions?.trim() || null,
        },
        include: { recipe: { select: { name: true } } },
      });
      createdItems.push(created);
    }

    return NextResponse.json({
      success: true,
      sessionId: orderSession.id,
      itemsAdded: createdItems.length,
      items: createdItems,
    });
  } catch (error) {
    console.error('Error creating public order:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
