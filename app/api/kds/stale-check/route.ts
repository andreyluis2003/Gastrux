import { NextRequest, NextResponse } from 'next/server';
import { alertStaleKitchenOrders } from '@/lib/kds/stale-orders';
import { alertForgottenShifts } from '@/lib/caixa/alerts';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kds/stale-check - schedule every 1-2 minutes with CRON_SECRET.
 * Alerts the restaurant about kitchen orders nobody started for 10 minutes (kitchen screen or
 * printer probably down), and about cash shifts left open for more than 16 hours. Returns only counters.
 */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const kitchen = await alertStaleKitchenOrders();
    // The same 2-minute cron also watches cash shifts left open (spec rule 15)
    const cash = await alertForgottenShifts();
    return NextResponse.json({ ...kitchen, forgottenCashShifts: cash.alerted });
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: '/api/kds/stale-check' });
    console.error('[kds] stale order check failed:', error);
    return NextResponse.json({ error: 'Stale order check failed' }, { status: 500 });
  }
}
