// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET cash register details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Cash register not found' }, { status: 404 });

    const register = await prisma.cashRegister.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        movements: {
          orderBy: { createdAt: 'desc' },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!register) {
      return NextResponse.json({ error: 'Cash register not found' }, { status: 404 });
    }

    return NextResponse.json(register);
  } catch (error) {
    console.error('Error fetching cash register:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update cash register
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) return NextResponse.json({ error: 'Cash register not found' }, { status: 404 });

    const existing = await prisma.cashRegister.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: 'Cash register not found' }, { status: 404 });

    const body = await req.json();
    const { name, description, actualBalance, closedAt } = body;

    const register = await prisma.cashRegister.update({
      where: { id: params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(actualBalance !== undefined && { actualBalance: parseFloat(actualBalance) }),
        ...(closedAt && { closedAt: new Date(closedAt), active: false }),
      },
    });

    return NextResponse.json(register);
  } catch (error) {
    console.error('Error updating cash register:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
