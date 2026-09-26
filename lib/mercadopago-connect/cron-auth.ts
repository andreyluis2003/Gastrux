import { NextRequest } from 'next/server';
import crypto from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Same authentication convention as the other cron endpoints (CRON_SECRET via
 * `x-internal-trigger` or `Authorization: Bearer`). Fails closed without the secret.
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const trigger = req.headers.get('x-internal-trigger');
  if (trigger && safeEqual(trigger, secret)) return true;

  const auth = req.headers.get('authorization');
  return Boolean(auth?.startsWith('Bearer ') && safeEqual(auth.slice(7), secret));
}
