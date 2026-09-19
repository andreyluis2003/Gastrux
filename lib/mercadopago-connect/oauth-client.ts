/**
 * Mercado Pago OAuth (marketplace) client. This is the ONLY file that knows
 * the Mercado Pago OAuth endpoints and parameter names; if the docs differ
 * from these assumptions (see Task 0, premise 1) only this file changes.
 */

const AUTH_URL = 'https://auth.mercadopago.com.br/authorization';
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

export interface MpOAuthTokens {
  accessToken: string;
  refreshToken: string;
  mpUserId: string;
  publicKey: string | null;
  liveMode: boolean;
  lifetimeSeconds: number;
}

export class MpOAuthError extends Error {
  status: number;
  revoked: boolean;

  constructor(message: string, status: number, revoked: boolean) {
    super(message);
    this.name = 'MpOAuthError';
    this.status = status;
    this.revoked = revoked;
  }
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MERCADO_PAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET;
  if (!clientId) throw new Error('MERCADO_PAGO_CLIENT_ID não configurado');
  if (!clientSecret) throw new Error('MERCADO_PAGO_CLIENT_SECRET não configurado');
  return { clientId, clientSecret };
}

export function isConnectConfigured(): boolean {
  return Boolean(
    process.env.MERCADO_PAGO_CLIENT_ID &&
      process.env.MERCADO_PAGO_CLIENT_SECRET &&
      process.env.NEXTAUTH_URL &&
      process.env.NEXTAUTH_SECRET &&
      process.env.CREDENTIALS_ENCRYPTION_KEY
  );
}

export function getRedirectUri(): string {
  const base = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '');
  return `${base}/api/pagamentos/mp/connect/callback`;
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: getRedirectUri(),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function parseTokens(data: any): MpOAuthTokens {
  if (!data?.access_token || !data?.refresh_token || data?.user_id == null || !data?.expires_in) {
    throw new MpOAuthError('Resposta do Mercado Pago sem tokens', 502, false);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    mpUserId: String(data.user_id),
    publicKey: data.public_key ?? null,
    liveMode: data.live_mode !== false,
    lifetimeSeconds: Number(data.expires_in),
  };
}

async function requestTokens(grant: Record<string, string>): Promise<MpOAuthTokens> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...grant }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      data?.message || data?.error_description || data?.error || `Mercado Pago OAuth error ${res.status}`;
    const revoked = data?.error === 'invalid_grant' || res.status === 401;
    throw new MpOAuthError(message, res.status, revoked);
  }
  return parseTokens(data);
}

export function exchangeCodeForTokens(code: string): Promise<MpOAuthTokens> {
  return requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
  });
}

export function refreshTokens(refreshToken: string): Promise<MpOAuthTokens> {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
}
