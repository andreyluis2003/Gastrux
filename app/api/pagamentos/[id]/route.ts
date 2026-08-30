// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';

export const dynamic = 'force-dynamic';

// GET payment details
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const payment = await prisma.payment.findFirst({
      where: { id: params.id, restaurantId },
      include: {
        mercadoPagoData: true,
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Error fetching payment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT update payment status
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const restaurantId = await getCurrentRestaurantId();
    if (!restaurantId) {
      return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
    }
    const ownedPayment = await prisma.payment.findFirst({
      where: { id: params.id, restaurantId },
      select: { id: true },
    });
    if (!ownedPayment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const body = await req.json();
    const { status, processedAt, refundedAt } = body;

    const payment = await prisma.payment.update({
      where: { id: params.id },
      data: {
        ...(status && { status }),
        ...(processedAt && { processedAt: new Date(processedAt) }),
        ...(refundedAt && { refundedAt: new Date(refundedAt) }),
      },
      include: {
        mercadoPagoData: true,
      },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
