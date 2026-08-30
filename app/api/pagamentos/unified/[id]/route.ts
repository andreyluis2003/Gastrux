// @ts-nocheck
/**
 * Unified Payment Detail API
 * GET    /api/pagamentos/unified/[id] - Get payment details
 * PATCH  /api/pagamentos/unified/[id] - Sync payment status
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { syncPaymentStatus } from '@/lib/payment-unified';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        mercadoPagoData: true,
        stripeData: true,
        refunds: true,
        settlements: true,
        restaurant: { select: { name: true } },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error('[Unified Payment] Get error:', error);
    return NextResponse.json(
      { error: 'Failed to get payment' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = params;
    const newStatus = await syncPaymentStatus(id);

    return NextResponse.json({ paymentId: id, status: newStatus });
  } catch (error) {
    console.error('[Unified Payment] Sync error:', error);
    return NextResponse.json(
      { error: 'Failed to sync payment status' },
      { status: 500 }
    );
  }
}
