import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { alertExpiringLabels } from '@/lib/labels/morning-alert';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/** POST /api/labels/morning-check - schedule daily at 07:00 Brasília (10:00 UTC) with CRON_SECRET */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await alertExpiringLabels());
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: '/api/labels/morning-check' });
    console.error('[labels] morning check failed:', error);
    return NextResponse.json({ error: 'Morning check failed' }, { status: 500 });
  }
}
