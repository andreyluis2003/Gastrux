import { timingSafeEqual } from 'crypto';

/** Constant-time comparison of a POS webhook's secret header; a missing secret on either side fails. */
export function webhookSecretMatches(expected: string | null | undefined, received: string | null | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
