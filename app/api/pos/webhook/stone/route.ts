// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Webhook Stone - recebe notificacoes de transacoes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const tx = body.transaction || body;

    // This is an external provider webhook - there is no session, so the
    // restaurant must be identified from the payload itself (Stone's
    // merchant/stone code), matched against the POSSettings row that
    // restaurant configured. An unscoped findFirst() here would validate
    // against a random other restaurant's webhook secret (or skip
    // validation entirely if that unrelated row has none set) and then
    // crash on the required restaurantId anyway.
    const merchantId = tx.merchant_id || tx.stone_code || body.merchant_id || body.stone_code || null;
    if (!merchantId) {
      return NextResponse.json({ error: 'merchant identifier missing' }, { status: 400 });
    }
    const settings = await prisma.pOSSettings.findFirst({
      where: { OR: [{ stoneMerchantId: String(merchantId) }, { stoneStoneCode: String(merchantId) }] },
    });
    if (!settings) {
      return NextResponse.json({ error: 'unknown merchant' }, { status: 404 });
    }

    // Validacao opcional de secret
    const sig = req.headers.get('x-stone-signature');
    if (settings.webhookSecret && sig && settings.webhookSecret !== sig) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }

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
        restaurantId: settings.restaurantId,
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
