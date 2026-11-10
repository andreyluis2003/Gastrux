/**
 * Todos os pedidos e loja aberta/fechada (spec 2026-11-07): closing stops the order API and the delivery site,
 * pauses iFood only when it was running (and opening resumes only that), and the board lists every channel once.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const texts: string[] = [];
jest.mock('../../../lib/whatsapp/meta-client', () => ({
  normalizePhone: (raw: string) => String(raw).replace(/D/g, ''),
  MetaCloudClient: jest.fn().mockImplementation(() => ({
    sendText: jest.fn(async ({ text }) => { texts.push(text); return {}; }),
    sendButtons: jest.fn(async ({ body }) => { texts.push(body); return {}; }),
    sendList: jest.fn(async () => ({})),
  })),
}));
import { handleInboundMessage } from '../../../lib/whatsapp/bot';

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as LOJA, POST as SET_LOJA } from '../../../app/api/pedidos/loja/route';
import { GET as QUADRO } from '../../../app/api/pedidos/quadro/route';
import { POST as API_ORDER } from '../../../app/api/v1/pedidos/route';
import { POST as SITE_ORDER } from '../../../app/api/public/delivery/order/route';
import { EXAMPLE_ORDER } from '../../../lib/delivery-orders/example';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);
const setLoja = (fechada: unknown) => SET_LOJA(new NextRequest('http://x/api/pedidos/loja', { method: 'POST', body: JSON.stringify({ fechada }) }));

describe('loja aberta/fechada e todos os pedidos', () => {
  let owner, cook, rid, key, ifood;
  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `qp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `qp-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    rid = (await prisma.restaurant.create({ data: { name: `QP ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    const api = await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'gastrux_api', apiKey: `a${tag}`, webhookSecret: 'y' } });
    key = `gx_live_${crypto.randomBytes(16).toString('hex')}`;
    await prisma.orderApiKey.create({ data: { restaurantId: rid, integrationId: api.id, name: 'Teste', prefix: key.slice(0, 12) + tag, keyHash: crypto.createHash('sha256').update(key).digest('hex'), callbackSecret: 'c', createdById: owner.id } });
    await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Refrigerante lata', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } });
    ifood = await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'ifood', apiKey: `i${tag}`, webhookSecret: 'y', storeId: `m-${tag}`, storeName: 'Loja', isActive: true } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.order.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.orderSession.deleteMany({ where: { restaurantId: rid } }); } catch {}
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('is not for the kitchen', async () => {
    as(cook);
    expect((await LOJA()).status).toBe(403);
    expect((await QUADRO()).status).toBe(403);
  });

  it('closing pauses the running iFood and refuses API and site orders; opening resumes iFood', async () => {
    as(owner);
    expect((await setLoja('sim')).status).toBe(400);
    expect(await (await setLoja(true)).json()).toMatchObject({ closed: true, ifood: 'paused' });
    expect(await (await LOJA()).json()).toMatchObject({ closed: true });
    expect((await prisma.deliveryIntegration.findUnique({ where: { id: ifood.id } })).isActive).toBe(false);

    const api = await API_ORDER(new NextRequest('http://x/api/v1/pedidos', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(JSON.stringify(EXAMPLE_ORDER)), codigo: `C-${tag}` }) }));
    expect(api.status).toBe(409);
    expect(await api.json()).toMatchObject({ code: 'STORE_CLOSED' });
    const site = await SITE_ORDER(new NextRequest('http://x/api/public/delivery/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ restaurantId: rid, items: [{ menuItemId: 'x', quantity: 1 }], customerName: 'Bia', customerPhone: '11999999999', deliveryAddress: 'Rua A, 1', paymentMethod: 'CASH_ON_DELIVERY' }) }));
    expect(site.status).toBe(409);

    expect(await (await setLoja(true)).json()).toMatchObject({ closed: true, ifood: null });
    expect(await (await setLoja(false)).json()).toMatchObject({ closed: false, ifood: 'resumed' });
    expect((await prisma.deliveryIntegration.findUnique({ where: { id: ifood.id } })).isActive).toBe(true);
    const ok = await API_ORDER(new NextRequest('http://x/api/v1/pedidos', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(JSON.stringify(EXAMPLE_ORDER)), codigo: `O-${tag}` }) }));
    expect(ok.status).toBe(201);
  });

  it('an iFood paused by hand stays paused when the store opens', async () => {
    as(owner);
    await prisma.deliveryIntegration.update({ where: { id: ifood.id }, data: { isActive: false } });
    expect(await (await setLoja(true)).json()).toMatchObject({ closed: true, ifood: null });
    expect(await (await setLoja(false)).json()).toMatchObject({ closed: false, ifood: null });
    expect((await prisma.deliveryIntegration.findUnique({ where: { id: ifood.id } })).isActive).toBe(false);
  });

  it('by the hours: outside them the API refuses, the button does not open by hand, and turning it off opens', async () => {
    as(owner);
    const allClosed = Object.fromEntries(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((d) => [d, { open: '11:00', close: '23:00', closed: true }]));
    await prisma.restaurant.update({ where: { id: rid }, data: { businessHours: { ...allClosed, auto: true } } });
    expect(await (await LOJA()).json()).toMatchObject({ closed: true, reason: 'horario', opens: null, auto: true });
    const api = await API_ORDER(new NextRequest('http://x/api/v1/pedidos', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...JSON.parse(JSON.stringify(EXAMPLE_ORDER)), codigo: `H-${tag}` }) }));
    expect(api.status).toBe(409);
    const opened = await (await setLoja(false)).json();
    expect(opened.state).toMatchObject({ closed: true, reason: 'horario' });
    // The iFood is not paused by the hours
    expect((await prisma.deliveryIntegration.findUnique({ where: { id: ifood.id } })).isActive).toBe(false);
    await prisma.restaurant.update({ where: { id: rid }, data: { businessHours: { ...allClosed, auto: false } } });
    expect(await (await LOJA()).json()).toMatchObject({ closed: false, reason: null });
  });
  it('the board shows the API order once, a table order and a counter order with their channels', async () => {
    as(owner);
    const section = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 4 } });
    const table = await prisma.table.create({ data: { restaurantId: rid, sectionId: section.id, number: 7, capacity: 4, qrToken: crypto.randomBytes(16).toString('hex') } });
    const mesa = await prisma.orderSession.create({ data: { restaurantId: rid, userId: owner.id, tableId: table.id, tableNumber: 7 } });
    const balcao = await prisma.orderSession.create({ data: { restaurantId: rid, userId: owner.id, customerName: 'Rui' } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `M${tag}`, orderType: 'DINE_IN', status: 'PREPARING', orderSessionId: mesa.id } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `B${tag}`, orderType: 'DINE_IN', status: 'READY', orderSessionId: balcao.id } });
    const body = await (await QUADRO()).json();
    expect(body.store).toMatchObject({ closed: false });
    const byLabel = Object.fromEntries(body.cards.map((c) => [c.label, c]));
    expect(byLabel['Mesa 7']).toMatchObject({ channel: 'salao', stage: 'preparo', href: `/vender/${mesa.id}` });
    expect(byLabel['Balcão: Rui']).toMatchObject({ channel: 'balcao', stage: 'pronto' });
    const api = body.cards.filter((c) => c.channel === 'api');
    expect(api).toHaveLength(1);
    expect(api[0]).toMatchObject({ href: '/admin/integrations/orders' });
  });
  it('a 99Food order shows as its own channel with the 99Food order number', async () => {
    as(owner);
    const nn = await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'ninety_nine_food', apiKey: `n${tag}`, webhookSecret: 'y', storeId: `nn-${tag}`, isActive: true } });
    await prisma.externalOrder.create({
      data: {
        restaurantId: rid, integrationId: nn.id, externalOrderId: `5764${tag}9876543`, status: 'PENDING', totalAmount: 60, customerName: 'Maria',
        customerPhone: '', deliveryAddress: 'Rua A', items: '[]', platformData: { orderIndex: 42 },
      },
    });
    const card = (await (await QUADRO()).json()).cards.find((c) => c.channel === 'ninetynine');
    expect(card).toMatchObject({ label: '99Food: Maria', number: '#42', stage: 'novo', href: '/admin/integrations/orders' });
  });

  it('WhatsApp: a delivery order waits while closed; an order from a table goes on', async () => {
    as(owner);
    await setLoja(true);
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    const soda = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Refri', price: 6, position: 0 } });
    await prisma.whatsAppConfig.create({ data: { restaurantId: rid, phoneNumberId: `pn${tag}`, accessToken: 'tk', isActive: true } });
    const phone = `5566${Date.now()}`.slice(0, 13);
    await prisma.whatsAppConversation.create({ data: { restaurantId: rid, phoneNumber: phone, customerName: 'Bia', state: 'CONFIRMING', orderType: 'DELIVERY', deliveryAddress: 'Rua A, 1', cart: [{ menuItemId: soda.id, name: 'Refri', quantity: 1, price: 6 }], cartTotal: 6 } });
    await handleInboundMessage(rid, { from: phone, buttonId: 'BTN_CONFIRM_ORDER', waMessageId: `w1-${tag}` });
    expect(texts.at(-1)).toMatch(/fechada/);
    expect(await prisma.orderSession.count({ where: { restaurantId: rid, notes: { startsWith: 'Pedido via WhatsApp' } } })).toBe(0);
    await setLoja(false);
    await handleInboundMessage(rid, { from: phone, buttonId: 'BTN_CONFIRM_ORDER', waMessageId: `w2-${tag}` });
    expect(await prisma.orderSession.count({ where: { restaurantId: rid, notes: { startsWith: 'Pedido via WhatsApp' } } })).toBe(1);
  });
});
