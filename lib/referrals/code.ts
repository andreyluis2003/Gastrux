/**
 * The referral code format (plan 2026-10-24 indicacao). Apart from rules.ts so the middleware (edge runtime) can read
 * the ?ref= of a link without the Node-only imports.
 */
/** No 0/O, 1/I/L: a code read aloud or copied by hand stays right */
export const REFERRAL_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const REFERRAL_CODE_SIZE = 6;
const CODE_RE = new RegExp(`^[${REFERRAL_ALPHABET}]{${REFERRAL_CODE_SIZE}}$`);
/** The cookie that keeps the code of a link for 60 days */
export const REFERRAL_COOKIE = 'gx_ref';
export const REFERRAL_COOKIE_MAX_AGE = 60 * 24 * 3600;

export function normalizeReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.replace(/\s+/g, '').toUpperCase();
  return CODE_RE.test(code) ? code : null;
}
