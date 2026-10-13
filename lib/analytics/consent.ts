/**
 * Cookie consent for Google Analytics (2026-10-13, Política de Privacidade: GA runs on consent).
 * Nothing loads until the visitor accepts. The choice lives in this browser only; the banner asks on the
 * public pages, never over the restaurant's working screens nor its customers' menu and delivery pages.
 */
export type Consent = 'granted' | 'denied';

const KEY = 'gx-cookie-consent';
export const CONSENT_EVENT = 'gx-consent-change';

const PUBLIC_PREFIXES = ['/pricing', '/calculadora', '/para', '/privacidade', '/termos', '/auth'];

/** Pages where the banner asks: the site, its plans and segment pages, sign-up/login and the legal pages. */
export function asksConsentOn(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

/** Stores the choice (null forgets it, so the banner asks again) and tells the page. */
export function writeConsent(value: Consent | null): void {
  try {
    if (value) window.localStorage.setItem(KEY, value);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice lasts until the page closes
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
}
