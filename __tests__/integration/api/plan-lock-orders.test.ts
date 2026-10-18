// @ts-nocheck
/**
 * Plans of 2026-10-18 §6: when the trial ends without a plan, customers cannot place new orders (QR, delivery
 * site, WhatsApp, external platforms), but a table that already owes can still pay its bill.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const sent: string[] = [];
jest.mock('../../../lib/whatsapp/meta-client', () => ({
  normalizePhone: (raw: string) => String(raw).replace(/\D/g, ''),
  MetaCloudClient: jest.fn().mockImplementation(() => ({
    sendText: jest.fn(async ({ text }) => { sent.push(text); return {}; }),
    sendButtons: jest.fn(async ({ body }) => { sent.push(body); return {}; }),
    sendList: jest.fn(async () => ({})),
  })),
}));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(async () => ({ id: 616161, status: 'pending', date_of_expiration: new Date(Date.now() + 1800000).toISOString(), point_of_interaction: { transaction_data: { qr_code: 'QR', qr_code_base64: 'B64', ticket_url: 'https://t' } } })),
}));

import { POST as qrOrder } from '../../../app/api/public/orders/[qrToken]/route';
import { POST as deliveryOrder } from '../../../app/api/public/delivery/order/route';
import { POST as externalWebhook } from '../../../app/api/external/orders/webhook/route';
import { POST as tablePay } from '../../../app/api/public/table/[qrToken]/pay/route';
import { handleInboundMessage } from '../../../lib/whatsapp/bot';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const SECRET = `s-${tag}`;
const STORE = `store-${tag}`;
const REFUSAL = { error: 'Este restaurante não está recebendo pedidos agora.', code: 'RESTAURANT_UNAVAILABLE' };
const DAY = 86_400_000;
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('customer orders and the plan lock', () => {
  let A, itemId, recipeId, recipeName, tableToken;
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const phone = `5511${Date.now()}`.slice(0, 13);

  const setTrial = (endsInMs: number) =>
    prisma.restaurant.update({ where: { id: A.restaurantId }, data: { isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() + endsInMs) } });
  const qr = () => qrOrder(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ items: [{ menuItemId: itemId, quantity: 1 }] }) }), { params: { qrToken: tableToken } });
  const delivery = () => deliveryOrder(new NextRequest('http://x/api/public/delivery/order', { method: 'POST', body: JSON.stringify({ restaurantId: A.restaurantId, customerName: 'Ana', customerPhone: '11999990000', deliveryAddress: 'Rua 1, 10', items: [{ menuItemId: itemId, quantity: 1 }], paymentMethod: 'CASH' }) }));
  const external = () => {
    const body = JSON.stringify({ type: 'order.new', orderId: `EXT-${crypto.randomBytes(3).toString('hex')}`, storeId: STORE, totalAmount: 20, customerName: 'Ana', items: [{ externalItemId: 'x1', name: recipeName, quantity: 1 }] });
    const sig = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
    return externalWebhook(new Request('https://gastrux.test/api/external/orders/webhook', { method: 'POST', headers: { 'x-platform': 'ifood', 'x-webhook-signature': sig }, body }) as any);
  };
  const confirmWhatsApp = async () => {
    await prisma.whatsAppConversation.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.whatsAppConversation.create({ data: { restaurantId: A.restaurantId, phoneNumber: phone, customerName: 'Bia', state: 'CONFIRMING', orderType: 'DELIVERY', deliveryAddress: 'Rua A, 1', cart: [{ menuItemId: itemId, name: recipeName, quantity: 1, price: 20 }], cartTotal: 20 } });
    sent.length = 0;
    await handleInboundMessage(A.restaurantId, { from: phone, buttonId: 'BTN_CONFIRM_ORDER', waMessageId: `wamid-${crypto.randomBytes(4).toString('hex')}` });
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA;
    recipeName = `Espeto ${tag}`;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `PL${tag}`, name: recipeName, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 20 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: A.restaurantId, name: `Espetos ${tag}`, position: 0, active: true } });
    itemId = (await prisma.menuItem.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, name: recipeName, price: 20, recipeId, position: 0, active: true, available: true } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: 'Salão', capacity: 20 } });
    tableToken = `pl${tag}`;
    await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 7, sectionId: sec.id, capacity: 4, qrToken: tableToken } });
    await prisma.deliveryIntegration.create({ data: { restaurantId: A.restaurantId, platform: 'ifood', apiKey: 'k', webhookSecret: SECRET, storeId: STORE } });
    await prisma.whatsAppConfig.create({ data: { restaurantId: A.restaurantId, phoneNumberId: `pn${tag}`, accessToken: 'tk', isActive: true } });
  }, 60000);

  afterAll(async () => {
    if (!A) return;
    const id = A.restaurantId;
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: id } } });
    await prisma.externalOrder.updateMany({ where: { restaurantId: id }, data: { internalOrderId: null } });
    await prisma.orderSession.updateMany({ where: { restaurantId: id }, data: { orderId: null } });
    await prisma.order.deleteMany({ where: { restaurantId: id } });
    await prisma.externalOrder.deleteMany({ where: { restaurantId: id } });
    await prisma.orderSessionItem.deleteMany({ where: { session: { restaurantId: id } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: id } });
    await prisma.payment.deleteMany({ where: { restaurantId: id } });
    await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: id } });
    await prisma.whatsAppConversation.deleteMany({ where: { restaurantId: id } });
    await prisma.whatsAppConfig.deleteMany({ where: { restaurantId: id } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: id } });
    await cleanupMultiTenantData([id]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  describe('trial over (locked)', () => {
    beforeAll(() => setTrial(-DAY));

    it('QR order refused', async () => {
      const res = await qr();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(REFUSAL);
    });

    it('delivery site order refused', async () => {
      const res = await delivery();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(REFUSAL);
    });

    it('external platform order refused', async () => {
      const res = await external();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual(REFUSAL);
    });

    it('WhatsApp order refused with the same sentence, no comanda created', async () => {
      const before = await prisma.orderSession.count({ where: { restaurantId: A.restaurantId } });
      await confirmWhatsApp();
      expect(sent).toContain(REFUSAL.error);
      expect(await prisma.orderSession.count({ where: { restaurantId: A.restaurantId } })).toBe(before);
    });

    it('a table that already owes can still pay its bill', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const table = await prisma.table.findFirst({ where: { qrToken: tableToken } });
      await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 7, status: 'OPEN', items: { create: [{ recipeId, price: 20, quantity: 1 }] } } });
      const res = await tablePay(new Request(`https://x/api/public/table/${tableToken}/pay`, { method: 'POST', body: JSON.stringify({ method: 'PIX', amountCents: 2200, phoneKey: 'phoneKEY1234567890ab' }) }) as any, { params: { qrToken: tableToken } });
      const out = await res.json();
      expect(out.code).not.toBe('RESTAURANT_UNAVAILABLE');
      expect(res.status).not.toBe(403);
    });
  });

  describe('trial in time', () => {
    beforeAll(() => setTrial(DAY));

    it('QR order accepted', async () => {
      expect((await qr()).status).toBeLessThan(300);
    });
  });
});
