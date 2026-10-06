/**
 * Someone already logged in who opens the site, the login or the sign-up page goes straight to work
 * instead of seeing the sales page or the login form again (2026-10-05: the installed app opened on the
 * sales page, and the login form showed even with a live session).
 */
const ENTRY_PAGES = new Set(['/', '/auth/signin', '/auth/signup']);

export const HOME_AFTER_LOGIN = '/dashboard';

/**
 * Only a path inside Gastrux, never another site. Parsed as a URL instead of prefix checks: browsers
 * drop tabs and newlines, so "/\t/evil.com" becomes "//evil.com" (security review, 2026-10-05).
 */
export function safeCallback(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl || /[\u0000-\u001F\u007F\\]/.test(callbackUrl)) return null;
  try {
    const base = 'https://gastrux.invalid';
    const u = new URL(callbackUrl, base);
    if (u.origin !== base || !callbackUrl.startsWith('/')) return null;
    const path = u.pathname + u.search + u.hash;
    if (path.startsWith('//') || ENTRY_PAGES.has(u.pathname)) return null;
    return path;
  } catch {
    return null;
  }
}

/** Where a logged-in person on an entry page goes, or null to stay */
export function entryRedirect(pathname: string, callbackUrl: string | null, loggedIn: boolean): string | null {
  if (!loggedIn || !ENTRY_PAGES.has(pathname)) return null;
  return safeCallback(callbackUrl) || HOME_AFTER_LOGIN;
}
