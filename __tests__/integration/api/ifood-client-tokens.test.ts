// @ts-nocheck
/** iFood client, distributed app: the store's token (plan 2026-10-24 ifood, Task 2) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ifoodTransport, getOrder, exchangeAuthorizationCode } from '../../../lib/ifood/client';
import { encryptSecret, decryptSecret } from '../../../lib/security/credential-crypto';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('iFood client (distributed)', () => {
  let rid, ownerId, calls, answer;
  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    const owner = await prisma.user.create({ data: { email: `ifc-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    ownerId = owner.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ifc ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
  });
  afterAll(async () => {
    await prisma.restaurant.delete({ where: { id: rid } }).catch(() => {});
    await prisma.user.delete({ where: { id: ownerId } }).catch(() => {});
  });
  beforeEach(() => {
    process.env.IFOOD_APP_MODE = 'distributed';
    process.env.IFOOD_CLIENT_ID = 'cid';
    process.env.IFOOD_CLIENT_SECRET = 'sec';
    calls = [];
    jest.spyOn(ifoodTransport, 'request').mockImplementation(async (r) => { calls.push(r); return answer(r); });
  });
  afterEach(() => jest.restoreAllMocks());
  const isToken = (r) => r.path.startsWith('/authentication/v1.0/oauth/token');

  it('refreshes only when expired and stores it encrypted', async () => {
    const integ = await prisma.deliveryIntegration.create({
      data: { restaurantId: rid, platform: 'ifood', apiKey: 'x', webhookSecret: 'y', storeId: 'm1',
        oauthAccessToken: encryptSecret('old'), oauthRefreshToken: encryptSecret('r1'), oauthExpiresAt: new Date(Date.now() + 3600_000) },
    });
    answer = (r) => (isToken(r) ? { status: 200, text: JSON.stringify({ accessToken: 'new', refreshToken: 'r2', expiresIn: 21600 }) } : { status: 200, text: '{"id":"o"}' });
    await getOrder(integ, 'o');
    expect(calls.filter(isToken)).toHaveLength(0);
    expect(calls[0].headers.Authorization).toBe('Bearer old');

    await prisma.deliveryIntegration.update({ where: { id: integ.id }, data: { oauthExpiresAt: new Date(Date.now() - 1000) } });
    calls = [];
    await getOrder(integ, 'o');
    const t = calls.filter(isToken);
    expect(t).toHaveLength(1);
    const body = new URLSearchParams(t[0].body);
    expect(body.get('grantType')).toBe('refresh_token');
    expect(body.get('refreshToken')).toBe('r1');
    expect(calls[1].headers.Authorization).toBe('Bearer new');
    const row = await prisma.deliveryIntegration.findUnique({ where: { id: integ.id } });
    expect(row.oauthAccessToken).not.toBe('new');
    expect(decryptSecret(row.oauthAccessToken)).toBe('new');
    expect(decryptSecret(row.oauthRefreshToken)).toBe('r2');
    expect(row.oauthExpiresAt.getTime()).toBeGreaterThan(Date.now() + 21000_000);
  });

  it('the authorization code uses the stored verifier', async () => {
    const integ = await prisma.deliveryIntegration.upsert({
      where: { restaurantId_platform: { restaurantId: rid, platform: 'ifood' } },
      update: { oauthVerifier: encryptSecret('ver1') },
      create: { restaurantId: rid, platform: 'ifood', apiKey: 'x', webhookSecret: 'y', oauthVerifier: encryptSecret('ver1') },
    });
    answer = () => ({ status: 200, text: JSON.stringify({ accessToken: 'a', refreshToken: 'r', expiresIn: 21600 }) });
    await exchangeAuthorizationCode(integ.id, 'AUTH-1');
    const body = new URLSearchParams(calls[0].body);
    expect(body.get('grantType')).toBe('authorization_code');
    expect(body.get('authorizationCode')).toBe('AUTH-1');
    expect(body.get('authorizationCodeVerifier')).toBe('ver1');
    const row = await prisma.deliveryIntegration.findUnique({ where: { id: integ.id } });
    expect(decryptSecret(row.oauthAccessToken)).toBe('a');
    expect(row.oauthVerifier).toBeNull();
  });
});
