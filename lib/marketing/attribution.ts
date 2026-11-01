/**
 * Where a sign-up came from (2026-10-31). The Meta pixel only runs after the cookie consent, so it undercounts
 * sign-ups; the link's UTM is kept in a first-party cookie, read on the server at sign-up. It holds the campaign
 * labels of the link and nothing about the person. No Prisma here: the middleware imports this file.
 */
export const ATTRIBUTION_COOKIE = 'gx_utm';
export const ATTRIBUTION_COOKIE_MAX_AGE = 60 * 24 * 3600;

export interface Attribution {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
}

const clean = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().slice(0, 100);
  return /^[\p{L}\p{N} ._+|:\/-]+$/u.test(value) ? value : null;
};

function build(source: unknown, medium: unknown, campaign: unknown, content: unknown): Attribution | null {
  const s = clean(source);
  return s ? { source: s, medium: clean(medium), campaign: clean(campaign), content: clean(content) } : null;
}

/** The UTM of a link; null when it has no valid source */
export function attributionFromParams(params: URLSearchParams): Attribution | null {
  return build(params.get('utm_source'), params.get('utm_medium'), params.get('utm_campaign'), params.get('utm_content'));
}

export function parseAttributionCookie(raw: string | undefined | null): Attribution | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return build(value?.source, value?.medium, value?.campaign, value?.content);
  } catch {
    return null;
  }
}

export function attributionLabel(a: Attribution): string {
  return [a.source, a.medium, a.campaign, a.content].filter(Boolean).join(' · ');
}
