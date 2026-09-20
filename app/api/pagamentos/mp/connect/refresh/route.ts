import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { refreshExpiringConnections } from '@/lib/mercadopago-connect/connection-service';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Same authentication convention as the other cron endpoints (CRON_SECRET via
// `x-internal-trigger` or `Authorization: Bearer`).
function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const trigger = req.headers.get('x-internal-trigger');
  if (trigger && safeEqual(trigger, secret)) return true;

  const auth = req.headers.get('authorization');
  return Boolean(auth?.startsWith('Bearer ') && safeEqual(auth.slice(7), secret));
}

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
