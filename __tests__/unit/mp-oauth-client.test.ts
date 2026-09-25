// @ts-nocheck
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshTokens,
  isConnectConfigured,
  getRedirectUri,
  MpOAuthError,
} from '../../lib/mercadopago-connect/oauth-client';

const ENV_KEYS = [
  'MERCADO_PAGO_CLIENT_ID',
  'MERCADO_PAGO_CLIENT_SECRET',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'CREDENTIALS_ENCRYPTION_KEY',
];

describe('mercadopago-connect/oauth-client', () => {
  const saved: Record<string, string | undefined> = {};
  const originalFetch = global.fetch;

  beforeEach(() => {
    ENV_KEYS.forEach((k) => (saved[k] = process.env[k]));
    process.env.MERCADO_PAGO_CLIENT_ID = 'client-123';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-456';
    process.env.NEXTAUTH_URL = 'https://gastrux.test/';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const tokenResponse = {
    access_token: 'APP_USR-access',
    refresh_token: 'TG-refresh',
    user_id: 998877,
    public_key: 'APP_USR-public',
    live_mode: true,
    expires_in: 15552000,
  };

  it('reports whether the integration is configured', () => {
    expect(isConnectConfigured()).toBe(true);
    delete process.env.MERCADO_PAGO_CLIENT_SECRET;
    expect(isConnectConfigured()).toBe(false);
  });

  it('builds the redirect URI without a double slash', () => {
    expect(getRedirectUri()).toBe('https://gastrux.test/api/pagamentos/mp/connect/callback');
  });

  it('builds the authorization URL with the required parameters', () => {
    const url = new URL(buildAuthorizationUrl('the-state'));
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.br/authorization');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('platform_id')).toBe('mp');
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.searchParams.get('redirect_uri')).toBe(getRedirectUri());
  });

  it('exchanges an authorization code for tokens', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => tokenResponse });
    global.fetch = fetchMock;

    const tokens = await exchangeCodeForTokens('the-code');

    expect(tokens).toEqual({
      accessToken: 'APP_USR-access',
      refreshToken: 'TG-refresh',
      mpUserId: '998877',
      publicKey: 'APP_USR-public',
      liveMode: true,
      lifetimeSeconds: 15552000,
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      client_id: 'client-123',
      client_secret: 'secret-456',
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: getRedirectUri(),
    });
  });

  it('refreshes tokens with the refresh_token grant', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => tokenResponse });
    global.fetch = fetchMock;

    await refreshTokens('old-refresh');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      client_id: 'client-123',
      client_secret: 'secret-456',
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
    });
  });

  it('flags invalid_grant as a revoked connection', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', message: 'Refresh token invalid' }),
    });

    const error = await refreshTokens('bad').catch((e) => e);
    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.revoked).toBe(true);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Refresh token invalid');
  });

  it('does NOT flag a bare 401 as revoked (one wrong client secret must not revoke every connection)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: 'invalid client credentials' }),
    });

    const error = await refreshTokens('good-token').catch((e) => e);

    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.status).toBe(401);
    expect(error.revoked).toBe(false);
  });

  it('does not flag a 401 whose body only says unauthorized as revoked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'unauthorized' }),
    });

    const error = await refreshTokens('good-token').catch((e) => e);
    expect(error.revoked).toBe(false);
  });

  it('sends an abort signal so a hung Mercado Pago call cannot stall the sweep', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => tokenResponse });
    global.fetch = fetchMock;

    await refreshTokens('old-refresh');

    const signal = fetchMock.mock.calls[0][1].signal;
    expect(signal).toBeDefined();
    expect(typeof signal.aborted).toBe('boolean');
  });

  it('turns an aborted/timed-out request into a RETRYABLE failure, never revoked', async () => {
    const abortError = new Error('The operation was aborted due to timeout');
    abortError.name = 'TimeoutError';
    global.fetch = jest.fn().mockRejectedValue(abortError);

    const error = await refreshTokens('good-token').catch((e) => e);

    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.revoked).toBe(false);
    expect(error.status).toBe(504);
    expect(error.message).toContain('aborted');
  });

  it('turns a network failure into a retryable failure too', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed'));

    const error = await refreshTokens('good-token').catch((e) => e);

    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.revoked).toBe(false);
  });

  it('does not flag a server error as revoked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const error = await refreshTokens('x').catch((e) => e);
    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.revoked).toBe(false);
  });

  it('rejects a response without tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'only' }) });
    await expect(exchangeCodeForTokens('c')).rejects.toBeInstanceOf(MpOAuthError);
  });

  it('fails clearly when credentials are missing', async () => {
    delete process.env.MERCADO_PAGO_CLIENT_ID;
    await expect(exchangeCodeForTokens('c')).rejects.toThrow('MERCADO_PAGO_CLIENT_ID');
  });
});
