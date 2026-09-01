// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Webhook SumUp - recebe notificacoes de transacoes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Formato esperado SumUp: { transaction_code, amount, currency, payment_type, status, timestamp, ... }
    const tx = body.transaction || body;

    // No session on an external webhook - resolve the restaurant from the
    // payload's merchant id, matched against the POSSettings row that
    // restaurant configured (see stone/route.ts for the full rationale).
    const merchantId = tx.merchant_code || tx.merchant_id || body.merchant_code || body.merchant_id || null;
    if (!merchantId) {
      return NextResponse.json({ error: 'merchant identifier missing' }, { status: 400 });
    }
    const settings = await prisma.pOSSettings.findFirst({ where: { sumupMerchantId: String(merchantId) } });
    if (!settings) {
      return NextResponse.json({ error: 'unknown merchant' }, { status: 404 });
    }

    // Validacao opcional de secret
    const sig = req.headers.get('x-sumup-signature');
    if (settings.webhookSecret && sig && settings.webhookSecret !== sig) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

    const transactionId = tx.transaction_code || tx.id || `sumup_${Date.now()}`;
    const amount = Number(tx.amount || 0);
    const paymentMethod = (tx.payment_type || tx.payment_method || 'CARD').toUpperCase();
    const status = (tx.status === 'SUCCESSFUL' ? 'COMPLETED' : tx.status === 'FAILED' ? 'FAILED' : 'COMPLETED');
    const transactionDate = tx.timestamp ? new Date(tx.timestamp) : new Date();

    await prisma.pOSTransaction.upsert({
      where: { transactionId },
      update: { status, amount, paymentMethod },
      create: {
        restaurantId: settings.restaurantId,
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
