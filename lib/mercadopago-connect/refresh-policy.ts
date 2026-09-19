/**
 * Pure decisions about when a Mercado Pago token needs refreshing.
 * Kept free of I/O so it is unit-testable without a database.
 */

/** Refresh (cron) when less than this fraction of the original lifetime is left. */
export const REFRESH_THRESHOLD_FRACTION = 0.25;

/** Refresh inline (on use) when the token expires within this window. */
export const ON_USE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export function shouldRefresh(
  conn: { expiresAt: Date; lifetimeSeconds: number },
  now: number = Date.now()
): boolean {
  const remainingMs = conn.expiresAt.getTime() - now;
  return remainingMs < conn.lifetimeSeconds * 1000 * REFRESH_THRESHOLD_FRACTION;
}

export function isExpiredOrNear(conn: { expiresAt: Date }, now: number = Date.now()): boolean {
  return conn.expiresAt.getTime() - now < ON_USE_REFRESH_WINDOW_MS;
}

export function isExpired(conn: { expiresAt: Date }, now: number = Date.now()): boolean {
  return conn.expiresAt.getTime() <= now;
}
