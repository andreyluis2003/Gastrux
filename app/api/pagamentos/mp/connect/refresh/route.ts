import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { refreshExpiringConnections } from '@/lib/mercadopago-connect/connection-service';

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
  return NextResponse.json(await refreshExpiringConnections());
}
