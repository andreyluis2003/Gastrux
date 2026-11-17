// @ts-nocheck
/**
 * Counter sale (POST /api/comanda/quick-sale) with the cash register (spec §6.2): the payments and the
 * change enter the shift; without an open shift the whole sale is refused; a replay records once.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as quickSale } from '../../../app/api/comanda/quick-sale/route';
import { POST as couponPreview } from '../../../app/api/comanda/coupon-preview/route';
import { INVALID } from '../../../lib/coupons/service';
import { takeCouponTry, TRIES_PER_MINUTE } from '../../../lib/coupons/attempts';
import { openSession, ensureDefaultRegister } from '../../../lib/caixa/sessions';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('counter sale records its payments in the shift', () => {
  let A, B, reg, owner, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  const sale = (body, key = crypto.randomUUID()) => quickSale(new Request('http://x/api/comanda/quick-sale', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
  }) as any);
  const linesOf = (orderSessionId) => prisma.cashSessionEntry.findMany({ where: { orderSessionId } });
  const item = () => ({ recipeId: burger.id, quantity: 1 });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    reg = await ensureDefaultRegister(A.restaurantId);
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: A.ownerId, email: `${A.ownerId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(A.restaurantId);
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });
  beforeEach(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
  });

  // Spec rule 12: change above the cash expected in the drawer is allowed, with a warning (2026-10-26)
  it('warns when the change is more than the drawer should have before the sale; never says how much it had', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: '10,00' });
    const big = await sale({ clientId: `bal-${crypto.randomUUID()}`, items: [item()], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 100 }] });
    expect(big.status).toBe(201);
    const body = await big.json();
    expect(body.changeCents).toBe(7000);
    expect(body.changeWarning).toMatch(/troco de R\$\s70,00 é maior que o dinheiro/i);
    expect(body.changeWarning).not.toMatch(/10,00/);
    // Now the drawer should have 10 + 30 = 40: a change of 20 is fine
    const ok = await sale({ clientId: `bal-${crypto.randomUUID()}`, items: [item()], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }] });
    expect((await ok.json()).changeWarning ?? null).toBeNull();
  });

  it('records the cash handed over and the change', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    const res = await sale({ clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }] });
    expect(res.status).toBe(201);
    expect((await res.json()).changeCents).toBe(2000);
    expect((await linesOf(clientId)).map((l) => [l.type, l.amountCents]).sort()).toEqual([['CHANGE', 2000], ['RECEIPT', 5000]]);
    expect((await prisma.orderSession.findUnique({ where: { id: clientId } })).status).toBe('CLOSED');
  });

  it('refuses the whole sale without an open shift (no comanda left behind)', async () => {
    const clientId = `bal-${crypto.randomUUID()}`;
    const res = await sale({ clientId, items: [item()], payments: [{ method: 'pix', amount: 30 }] });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
    expect(await prisma.orderSession.findUnique({ where: { id: clientId } })).toBeNull();
  });

  it('refuses payments that do not cover the total, leaving nothing behind', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    expect((await sale({ clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'pix', amount: 29 }] })).status).toBe(400);
    expect(await prisma.orderSession.findUnique({ where: { id: clientId } })).toBeNull();
  });

  it('the same clientId sent again records once', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    const body = { clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    await sale(body);
    const again = await (await sale(body)).json();
    expect(again.alreadyRecorded).toBe(true);
    expect(await linesOf(clientId)).toHaveLength(1);
  });

  it('legacy body (single paymentMethod) uses the default register shift', async () => {
    await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    expect((await sale({ clientId, items: [item()], paymentMethod: 'pix' })).status).toBe(201);
    expect((await linesOf(clientId)).map((l) => [l.type, l.method, l.amountCents])).toEqual([['RECEIPT', 'PIX', 3000]]);
  });

  it('a counter sale interrupted after its payments were recorded is closed by the replay, never left open', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    await prisma.orderSession.create({ data: { id: clientId, restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', customerName: 'Balcão' } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: A.restaurantId, cashSessionId: session.id, type: 'RECEIPT', method: 'PIX', amountCents: 3000, orderSessionId: clientId, createdById: A.ownerId } });
    const res = await sale({ clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] });
    expect((await res.json()).alreadyRecorded).toBe(true);
    expect((await prisma.orderSession.findUnique({ where: { id: clientId } })).status).toBe('CLOSED');
    expect(await linesOf(clientId)).toHaveLength(1);
  });

  it('sells a menu item without a ficha técnica (a soda): it gets a ficha simples (2026-10-12)', async () => {
    const cat = await prisma.menuCategory.create({ data: { restaurantId: A.restaurantId, name: `Bebidas ${tag}`, position: 9, active: true } });
    const soda = await prisma.menuItem.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, name: `Refri ${tag}`, price: 6, position: 0 } });
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    const res = await sale({ clientId, items: [{ menuItemId: soda.id, quantity: 2 }], cashSessionId: session.id, payments: [{ method: 'pix', amount: 12 }] });
    expect(res.status).toBe(201);
    const line = await prisma.orderSessionItem.findFirst({ where: { sessionId: clientId }, include: { recipe: true } });
    expect(line.recipe.name).toBe(`Refri ${tag}`);
    expect(Number(line.price)).toBe(6);
    expect((await prisma.menuItem.findUnique({ where: { id: soda.id } })).recipeId).toBe(line.recipeId);
  });

  it('a counter sale takes its ingredients out of stock without the kitchen screen (2026-10-13)', async () => {
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: A.restaurantId, name: `QS ${tag}` } });
    const bread = await prisma.ingredient.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, code: `QSB-${tag}`, name: 'Pão', standardUnit: 'un', purchaseUnit: 'un' } });
    await prisma.stock.create({ data: { restaurantId: A.restaurantId, ingredientId: bread.id, currentQuantity: 10 } });
    await prisma.recipeIngredient.create({ data: { recipeId: burger.id, ingredientId: bread.id, quantity: 1, unit: 'un' } });
    try {
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      const clientId = `bal-${crypto.randomUUID()}`;
      const res = await sale({ clientId, items: [{ recipeId: burger.id, quantity: 2 }], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 60 }] });
      expect(res.status).toBe(201);
      expect((await prisma.stock.findFirst({ where: { ingredientId: bread.id } })).currentQuantity).toBe(8);
      expect(await prisma.stockMovement.count({ where: { referenceType: 'ORDER_SESSION', referenceId: clientId, ingredientId: bread.id } })).toBe(1);
    } finally {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: burger.id } });
    }
  });

  it('a replay of a sale closed without its stock settled settles it (final review 2026-10-13)', async () => {
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: A.restaurantId, name: `QR ${tag}` } });
    const bread = await prisma.ingredient.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, code: `QRB-${tag}`, name: 'Pão', standardUnit: 'un', purchaseUnit: 'un' } });
    await prisma.stock.create({ data: { restaurantId: A.restaurantId, ingredientId: bread.id, currentQuantity: 10 } });
    await prisma.recipeIngredient.create({ data: { recipeId: burger.id, ingredientId: bread.id, quantity: 1, unit: 'un' } });
    try {
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      const clientId = `bal-${crypto.randomUUID()}`;
      // The sale closed, but its settlement failed (crash between the two): no stock movement
      await prisma.orderSession.create({ data: { id: clientId, restaurantId: A.restaurantId, userId: A.ownerId, status: 'CLOSED', closedAt: new Date() } });
      await prisma.orderSessionItem.create({ data: { sessionId: clientId, recipeId: burger.id, quantity: 1, price: 30 } });
      const res = await sale({ clientId, items: [{ recipeId: burger.id, quantity: 1 }], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 30 }] });
      expect((await res.json()).alreadyRecorded).toBe(true);
      expect((await prisma.stock.findFirst({ where: { ingredientId: bread.id } })).currentQuantity).toBe(9);
    } finally {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: burger.id } });
    }
  });
  // Cupom na venda balcão (spec 2026-11-16 cupom-whatsapp-balcao, parte 1b)
  describe('coupon', () => {
    let soda;
    const preview = (body) => couponPreview(new Request('http://x/api/comanda/coupon-preview', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }) as any);
    const coupon = (data) => prisma.coupon.create({ data: { restaurantId: A.restaurantId, kind: 'PERCENT', value: 10, maxPerCustomer: null, ...data } });
    // 2 x R$ 20
    const twoSodas = () => [{ menuItemId: soda.id, quantity: 2 }];

    beforeAll(async () => {
      const cat = await prisma.menuCategory.create({ data: { restaurantId: A.restaurantId, name: `Cup ${tag}`, position: 9, active: true } });
      soda = await prisma.menuItem.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, name: `Suco ${tag}`, price: 20, position: 0 } });
    });

    it('counter sale with coupon charges the discounted total', async () => {
      const c = await coupon({ code: `BA${tag}`.toUpperCase() });
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      const short = `bal-${crypto.randomUUID()}`;
      const refused = await sale({ clientId: short, items: twoSodas(), couponCode: c.code, cashSessionId: session.id, payments: [{ method: 'pix', amount: 35 }] });
      expect(refused.status).toBe(400);
      expect((await refused.json()).error).toMatch(/Faltam/);
      expect(await prisma.orderSession.findUnique({ where: { id: short } })).toBeNull();
      expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(0);

      const clientId = `bal-${crypto.randomUUID()}`;
      const res = await sale({ clientId, items: twoSodas(), couponCode: c.code.toLowerCase(), cashSessionId: session.id, payments: [{ method: 'pix', amount: 36 }] });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.couponDiscountCents).toBe(400);
      expect(body.couponWarning ?? null).toBeNull();
      const s = await prisma.orderSession.findUnique({ where: { id: clientId } });
      expect([s.status, s.couponCode, s.couponDiscountCents]).toEqual(['CLOSED', c.code, 400]);
      expect((await linesOf(clientId)).map((l) => l.amountCents)).toEqual([3600]);
      const uses = await prisma.couponRedemption.findMany({ where: { orderSessionId: clientId, restaurantId: A.restaurantId } });
      expect(uses.map((u) => [u.discountCents, u.outOfRule])).toEqual([[400, false]]);
    });

    it('replay after the limit ran out records once, with the discount and outOfRule', async () => {
      const c = await coupon({ code: `LI${tag}`.toUpperCase(), maxUses: 1 });
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      // Previewed online...
      expect((await preview({ code: c.code, items: twoSodas() })).status).toBe(200);
      // ...then another sale took the last use before this one reached the server
      await prisma.coupon.update({ where: { id: c.id }, data: { usedCount: 1 } });
      const ruleText = (await (await preview({ code: c.code, items: twoSodas() })).json()).error;
      expect(ruleText).toBeTruthy();

      const clientId = `bal-${crypto.randomUUID()}`;
      const key = crypto.randomUUID();
      const body = { clientId, items: twoSodas(), couponCode: c.code, cashSessionId: session.id, payments: [{ method: 'pix', amount: 36 }], queuedAt: new Date().toISOString() };
      const first = await sale(body, key);
      expect(first.status).toBe(201);
      const firstBody = await first.json();
      expect(firstBody.couponDiscountCents).toBe(400);
      expect(firstBody.couponWarning).toBe(ruleText);
      const again = await sale(body, key);
      expect(again.status).toBe(201);
      expect((await again.json()).couponWarning).toBe(ruleText);

      expect(await prisma.orderSession.count({ where: { id: clientId } })).toBe(1);
      const uses = await prisma.couponRedemption.findMany({ where: { orderSessionId: clientId } });
      expect(uses.map((u) => [u.discountCents, u.outOfRule])).toEqual([[400, true]]);
      expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(2);
      expect(await linesOf(clientId)).toHaveLength(1);
    });

    // Spec parte 1b: a code that no longer exists never fails the sale (it may have waited offline): full price, a warning
    it('unknown code: the sale goes in at full price with a warning, no use recorded', async () => {
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      const clientId = `bal-${crypto.randomUUID()}`;
      const short = await sale({ clientId, items: twoSodas(), couponCode: `NO${tag}`, cashSessionId: session.id, payments: [{ method: 'pix', amount: 36 }] });
      expect(short.status).toBe(400);
      expect((await short.json()).error).toMatch(/Faltam/);
      const res = await sale({ clientId, items: twoSodas(), couponCode: `NO${tag}`, cashSessionId: session.id, payments: [{ method: 'pix', amount: 40 }] });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect([body.couponDiscountCents, body.couponWarning]).toEqual([0, INVALID]);
      const s = await prisma.orderSession.findUnique({ where: { id: clientId } });
      expect([s.status, s.couponCode, s.couponDiscountCents]).toEqual(['CLOSED', null, 0]);
      expect(await prisma.couponRedemption.count({ where: { orderSessionId: clientId } })).toBe(0);
      expect((await linesOf(clientId)).map((l) => l.amountCents)).toEqual([4000]);
    });

    it('preview never writes', async () => {
      const c = await coupon({ code: `PV${tag}`.toUpperCase() });
      const sessionsBefore = await prisma.orderSession.count({ where: { restaurantId: A.restaurantId } });
      const res = await preview({ code: c.code.toLowerCase(), items: twoSodas() });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ code: c.code, discountCents: 400, label: '10% de desconto' });
      expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(0);
      expect(await prisma.couponRedemption.count({ where: { couponId: c.id } })).toBe(0);
      expect(await prisma.orderSession.count({ where: { restaurantId: A.restaurantId } })).toBe(sessionsBefore);
      const unknown = await preview({ code: `NO${tag}`, items: twoSodas() });
      expect(unknown.status).toBe(422);
      expect((await unknown.json()).error).toBe(INVALID);
    });

    // Last in this block: the tries of this user stay used up for a minute
    it('a live sale with a code over the try limit is refused 429, nothing written; a queued replay is never limited', async () => {
      const c = await coupon({ code: `TL${tag}`.toUpperCase() });
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      for (let i = 0; i < TRIES_PER_MINUTE; i++) takeCouponTry('user:' + A.ownerId, A.restaurantId);
      const live = `bal-${crypto.randomUUID()}`;
      const refused = await sale({ clientId: live, items: twoSodas(), couponCode: c.code, cashSessionId: session.id, payments: [{ method: 'pix', amount: 36 }] });
      expect(refused.status).toBe(429);
      expect((await refused.json()).error).toBe('Muitas tentativas. Tente em um minuto.');
      expect(await prisma.orderSession.findUnique({ where: { id: live } })).toBeNull();
      expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(0);

      const queued = `bal-${crypto.randomUUID()}`;
      const ok = await sale({ clientId: queued, items: twoSodas(), couponCode: c.code, cashSessionId: session.id, payments: [{ method: 'pix', amount: 36 }], queuedAt: new Date().toISOString() });
      expect(ok.status).toBe(201);
      expect((await ok.json()).couponDiscountCents).toBe(400);
      expect((await prisma.orderSession.findUnique({ where: { id: queued } })).status).toBe('CLOSED');
    });
  });
});
