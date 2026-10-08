// @ts-nocheck
/**
 * A WhatsApp order the customer confirms reaches the kitchen screen (2026-10-08): the bot saved the
 * comanda as "sent to the kitchen" but never created the kitchen order, so the kitchen never saw it.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

const sent: string[] = [];
jest.mock('../../../lib/whatsapp/meta-client', () => ({
  normalizePhone: (raw: string) => String(raw).replace(/\D/g, ''),
  MetaCloudClient: jest.fn().mockImplementation(() => ({
    sendText: jest.fn(async ({ text }) => { sent.push(text); return {}; }),
    sendButtons: jest.fn(async ({ body }) => { sent.push(body); return {}; }),
    sendList: jest.fn(async () => ({})),
  })),
}));
import { handleInboundMessage } from '../../../lib/whatsapp/bot';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('WhatsApp order: confirmed order reaches the kitchen', () => {
  let rid: string, ownerId: string, menuItemId: string;
  const phone = `5511${Date.now()}`.slice(0, 13);
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `wak-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Wak ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    const recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `WK${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 40, prepTimeMinutes: 20 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pizzas', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Pizza', price: 40, recipeId, position: 0 } })).id;
    await prisma.whatsAppConfig.create({ data: { restaurantId: rid, phoneNumberId: 'pn', accessToken: 'tk', isActive: true } });
    await prisma.whatsAppConversation.create({
      data: {
        restaurantId: rid, phoneNumber: phone, customerName: 'Bia', state: 'CONFIRMING', orderType: 'DELIVERY',
        deliveryAddress: 'Rua A, 1', cart: [{ menuItemId, name: 'Pizza', quantity: 2, price: 40 }], cartTotal: 80,
      },
    });
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('creates the kitchen order with the lines, marks them sent and links it to the comanda', async () => {
    await handleInboundMessage(rid, { from: phone, buttonId: 'BTN_CONFIRM_ORDER', waMessageId: `wamid-${tag}` });

    const comanda = await prisma.orderSession.findFirst({ where: { restaurantId: rid }, include: { items: true } });
    expect(comanda).toBeTruthy();
    expect(comanda.status).toBe('SENT_TO_KITCHEN');
    expect(comanda.items.every((i) => i.sentAt)).toBe(true);

    const orders = await prisma.order.findMany({ where: { restaurantId: rid, orderSessionId: comanda.id }, include: { items: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0].items.map((i) => i.quantity)).toEqual([2]);
    expect(comanda.orderId).toBe(orders[0].id);
    expect(sent.some((b) => b.includes('Pedido confirmado'))).toBe(true);
  });
});
