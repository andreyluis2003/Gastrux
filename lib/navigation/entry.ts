/**
 * Someone already logged in who opens the site, the login or the sign-up page goes straight to work
 * instead of seeing the sales page or the login form again (2026-10-05: the installed app opened on the
 * sales page, and the login form showed even with a live session).
 */
const ENTRY_PAGES = new Set(['/', '/auth/signin', '/auth/signup']);

export const HOME_AFTER_LOGIN = '/dashboard';

/** Only a path inside Gastrux: never another site ("//evil.com", "https://...") */
export function safeCallback(callbackUrl: string | null | undefined): string | null {
  if (!callbackUrl) return null;
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//') || callbackUrl.startsWith('/\\')) return null;
  if (ENTRY_PAGES.has(callbackUrl.split('?')[0])) return null;
  return callbackUrl;
}

/** Where a logged-in person on an entry page goes, or null to stay */
export function entryRedirect(pathname: string, callbackUrl: string | null, loggedIn: boolean): string | null {
  if (!loggedIn || !ENTRY_PAGES.has(pathname)) return null;
  return safeCallback(callbackUrl) || HOME_AFTER_LOGIN;
}
