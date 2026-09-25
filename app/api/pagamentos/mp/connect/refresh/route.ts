import { NextRequest, NextResponse } from 'next/server';
import { refreshExpiringConnections } from '@/lib/mercadopago-connect/connection-service';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // The sweep already swallows per-connection failures; anything that still
  // escapes (a dead database, a bug) must be visible instead of a raw 500.
  try {
    return NextResponse.json(await refreshExpiringConnections());
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
      endpoint: '/api/pagamentos/mp/connect/refresh',
    });
    console.error('[mp-connect] refresh cron failed:', error);
    return NextResponse.json(
      { error: 'Refresh sweep failed', code: 'MP_REFRESH_SWEEP_FAILED' },
      { status: 500 }
    );
  }
}
