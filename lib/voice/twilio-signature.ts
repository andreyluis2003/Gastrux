import crypto from 'crypto';

/**
 * Twilio request validation (https://www.twilio.com/docs/usage/security#validating-requests):
 * X-Twilio-Signature = base64(HMAC-SHA1(authToken, fullUrl + each POST param name+value, sorted by name)).
 *
 * The voice webhooks accepted any POST, so anyone could fake a call and make the voice agent create
 * reservations in a restaurant. Each restaurant's own Twilio auth token (VoiceAgentConfig) signs its calls.
 */

/** The URL Twilio called: the public address, not the internal one behind the proxy. */
export function publicRequestUrl(reqUrl: string): string {
  const url = new URL(reqUrl);
  const base = (process.env.NEXTAUTH_URL || url.origin).replace(/\/+$/, '');
  return `${base}${url.pathname}${url.search}`;
}

export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
}

export function isValidTwilioRequest(
  authToken: string | null | undefined,
  signature: string | null | undefined,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken || !signature) return false;
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params));
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

/** FormData to the plain object Twilio signs (every field is a string in its webhooks). */
export function formToParams(form: FormData): Record<string, string> {
  const params: Record<string, string> = {};
  form.forEach((value, key) => {
    params[key] = String(value);
  });
  return params;
}
