// @ts-nocheck
/**
 * Connecting, pausing and staff-linking the 99Food store; the store toggle pauses it too (plan 2026-11-09 99food, Task 6).
 * Picking a store only records a link request: the Gastrux staff confirms it (phones do not prove who owns a store).
 */
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
import { phoneKey } from '../../../lib/ninetynine/connect';
import { prisma as appPrisma } from '../../../lib/prisma';
import { GET, POST, DELETE } from '../../../app/api/admin/integrations/99food/route';
import { GET as LINKS, POST as LINK } from '../../../app/api/admin/platform/99food-link/route';
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
// The integration row plus its 99Food-only state (ninetynine_store_states), flattened as the screens read them
const NO_STATE = { linkRequestStoreId: null, linkRequestStoreName: null, linkRequestedAt: null, linkRequestedBy: null, pausedUntil: null };
const integOf = async (rid): Promise<any> => {
  const row = await prisma.deliveryIntegration.findUnique({ where: { restaurantId_platform: { restaurantId: rid, platform: 'ninety_nine_food' } }, include: { ninetynineState: true } });
  if (!row) return row;
  const { ninetynineState: st, ...rest } = row;
  const { integrationId: _i, updatedAt: _u, ...state } = st ?? ({} as any);
  return { ...rest, ...NO_STATE, ...state };
};
const TAKEN = 'Esta loja da 99Food já está ligada a outro restaurante do Gastrux';
const tick = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => Promise<boolean>, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await check()) return true; await tick(); }
  return false;
}

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
  let a, b, c, pro, other, shops, staffUser, adminUser;
  const S = { mine: bigId(), byWhatsapp: bigId(), stranger: bigId(), unbound: bigId(), taken: bigId(), clash: bigId() };
  const staffEmail = `staff-${tag}@gastrux.test`;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    a = await setup('business', { phone: '(66) 3531-2233', whatsapp: '+55 66 99988-7766' });
    b = await setup('business', { phone: '66 3531 0000' });
    c = await setup('business');
    pro = await setup('pro', { phone: '(66) 3531-2233' });
    other = await setup('business');
    staffUser = await prisma.user.create({ data: { email: staffEmail, name: 'Equipe', password: 'x', role: 'ADMIN' } });
    // the global ADMIN role without a staff e-mail: never sees other restaurants
    adminUser = await prisma.user.create({ data: { email: `nnc-admin-${tag}@gastrux.test`, name: 'Admin', password: 'x', role: 'ADMIN' } });
    // a store already linked to another restaurant
    await prisma.deliveryIntegration.create({ data: { restaurantId: other.rid, platform: 'ninety_nine_food', apiKey: 'x', webhookSecret: 'y', storeId: S.taken, storeName: 'Tomada' } });
  }, 60000);
  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { userId: { in: [staffUser.id, adminUser.id] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [staffUser.id, adminUser.id] } } }); } catch {}
    for (const x of [a, b, c, pro, other]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.auditLog.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });
  beforeEach(() => {
    process.env.NINETYNINE_FOOD_APP_ID = '5764607523034234880';
    process.env.NINETYNINE_FOOD_APP_SECRET = 'secret';
    process.env.PLATFORM_ADMIN_EMAILS = staffEmail;
    shops = [
      [
        shop(S.mine, 'Loja do Telefone', '6635312233'), shop(S.stranger, 'Outra Loja', '1199998888'), shop(S.unbound, 'Não ligada', '6635312233', 0),
        // same last 8 digits, another area code
        shop(S.clash, 'Mesmo número, outro DDD', '1135312233'),
      ],
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

  it('without the app credentials the screen says so, pause is 409 and nothing is called', async () => {
    delete process.env.NINETYNINE_FOOD_APP_ID;
    as(a.owner);
    expect(await (await GET()).json()).toMatchObject({ configured: false, available: true, connected: false, store: null, request: null });
    expect((await POST(req('POST', { action: 'start' }))).status).toBe(409);
    const p = await POST(req('POST', { action: 'pause' }));
    expect(p.status).toBe(409);
    expect((await p.json()).error).toBe('A 99Food não está configurada neste servidor');
    expect(getAuthorizationUrl).not.toHaveBeenCalled();
    expect(setStoreStatus).not.toHaveBeenCalled();
  });

  it('start returns the 99Food authorization page', async () => {
    as(a.owner);
    const r = await POST(req('POST', { action: 'start' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ url: 'https://page.99food.com/auth?x=1' });
  });

  it('phones compare area code + number: country code dropped, ninth digit tolerated, area codes never mixed', () => {
    expect(phoneKey('+55 66 99988-7766')).toBe(phoneKey('(66) 9988-7766'));
    expect(phoneKey('5566999887766')).toBe('6699887766');
    expect(phoneKey('(66) 3531-2233')).toBe(phoneKey('066 3531 2233'));
    expect(phoneKey('1135312233')).not.toBe(phoneKey('6635312233'));
    // 55 is also an area code (RS): a 10-digit number keeps it
    expect(phoneKey('55 3222-1111')).toBe('5532221111');
    expect(phoneKey('3531-2233')).toBeNull();
    expect(phoneKey(null)).toBeNull();
  });

  it('candidates: bound stores matching the restaurant or owner phone (same area code), not linked elsewhere, every page', async () => {
    as(a.owner);
    const r = await POST(req('POST', { action: 'stores' }));
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.stores).toEqual([{ appShopId: S.mine, name: 'Loja do Telefone' }, { appShopId: S.byWhatsapp, name: 'Loja do WhatsApp' }]);
    expect((listAuthorizedShops as jest.Mock).mock.calls.map((x) => x[0])).toEqual([1, 2]);
    // b's phone matches nothing
    as(b.owner);
    expect((await (await POST(req('POST', { action: 'stores' }))).json()).stores).toEqual([]);
    // no phone at all: an empty list, the 99Food is not even asked
    (listAuthorizedShops as jest.Mock).mockClear();
    as(c.owner);
    expect((await (await POST(req('POST', { action: 'stores' }))).json()).stores).toEqual([]);
    expect(listAuthorizedShops).not.toHaveBeenCalled();
  });

  it('select outside the candidates is 400 (another area code too); a store linked elsewhere is 409 with the copy', async () => {
    as(a.owner);
    expect((await POST(req('POST', { action: 'select', appShopId: S.stranger }))).status).toBe(400);
    expect((await POST(req('POST', { action: 'select', appShopId: S.unbound }))).status).toBe(400);
    expect((await POST(req('POST', { action: 'select', appShopId: S.clash }))).status).toBe(400);
    const dup = await POST(req('POST', { action: 'select', appShopId: S.taken }));
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe(TAKEN);
    expect(await integOf(a.rid)).toBeNull();
  });

  it('select only records a link request (no storeId, no token) and rings the Gastrux staff, not the global ADMIN', async () => {
    as(a.owner);
    const r = await POST(req('POST', { action: 'select', appShopId: S.mine }));
    expect(r.status).toBe(200);
    expect((await r.json()).request).toMatchObject({ appShopId: S.mine, name: 'Loja do Telefone' });
    const row = await integOf(a.rid);
    expect(row).toMatchObject({ storeId: null, linkRequestStoreId: S.mine, linkRequestStoreName: 'Loja do Telefone', linkRequestedBy: a.owner.id });
    expect(row.linkRequestedAt).toBeInstanceOf(Date);
    expect(tokenFor).not.toHaveBeenCalled();
    const restaurant = await prisma.restaurant.findUnique({ where: { id: a.rid } });
    const rung = await prisma.notification.findMany({ where: { userId: staffUser.id, title: 'Pedido para ligar loja da 99Food' } });
    expect(rung).toHaveLength(1);
    expect(rung[0].message).toContain(restaurant.name);
    expect(rung[0].message).toContain('Loja do Telefone');
    expect(rung[0].message).toContain(S.mine);
    expect(rung[0].actionUrl).toBe('/admin/platform/99food');
    expect(await prisma.notification.count({ where: { userId: adminUser.id } })).toBe(0);
    expect(await (await GET()).json()).toMatchObject({ connected: false, store: null, request: { appShopId: S.mine, name: 'Loja do Telefone' } });
    expect(await prisma.auditLog.count({ where: { restaurantId: a.rid, entityId: row.id } })).toBeGreaterThan(0);
  });

  it('the restaurant can cancel its request', async () => {
    as(a.owner);
    expect((await POST(req('POST', { action: 'cancel' }))).status).toBe(200);
    expect(await integOf(a.rid)).toMatchObject({ storeId: null, linkRequestStoreId: null, linkRequestedAt: null, linkRequestedBy: null });
    expect((await (await GET()).json()).request).toBeNull();
  });

  it('staff routes refuse a restaurant owner and a non-staff global ADMIN', async () => {
    for (const u of [b.owner, { id: adminUser.id, email: adminUser.email, role: 'ADMIN' }]) {
      as(u);
      expect((await LINKS()).status).toBe(401);
      expect((await LINK(req('POST', { restaurantId: b.rid, appShopId: S.stranger }))).status).toBe(401);
      expect((await LINK(req('POST', { action: 'refuse', restaurantId: a.rid }))).status).toBe(401);
    }
    expect((await integOf(b.rid))?.storeId ?? null).toBeNull();
  });

  it('staff: lists the request; refusing clears it and tells the restaurant', async () => {
    as(a.owner);
    await POST(req('POST', { action: 'select', appShopId: S.mine }));
    as({ id: staffUser.id, email: staffEmail, role: 'ADMIN' });
    const list = await (await LINKS()).json();
    expect(list.requests.find((x) => x.restaurantId === a.rid)).toMatchObject({ appShopId: S.mine, storeName: 'Loja do Telefone', requestedBy: { email: a.owner.email } });
    expect((await LINK(req('POST', { action: 'refuse', restaurantId: a.rid }))).status).toBe(200);
    expect(await integOf(a.rid)).toMatchObject({ storeId: null, linkRequestStoreId: null });
    expect(await prisma.notification.count({ where: { restaurantId: a.rid, title: 'A equipe Gastrux não confirmou a loja da 99Food: fale com o suporte' } })).toBe(1);
    expect((await LINK(req('POST', { action: 'refuse', restaurantId: a.rid }))).status).toBe(404);
  });

  it('staff confirm: a token the 99Food refuses keeps the request and links nothing (502)', async () => {
    as(a.owner);
    await POST(req('POST', { action: 'select', appShopId: S.mine }));
    (tokenFor as jest.Mock).mockRejectedValue(new NinetynineError('99Food recusou', 10100));
    as({ id: staffUser.id, email: staffEmail, role: 'ADMIN' });
    const r = await LINK(req('POST', { restaurantId: a.rid, appShopId: S.mine }));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toBe('A 99Food não liberou o acesso a esta loja: tente de novo em 1 minuto');
    expect(await integOf(a.rid)).toMatchObject({ storeId: null, linkRequestStoreId: S.mine });
  });

  it('staff confirm links the store, fetches a fresh token and clears the request; GET shows it', async () => {
    as({ id: staffUser.id, email: staffEmail, role: 'ADMIN' });
    const r = await LINK(req('POST', { restaurantId: a.rid, appShopId: S.mine }));
    expect(r.status).toBe(200);
    expect((await r.json()).store).toEqual({ appShopId: S.mine, name: 'Loja do Telefone' });
    const row = await integOf(a.rid);
    expect(row).toMatchObject({ storeId: S.mine, storeName: 'Loja do Telefone', isActive: true, linkRequestStoreId: null, linkRequestedBy: null });
    expect(tokenFor).toHaveBeenCalledWith(row.id, true);
    as(a.owner);
    expect(await (await GET()).json()).toMatchObject({ configured: true, available: true, connected: true, paused: false, request: null, store: { appShopId: S.mine, name: 'Loja do Telefone' } });
    // linked: another request is refused, and the store is no longer a candidate for anyone
    expect((await POST(req('POST', { action: 'select', appShopId: S.byWhatsapp }))).status).toBe(409);
    as(b.owner);
    shops[0][0].shop_phone[0].phone = '6635310000';
    expect((await (await POST(req('POST', { action: 'stores' }))).json()).stores).toEqual([]);
  });

  it('pause tells the 99Food and keeps the link on (orders still come in) until the end of the day; resume clears it', async () => {
    as(a.owner);
    const id = (await integOf(a.rid)).id;
    expect((await POST(req('POST', { action: 'pause' }))).status).toBe(200);
    expect(setStoreStatus).toHaveBeenCalledWith(id, 'pause');
    let row = await integOf(a.rid);
    expect(row.isActive).toBe(true);
    expect(row.pausedUntil.getTime()).toBeGreaterThan(Date.now());
    expect(row.pausedUntil.getTime()).toBeLessThanOrEqual(Date.now() + 24 * 3600_000);
    expect((await (await GET()).json()).paused).toBe(true);
    expect((await POST(req('POST', { action: 'resume' }))).status).toBe(200);
    expect(setStoreStatus).toHaveBeenLastCalledWith(id, 'online');
    row = await integOf(a.rid);
    expect(row).toMatchObject({ isActive: true, pausedUntil: null });
    expect((await (await GET()).json()).paused).toBe(false);
    // paused on the 99Food itself (shopStatus sub_biz_status 2)
    await prisma.deliveryIntegration.update({ where: { id }, data: { syncStatus: 'PARTIAL', syncError: 'Loja pausada na 99Food' } });
    expect((await (await GET()).json()).paused).toBe(true);
    await prisma.deliveryIntegration.update({ where: { id }, data: { syncStatus: 'SUCCESS', syncError: null } });
    // a pause that ended yesterday is not a pause
    await prisma.ninetynineStoreState.update({ where: { integrationId: id }, data: { pausedUntil: new Date(Date.now() - 60_000) } });
    expect((await (await GET()).json()).paused).toBe(false);
    await prisma.ninetynineStoreState.update({ where: { integrationId: id }, data: { pausedUntil: null } });
    (setStoreStatus as jest.Mock).mockRejectedValue(new NinetynineError('x', 500));
    expect((await POST(req('POST', { action: 'pause' }))).status).toBe(502);
    expect(await integOf(a.rid)).toMatchObject({ isActive: true, pausedUntil: null });
  });

  it('the store toggle tells the 99Food in the background, after the Gastrux state is saved', async () => {
    const id = (await integOf(a.rid)).id;
    const closed = await setStoreClosed(a.member, true);
    expect(closed).toMatchObject({ closed: true, ninetynine: 'pending' });
    expect(await until(async () => (setStoreStatus as jest.Mock).mock.calls.length > 0)).toBe(true);
    expect(setStoreStatus).toHaveBeenCalledWith(id, 'pause');
    // the link stays on: the orders already taken keep coming
    expect((await integOf(a.rid)).isActive).toBe(true);
    const opened = await setStoreClosed(a.member, false);
    expect(opened).toMatchObject({ closed: false, ninetynine: 'pending' });
    expect(await until(async () => (setStoreStatus as jest.Mock).mock.calls.length > 1)).toBe(true);
    expect(setStoreStatus).toHaveBeenLastCalledWith(id, 'online');

    // a failure never blocks the toggle; it goes to the sino
    (setStoreStatus as jest.Mock).mockRejectedValue(new NinetynineError('x', -1));
    expect(await setStoreClosed(a.member, true)).toMatchObject({ closed: true, ninetynine: 'pending' });
    expect((await prisma.restaurant.findUnique({ where: { id: a.rid } })).ordersClosedAt).not.toBeNull();
    expect(await until(async () => (await prisma.notification.count({ where: { restaurantId: a.rid, title: 'A 99Food não recebeu a pausa da loja' } })) === 1)).toBe(true);
    (setStoreStatus as jest.Mock).mockResolvedValue({});
    await setStoreClosed(a.member, false);
    await tick();

    // a 99Food that never answers: the toggle still answers at once
    (setStoreStatus as jest.Mock).mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const slow = await Promise.race([setStoreClosed(a.member, true), tick(2000).then(() => 'timeout')]);
    expect(slow).toMatchObject({ closed: true, ninetynine: 'pending' });
    expect(Date.now() - started).toBeLessThan(2000);
    (setStoreStatus as jest.Mock).mockResolvedValue({});
    await setStoreClosed(a.member, false);
    await tick();
  });

  it('a 99Food store paused by hand is not touched by the store toggle', async () => {
    as(a.owner);
    await POST(req('POST', { action: 'pause' }));
    (setStoreStatus as jest.Mock).mockClear();
    expect(await setStoreClosed(a.member, true)).toMatchObject({ ninetynine: null });
    expect(await setStoreClosed(a.member, false)).toMatchObject({ ninetynine: null });
    await tick();
    expect(setStoreStatus).not.toHaveBeenCalled();
    await POST(req('POST', { action: 'resume' }));
  });

  it('the store toggle never fails after the Gastrux state is saved, even when reading the 99Food link fails', async () => {
    const real = appPrisma.deliveryIntegration.findUnique.bind(appPrisma.deliveryIntegration);
    const spy = jest.spyOn(appPrisma.deliveryIntegration, 'findUnique').mockImplementation(((args: any) =>
      args?.where?.restaurantId_platform?.platform === 'ninety_nine_food' ? Promise.reject(new Error('db down')) : real(args)) as any);
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await setStoreClosed(a.member, true)).toMatchObject({ closed: true, ninetynine: null });
      expect((await prisma.restaurant.findUnique({ where: { id: a.rid } })).ordersClosedAt).not.toBeNull();
    } finally {
      spy.mockRestore();
      quiet.mockRestore();
    }
    await setStoreClosed(a.member, false);
    await tick();
    (setStoreStatus as jest.Mock).mockClear();
  });

  it('disconnect clears the store and the token', async () => {
    as(a.owner);
    expect((await DELETE()).status).toBe(200);
    expect(await integOf(a.rid)).toMatchObject({ isActive: false, storeId: null, storeName: null, oauthAccessToken: null, oauthExpiresAt: null, pausedUntil: null });
    expect((await (await GET()).json()).connected).toBe(false);
  });

  it('staff link without a request: any phone; refuses a store linked elsewhere or unknown', async () => {
    as({ id: staffUser.id, email: staffEmail, role: 'ADMIN' });
    expect((await LINK(req('POST', { restaurantId: b.rid, appShopId: S.taken }))).status).toBe(409);
    expect((await LINK(req('POST', { restaurantId: b.rid, appShopId: '999' }))).status).toBe(400);
    const ok = await LINK(req('POST', { restaurantId: b.rid, appShopId: S.stranger }));
    expect(ok.status).toBe(200);
    expect(await integOf(b.rid)).toMatchObject({ storeId: S.stranger, storeName: 'Outra Loja', isActive: true });
  });

  it('a link racing another restaurant for the same store gets the 409 copy (unique store, P2002)', async () => {
    as({ id: staffUser.id, email: staffEmail, role: 'ADMIN' });
    // the check passes as if nobody had the store yet; the unique index catches it
    const spy = jest.spyOn(appPrisma.deliveryIntegration, 'findFirst').mockResolvedValueOnce(null);
    try {
      const r = await LINK(req('POST', { restaurantId: c.rid, appShopId: S.taken }));
      expect(spy).toHaveBeenCalled();
      expect(r.status).toBe(409);
      expect((await r.json()).error).toBe(TAKEN);
    } finally {
      spy.mockRestore();
    }
    expect((await integOf(c.rid))?.storeId ?? null).toBeNull();
    expect((await integOf(other.rid)).storeId).toBe(S.taken);
  });
});
