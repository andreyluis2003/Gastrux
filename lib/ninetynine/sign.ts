import { createHash, timingSafeEqual } from 'crypto';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

/** App-level v3 signature: sorted `k=v` joined by `&` + app secret, md5; arrays/objects count as "Array"; empty values and `sign` are left out */
export function signParams(params: Record<string, unknown>, secret: string): string {
  const parts: string[] = [];
  for (const key of Object.keys(params).sort()) {
    const v = params[key];
    if (key === 'sign' || v === undefined || v === null || v === '') continue;
    parts.push(`${key}=${typeof v === 'object' ? 'Array' : String(v)}`);
  }
  return md5(parts.join('&') + secret);
}

/** Webhook header `didi-header-sign` must equal md5(raw body + app secret) */
export function verifyWebhookSign(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const want = Buffer.from(md5(rawBody + secret));
  const got = Buffer.from(header.trim().toLowerCase());
  return got.length === want.length && timingSafeEqual(got, want);
}
