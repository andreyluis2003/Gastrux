// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import {
  saveConnection,
  getConnection,
  getActiveConnection,
  hasActiveConnection,
  markNeedsReconnect,
  refreshConnection,
  getMpClientForRestaurant,
  disconnect,
  refreshExpiringConnections,
} from '../../../lib/mercadopago-connect/connection-service';
import { decryptSecret } from '../../../lib/security/credential-crypto';
// The service writes through the app's own Prisma client, not this file's
// instance: a spy on a local client would never be hit.
import { prisma as appPrisma } from '../../../lib/prisma';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = {
  accessToken: 'APP_USR-access-1',
  refreshToken: 'TG-refresh-1',
  mpUserId: '123456',
  publicKey: 'APP_USR-public-1',
  liveMode: true,
  lifetimeSeconds: 15552000,
};

const REFRESHED = {
  access_token: 'APP_USR-access-2',
  refresh_token: 'TG-refresh-2',
  user_id: 123456,
  public_key: 'APP_USR-public-2',
  live_mode: true,
  expires_in: 15552000,
};

describe('mercadopago-connect/connection-service', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const originalFetch = global.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ['CREDENTIALS_ENCRYPTION_KEY', 'MERCADO_PAGO_CLIENT_ID', 'MERCADO_PAGO_CLIENT_SECRET', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET'].forEach(
      (k) => (savedEnv[k] = process.env[k])
    );
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.MERCADO_PAGO_CLIENT_ID = 'client-123';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-456';
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';

    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    Object.entries(savedEnv).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  });

  beforeEach(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stores tokens encrypted and never in plaintext', async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const raw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: A.restaurantId } });
    expect(raw.accessToken.startsWith('v1:')).toBe(true);
    expect(raw.refreshToken.startsWith('v1:')).toBe(true);
    expect(raw.accessToken).not.toContain('APP_USR-access-1');
    expect(decryptSecret(raw.accessToken)).toBe('APP_USR-access-1');
    expect(decryptSecret(raw.refreshToken)).toBe('TG-refresh-1');
    expect(raw.status).toBe('ACTIVE');
    expect(raw.expiresAt.getTime()).toBeGreaterThan(Date.now() + 15000000 * 1000);
  });

  it('saveConnection on an existing restaurant replaces the tokens and reactivates it', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await markNeedsReconnect(A.restaurantId, 'test');
    await saveConnection(A.restaurantId, { ...TOKENS, accessToken: 'APP_USR-access-9' });

    const conn = await getActiveConnection(A.restaurantId);
    expect(conn).not.toBeNull();
    expect(decryptSecret(conn.accessToken)).toBe('APP_USR-access-9');
  });

  it('isolates connections between restaurants', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    expect(await hasActiveConnection(A.restaurantId)).toBe(true);
    expect(await hasActiveConnection(B.restaurantId)).toBe(false);
    expect(await getMpClientForRestaurant(B.restaurantId)).toBeNull();
  });

  it('getActiveConnection is null for NEEDS_RECONNECT, and disconnect removes only that restaurant', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    await markNeedsReconnect(A.restaurantId, 'revoked');

    expect(await getActiveConnection(A.restaurantId)).toBeNull();
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');

    await disconnect(A.restaurantId);
    expect(await getConnection(A.restaurantId)).toBeNull();
    expect(await hasActiveConnection(B.restaurantId)).toBe(true);
  });

  it('markNeedsReconnect notifies the owner only on the transition', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await markNeedsReconnect(A.restaurantId, 'first');
    await markNeedsReconnect(A.restaurantId, 'second');

    const notifications = await prisma.notification.findMany({
      where: { userId: A.ownerId, title: 'Reconecte seu Mercado Pago' },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].actionUrl).toBe('/dashboard/pagamentos/conectar');
  });

  it('refreshConnection stores the new tokens encrypted', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    expect(await refreshConnection(A.restaurantId)).toBe('refreshed');

    const raw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: A.restaurantId } });
    expect(decryptSecret(raw.accessToken)).toBe('APP_USR-access-2');
    expect(decryptSecret(raw.refreshToken)).toBe('TG-refresh-2');
    expect(raw.lastRefreshAt).not.toBeNull();
    expect(raw.lastRefreshError).toBeNull();
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).refresh_token).toBe('TG-refresh-1');
  });

  it('two concurrent refreshes call Mercado Pago only once', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    const results = await Promise.all([refreshConnection(A.restaurantId), refreshConnection(A.restaurantId)]);

    expect(results.sort()).toEqual(['refreshed', 'skipped']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a revoked refresh token marks the connection NEEDS_RECONNECT', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', message: 'Refresh token invalid' }),
    });

    expect(await refreshConnection(A.restaurantId)).toBe('needs_reconnect');
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });

  it('a transient failure keeps the connection ACTIVE and records the error', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    expect(await refreshConnection(A.restaurantId)).toBe('failed');
    const conn = await getConnection(A.restaurantId);
    expect(conn.status).toBe('ACTIVE');
    expect(conn.lastRefreshError).toContain('503');
  });

  it('getMpClientForRestaurant returns a client built from the decrypted token', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const client = await getMpClientForRestaurant(A.restaurantId);
    expect(client).not.toBeNull();
    expect(client.accessToken).toBe('APP_USR-access-1');
  });

  it('getMpClientForRestaurant refreshes inline when the token expires within 24 hours', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId: A.restaurantId },
      data: { expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    const client = await getMpClientForRestaurant(A.restaurantId);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(client.accessToken).toBe('APP_USR-access-2');
  });

  it('getMpClientForRestaurant returns null when the token is expired and cannot be refreshed', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId: A.restaurantId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    expect(await getMpClientForRestaurant(A.restaurantId)).toBeNull();
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });

  it('refreshExpiringConnections only refreshes connections under 25% of their lifetime', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId: A.restaurantId },
      data: { expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    const summary = await refreshExpiringConnections();

    expect(summary.refreshed).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const bRaw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: B.restaurantId } });
    expect(decryptSecret(bRaw.accessToken)).toBe('APP_USR-access-1');
  });

  it('one connection that throws does not abort the sweep: the others are still refreshed (I7)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    // Both are due for a refresh.
    await prisma.mercadoPagoConnection.updateMany({
      where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } },
      data: { expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    // A's row behaves like one deleted mid-sweep: the read throws P2025 out of
    // refreshConnection. Before the fix this aborted the whole loop and every
    // remaining restaurant was silently skipped.
    const realFindUnique = appPrisma.mercadoPagoConnection.findUnique.bind(appPrisma.mercadoPagoConnection);
    const spy = jest
      .spyOn(appPrisma.mercadoPagoConnection, 'findUnique')
      .mockImplementation((args: any) => {
        if (args?.where?.restaurantId === A.restaurantId) {
          return Promise.reject(Object.assign(new Error('An operation failed because it depends on one or more records that were required but not found.'), { code: 'P2025' }));
        }
        return realFindUnique(args);
      });

    let summary: any;
    try {
      summary = await refreshExpiringConnections();
    } finally {
      spy.mockRestore();
    }

    expect(summary.checked).toBe(2);
    expect(summary.failed).toBe(1);
    expect(summary.refreshed).toBe(1);
    // B was refreshed despite A blowing up.
    const bRaw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: B.restaurantId } });
    expect(decryptSecret(bRaw.accessToken)).toBe('APP_USR-access-2');
  });

  it('keeps a failed refresh ACTIVE and does not throw when the row disappears mid-refresh (I7)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    // The RECOVERY write fails (the claim, which writes lastRefreshError:
    // null, must still go through). It must be logged, not thrown out.
    const realUpdateMany = appPrisma.mercadoPagoConnection.updateMany.bind(appPrisma.mercadoPagoConnection);
    const spy = jest
      .spyOn(appPrisma.mercadoPagoConnection, 'updateMany')
      .mockImplementation((args: any) => {
        if (typeof args?.data?.lastRefreshError === 'string') {
          return Promise.reject(new Error('row vanished'));
        }
        return realUpdateMany(args);
      });

    try {
      await expect(refreshConnection(A.restaurantId)).resolves.toBe('failed');
    } finally {
      spy.mockRestore();
    }
  });
});
