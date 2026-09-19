import { NextRequest, NextResponse } from 'next/server';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { createPixForTarget, normalizePayer } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pagamentos/mp/pix
 * Public (the end customer has no login). The browser only says WHAT it wants
 * to pay - `orderId` (delivery) or `qrToken` (table tab). The restaurant and
 * the amount are resolved on the server, and the PIX is created with the
 * restaurant's own Mercado Pago token, so the money lands in its account.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, qrToken, payerEmail, payerName } = body || {};

    const resolved = await resolvePixTarget({ orderId, qrToken });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    const result = await createPixForTarget(resolved.target, normalizePayer({ payerEmail, payerName }));
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ success: true, ...result.pix });
  } catch (error) {
    console.error('[PIX] Erro ao criar pagamento:', error);
    return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 500 });
  }
}
