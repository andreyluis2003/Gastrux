// @ts-nocheck
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * DEPRECATED - neutralized Mercado Pago receiver (reads nothing, writes nothing).
 *
 * This route used to update Payment and MercadoPagoTransaction rows straight
 * from an UNSIGNED request body (body.data.status): no signature check, no
 * auth, no tenant check, no amount check and no state machine. Anyone who knew
 * a Mercado Pago payment id could flip that payment to APPROVED or REFUNDED.
 * It was wrong for genuine traffic too: a real, signed Mercado Pago
 * notification carries no status in its body, so the mapping fell back to
 * PENDING and would have regressed an approved payment.
 *
 * The real receiver is /api/pagamentos/mp/webhook: it verifies the HMAC
 * signature and handles per-restaurant notifications (?rid=<restaurantId>)
 * with that restaurant's own token.
 */
export async function POST() {
  // No body contents are logged: the payload is unauthenticated and untrusted.
  console.warn(
    '[pagamentos/webhook] Notification received on the deprecated webhook route and ignored. Configure Mercado Pago to notify /api/pagamentos/mp/webhook.'
  );
  return NextResponse.json({ ok: true, deprecated: true });
}
