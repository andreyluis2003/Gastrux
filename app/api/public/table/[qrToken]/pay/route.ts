import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCpf, isValidPayerKey } from '@/lib/comanda/table-share';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { createPixForTarget, normalizePayer } from '@/lib/mercadopago-connect/pix-service';
import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentEnabled } from '@/lib/mercadopago-connect/table-payment-access';
import { createCardCheckout, resolveBaseUrl } from '@/lib/mercadopago-connect/card-checkout';

export const dynamic = 'force-dynamic';

/**
 * POST: one person pays their part of the table bill by PIX or card (spec 2026-10-10 §5.4; card: stage 3). The browser sends only
 * the choice (mode, people or amount), the optional CPF and its phone key; the amount, the restaurant and
 * the comanda come from the server.
 */
export async function POST(req: NextRequest, { params }: { params: { qrToken: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!isValidPayerKey(body?.payerKey)) return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 422 });
    const cpf = normalizeCpf(body?.cpf);
    if (!cpf.ok) return NextResponse.json({ error: cpf.error }, { status: 422 });
    const method = body?.method ?? 'PIX';
    if (method !== 'PIX' && method !== 'CARD') return NextResponse.json({ error: 'Escolha Pix ou cartão.' }, { status: 422 });

    const table = await prisma.table.findUnique({ where: { qrToken: params.qrToken }, select: { restaurantId: true } });
    if (!table) return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
    if (!(await tablePaymentEnabled(table.restaurantId))) return NextResponse.json({ error: TABLE_PAYMENT_UNAVAILABLE }, { status: 403 });

    const resolved = await resolvePixTarget({
      qrToken: params.qrToken,
      share: { mode: body?.mode, people: body?.people, amountCents: body?.amountCents, cpf: cpf.cpf, payerKey: body.payerKey },
    });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    if (method === 'CARD') {
      const base = resolveBaseUrl();
      if (!base) return NextResponse.json({ error: 'Pagamento com cartão indisponível no momento. Use o Pix ou pague com o garçom.' }, { status: 500 });
      const out = await createCardCheckout({
        target: resolved.target,
        payer: normalizePayer({ payerName: body?.payerName }),
        // Back to this table's menu, which reopens the bill and confirms the payment (lib/menu/card-return.ts)
        backUrl: (id, result) => `${base}/menu/${params.qrToken}?payment=${id}&result=${result}`,
        itemId: `mesa-${resolved.target.sessionId}`,
        // PIX has its own button; boleto and bank slips take days
        excludedPaymentTypes: ['ticket', 'atm', 'bank_transfer'],
      });
      if (!out.ok) return NextResponse.json({ error: out.error, code: out.code }, { status: out.status });
      return NextResponse.json({ success: true, paymentId: out.paymentId, initPoint: out.initPoint, amount: resolved.target.amount, sessionId: resolved.target.sessionId });
    }

    const result = await createPixForTarget(resolved.target, normalizePayer({ payerName: body?.payerName }));
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    return NextResponse.json({ success: true, ...result.pix, sessionId: resolved.target.sessionId });
  } catch (error) {
    console.error('[table pay] failed:', error);
    return NextResponse.json({ error: 'Não foi possível gerar o Pix. Tente de novo.' }, { status: 500 });
  }
}
