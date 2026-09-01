// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// PUT /api/comanda/sessions/[id]/items/[itemId]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

    const owned = await prisma.orderSessionItem.findFirst({
      where: { id: params.itemId, sessionId: params.id, session: { restaurantId } },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    const { quantity, specialInstructions } = await request.json();

    const item = await prisma.orderSessionItem.update({
      where: { id: params.itemId },
      data: {
        quantity: quantity !== undefined ? quantity : undefined,
        specialInstructions: specialInstructions !== undefined ? specialInstructions : undefined,
      },
      include: {
        recipe: { select: { name: true, sellingPrice: true } },
      },
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// DELETE /api/comanda/sessions/[id]/items/[itemId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; itemId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });

    const owned = await prisma.orderSessionItem.findFirst({
      where: { id: params.itemId, sessionId: params.id, session: { restaurantId } },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: 'Item not found' }, { status: 404 });

    await prisma.orderSessionItem.delete({
      where: { id: params.itemId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
