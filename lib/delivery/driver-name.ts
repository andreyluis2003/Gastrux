/**
 * The typed name of a driver (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md). Pure: used by
 * the server (dispatch, pay, report) and by the screen (pairing the door money with the payment).
 */

/** Trimmed, inner spaces collapsed, up to 60 characters; empty = null */
export function normalizeDriverName(value: unknown): string | null {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  return name || null;
}

/** Pay key of a typed name: 'name:' + the normalized name in lower case ("João  Silva" and "joão silva" are one driver) */
export function driverNameKey(value: unknown): string | null {
  const name = normalizeDriverName(value);
  return name ? `name:${name.toLowerCase()}` : null;
}
