// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Webhook Stone - recebe notificacoes de transacoes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const settings = await prisma.pOSSettings.findFirst();

    // Validacao opcional de secret
    const sig = req.headers.get('x-stone-signature');
    if (settings?.webhookSecret && sig && settings.webhookSecret !== sig) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    const tx = body.transaction || body;
    const transactionId = tx.id || tx.transactionId || `stone_${Date.now()}`;
    const amount = Number(tx.amount || 0) / (tx.amount_in_cents ? 100 : 1);
    const paymentMethod = (tx.payment_method || tx.card_type || 'CARD').toUpperCase();
    const statusRaw = (tx.status || '').toUpperCase();
    const status = statusRaw === 'APPROVED' ? 'COMPLETED' : statusRaw === 'DECLINED' ? 'FAILED' : 'COMPLETED';
    const transactionDate = tx.created_at ? new Date(tx.created_at) : new Date();

    await prisma.pOSTransaction.upsert({
      where: { transactionId },
      update: { status, amount, paymentMethod },
      create: {
        transactionId,
        provider: 'STONE',
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
    console.error('[stone webhook]', err);
    return NextResponse.json({ error: 'erro' }, { status: 500 });
  }
}
