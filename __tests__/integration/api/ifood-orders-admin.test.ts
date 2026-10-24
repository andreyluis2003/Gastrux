// @ts-nocheck
/** iFood orders in Pedidos de delivery: displayId, iFood reasons, cancel, disputes, DRE (plan 2026-10-24 ifood, Task 8) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { ifoodTransport, resetIfoodTokenCache } from '../../../lib/ifood/client';
import { mapIfoodOrder } from '../../../lib/ifood/order-map';
import { ingestDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { salesInRange } from '../../../lib/finance/month-sales';
import { GET as LIST } from '../../../app/api/admin/integrations/orders/route';
import { PATCH, PUT } from '../../../app/api/admin/integrations/orders/[id]/route';
import { GET as REASONS } from '../../../app/api/admin/integrations/orders/[id]/cancel-reasons/route';
import { ownDelivery } from '../../unit/fixtures/ifood-order';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const patch = (id, body) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: { id } });

describe('iFood orders in Pedidos de delivery', () => {
  let rid, ownerId, cashierId, owner, cashier, integ, calls;

  async function ingest(autoAccept = false) {
    await prisma.restaurant.update({ where: { id: rid }, data: { deliveryAutoAccept: autoAccept } });
    const m = mapIfoodOrder(ownDelivery());
    m.input.codigo = `${m.input.codigo}-${tag}-${seq++}`;
    const r = await ingestDeliveryOrder({ restaurantId: rid, integrationId: integ.id, platform: 'ifood', input: m.input, extraNote: m.extraNote, platformData: m.platformData, externalCustomerId: m.externalCustomerId });
    return r.externalOrder.id;
  }

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ioa-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    ownerId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ioa ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    const c = await prisma.user.create({ data: { email: `ioa-c-${tag}@gastrux.test`, name: 'Caixa', password: 'x', role: 'CASHIER', currentRestaurantId: rid } });
    cashierId = c.id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
    owner = { id: ownerId, email: o.email, role: 'OWNER' };
    cashier = { id: cashierId, email: c.email, role: 'CASHIER' };
    integ = await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'ifood', apiKey: 'x', webhookSecret: 'y', storeId: `m-${tag}` } });
    for (const name of ['Espeto de frango', 'Refrigerante lata']) {
      await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    }
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.order.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [ownerId, cashierId] } } }); } catch {}
  });
  beforeEach(() => {
    process.env.IFOOD_APP_MODE = 'centralized';
    process.env.IFOOD_CLIENT_ID = 'cid';
    process.env.IFOOD_CLIENT_SECRET = 'sec';
    resetIfoodTokenCache();
    calls = [];
    jest.spyOn(ifoodTransport, 'request').mockImplementation(async (r) => {
      calls.push(r);
      if (r.path.startsWith('/authentication')) return { status: 200, text: JSON.stringify({ accessToken: 't', expiresIn: 21600 }) };
      if (r.path.endsWith('/cancellationReasons')) return { status: 200, text: JSON.stringify([{ cancelCodeId: '501', description: 'Problemas de sistema' }]) };
      return { status: 202, text: '' };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it('the list shows the iFood order with its displayId', async () => {
    const id = await ingest();
    as(cashier);
    const body = await (await LIST(new NextRequest('http://x?platform=ifood'))).json();
    const row = body.orders.find((o) => o.id === id);
    expect(row.integration.platform).toBe('ifood');
    expect(row.platformData.displayId).toBe('4821');
    expect(JSON.stringify(body)).not.toMatch(/webhookSecret|apiKey"/);
  });

  it('reject without the iFood reason is 400; the reasons come from iFood; with a reason it is pushed', async () => {
    const id = await ingest();
    as(cashier);
    const r400 = await patch(id, { action: 'reject', reason: 'Sem entregador' });
    expect(r400.status).toBe(400);
    expect((await r400.json()).error).toMatch(/motivo do iFood/);
    const reasons = await (await REASONS(new NextRequest('http://x'), { params: { id } })).json();
    expect(reasons.reasons).toEqual([{ cancelCodeId: '501', description: 'Problemas de sistema' }]);
    calls = [];
    expect((await patch(id, { action: 'reject', reason: 'Sem entregador', cancelCode: '501' })).status).toBe(200);
    const sent = calls.find((c) => c.path.endsWith('/requestCancellation'));
    expect(JSON.parse(sent.body)).toEqual({ reason: 'Sem entregador', cancellationCode: '501' });
    expect((await prisma.externalOrder.findUnique({ where: { id } })).status).toBe('CANCELLED');
  });

  it('cancelling an accepted iFood order needs a manager and goes to iFood', async () => {
    const id = await ingest(true);
    as(cashier);
    expect((await patch(id, { action: 'cancel', cancelCode: '501', reason: 'Acabou o frango' })).status).toBe(403);
    as(owner);
    calls = [];
    expect((await patch(id, { action: 'cancel', cancelCode: '501', reason: 'Acabou o frango' })).status).toBe(200);
    expect(calls.some((c) => c.path.endsWith('/requestCancellation'))).toBe(true);
    // the kitchen order is cancelled by iFood's CAN event, not here
    expect((await prisma.externalOrder.findUnique({ where: { id } })).status).not.toBe('CANCELLED');
  });

  it('dispute-accept calls iFood and clears the dispute; an expired dispute is 409', async () => {
    const id = await ingest(true);
    await prisma.externalOrder.update({ where: { id }, data: { disputeId: `d-${tag}`, disputeExpiresAt: new Date(Date.now() + 5 * 60e3) } });
    as(cashier);
    calls = [];
    expect((await patch(id, { action: 'dispute-accept' })).status).toBe(200);
    expect(calls.map((c) => c.path)).toContain(`/order/v1.0/disputes/d-${tag}/accept`);
    expect((await prisma.externalOrder.findUnique({ where: { id } })).disputeId).toBeNull();
    expect((await patch(id, { action: 'dispute-reject' })).status).toBe(409);

    await prisma.externalOrder.update({ where: { id }, data: { disputeId: `d2-${tag}`, disputeExpiresAt: new Date(Date.now() - 1000) } });
    calls = [];
    expect((await patch(id, { action: 'dispute-reject' })).status).toBe(409);
    expect(calls.filter((c) => c.path.includes('/disputes/'))).toHaveLength(0);
  });

  it('a status change by hand: cancel is refused for iFood, Pronto goes to iFood', async () => {
    const id = await ingest(true);
    as(cashier);
    const r409 = await PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status: 'CANCELLED' }) }), { params: { id } });
    expect(r409.status).toBe(409);
    calls = [];
    const ok = await PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status: 'READY' }) }), { params: { id } });
    expect(ok.status).toBe(200);
    expect(calls.some((c) => c.path.endsWith('/readyToPickup'))).toBe(true);
  });

  it('DRE separates iFood from the site and the API', async () => {
    const from = new Date(Date.now() - 3600e3), to = new Date(Date.now() + 3600e3);
    const s = await salesInRange(rid, from, to);
    // the orders still in the kitchen count (rejected ones never reached it); none is a site or API order
    expect(s.deliveryByOrigin.ifood).toBeGreaterThan(0);
    expect(s.deliveryByOrigin.ifood).toBe(s.deliveryCents);
    expect(s.deliveryByOrigin.site).toBe(0);
    expect(s.deliveryByOrigin.gastrux_api).toBe(0);
  });
});
