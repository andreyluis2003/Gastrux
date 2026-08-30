// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function mapMercadoPagoStatus(mpStatus: string): string {
  const statusMap: Record<string, string> = {
    'approved': 'APPROVED',
    'pending': 'PENDING',
    'authorized': 'PROCESSING',
    'in_process': 'PROCESSING',
    'rejected': 'DECLINED',
    'cancelled': 'CANCELLED',
    'refunded': 'REFUNDED',
  };
  return statusMap[mpStatus] || 'PENDING';
}

export const dynamic = 'force-dynamic';

// POST webhook for Mercado Pago notifications
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Handle payment notification
    if (body.type === 'payment') {
      const mpPaymentId = body.data?.id;
      
      if (!mpPaymentId) {
        return NextResponse.json({ ok: true });
      }

      // Find the transaction by MP payment ID
      const transaction = await prisma.mercadoPagoTransaction.findFirst({
        where: { mpPaymentId: mpPaymentId.toString() },
        include: { payment: true },
      });

      if (transaction) {
        // Update the transaction with new status
        await prisma.mercadoPagoTransaction.update({
          where: { id: transaction.id },
          data: {
            mpStatus: body.data?.status,
            mpStatusDetail: body.data?.status_detail,
            notificationId: body.id?.toString(),
            lastWebhookAt: new Date(),
          },
        });

        // Update the payment status
        const newStatus = mapMercadoPagoStatus(body.data?.status);
        
        await prisma.payment.update({
          where: { id: transaction.paymentId },
          data: {
            status: newStatus,
            ...(newStatus === 'APPROVED' ? { processedAt: new Date() } : {}),
            ...(newStatus === 'REFUNDED' ? { refundedAt: new Date() } : {}),
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
