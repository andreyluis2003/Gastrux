import { NextRequest, NextResponse } from 'next/server';
import { sweepPendingPayments } from '@/lib/mercadopago-connect/payment-sweep';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { captureException } from '@/lib/sentry';
import { expireEndedSubscriptions } from '@/lib/billing/subscription-sync';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pagamentos/mp/reconcile - schedule every ~5 minutes with CRON_SECRET.
 * Asks Mercado Pago about payments still PENDING/PROCESSING so a lost webhook or a
 * closed customer page cannot leave paid money unrecorded, and ends canceled Gastrux
 * subscriptions whose paid period is over. Returns only counters.
 */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const sweep = await sweepPendingPayments();
    // Mercado Pago never says when a canceled subscription's paid period ends: done here
    const expiredSubscriptions = await expireEndedSubscriptions();
    return NextResponse.json({ ...sweep, expiredSubscriptions });
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/reconcile',
    });
    console.error('[mp-connect] payment sweep failed:', error);
    return NextResponse.json({ error: 'Payment sweep failed', code: 'MP_PAYMENT_SWEEP_FAILED' }, { status: 500 });
  }
}
