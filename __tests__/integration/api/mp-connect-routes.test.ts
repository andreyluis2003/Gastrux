// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { GET as getStatus, DELETE as disconnectRoute } from '../../../app/api/pagamentos/mp/connect/route';
import { GET as startRoute } from '../../../app/api/pagamentos/mp/connect/start/route';
import { GET as callbackRoute } from '../../../app/api/pagamentos/mp/connect/callback/route';
import { POST as refreshRoute } from '../../../app/api/pagamentos/mp/connect/refresh/route';
import { createOAuthState, verifyOAuthState } from '../../../lib/mercadopago-connect/oauth-state';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { decryptSecret } from '../../../lib/security/credential-crypto';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const ENV = ['CREDENTIALS_ENCRYPTION_KEY', 'MERCADO_PAGO_CLIENT_ID', 'MERCADO_PAGO_CLIENT_SECRET', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'CRON_SECRET'];

describe('Mercado Pago connect routes', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const saved: Record<string, string | undefined> = {};
  const originalFetch = global.fetch;

  const session = (role: string, ownerId = A.ownerId, email = 'owner-a@integration.test') =>
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId, email, role } });

  beforeAll(async () => {
    ENV.forEach((k) => (saved[k] = process.env[k]));
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.MERCADO_PAGO_CLIENT_ID = 'client-123';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-456';
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';
    process.env.CRON_SECRET = 'cron-secret';

    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    ENV.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  beforeEach(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    global.fetch = originalFetch;
  });

  afterEach(() => jest.restoreAllMocks());

  const callback = (query: string) =>
    callbackRoute(new Request(`https://gastrux.test/api/pagamentos/mp/connect/callback?${query}`) as any);
  const location = (res: Response) => res.headers.get('location') || '';

  describe('GET /connect (status)', () => {
    it('rejects unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect((await getStatus()).status).toBe(401);
    });

    it('reports not connected without leaking any token field', async () => {
      session('OWNER');
      const body = await (await getStatus()).json();
      expect(body).toMatchObject({ configured: true, connected: false, needsReconnect: false });
      expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken|APP_USR/);
    });

    it('reports connected after a connection is saved', async () => {
      await saveConnection(A.restaurantId, {
        accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '77', publicKey: 'pk', liveMode: true, lifetimeSeconds: 15552000,
      });
      session('OWNER');
      const body = await (await getStatus()).json();
      expect(body).toMatchObject({ connected: true, needsReconnect: false, mpUserId: '77', liveMode: true });
    });
  });

  describe('GET /connect/start', () => {
    it('denies non owner/admin roles', async () => {
      session('MANAGER');
      expect((await startRoute()).status).toBe(403);
    });

    it('redirects an owner to Mercado Pago with a valid signed state', async () => {
      session('OWNER');
      const res = await startRoute();
      expect([302, 307]).toContain(res.status);
      const url = new URL(location(res));
      expect(url.origin).toBe('https://auth.mercadopago.com.br');
      const state = verifyOAuthState(url.searchParams.get('state'));
      expect(state).toMatchObject({ restaurantId: A.restaurantId, userId: A.ownerId });
    });
  });

  describe('GET /connect/callback', () => {
    it('redirects with mp=denied when the user cancels at Mercado Pago', async () => {
      session('OWNER');
      const res = await callback('error=access_denied');
      expect(location(res)).toContain('mp=denied');
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('rejects a tampered state without saving anything', async () => {
      session('OWNER');
      const res = await callback('code=abc&state=tampered.state');
      expect(location(res)).toContain('mp=invalid_state');
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('rejects a state minted for another restaurant', async () => {
      session('OWNER');
      const state = createOAuthState({ restaurantId: B.restaurantId, userId: A.ownerId });
      const res = await callback(`code=abc&state=${state}`);
      expect(location(res)).toContain('mp=invalid_state');
      expect(await getConnection(B.restaurantId)).toBeNull();
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('rejects a valid state when the session belongs to a different user', async () => {
      session('OWNER', 'someone-else');
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });
      const res = await callback(`code=abc&state=${state}`);
      expect(location(res)).toContain('mp=invalid_state');
    });

    it('exchanges the code and stores an encrypted connection on the happy path', async () => {
      session('OWNER');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'APP_USR-live', refresh_token: 'TG-live', user_id: 4242,
          public_key: 'pk-live', live_mode: true, expires_in: 15552000,
        }),
      });
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });

      const res = await callback(`code=the-code&state=${state}`);

      expect(location(res)).toContain('mp=connected');
      const raw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: A.restaurantId } });
      expect(raw.status).toBe('ACTIVE');
      expect(raw.mpUserId).toBe('4242');
      expect(raw.accessToken).not.toContain('APP_USR-live');
      expect(decryptSecret(raw.accessToken)).toBe('APP_USR-live');
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ grant_type: 'authorization_code', code: 'the-code' });
    });

    it('redirects with mp=error when the code exchange fails', async () => {
      session('OWNER');
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });
      const res = await callback(`code=bad&state=${state}`);
      expect(location(res)).toContain('mp=error');
      expect(await getConnection(A.restaurantId)).toBeNull();
    });
  });

  describe('DELETE /connect', () => {
    it('denies non owner/admin roles', async () => {
      session('MANAGER');
      expect((await disconnectRoute()).status).toBe(403);
    });

    it('removes only the caller restaurant connection', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      await saveConnection(B.restaurantId, tokens);
      session('OWNER');

      const res = await disconnectRoute();

      expect(res.status).toBe(200);
      expect(await getConnection(A.restaurantId)).toBeNull();
      expect(await getConnection(B.restaurantId)).not.toBeNull();
    });
  });

  describe('POST /connect/refresh (cron)', () => {
    it('rejects requests without the cron secret', async () => {
      const res = await refreshRoute(new Request('https://gastrux.test/x', { method: 'POST' }) as any);
      expect(res.status).toBe(401);
    });

    it('runs with the bearer secret', async () => {
      const res = await refreshRoute(
        new Request('https://gastrux.test/x', { method: 'POST', headers: { authorization: 'Bearer cron-secret' } }) as any
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ checked: expect.any(Number), refreshed: expect.any(Number) });
    });
  });
});
