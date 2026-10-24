// @ts-nocheck
/** The screens of the Gastrux order API (plan 2026-10-23 api-de-pedidos, Task 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST } from '../../../app/api/admin/integrations/orders/route';
import { PATCH as ACT } from '../../../app/api/admin/integrations/orders/[id]/route';
import { PUT as SETTINGS } from '../../../app/api/admin/delivery-settings/route';
import { POST as NEW_ITEM } from '../../../app/api/cardapio/itens/route';
import { PUT as EDIT_ITEM } from '../../../app/api/cardapio/itens/[id]/route';
import { ingestDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { parseOrderApiInput } from '../../../lib/delivery-orders/input';
import { EXAMPLE_ORDER } from '../../../lib/delivery-orders/example';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method, body?) => new NextRequest('http://x', { method, body: body ? JSON.stringify(body) : undefined });
let seq = 0;

describe('order API screens', () => {
  let rid, owner, cashier, cook, integrationId, category;
  const userIds = [];
  const waiting = async () => {
    const b = JSON.parse(JSON.stringify(EXAMPLE_ORDER)); b.codigo = `W${seq++}-${tag}`;
    const r = parseOrderApiInput(b); if (!r.ok) throw new Error(r.error);
    return (await ingestDeliveryOrder({ restaurantId: rid, integrationId, platform: 'gastrux_api', input: r.value })).externalOrder;
  };

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `oaa-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Oaa ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false, deliveryAutoAccept: false } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' }; userIds.push(o.id);
    for (const role of ['CASHIER', 'COOK']) {
      const u = await prisma.user.create({ data: { email: `oaa-${role}-${tag}@gastrux.test`, name: role, password: 'x', role, currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      userIds.push(u.id);
      if (role === 'CASHIER') cashier = { id: u.id, email: u.email, role }; else cook = { id: u.id, email: u.email, role };
    }
    integrationId = (await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'gastrux_api', apiKey: `secret-api-${tag}`, webhookSecret: `secret-hook-${tag}` } })).id;
    await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Espeto de alcatra', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 14 } });
    category = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Espetos', position: 1, active: true } });
  }, 60000);
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId: rid } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: rid } });
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('the cashier accepts from Pedidos de delivery: the kitchen order is created; reject needs a reason', async () => {
    const ext = await waiting();
    as(cashier);
    const ok = await ACT(req('PATCH', { action: 'accept' }), { params: { id: ext.id } });
    expect(ok.status).toBe(200);
    expect((await ok.json()).kitchenOrderId).toBeTruthy();
    expect(await prisma.order.count({ where: { externalOrderId: ext.id } })).toBe(1);
    const other = await waiting();
    expect((await ACT(req('PATCH', { action: 'reject' }), { params: { id: other.id } })).status).toBe(400);
    expect((await ACT(req('PATCH', { action: 'reject', reason: 'Acabou o produto' }), { params: { id: other.id } })).status).toBe(200);
    expect((await prisma.externalOrder.findUnique({ where: { id: other.id } })).status).toBe('CANCELLED');
  });

  it('the kitchen cannot accept nor change the setting; the cashier cannot change the setting', async () => {
    const ext = await waiting();
    as(cook);
    expect((await ACT(req('PATCH', { action: 'accept' }), { params: { id: ext.id } })).status).toBe(403);
    expect((await SETTINGS(req('PUT', { autoAccept: true }))).status).toBe(403);
    as(cashier);
    expect((await SETTINGS(req('PUT', { autoAccept: true }))).status).toBe(403);
    as(owner);
    expect((await SETTINGS(req('PUT', { autoAccept: true }))).status).toBe(200);
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).deliveryAutoAccept).toBe(true);
    await SETTINGS(req('PUT', { autoAccept: false }));
  });

  it('the list shows the origin and the setting, never the integration secrets', async () => {
    await waiting();
    as(cashier);
    const body = await (await LIST(new NextRequest('http://x/api/admin/integrations/orders?limit=100'))).json();
    expect(body.orders[0].integration).toEqual({ platform: 'gastrux_api', storeName: null });
    expect(JSON.stringify(body)).not.toContain(`secret-api-${tag}`);
    expect(JSON.stringify(body)).not.toContain(`secret-hook-${tag}`);
    expect(body.autoAccept).toBe(false);
    expect(body.canChangeSettings).toBe(false);
  });

  it('the product code is unique in the restaurant', async () => {
    as(owner);
    const first = await NEW_ITEM(req('POST', { categoryId: category.id, name: 'Espeto A', price: 10, code: 'ESP-A' }));
    expect(first.status).toBe(201);
    expect((await first.json()).code).toBe('ESP-A');
    const dup = await NEW_ITEM(req('POST', { categoryId: category.id, name: 'Espeto B', price: 10, code: 'esp-a ' }));
    expect(dup.status).toBe(400);
    expect((await dup.json()).error).toBe('Este código já é de outro produto');
    const b = await (await NEW_ITEM(req('POST', { categoryId: category.id, name: 'Espeto B', price: 10 }))).json();
    const edit = await EDIT_ITEM(req('PUT', { code: 'ESP-A' }), { params: { id: b.id } });
    expect(edit.status).toBe(400);
    expect((await EDIT_ITEM(req('PUT', { code: 'ESP-B' }), { params: { id: b.id } })).status).toBe(200);
    expect((await prisma.menuItem.findUnique({ where: { id: b.id } })).code).toBe('ESP-B');
    expect((await NEW_ITEM(req('POST', { categoryId: category.id, name: 'Espeto C', price: 10, code: 'com espaço!' }))).status).toBe(400);
  });

  // Final review 2026-10-24 (I3): a site order paid online shows only once paid (an abandoned checkout is not an active order)
  it('an unpaid online site order stays out of Pedidos de delivery until the payment is approved', async () => {
    const site = (await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'delivery_site', apiKey: 's', webhookSecret: 's' } })).id;
    const ext = await prisma.externalOrder.create({ data: { restaurantId: rid, integrationId: site, externalOrderId: `DLV-${tag}`, status: 'CONFIRMED', totalAmount: 30, items: '[]', customerName: 'Paula', customerPhone: '11977776666', deliveryAddress: 'Rua B', paymentMethod: 'ONLINE_PIX' } });
    const order = await prisma.order.create({ data: { restaurantId: rid, orderNumber: `DLV-${tag}`, orderType: 'DELIVERY', status: 'PENDING', subtotal: 30, total: 30, paymentMethod: 'ONLINE_PIX', paymentStatus: 'PENDING', externalOrderId: ext.id } });
    as(owner);
    const ids = async () => (await (await LIST(req('GET'))).json()).orders.map((o) => o.id);
    expect(await ids()).not.toContain(ext.id);
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'APPROVED' } });
    expect(await ids()).toContain(ext.id);
  });
});
