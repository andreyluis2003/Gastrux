// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Webhook SumUp - recebe notificacoes de transacoes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const settings = await prisma.pOSSettings.findFirst();

    // Validacao opcional de secret
    const sig = req.headers.get('x-sumup-signature');
    if (settings?.webhookSecret && sig && settings.webhookSecret !== sig) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    // Formato esperado SumUp: { transaction_code, amount, currency, payment_type, status, timestamp, ... }
    const tx = body.transaction || body;
    const transactionId = tx.transaction_code || tx.id || `sumup_${Date.now()}`;
    const amount = Number(tx.amount || 0);
    const paymentMethod = (tx.payment_type || tx.payment_method || 'CARD').toUpperCase();
    const status = (tx.status === 'SUCCESSFUL' ? 'COMPLETED' : tx.status === 'FAILED' ? 'FAILED' : 'COMPLETED');
    const transactionDate = tx.timestamp ? new Date(tx.timestamp) : new Date();

    await prisma.pOSTransaction.upsert({
      where: { transactionId },
      update: { status, amount, paymentMethod },
      create: {
        transactionId,
        provider: 'SUMUP',
        amount,
        currency: tx.currency || 'BRL',
        paymentMethod,
        status,
        items: JSON.stringify(tx.items || []),
        transactionDate,
        receiptUrl: tx.receipt_url || null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[sumup webhook]', err);
    return NextResponse.json({ error: 'erro' }, { status: 500 });
  }
}
