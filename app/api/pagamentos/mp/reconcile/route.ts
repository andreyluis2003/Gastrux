import { NextRequest, NextResponse } from 'next/server';
import { sweepPendingPayments } from '@/lib/mercadopago-connect/payment-sweep';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pagamentos/mp/reconcile - schedule every ~5 minutes with CRON_SECRET.
 * Asks Mercado Pago about payments still PENDING/PROCESSING so a lost webhook or a
 * closed customer page cannot leave paid money unrecorded. Returns only counters.
 */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await sweepPendingPayments());
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/reconcile',
    });
    console.error('[mp-connect] payment sweep failed:', error);
    return NextResponse.json({ error: 'Payment sweep failed', code: 'MP_PAYMENT_SWEEP_FAILED' }, { status: 500 });
  }
}
