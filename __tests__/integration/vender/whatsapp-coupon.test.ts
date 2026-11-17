// @ts-nocheck
/**
 * Cupom no robô do WhatsApp (spec 2026-11-16 cupom-whatsapp-balcao): the bot asks for a coupon before the summary when
 * the restaurant has one, applies it on the comanda in the same transaction that creates it, and always links the
 * comanda to the customer of the phone.
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
const QUESTION = 'Tem cupom de desconto? Digite o código ou *não*.';
// fmtBRL writes a no-break space after "R$"
const last = () => (sent[sent.length - 1] || '').replace(/ /g, ' ');
const all = () => sent.map((s) => s.replace(/ /g, ' '));

let seq = 0;
const phoneOf = () => `55119${String(Date.now() + seq++).slice(-8)}`;
const say = (rid: string, from: string, m: any) =>
  handleInboundMessage(rid, { from, waMessageId: `wamid-${crypto.randomBytes(6).toString('hex')}`, ...m });

describe('WhatsApp bot: coupon question and customer on the comanda', () => {
  let ownerId: string, rid: string, bare: string, menuItemId: string, bareItemId: string;

  const makeRestaurant = async (name: string) => {
    const id = (await prisma.restaurant.create({ data: { name: `${name} ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    const recipeId = (await prisma.recipe.create({ data: { restaurantId: id, code: `WC${name}${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 40, prepTimeMinutes: 20 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: id, name: 'Pizzas', position: 0, active: true } });
    const item = (await prisma.menuItem.create({ data: { restaurantId: id, categoryId: cat.id, name: 'Pizza', price: 40, recipeId, position: 0 } })).id;
    await prisma.whatsAppConfig.create({ data: { restaurantId: id, phoneNumberId: 'pn', accessToken: 'tk', isActive: true } });
    return { id, item };
  };

  // A conversation waiting for the customer's name (pickup), with 2 pizzas (R$ 80,00) in the cart
  const conversation = async (restaurantId: string, item: string, phone: string) =>
    prisma.whatsAppConversation.create({
      data: {
        restaurantId, phoneNumber: phone, state: 'COLLECTING_INFO', orderType: 'PICKUP',
        cart: [{ menuItemId: item, name: 'Pizza', quantity: 2, price: 40 }], cartTotal: 80,
      },
    });
  const conv = (restaurantId: string, phone: string) =>
    prisma.whatsAppConversation.findUnique({ where: { restaurantId_phoneNumber: { restaurantId, phoneNumber: phone } } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `wac-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    ({ id: rid, item: menuItemId } = await makeRestaurant('Wac'));
    ({ id: bare, item: bareItemId } = await makeRestaurant('WacBare'));
    await prisma.coupon.create({ data: { restaurantId: rid, code: 'DEZ', kind: 'PERCENT', value: 10, maxPerCustomer: null } });
    await prisma.coupon.create({ data: { restaurantId: rid, code: 'PAUSADO', kind: 'PERCENT', value: 50, active: false } });
    // A paused coupon alone does not make the bot ask
    await prisma.coupon.create({ data: { restaurantId: bare, code: 'VELHO', kind: 'PERCENT', value: 10, active: false } });
  }, 60000);
  afterAll(async () => {
    for (const id of [rid, bare]) {
      try { await prisma.restaurant.delete({ where: { id } }); } catch {}
      try { await prisma.customer.deleteMany({ where: { restaurantId: id } }); } catch {}
    }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('asks for a coupon when the restaurant has one', async () => {
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    expect(last()).toBe(QUESTION);
    const c = await conv(rid, phone);
    expect(c.state).toBe('CONFIRMING');
    expect(c.context.couponStep).toBe('ASK');
  });

  it('skips the question when there is none', async () => {
    const phone = phoneOf();
    await conversation(bare, bareItemId, phone);
    const at = sent.length;
    await say(bare, phone, { text: 'Bia' });
    expect(all().slice(at)).not.toContain(QUESTION);
    expect(last()).toContain('Resumo do pedido');
    expect(last()).toContain('Total: R$ 80,00');
    expect(last()).not.toContain('Cupom');
  });

  it('"não" shows the summary without coupon', async () => {
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: 'Não' });
    expect(last()).toContain('Resumo do pedido');
    expect(last()).toContain('Total: R$ 80,00');
    expect(last()).not.toContain('Cupom');
    expect((await conv(rid, phone)).context.couponStep).toBeUndefined();
  });

  it('valid code shows the discount in the summary', async () => {
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: ' dez ' });
    expect(last()).toContain('Resumo do pedido');
    expect(last()).toContain('Cupom DEZ: −R$ 8,00');
    expect(last()).toContain('Total: R$ 72,00');
    const c = await conv(rid, phone);
    expect(c.context.coupon).toEqual(expect.objectContaining({ code: 'DEZ', discountCents: 800 }));
    expect(c.context.couponStep).toBeUndefined();
  });

  it('invalid code asks again', async () => {
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: 'NAOEXISTE' });
    expect(last()).toContain('Cupom inválido ou fora do ar.');
    expect(last()).toContain(QUESTION);
    // A paused code answers the same: whether it exists is not told
    await say(rid, phone, { text: 'pausado' });
    expect(last()).toContain('Cupom inválido ou fora do ar.');
    expect(last()).toContain(QUESTION);
    const c = await conv(rid, phone);
    expect(c.context.couponStep).toBe('ASK');
    expect(c.context.coupon).toBeUndefined();
  });

  it('confirm records the use on the comanda and links the customer', async () => {
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: 'DEZ' });
    const before = (await prisma.coupon.findFirst({ where: { restaurantId: rid, code: 'DEZ' } })).usedCount;
    await say(rid, phone, { buttonId: 'BTN_CONFIRM_ORDER' });

    const c = await conv(rid, phone);
    const comanda = await prisma.orderSession.findUnique({ where: { id: c.orderSessionId } });
    expect(comanda.couponCode).toBe('DEZ');
    expect(comanda.couponDiscountCents).toBe(800);
    expect(comanda.status).toBe('SENT_TO_KITCHEN');
    const customer = await prisma.customer.findUnique({ where: { id: comanda.customerId } });
    expect(customer.restaurantId).toBe(rid);
    expect(customer.phoneDigits).toBe(phone.slice(2));
    expect(customer.name).toBe('Bia');
    const redemption = await prisma.couponRedemption.findFirst({ where: { orderSessionId: comanda.id } });
    expect(redemption).toEqual(expect.objectContaining({ restaurantId: rid, discountCents: 800, phoneDigits: phone.slice(2), outOfRule: false }));
    expect((await prisma.coupon.findFirst({ where: { restaurantId: rid, code: 'DEZ' } })).usedCount).toBe(before + 1);
    expect(last()).toContain('Pedido confirmado');
    expect(last()).toContain('Total: R$ 72,00');
    expect(c.context.coupon).toBeUndefined();
  });

  it('limit ran out between summary and confirm: no comanda, summary again without coupon', async () => {
    const limited = await prisma.coupon.create({ data: { restaurantId: rid, code: 'UMA', kind: 'FIXED', value: 500, maxUses: 1, maxPerCustomer: null } });
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: 'UMA' });
    expect(last()).toContain('Cupom UMA: −R$ 5,00');
    // Another customer used the last one meanwhile
    await prisma.coupon.update({ where: { id: limited.id }, data: { usedCount: 1 } });
    const sessionsBefore = await prisma.orderSession.count({ where: { restaurantId: rid } });
    const customersBefore = await prisma.customer.count({ where: { restaurantId: rid } });
    const at = sent.length;
    await say(rid, phone, { buttonId: 'BTN_CONFIRM_ORDER' });

    expect(await prisma.orderSession.count({ where: { restaurantId: rid } })).toBe(sessionsBefore);
    // The customer creation rolled back with the comanda
    expect(await prisma.customer.count({ where: { restaurantId: rid } })).toBe(customersBefore);
    const replies = all().slice(at);
    expect(replies.some((r) => r.includes('Este cupom já foi usado o número máximo de vezes.'))).toBe(true);
    expect(last()).toContain('Resumo do pedido');
    expect(last()).not.toContain('Cupom');
    expect(last()).toContain('Total: R$ 80,00');
    const c = await conv(rid, phone);
    expect(c.context.coupon).toBeUndefined();
    expect(c.state).toBe('CONFIRMING');
    expect(c.orderSessionId).toBeNull();
    expect((await prisma.coupon.findUnique({ where: { id: limited.id } })).usedCount).toBe(1);
  });

  it('"menu" during the question clears the coupon step', async () => {
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    expect(last()).toBe(QUESTION);
    await say(rid, phone, { text: 'menu' });
    const c = await conv(rid, phone);
    expect(c.state).toBe('MENU_BROWSING');
    expect(c.context.couponStep).toBeUndefined();
    expect(c.context.coupon).toBeUndefined();
  });

  it('first-order coupon: applies on the first comanda, refused while that comanda is open', async () => {
    await prisma.coupon.create({ data: { restaurantId: rid, code: 'PRIMEIRO', kind: 'FIXED', value: 1000, firstOrderOnly: true, maxPerCustomer: null } });
    // A phone that already has an open WhatsApp comanda (ordered without coupon)
    const phone = phoneOf();
    await conversation(rid, menuItemId, phone);
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: 'n' });
    await say(rid, phone, { buttonId: 'BTN_CONFIRM_ORDER' });
    const first = await prisma.orderSession.findUnique({ where: { id: (await conv(rid, phone)).orderSessionId } });
    expect(first.status).not.toBe('CLOSED');
    expect(first.couponCode).toBeNull();
    // Ordering again: the coupon no longer counts it as a first order
    await prisma.whatsAppConversation.updateMany({
      where: { restaurantId: rid, phoneNumber: phone },
      data: { state: 'COLLECTING_INFO', orderType: 'PICKUP', cart: [{ menuItemId, name: 'Pizza', quantity: 2, price: 40 }], cartTotal: 80, orderSessionId: null },
    });
    await say(rid, phone, { text: 'Bia' });
    await say(rid, phone, { text: 'PRIMEIRO' });
    expect(last()).toContain('Este cupom não vale para este celular.');
    expect(last()).toContain(QUESTION);

    // A new phone: the comanda the coupon goes on does not count as an earlier order
    const fresh = phoneOf();
    await conversation(rid, menuItemId, fresh);
    await say(rid, fresh, { text: 'Leo' });
    await say(rid, fresh, { text: 'PRIMEIRO' });
    expect(last()).toContain('Cupom PRIMEIRO: −R$ 10,00');
    await say(rid, fresh, { buttonId: 'BTN_CONFIRM_ORDER' });
    const comanda = await prisma.orderSession.findUnique({ where: { id: (await conv(rid, fresh)).orderSessionId } });
    expect(comanda.couponCode).toBe('PRIMEIRO');
    expect(last()).toContain('Total: R$ 70,00');
  });

  it('a number outside Brazil (no 55) creates no customer link', async () => {
    // 11 digits that the cashback phone rule alone would read as a Brazilian DDD + number
    const phone = `1415${String(Date.now()).slice(-7)}`;
    await conversation(bare, bareItemId, phone);
    await say(bare, phone, { text: 'Tom' });
    await say(bare, phone, { buttonId: 'BTN_CONFIRM_ORDER' });
    const comanda = await prisma.orderSession.findUnique({ where: { id: (await conv(bare, phone)).orderSessionId } });
    expect(comanda).toBeTruthy();
    expect(comanda.customerId).toBeNull();
    expect(await prisma.customer.count({ where: { restaurantId: bare, phoneDigits: phone } })).toBe(0);
  });

  it('two taps on Confirmar at once make one comanda', async () => {
    const phone = phoneOf();
    await conversation(bare, bareItemId, phone);
    await say(bare, phone, { text: 'Rui' });
    // A known customer: the race is not masked by a unique-key error on a new customer
    await prisma.customer.create({ data: { restaurantId: bare, name: 'Rui', phoneDigits: phone.slice(2) } });
    const before = await prisma.orderSession.count({ where: { restaurantId: bare } });
    await Promise.all([say(bare, phone, { buttonId: 'BTN_CONFIRM_ORDER' }), say(bare, phone, { buttonId: 'BTN_CONFIRM_ORDER' })]);
    expect(await prisma.orderSession.count({ where: { restaurantId: bare } })).toBe(before + 1);
    expect(await prisma.customer.count({ where: { restaurantId: bare, phoneDigits: phone.slice(2) } })).toBe(1);
    expect((await conv(bare, phone)).state).toBe('COMPLETED');
  });

  it('order without coupon also links the customer', async () => {
    const phone = phoneOf();
    await conversation(bare, bareItemId, phone);
    await say(bare, phone, { text: 'Caio' });
    await say(bare, phone, { buttonId: 'BTN_CONFIRM_ORDER' });
    const c = await conv(bare, phone);
    const comanda = await prisma.orderSession.findUnique({ where: { id: c.orderSessionId } });
    expect(comanda.couponCode).toBeNull();
    const customer = await prisma.customer.findUnique({ where: { id: comanda.customerId } });
    expect(customer).toEqual(expect.objectContaining({ restaurantId: bare, phoneDigits: phone.slice(2), name: 'Caio' }));
    expect(last()).toContain('Total: R$ 80,00');
  });
});
