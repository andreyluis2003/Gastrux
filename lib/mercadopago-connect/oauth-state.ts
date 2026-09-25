import crypto from 'crypto';

/**
 * Signed, expiring `state` for the Mercado Pago OAuth round trip.
 * Binds the callback to the restaurant and user that started the flow, so a
 * forged or replayed callback cannot attach someone else's Mercado Pago
 * account to a restaurant (CSRF / tenant confusion). Stateless: the nonce is
 * not stored, replay is bounded by the 10-minute expiry and by the fact that
 * the OAuth `code` itself is single-use.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  restaurantId: string;
  userId: string;
  nonce: string;
  exp: number;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('NEXTAUTH_SECRET não configurado');
  return value;
}

function sign(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

export function createOAuthState(
  input: { restaurantId: string; userId: string },
  now: number = Date.now()
): string {
  const payload: OAuthStatePayload = {
    restaurantId: input.restaurantId,
    userId: input.userId,
    nonce: crypto.randomBytes(12).toString('base64url'),
    exp: now + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyOAuthState(state: string, now: number = Date.now()): OAuthStatePayload | null {
  const [body, signature, ...rest] = (state || '').split('.');
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (
      typeof payload?.restaurantId !== 'string' ||
      typeof payload?.userId !== 'string' ||
      typeof payload?.nonce !== 'string' ||
      typeof payload?.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < now) return null;
    return payload as OAuthStatePayload;
  } catch {
    return null;
  }
}
