import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { morningCheck } from '@/lib/payables/alerts';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/** POST /api/payables/morning-check - daily at 07h BRT from the VPS cron (spec 2026-10-18 contas a pagar §6) */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await morningCheck());
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: '/api/payables/morning-check' });
    console.error('[payables] morning check failed:', error);
    return NextResponse.json({ error: 'Morning check failed' }, { status: 500 });
  }
}
