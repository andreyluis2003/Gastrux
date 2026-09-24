import { NextRequest, NextResponse } from 'next/server';
import { alertStaleKitchenOrders } from '@/lib/kds/stale-orders';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kds/stale-check - schedule every 1-2 minutes with CRON_SECRET.
 * Alerts the restaurant about kitchen orders nobody started for 10 minutes (kitchen screen or
 * printer probably down). Returns only counters.
 */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    return NextResponse.json(await alertStaleKitchenOrders());
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: '/api/kds/stale-check' });
    console.error('[kds] stale order check failed:', error);
    return NextResponse.json({ error: 'Stale order check failed' }, { status: 500 });
  }
}
