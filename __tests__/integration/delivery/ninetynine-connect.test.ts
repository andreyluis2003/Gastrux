// @ts-nocheck
/** Connecting, pausing and staff-linking the 99Food store; the store toggle pauses it too (plan 2026-11-09 99food, Task 6) */
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/ninetynine/client', () => ({
  ...jest.requireActual('../../../lib/ninetynine/client'),
  getAuthorizationUrl: jest.fn(),
  listAuthorizedShops: jest.fn(),
  tokenFor: jest.fn(),
  setStoreStatus: jest.fn(),
}));

import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { getAuthorizationUrl, listAuthorizedShops, setStoreStatus, tokenFor, NinetynineError } from '../../../lib/ninetynine/client';
import { GET, POST, DELETE } from '../../../app/api/admin/integrations/99food/route';
import { POST as LINK } from '../../../app/api/admin/platform/99food-link/route';
import { setStoreClosed } from '../../../lib/orders/store-open';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const bigId = () => `57646${String(Date.now()).slice(-8)}${String(100000 + seq++).slice(-6)}`;
const as = (u) => {
  const s = u ? { user: u, expires: '2099-01-01' } : null;
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method, body?) => new NextRequest('http://x', { method, body: body ? JSON.stringify(body) : undefined });
const integOf = (rid) => prisma.deliveryIntegration.findUnique({ where: { restaurantId_platform: { restaurantId: rid, platform: 'ninety_nine_food' } } });

async function setup(tier, phones: { phone?: string; whatsapp?: string } = {}) {
  const o = await prisma.user.create({ data: { email: `nnc-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', whatsapp: phones.whatsapp ?? null } });
  const rid = (await prisma.restaurant.create({ data: { name: `Nnc ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active', isInternal: false, phone: phones.phone ?? null } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const c = await prisma.user.create({ data: { email: `nnc-c-${seq++}-${tag}@gastrux.test`, name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
  return {
    rid,
    owner: { id: o.id, email: o.email, role: 'OWNER' },
    cashier: { id: c.id, email: c.email, role: 'CASHIER' },
    member: { userId: o.id, restaurantId: rid, role: 'OWNER' },
    userIds: [o.id, c.id],
  };
}

const shop = (id, name, phone, bound = 1) => ({
  shop_id: `1${id}`, shop_name: name, app_shop_id: id, bound_flag: bound,
  shop_phone: [{ type: 1, phone, callingCode: '55' }],
});

describe('99Food connection', () => {
  let a, b, pro, other, shops;
  const S = { mine: bigId(), byWhatsapp: bigId(), stranger: bigId(), unbound: bigId(), taken: bigId(), page2: bigId() };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    a = await setup('business', { phone: '(66) 3531-2233', whatsapp: '+55 66 99988-7766' });
    b = await setup('business', { phone: '66 3531 0000' });
    pro = await setup('pro', { phone: '(66) 3531-2233' });
    other = await setup('business');
    // a store already linked to another restaurant
    await prisma.deliveryIntegration.create({ data: { restaurantId: other.rid, platform: 'ninety_nine_food', apiKey: 'x', webhookSecret: 'y', storeId: S.taken, storeName: 'Tomada' } });
  }, 60000);
  afterAll(async () => {
    for (const x of [a, b, pro, other]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });
  beforeEach(() => {
    process.env.NINETYNINE_FOOD_APP_ID = '5764607523034234880';
    process.env.NINETYNINE_FOOD_APP_SECRET = 'secret';
    process.env.PLATFORM_ADMIN_EMAILS = `staff-${tag}@gastrux.test`;
    shops = [
      [shop(S.mine, 'Loja do Telefone', '6635312233'), shop(S.stranger, 'Outra Loja', '1199998888'), shop(S.unbound, 'Não ligada', '6635312233', 0)],
      [shop(S.byWhatsapp, 'Loja do WhatsApp', '66999887766'), shop(S.taken, 'Tomada', '6635312233')],
    ];
    (getAuthorizationUrl as jest.Mock).mockReset().mockResolvedValue('https://page.99food.com/auth?x=1');
    (listAuthorizedShops as jest.Mock).mockReset().mockImplementation(async (page) => ({ total_page: shops.length, page_no: page, shops: shops[page - 1] ?? [] }));
    (tokenFor as jest.Mock).mockReset().mockResolvedValue('tok');
    (setStoreStatus as jest.Mock).mockReset().mockResolvedValue({ requestId: 'r1' });
  });

  it('a cashier gets 403; a Pro restaurant gets 403 with upgradeUrl', async () => {
    as(a.cashier);
    expect((await GET()).status).toBe(403);
    as(pro.owner);
    const r = await POST(req('POST', { action: 'start' }));
    expect(r.status).toBe(403);
    expect((await r.json()).upgradeUrl).toBe('/pricing');
    expect((await POST(req('POST', { action: 'stores' }))).status).toBe(403);
  });

  it('without the app credentials the screen says so and nothing is called', async () => {
    delete process.env.NINETYNINE_FOOD_APP_ID;
    as(a.owner);
    expect(await (await GET()).json()).toMatchObject({ configured: false, available: true, connected: false, store: null });
    expect((await POST(req('POST', { action: 'start' }))).status).toBe(409);
    expect(getAuthorizationUrl).not.toHaveBeenCalled();
  });

  it('start returns the 99Food authorization page', async () => {
    as(a.owner);
    const r = await POST(req('POST', { action: 'start' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: 'https://page.99food.com/auth?x=1' });
  });

  it('candidates: bound stores whose phone matches the restaurant or the owner, not linked elsewhere, every page', async () => {
    as(a.owner);
    const r = await POST(req('POST', { action: 'stores' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.stores).toEqual([{ appShopId: S.mine, name: 'Loja do Telefone' }, { appShopId: S.byWhatsapp, name: 'Loja do WhatsApp' }]);
    expect((listAuthorizedShops as jest.Mock).mock.calls.map((c) => c[0])).toEqual([1, 2]);
    // b's phone matches nothing
    as(b.owner);
    expect((await (await POST(req('POST', { action: 'stores' }))).json()).stores).toEqual([]);
  });

  it('select outside the candidates is 400; a store linked elsewhere is 409 with the copy', async () => {
    as(a.owner);
    expect((await POST(req('POST', { action: 'select', appShopId: S.stranger }))).status).toBe(400);
    expect((await POST(req('POST', { action: 'select', appShopId: S.unbound }))).status).toBe(400);
    const dup = await POST(req('POST', { action: 'select', appShopId: S.taken }));
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('Esta loja da 99Food já está ligada a outro restaurante do Gastrux');
    expect(await integOf(a.rid)).toBeNull();
  });

  it('a token the 99Food refuses leaves the store unlinked (502)', async () => {
    (tokenFor as jest.Mock).mockRejectedValue(new NinetynineError('99Food recusou', 10100));
    as(a.owner);
    const r = await POST(req('POST', { action: 'select', appShopId: S.mine }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('A 99Food não liberou o acesso a esta loja: tente de novo em 1 minuto');
    expect((await integOf(a.rid))?.storeId ?? null).toBeNull();
  });

  it('select links the store, fetches a fresh token and audits; GET shows it', async () => {
    as(a.owner);
    const r = await POST(req('POST', { action: 'select', appShopId: S.mine }));
    expect(r.status).toBe(200);
    expect((await r.json()).store).toEqual({ appShopId: S.mine, name: 'Loja do Telefone' });
    const row = await integOf(a.rid);
    expect(row).toMatchObject({ storeId: S.mine, storeName: 'Loja do Telefone', isActive: true });
    expect(tokenFor).toHaveBeenCalledWith(row.id, true);
    expect(await prisma.auditLog.count({ where: { restaurantId: a.rid, entityId: row.id } })).toBeGreaterThan(0);
    const state = await (await GET()).json();
    expect(state).toMatchObject({ configured: true, available: true, connected: true, paused: false, store: { appShopId: S.mine, name: 'Loja do Telefone' } });
    // now linked: no longer a candidate for anyone
    as(b.owner);
    shops[0][0].shop_phone[0].phone = '6635310000';
    expect((await (await POST(req('POST', { action: 'stores' }))).json()).stores).toEqual([]);
  });

  it('pause calls setStoreStatus pause and turns the link off; resume brings it back; a refused pause changes nothing', async () => {
    as(a.owner);
    const id = (await integOf(a.rid)).id;
    expect((await POST(req('POST', { action: 'pause' }))).status).toBe(200);
    expect(setStoreStatus).toHaveBeenCalledWith(id, 'pause');
    expect((await integOf(a.rid)).isActive).toBe(false);
    expect((await (await GET()).json()).paused).toBe(true);
    expect((await POST(req('POST', { action: 'resume' }))).status).toBe(200);
    expect(setStoreStatus).toHaveBeenLastCalledWith(id, 'online');
    expect((await integOf(a.rid)).isActive).toBe(true);
    (setStoreStatus as jest.Mock).mockRejectedValue(new NinetynineError('x', 500));
    expect((await POST(req('POST', { action: 'pause' }))).status).toBe(502);
    expect((await integOf(a.rid)).isActive).toBe(true);
  });

  it('closing the store pauses the 99Food store and opening resumes it; a 99Food failure does not block the toggle', async () => {
    const id = (await integOf(a.rid)).id;
    const closed = await setStoreClosed(a.member, true);
    expect(closed).toMatchObject({ closed: true, ninetynine: 'paused' });
    expect(setStoreStatus).toHaveBeenCalledWith(id, 'pause');
    // the link stays on: the orders already taken keep coming
    expect((await integOf(a.rid)).isActive).toBe(true);
    const opened = await setStoreClosed(a.member, false);
    expect(opened).toMatchObject({ closed: false, ninetynine: 'resumed' });
    expect(setStoreStatus).toHaveBeenLastCalledWith(id, 'online');

    (setStoreStatus as jest.Mock).mockRejectedValue(new NinetynineError('x', -1));
    const failed = await setStoreClosed(a.member, true);
    expect(failed).toMatchObject({ closed: true, ninetynine: 'failed' });
    expect((await prisma.restaurant.findUnique({ where: { id: a.rid } })).ordersClosedAt).not.toBeNull();
    expect(await prisma.notification.count({ where: { restaurantId: a.rid, title: 'A 99Food não recebeu a pausa da loja' } })).toBe(1);
    (setStoreStatus as jest.Mock).mockResolvedValue({});
    await setStoreClosed(a.member, false);
  });

  it('a 99Food store paused by hand is not touched by the store toggle', async () => {
    as(a.owner);
    await POST(req('POST', { action: 'pause' }));
    (setStoreStatus as jest.Mock).mockClear();
    expect(await setStoreClosed(a.member, true)).toMatchObject({ ninetynine: null });
    expect(await setStoreClosed(a.member, false)).toMatchObject({ ninetynine: null });
    expect(setStoreStatus).not.toHaveBeenCalled();
    await POST(req('POST', { action: 'resume' }));
  });

  it('disconnect clears the store and the token', async () => {
    as(a.owner);
    expect((await DELETE()).status).toBe(200);
    expect(await integOf(a.rid)).toMatchObject({ isActive: false, storeId: null, storeName: null, oauthAccessToken: null, oauthExpiresAt: null });
    expect((await (await GET()).json()).connected).toBe(false);
  });

  it('staff link: platform staff only; any phone; refuses a store linked elsewhere', async () => {
    as(b.owner);
    expect((await LINK(req('POST', { restaurantId: b.rid, appShopId: S.stranger }))).status).toBe(401);
    as({ id: 'staff', email: `staff-${tag}@gastrux.test`, role: 'ADMIN' });
    expect((await LINK(req('POST', { restaurantId: b.rid, appShopId: S.taken }))).status).toBe(409);
    expect((await LINK(req('POST', { restaurantId: b.rid, appShopId: '999' }))).status).toBe(400);
    const ok = await LINK(req('POST', { restaurantId: b.rid, appShopId: S.stranger }));
    expect(ok.status).toBe(200);
    expect(await integOf(b.rid)).toMatchObject({ storeId: S.stranger, storeName: 'Outra Loja', isActive: true });
  });
});
