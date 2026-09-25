// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData, createUserWithRole } from '../helpers/multi-tenant';

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
  let managerA: { userId: string; email: string };
  let adminA: { userId: string; email: string };
  let cashierA: { userId: string; email: string };
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

    // Ruling R20 fixtures, all members of restaurant A but NOT its owner.
    managerA = await createUserWithRole(A.restaurantId, 'MANAGER', 'r20-manager@integration.test');
    adminA = await createUserWithRole(A.restaurantId, 'ADMIN', 'r20-admin@integration.test');
    cashierA = await createUserWithRole(A.restaurantId, 'CASHIER', 'r20-cashier@integration.test');
    // Globally OWNER (of some other restaurant), but only a CASHIER member here:
    // the exact case the old global-role check let through.
    await prisma.user.update({ where: { id: cashierA.userId }, data: { role: 'OWNER' } });
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    await prisma.user.deleteMany({
      where: { id: { in: [managerA.userId, adminA.userId, cashierA.userId] } },
    });
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
  const start = () => new Request('https://gastrux.test/api/pagamentos/mp/connect/start') as any;
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
    it('redirects non owner/admin members back with mp=unauthorized', async () => {
      // A MANAGER member of the CURRENT restaurant (ruling R20 authorizes by
      // membership, so this user must not be the restaurant's owner).
      session('MANAGER', managerA.userId, managerA.email);
      const res = await startRoute(start());
      expect([302, 307]).toContain(res.status);
      expect(location(res)).toContain('mp=unauthorized');
    });

    it('redirects a globally OWNER user who is only a cashier HERE with mp=unauthorized (R20)', async () => {
      session('OWNER', cashierA.userId, cashierA.email);
      const res = await startRoute(start());
      expect([302, 307]).toContain(res.status);
      expect(location(res)).toContain('mp=unauthorized');
    });

    it('redirects unauthenticated users back with mp=unauthorized', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      const res = await startRoute(start());
      expect([302, 307]).toContain(res.status);
      expect(location(res)).toContain('mp=unauthorized');
    });

    it('redirects back with mp=error when Mercado Pago is not configured', async () => {
      session('OWNER');
      const previous = process.env.MERCADO_PAGO_CLIENT_SECRET;
      delete process.env.MERCADO_PAGO_CLIENT_SECRET;
      try {
        const res = await startRoute(start());
        expect([302, 307]).toContain(res.status);
        expect(location(res)).toContain('mp=error');
      } finally {
        process.env.MERCADO_PAGO_CLIENT_SECRET = previous;
      }
    });

    it('redirects an owner to Mercado Pago with a valid signed state', async () => {
      session('OWNER');
      const res = await startRoute(start());
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
      // An authorized ADMIN member of the same restaurant (requireConnectManager passes, R20) who
      // is not the user that started the flow: only the state's userId check can reject this.
      session('ADMIN', adminA.userId, adminA.email);
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });
      const res = await callback(`code=abc&state=${state}`);
      expect(location(res)).toContain('mp=invalid_state');
    });

    it('rejects a valid state when the session user is not a member of the restaurant', async () => {
      session('OWNER', 'someone-else');
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });
      const res = await callback(`code=abc&state=${state}`);
      expect(location(res)).toContain('mp=unauthorized');
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
    it('denies a non owner/admin member of the current restaurant', async () => {
      session('MANAGER', managerA.userId, managerA.email);
      expect((await disconnectRoute()).status).toBe(403);
    });

    it('denies a globally OWNER user whose membership here is a cashier (R20)', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      session('OWNER', cashierA.userId, cashierA.email);

      expect((await disconnectRoute()).status).toBe(403);
      // The connection is untouched: this user cannot change where A's money lands.
      expect(await getConnection(A.restaurantId)).not.toBeNull();
    });

    it('denies a cashier whose GLOBAL role is ADMIN when not on the platform allowlist', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      const prev = process.env.PLATFORM_ADMIN_EMAILS;
      delete process.env.PLATFORM_ADMIN_EMAILS;
      session('ADMIN', cashierA.userId, cashierA.email);
      try {
        expect((await disconnectRoute()).status).toBe(403);
        expect(await getConnection(A.restaurantId)).not.toBeNull();
      } finally {
        if (prev === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
        else process.env.PLATFORM_ADMIN_EMAILS = prev;
      }
    });

    it("allows the restaurant's own owner (R20)", async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      session('OWNER', A.ownerId, 'owner-a@integration.test');

      expect((await disconnectRoute()).status).toBe(200);
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('allows an ACTIVE ADMIN member who is not the owner (R20)', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      // Session role OWNER on purpose: it is NOT a platform-staff identity, so
      // this exercises the RestaurantUser(role: ADMIN) branch and not the
      // platform-staff short-circuit.
      session('OWNER', adminA.userId, adminA.email);

      expect((await disconnectRoute()).status).toBe(200);
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('denies that same ADMIN member once the membership is deactivated (R20)', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      await prisma.restaurantUser.updateMany({
        where: { restaurantId: A.restaurantId, userId: adminA.userId },
        data: { isActive: false },
      });
      session('OWNER', adminA.userId, adminA.email);

      try {
        // getCurrentRestaurantId no longer resolves a restaurant for this user,
        // so the guard answers 404 (never 200).
        expect([403, 404]).toContain((await disconnectRoute()).status);
        expect(await getConnection(A.restaurantId)).not.toBeNull();
      } finally {
        await prisma.restaurantUser.updateMany({
          where: { restaurantId: A.restaurantId, userId: adminA.userId },
          data: { isActive: true },
        });
      }
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
      // The cron sweeps EVERY ACTIVE connection in the database: on a database
      // that is not dedicated to tests it would touch real restaurants' tokens
      // and notify their owners. Refuse BEFORE any mutation.
      const foreign = await prisma.mercadoPagoConnection.count({
        where: { restaurantId: { notIn: [A.restaurantId, B.restaurantId] } },
      });
      if (foreign > 0) {
        throw new Error(
          `POST /connect/refresh sweeps ALL connections and this database has ${foreign} foreign MercadoPagoConnection row(s): this test requires a dedicated empty test DB.`
        );
      }

      const res = await refreshRoute(
        new Request('https://gastrux.test/x', { method: 'POST', headers: { authorization: 'Bearer cron-secret' } }) as any
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ checked: expect.any(Number), refreshed: expect.any(Number) });
    });
  });
});
