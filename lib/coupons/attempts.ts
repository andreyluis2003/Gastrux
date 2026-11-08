import { isIP } from 'net';

/**
 * Coupon tries (spec 2026-11-08 cupons; security review 2026-11-08): per client address and restaurant, plus a
 * ceiling per restaurant for tries spread over many addresses. The preview and the order creation share it, so a
 * code is not found by trying thousands. One server process: a map is enough; old keys are evicted one by one.
 */
export const TRIES_PER_MINUTE = 20;
export const RESTAURANT_TRIES_PER_MINUTE = 300;
const WINDOW_MS = 60_000;
const MAX_KEYS = 5000;
const tries = new Map<string, number[]>();

/**
 * The client address as lib/billing/subscription-acceptance.ts reads it: the proxy (Traefik, on Easypanel) adds the
 * caller as the LAST entry of X-Forwarded-For; anything before it can be forged.
 */
export function clientAddress(headers: { get(name: string): string | null }): string {
  const last = headers.get('x-forwarded-for')?.split(',').pop()?.trim();
  return last && isIP(last) ? last : 'local';
}

function take(key: string, limit: number, now: number): boolean {
  const recent = (tries.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= limit) {
    tries.set(key, recent);
    return false;
  }
  recent.push(now);
  tries.delete(key);
  tries.set(key, recent);
  // Evict the least recently used keys, never the whole map
  while (tries.size > MAX_KEYS) tries.delete(tries.keys().next().value as string);
  return true;
}

/** One coupon try of this address on this restaurant; false when either limit is reached */
export function takeCouponTry(address: string, restaurantId: string, now = Date.now()): boolean {
  return take(`r|${restaurantId}`, RESTAURANT_TRIES_PER_MINUTE, now) && take(`a|${address}|${restaurantId}`, TRIES_PER_MINUTE, now);
}
