// @ts-nocheck
/** Polling, processing and acknowledging the iFood events (plan 2026-10-24 ifood, Task 5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ifoodTransport, resetIfoodTokenCache } from '../../../lib/ifood/client';
import { pollIfoodOnce } from '../../../lib/ifood/events';
import { changeOrderStatus } from '../../../lib/kds/order-status';
import { salesInRange } from '../../../lib/finance/month-sales';
import { ownDelivery } from '../../unit/fixtures/ifood-order';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;

describe('pollIfoodOnce', () => {
  const made = [];
  let server;
  async function restaurant(extra = {}) {
    const owner = await prisma.user.create({ data: { email: `ife-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    const r = await prisma.restaurant.create({ data: { name: `Ife ${seq++} ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false, ...extra } });
    const merchantId = `m-${tag}-${seq++}`;
    const integ = await prisma.deliveryIntegration.create({ data: { restaurantId: r.id, platform: 'ifood', apiKey: 'x', webhookSecret: 'y', storeId: merchantId } });
    for (const name of ['Espeto de frango', 'Refrigerante lata']) {
      await prisma.recipe.create({ data: { restaurantId: r.id, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    }
    made.push({ rid: r.id, ownerId: owner.id });
    return { rid: r.id, integ, merchantId };
  }
  /** An order placed on iFood for this store: the fake server serves it and queues its PLC */
  function place(r, orderId = `o-${tag}-${seq++}`) {
    const o = ownDelivery();
    o.id = orderId;
    o.merchant.id = r.merchantId;
    server.orders[orderId] = o;
    return orderId;
  }
  const event = (r, code, orderId, extra = {}) => ({ id: `ev-${tag}-${seq++}`, code, fullCode: code, orderId, merchantId: r.merchantId, createdAt: new Date().toISOString(), ...extra });
  const ours = (ids) => ids.filter((id) => id.startsWith(`ev-${tag}`));
  const extOf = (orderId) => prisma.externalOrder.findFirst({ where: { externalOrderId: orderId } });

  beforeEach(() => {
    process.env.IFOOD_APP_MODE = 'centralized';
    process.env.IFOOD_CLIENT_ID = 'cid';
    process.env.IFOOD_CLIENT_SECRET = 'sec';
    resetIfoodTokenCache();
    server = { events: [], orders: {}, acked: [], polledMerchants: [], failGet: 0, calls: [] };
    jest.spyOn(ifoodTransport, 'request').mockImplementation(async (r) => {
      server.calls.push(r);
      if (r.path.startsWith('/authentication')) return { status: 200, text: JSON.stringify({ accessToken: 't', expiresIn: 21600 }) };
      if (r.path === '/events/v1.0/events:polling') {
        server.polledMerchants.push(...(r.headers['x-polling-merchants'] || '').split(','));
        const evs = server.events.filter((e) => !server.acked.includes(e.id));
        return evs.length ? { status: 200, text: JSON.stringify(evs) } : { status: 204, text: '' };
      }
      if (r.path === '/events/v1.0/events/acknowledgment') {
        server.acked.push(...JSON.parse(r.body).map((x) => x.id));
        return { status: 202, text: '' };
      }
      const m = r.path.match(/^\/order\/v1\.0\/orders\/([^/]+)$/);
      if (m && r.method === 'GET') {
        if (server.failGet > 0) { server.failGet--; return { status: 503, text: 'down' }; }
        const o = server.orders[decodeURIComponent(m[1])];
        return o ? { status: 200, text: JSON.stringify(o) } : { status: 404, text: '' };
      }
      return { status: 202, text: '' };
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await prisma.ifoodEvent.deleteMany({ where: { id: { startsWith: `ev-${tag}` } } }).catch(() => {});
    for (const m of made) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.order.deleteMany({ where: { restaurantId: m.rid } }); } catch {}
      try { await prisma.restaurant.delete({ where: { id: m.rid } }); } catch {}
      try { await prisma.user.delete({ where: { id: m.ownerId } }); } catch {}
    }
  });

  it('PLC twice in one poll and again next poll: one order, one kitchen order, all acked', async () => {
    const r = await restaurant();
    const orderId = place(r);
    const e1 = event(r, 'PLC', orderId);
    const e2 = event(r, 'PLC', orderId);
    server.events.push(e1, e1, e2);
    await pollIfoodOnce();
    server.acked = server.acked.filter((id) => id !== e2.id); // iFood repeats one of them
    await pollIfoodOnce();
    expect(await prisma.externalOrder.count({ where: { externalOrderId: orderId } })).toBe(1);
    const ext = await extOf(orderId);
    expect(await prisma.order.count({ where: { externalOrderId: ext.id } })).toBe(1);
    expect(ext.status).toBe('CONFIRMED');
    expect(ours(server.acked).sort()).toEqual([e1.id, e2.id].sort());
    const integ = await prisma.deliveryIntegration.findUnique({ where: { id: r.integ.id } });
    expect(integ.lastPolledAt).not.toBeNull();
    expect(integ.syncStatus).toBe('SUCCESS');
  });

  it('an event that fails is not acked and the next poll recovers it', async () => {
    const r = await restaurant();
    const orderId = place(r);
    const e = event(r, 'PLC', orderId);
    server.events.push(e);
    server.failGet = 1;
    const first = await pollIfoodOnce();
    expect(first.failed).toBeGreaterThanOrEqual(1);
    expect(server.acked).not.toContain(e.id);
    expect(await extOf(orderId)).toBeNull();
    await pollIfoodOnce();
    expect(server.acked).toContain(e.id);
    expect((await extOf(orderId)).status).toBe('CONFIRMED');
  });

  it('CAN listed before its PLC in one batch: the order never stays active (final review I1)', async () => {
    const r = await restaurant();
    const orderId = place(r);
    const plc = event(r, 'PLC', orderId, { createdAt: new Date(Date.now() - 2000).toISOString() });
    const can = event(r, 'CAN', orderId, { createdAt: new Date().toISOString() });
    server.events.push(can, plc);
    const res = await pollIfoodOnce();
    expect(res.failed).toBe(0);
    const ext = await extOf(orderId);
    expect(ext.status).toBe('CANCELLED');
    const kitchen = await prisma.order.findUnique({ where: { externalOrderId: ext.id } });
    expect(kitchen === null || kitchen.status === 'CANCELLED').toBe(true);
    const range = [new Date(Date.now() - 3600e3), new Date(Date.now() + 3600e3)];
    expect((await salesInRange(r.rid, range[0], range[1])).deliveryCents).toBe(0);
  });

  it('PLC fails and its CAN comes first: the CAN waits, and the order ends cancelled (final review I1)', async () => {
    const r = await restaurant();
    const orderId = place(r);
    const plc = event(r, 'PLC', orderId, { createdAt: new Date(Date.now() - 2000).toISOString() });
    server.events.push(plc);
    server.failGet = 1;
    await pollIfoodOnce();
    expect(await extOf(orderId)).toBeNull();
    const can = event(r, 'CAN', orderId);
    server.events.push(can);
    server.failGet = 1;
    await pollIfoodOnce();
    // the PLC failed again: its CAN must not be acknowledged as done while the order is unknown
    expect(server.acked).not.toContain(can.id);
    await pollIfoodOnce();
    expect(server.acked).toEqual(expect.arrayContaining([plc.id, can.id]));
    const ext = await extOf(orderId);
    expect(ext.status).toBe('CANCELLED');
    const kitchen = await prisma.order.findUnique({ where: { externalOrderId: ext.id } });
    expect(kitchen === null || kitchen.status === 'CANCELLED').toBe(true);
  });

  it('two polls at once (two server processes): one order, one confirm, no false alarm (final review I5)', async () => {
    const r = await restaurant();
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await Promise.all([pollIfoodOnce(), pollIfoodOnce()]);
    expect(await prisma.externalOrder.count({ where: { externalOrderId: orderId } })).toBe(1);
    const ext = await extOf(orderId);
    expect(await prisma.order.count({ where: { externalOrderId: ext.id } })).toBe(1);
    expect(server.calls.filter((c) => c.path.endsWith('/confirm'))).toHaveLength(1);
    expect(await prisma.notification.count({ where: { restaurantId: r.rid, severity: 'CRITICAL' } })).toBe(0);
    expect(server.calls.filter((c) => c.path === '/events/v1.0/events:polling' && (c.headers['x-polling-merchants'] || '').includes(r.merchantId))).toHaveLength(1);
  });

  it("an unlinked merchant's event is acked and creates nothing", async () => {
    const stranger = { merchantId: `m-unlinked-${tag}` };
    const orderId = place(stranger);
    const e = event(stranger, 'PLC', orderId);
    server.events.push(e);
    await pollIfoodOnce();
    expect(server.acked).toContain(e.id);
    expect(await extOf(orderId)).toBeNull();
  });

  it('a plan-locked restaurant is not polled', async () => {
    const locked = await restaurant({ status: 'SUSPENDED', subscriptionStatus: 'canceled' });
    const pro = await restaurant({ subscriptionTier: 'pro' });
    const ok = await restaurant();
    await pollIfoodOnce();
    expect(server.polledMerchants).toContain(ok.merchantId);
    expect(server.polledMerchants).not.toContain(locked.merchantId);
    expect(server.polledMerchants).not.toContain(pro.merchantId);
  });

  it('CAN cancels the kitchen order and takes it out of the sale', async () => {
    const r = await restaurant();
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await pollIfoodOnce();
    const range = [new Date(Date.now() - 3600e3), new Date(Date.now() + 3600e3)];
    // the DRE convention of part 1: items + delivery fee in the sale, the store's coupon in the deductions
    const sold = await salesInRange(r.rid, range[0], range[1]);
    expect([sold.deliveryCents, sold.deliveryDiscountCents]).toEqual([3700, 300]);
    server.events.push(event(r, 'CAN', orderId));
    await pollIfoodOnce();
    const ext = await extOf(orderId);
    expect(ext.status).toBe('CANCELLED');
    expect((await prisma.order.findUnique({ where: { externalOrderId: ext.id } })).status).toBe('CANCELLED');
    expect((await salesInRange(r.rid, range[0], range[1])).deliveryCents).toBe(0);
    // iFood cancelled it: nothing goes back to iFood
    expect(server.calls.filter((c) => c.path.endsWith('/requestCancellation'))).toEqual([]);
  });

  it('CAN after COMPLETED keeps the sale and rings CRITICAL', async () => {
    const r = await restaurant();
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await pollIfoodOnce();
    const ext = await extOf(orderId);
    const kitchen = await prisma.order.findUnique({ where: { externalOrderId: ext.id } });
    await changeOrderStatus(r.rid, kitchen.id, 'COMPLETED');
    server.events.push(event(r, 'CAN', orderId));
    const res = await pollIfoodOnce();
    expect(res.failed).toBe(0);
    expect((await prisma.order.findUnique({ where: { id: kitchen.id } })).status).toBe('COMPLETED');
    const bell = await prisma.notification.findFirst({ where: { restaurantId: r.rid, severity: 'CRITICAL' } });
    expect(bell.message).toMatch(/#4821.*já concluiu/);
  });

  it('CON delivers it', async () => {
    const r = await restaurant();
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await pollIfoodOnce();
    server.events.push(event(r, 'CON', orderId));
    await pollIfoodOnce();
    expect((await extOf(orderId)).status).toBe('DELIVERED');
  });

  it('HSD stores the dispute and rings; HSS clears it', async () => {
    const r = await restaurant();
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await pollIfoodOnce();
    const expiresAt = new Date(Date.now() + 5 * 60e3).toISOString();
    server.events.push(event(r, 'HSD', orderId, { metadata: { disputeId: `d-${tag}`, expiresAt, action: 'CANCELLATION' } }));
    await pollIfoodOnce();
    let ext = await extOf(orderId);
    expect(ext.disputeId).toBe(`d-${tag}`);
    expect(ext.disputeExpiresAt.toISOString()).toBe(expiresAt);
    const bell = await prisma.notification.findFirst({ where: { restaurantId: r.rid, message: { contains: 'pediu para cancelar' } } });
    expect(bell.severity).toBe('HIGH');
    server.events.push(event(r, 'HSS', orderId, { metadata: { disputeId: `d-${tag}` } }));
    await pollIfoodOnce();
    ext = await extOf(orderId);
    expect(ext.disputeId).toBeNull();
  });

  it('a confirm that failed is retried by the next poll within 8 minutes', async () => {
    const r = await restaurant();
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await pollIfoodOnce();
    const ext = await extOf(orderId);
    await prisma.externalOrder.update({ where: { id: ext.id }, data: { platformConfirmedAt: null } });
    server.calls = [];
    await pollIfoodOnce();
    expect(server.calls.filter((c) => c.path === `/order/v1.0/orders/${orderId}/confirm`)).toHaveLength(1);
    expect((await extOf(orderId)).platformConfirmedAt).not.toBeNull();
    // after 8 minutes there is no point (iFood cancelled it)
    await prisma.externalOrder.update({ where: { id: ext.id }, data: { platformConfirmedAt: null, orderReceivedAt: new Date(Date.now() - 9 * 60e3) } });
    server.calls = [];
    await pollIfoodOnce();
    expect(server.calls.filter((c) => c.path.endsWith('/confirm'))).toHaveLength(0);
  });

  it('an order waiting for Aceitar rings again after 5 minutes, once', async () => {
    const r = await restaurant({ deliveryAutoAccept: false });
    const orderId = place(r);
    server.events.push(event(r, 'PLC', orderId));
    await pollIfoodOnce();
    const ext = await extOf(orderId);
    expect(ext.status).toBe('PENDING');
    const second = () => prisma.notification.count({ where: { restaurantId: r.rid, message: { contains: 'espera o Aceitar' } } });
    await pollIfoodOnce();
    expect(await second()).toBe(0);
    await prisma.externalOrder.update({ where: { id: ext.id }, data: { orderReceivedAt: new Date(Date.now() - 6 * 60e3) } });
    await pollIfoodOnce();
    await pollIfoodOnce();
    expect(await second()).toBe(1);
  });
});
