// @ts-nocheck
/** Status changes made in Gastrux go back to iFood (plan 2026-10-24 ifood, Task 4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { ifoodTransport, resetIfoodTokenCache } from '../../../lib/ifood/client';
import { mapIfoodOrder } from '../../../lib/ifood/order-map';
import { ingestDeliveryOrder, rejectDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { cancelPlatformOrder } from '../../../lib/delivery-orders/platform-sync';
import { changeOrderStatus } from '../../../lib/kds/order-status';
import { DELETE as KDS_CANCEL } from '../../../app/api/kds/orders/[id]/route';
import { ownDelivery, ifoodDelivery, takeoutCash } from '../../unit/fixtures/ifood-order';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};

describe('pushPlatformStatus (iFood)', () => {
  const made = [];
  let calls, fail;
  async function restaurant(autoAccept = true) {
    const owner = await prisma.user.create({ data: { email: `ifs-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    const r = await prisma.restaurant.create({ data: { name: `Ifs ${seq++} ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false, deliveryAutoAccept: autoAccept } });
    await prisma.user.update({ where: { id: owner.id }, data: { currentRestaurantId: r.id } });
    const integ = await prisma.deliveryIntegration.create({ data: { restaurantId: r.id, platform: 'ifood', apiKey: 'x', webhookSecret: 'y', storeId: `m-${tag}-${seq++}` } });
    for (const name of ['Espeto de frango', 'Refrigerante lata']) {
      await prisma.recipe.create({ data: { restaurantId: r.id, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    }
    made.push({ rid: r.id, ownerId: owner.id });
    return { rid: r.id, integ, owner: { id: owner.id, email: owner.email, role: 'OWNER' } };
  }
  async function ingest(r, fixture) {
    const m = mapIfoodOrder(fixture);
    m.input.codigo = `${m.input.codigo}-${seq++}`;
    return ingestDeliveryOrder({ restaurantId: r.rid, integrationId: r.integ.id, platform: 'ifood', input: m.input, extraNote: m.extraNote, platformData: m.platformData, externalCustomerId: m.externalCustomerId });
  }
  const actions = () => calls.filter((c) => c.path.startsWith('/order/')).map((c) => `${c.method} ${c.path.replace(/orders\/[^/]+/, 'orders/:id')}`);

  beforeEach(() => {
    process.env.IFOOD_APP_MODE = 'centralized';
    process.env.IFOOD_CLIENT_ID = 'cid';
    process.env.IFOOD_CLIENT_SECRET = 'sec';
    resetIfoodTokenCache();
    calls = [];
    fail = false;
    jest.spyOn(ifoodTransport, 'request').mockImplementation(async (r) => {
      calls.push(r);
      if (r.path.startsWith('/authentication')) return { status: 200, text: JSON.stringify({ accessToken: 't', expiresIn: 21600 }) };
      return fail ? { status: 500, text: 'down' } : { status: 202, text: '' };
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    for (const m of made) {
      try { await prisma.order.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: m.rid } }); } catch {}
      try { await prisma.user.delete({ where: { id: m.ownerId } }); } catch {}
    }
  });

  it('auto-accept confirms on iFood once, and the extras are kept', async () => {
    const r = await restaurant();
    const first = await ingest(r, ownDelivery());
    expect(actions()).toEqual(['POST /order/v1.0/orders/:id/confirm']);
    const ext = await prisma.externalOrder.findUnique({ where: { id: first.externalOrder.id } });
    expect(ext.platformConfirmedAt).not.toBeNull();
    expect(ext.platformData).toMatchObject({ displayId: '4821', deliveredBy: 'MERCHANT' });
    expect(ext.externalCustomerId).toBe('cust-1');
    expect(ext.customerId).toBeNull();
    expect(ext.specialInstructions).toContain('iFood #4821');
    // the same order again does not confirm again
    calls = [];
    await ingestDeliveryOrder({ restaurantId: r.rid, integrationId: r.integ.id, platform: 'ifood', input: { ...mapIfoodOrder(ownDelivery()).input, codigo: ext.externalOrderId } });
    expect(actions()).toEqual([]);
  });

  it('a failed confirm leaves platformConfirmedAt null and logs it', async () => {
    const r = await restaurant();
    fail = true;
    const res = await ingest(r, ownDelivery());
    const ext = await prisma.externalOrder.findUnique({ where: { id: res.externalOrder.id }, include: { deliveryLogs: true } });
    expect(ext.status).toBe('CONFIRMED');
    expect(ext.platformConfirmedAt).toBeNull();
    expect(ext.deliveryLogs.some((l) => /iFood/.test(l.message))).toBe(true);
  });

  it('a kitchen that skips Pronto still tells iFood it is ready (final review I2)', async () => {
    const r = await restaurant();
    const own = await ingest(r, ownDelivery());
    const byIfood = await ingest(r, ifoodDelivery());
    const takeout = await ingest(r, takeoutCash());
    calls = [];
    for (const o of [own, byIfood, takeout]) await changeOrderStatus(r.rid, o.kitchenOrderId, 'COMPLETED');
    const id = (o) => o.externalOrder.externalOrderId;
    const by = (o) => calls.filter((c) => c.path.includes(id(o))).map((c) => c.path.split('/').pop());
    expect(by(own)).toEqual(['readyToPickup', 'dispatch']);
    expect(by(byIfood)).toEqual(['readyToPickup']);
    expect(by(takeout)).toEqual(['readyToPickup']);
  });

  it('kitchen READY sends readyToPickup; COMPLETED dispatches only on own delivery', async () => {
    const r = await restaurant();
    const own = await ingest(r, ownDelivery());
    const byIfood = await ingest(r, ifoodDelivery());
    const takeout = await ingest(r, takeoutCash());
    calls = [];
    for (const o of [own, byIfood, takeout]) {
      for (const s of ['PREPARING', 'READY', 'COMPLETED']) await changeOrderStatus(r.rid, o.kitchenOrderId, s);
    }
    const id = (o) => o.externalOrder.externalOrderId;
    const by = (o) => calls.filter((c) => c.path.includes(id(o))).map((c) => c.path.split('/').pop());
    expect(by(own)).toEqual(['startPreparation', 'readyToPickup', 'dispatch']);
    expect(by(byIfood)).toEqual(['startPreparation', 'readyToPickup']);
    expect(by(takeout)).toEqual(['startPreparation', 'readyToPickup']);
  });

  it('rejecting an iFood order needs the iFood reason', async () => {
    const r = await restaurant(false);
    const res = await ingest(r, ownDelivery());
    expect(actions()).toEqual([]);
    const member = { restaurantId: r.rid, userId: r.owner.id, role: 'OWNER' };
    await expect(rejectDeliveryOrder(member, res.externalOrder.id, 'Sem entregador')).rejects.toMatchObject({ status: 400 });
    await rejectDeliveryOrder(member, res.externalOrder.id, 'Sem entregador', '503');
    const cancel = calls.find((c) => c.path.endsWith('/requestCancellation'));
    expect(JSON.parse(cancel.body)).toEqual({ reason: 'Sem entregador', cancellationCode: '503' });
    expect((await prisma.externalOrder.findUnique({ where: { id: res.externalOrder.id } })).status).toBe('CANCELLED');
  });

  it('the kitchen cannot cancel an iFood order directly; cancelPlatformOrder asks iFood', async () => {
    const r = await restaurant();
    const res = await ingest(r, ownDelivery());
    as(r.owner);
    const out = await KDS_CANCEL(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: res.kitchenOrderId } });
    expect(out.status).toBe(409);
    expect((await out.json()).error).toMatch(/Pedidos de delivery/);
    expect((await prisma.order.findUnique({ where: { id: res.kitchenOrderId } })).status).not.toBe('CANCELLED');

    calls = [];
    await cancelPlatformOrder({ restaurantId: r.rid, userId: r.owner.id, role: 'OWNER' }, res.externalOrder.id, { code: '501', reason: 'Acabou o frango' });
    expect(actions()).toEqual(['POST /order/v1.0/orders/:id/requestCancellation']);
    fail = true;
    await expect(cancelPlatformOrder({ restaurantId: r.rid, userId: r.owner.id, role: 'OWNER' }, res.externalOrder.id, { code: '501', reason: 'Acabou o frango' })).rejects.toMatchObject({ status: 502 });
  });

  it('gastrux_api orders never call iFood', async () => {
    const r = await restaurant();
    const api = await prisma.deliveryIntegration.create({ data: { restaurantId: r.rid, platform: 'gastrux_api', apiKey: 'a', webhookSecret: 'b' } });
    const m = mapIfoodOrder(ownDelivery());
    const res = await ingestDeliveryOrder({ restaurantId: r.rid, integrationId: api.id, platform: 'gastrux_api', input: { ...m.input, codigo: `API-${tag}` } });
    await changeOrderStatus(r.rid, res.kitchenOrderId, 'READY');
    expect(calls).toEqual([]);
  });
});
