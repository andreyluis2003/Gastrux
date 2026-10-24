// @ts-nocheck
/** Connecting, pausing and disconnecting the iFood store (plan 2026-10-24 ifood, Task 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET, POST, DELETE } from '../../../app/api/admin/integrations/ifood/route';
import { POST as LINK } from '../../../app/api/admin/platform/ifood-link/route';
import { ifoodTransport, resetIfoodTokenCache } from '../../../lib/ifood/client';
import { pollIfoodOnce } from '../../../lib/ifood/events';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const as = (u) => {
  const s = u ? { user: u, expires: '2099-01-01' } : null;
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method, body?) => new NextRequest('http://x', { method, body: body ? JSON.stringify(body) : undefined });

async function setup(tier) {
  const o = await prisma.user.create({ data: { email: `ifk-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Ifk ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active', isInternal: false } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const c = await prisma.user.create({ data: { email: `ifk-c-${seq++}-${tag}@gastrux.test`, name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
  return { rid, owner: { id: o.id, email: o.email, role: 'OWNER' }, cashier: { id: c.id, email: c.email, role: 'CASHIER' }, userIds: [o.id, c.id] };
}

describe('iFood connection', () => {
  let a, b, pro, calls, merchants;
  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    a = await setup('business'); b = await setup('business'); pro = await setup('pro');
  }, 60000);
  afterAll(async () => {
    for (const x of [a, b, pro]) {
      try { await prisma.auditLog.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });
  beforeEach(() => {
    process.env.IFOOD_APP_MODE = 'distributed';
    process.env.IFOOD_CLIENT_ID = 'cid';
    process.env.IFOOD_CLIENT_SECRET = 'sec';
    process.env.PLATFORM_ADMIN_EMAILS = `staff-${tag}@gastrux.test`;
    resetIfoodTokenCache();
    calls = [];
    merchants = [{ id: `m-${tag}-1`, name: 'Loja Centro' }];
    jest.spyOn(ifoodTransport, 'request').mockImplementation(async (r) => {
      calls.push(r);
      if (r.path === '/authentication/v1.0/oauth/userCode') return { status: 200, text: JSON.stringify({ userCode: 'ABCD-EFGH', authorizationCodeVerifier: 'verif', verificationUrlComplete: 'https://portal.ifood.com.br/apps/code?c=ABCD-EFGH', expiresIn: 600 }) };
      if (r.path === '/authentication/v1.0/oauth/token') return { status: 200, text: JSON.stringify({ accessToken: `tok-${seq++}`, refreshToken: 'ref', expiresIn: 21600 }) };
      if (r.path === '/merchant/v1.0/merchants') return { status: 200, text: JSON.stringify(merchants) };
      if (r.path === '/events/v1.0/events:polling') return { status: 204, text: '' };
      return { status: 404, text: '' };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('a cashier gets 403; a Pro restaurant gets 403 with upgradeUrl', async () => {
    as(a.cashier);
    expect((await GET()).status).toBe(403);
    as(pro.owner);
    const r = await POST(req('POST', { action: 'start' }));
    expect(r.status).toBe(403);
    expect((await r.json()).upgradeUrl).toBe('/pricing');
  });

  it('start -> finish with one merchant links it; GET never returns tokens', async () => {
    as(a.owner);
    const start = await POST(req('POST', { action: 'start' }));
    expect(start.status).toBe(200);
    expect(await start.json()).toEqual({ userCode: 'ABCD-EFGH', verificationUrlComplete: 'https://portal.ifood.com.br/apps/code?c=ABCD-EFGH', expiresIn: 600 });
    const fin = await POST(req('POST', { action: 'finish', authorizationCode: 'AUTH-XYZ' }));
    expect(fin.status).toBe(200);
    expect((await fin.json()).merchant).toEqual({ id: `m-${tag}-1`, name: 'Loja Centro' });
    const body = new URLSearchParams(calls.find((c) => c.path.endsWith('/token')).body);
    expect(body.get('authorizationCodeVerifier')).toBe('verif');
    const state = await (await GET()).json();
    expect(state).toMatchObject({ mode: 'distributed', connected: true, paused: false, merchant: { id: `m-${tag}-1`, name: 'Loja Centro' } });
    const raw = JSON.stringify(state);
    expect(raw).not.toMatch(/tok-|ref|verif/);
  });

  it('a merchant already linked to another restaurant is refused; select picks one of several', async () => {
    as(b.owner);
    await POST(req('POST', { action: 'start' }));
    const fin = await POST(req('POST', { action: 'finish', authorizationCode: 'AUTH-2' }));
    expect(fin.status).toBe(409);
    merchants = [{ id: `m-${tag}-1`, name: 'Loja Centro' }, { id: `m-${tag}-2`, name: 'Loja Bairro' }];
    expect((await POST(req('POST', { action: 'select', merchantId: `m-${tag}-1` }))).status).toBe(409);
    expect((await POST(req('POST', { action: 'select', merchantId: 'm-nope' }))).status).toBe(400);
    const ok = await POST(req('POST', { action: 'select', merchantId: `m-${tag}-2` }));
    expect(ok.status).toBe(200);
    expect((await (await GET()).json()).merchant).toEqual({ id: `m-${tag}-2`, name: 'Loja Bairro' });
  });

  it('pause stops polling; resume and disconnect', async () => {
    as(a.owner);
    await POST(req('POST', { action: 'pause' }));
    calls = [];
    await pollIfoodOnce();
    expect(calls.filter((c) => c.path === '/events/v1.0/events:polling' && c.headers['x-polling-merchants'] === `m-${tag}-1`)).toHaveLength(0);
    await POST(req('POST', { action: 'resume' }));
    calls = [];
    await pollIfoodOnce();
    expect(calls.filter((c) => c.headers['x-polling-merchants'] === `m-${tag}-1`)).toHaveLength(1);
    expect((await DELETE()).status).toBe(200);
    const row = await prisma.deliveryIntegration.findUnique({ where: { restaurantId_platform: { restaurantId: a.rid, platform: 'ifood' } } });
    expect(row).toMatchObject({ isActive: false, storeId: null, oauthAccessToken: null, oauthRefreshToken: null });
  });

  it('test mode: start answers 409; the link needs Gastrux staff', async () => {
    process.env.IFOOD_APP_MODE = 'centralized';
    as(a.owner);
    expect((await POST(req('POST', { action: 'start' }))).status).toBe(409);
    merchants = [{ id: `m-${tag}-test`, name: 'Teste - HELP FLOW LTDA' }];
    as({ id: a.owner.id, email: a.owner.email, role: 'ADMIN' });
    expect((await LINK(req('POST', { restaurantId: a.rid, merchantId: `m-${tag}-test` }))).status).toBe(401);
    as({ id: 'staff', email: `staff-${tag}@gastrux.test`, role: 'ADMIN' });
    expect((await LINK(req('POST', { restaurantId: a.rid, merchantId: 'm-unknown' }))).status).toBe(400);
    const ok = await LINK(req('POST', { restaurantId: a.rid, merchantId: `m-${tag}-test` }));
    expect(ok.status).toBe(200);
    const row = await prisma.deliveryIntegration.findUnique({ where: { restaurantId_platform: { restaurantId: a.rid, platform: 'ifood' } } });
    expect(row).toMatchObject({ isActive: true, storeId: `m-${tag}-test`, storeName: 'Teste - HELP FLOW LTDA' });
    // another restaurant cannot take the same store
    expect((await LINK(req('POST', { restaurantId: b.rid, merchantId: `m-${tag}-test` }))).status).toBe(409);
  });
});
