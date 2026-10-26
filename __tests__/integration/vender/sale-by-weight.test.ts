// @ts-nocheck
/**
 * Venda por peso (spec 2026-10-25 venda-por-peso): a line by weight is priced on the server from the
 * price per kg, never merges, takes no modifiers nor quantity changes, goes to the kitchen with its
 * weight and takes from stock what its ficha (1 kg) says times the kg sold.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { PUT } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { settleSessionStock } from '../../../lib/stock/session-stock';
import { itemSalesInRange } from '../../../lib/finance/item-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) =>
  new NextRequest('http://x', { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } });

describe('sale by weight', () => {
  let rid, ownerId, breadItem, breadRecipe, flour, cokeItem, cheese;
  const add = (sid, body) => ADD(req('POST', body), { params: { id: sid } });
  const newSession = async () => (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN' } })).id;
  const lines = (sid) => prisma.orderSessionItem.findMany({ where: { sessionId: sid }, orderBy: { addedAt: 'asc' } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `peso-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Peso ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const icat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Cat ${tag}` } });
    flour = await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: icat.id, code: `FA-${tag}`, name: 'Farinha', standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 0, referenceCost: 5 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: flour.id, currentQuantity: 10 } });
    // The ficha of a product sold by weight describes 1 kg: 0.8 kg of flour per kg of bread
    breadRecipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `PF-${tag}`, name: 'Pão francês', baseYield: 1, yieldUnit: 'kg', portionUnit: 'kg', ingredients: { create: [{ ingredientId: flour.id, quantity: 0.8, unit: 'kg' }] } } });
    const coke = await prisma.recipe.create({ data: { restaurantId: rid, code: `CO-${tag}`, name: 'Coca', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Padaria', position: 0, active: true } });
    breadItem = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Pão francês', price: 18.9, recipeId: breadRecipe.id, soldByWeight: true } });
    cokeItem = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca', price: 6, recipeId: coke.id, position: 1 } });
    cheese = (await prisma.itemModifier.create({ data: { restaurantId: rid, name: 'Queijo', priceAdjustment: 2 } })).id;
    const session = { user: { id: ownerId, email: `peso-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: rid } } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('prices the line on the server from the price per kg and keeps quantity 1', async () => {
    const sid = await newSession();
    const res = await add(sid, { menuItemId: breadItem.id, weightGrams: 350, price: 0.01 });
    expect(res.status).toBe(201);
    const [line] = await lines(sid);
    expect([line.quantity, line.weightGrams, Number(line.pricePerKg), Number(line.price)]).toEqual([1, 350, 18.9, 6.62]);
  });

  it('refuses a line by weight without a valid weight, and a weight on a unit item', async () => {
    const sid = await newSession();
    for (const body of [{ menuItemId: breadItem.id }, { menuItemId: breadItem.id, weightGrams: 0 }, { menuItemId: breadItem.id, weightGrams: 60000 }, { menuItemId: breadItem.id, weightGrams: 1.5 }]) {
      const res = await add(sid, body);
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 400]);
    }
    expect((await add(sid, { menuItemId: cokeItem.id, weightGrams: 300 })).status).toBe(400);
    expect((await add(sid, { menuItemId: breadItem.id, weightGrams: 300, modifierIds: [cheese] })).status).toBe(400);
    expect(await lines(sid)).toHaveLength(0);
  });

  it('never merges two weighings, even on a one-tap add', async () => {
    const sid = await newSession();
    await add(sid, { menuItemId: breadItem.id, weightGrams: 300, merge: true });
    await add(sid, { menuItemId: breadItem.id, weightGrams: 300, merge: true });
    expect((await lines(sid)).map((l) => [l.quantity, l.weightGrams])).toEqual([[1, 300], [1, 300]]);
  });

  it('a weighed line takes no quantity change; the note can change', async () => {
    const sid = await newSession();
    await add(sid, { menuItemId: breadItem.id, weightGrams: 300 });
    const [line] = await lines(sid);
    const put = (body) => PUT(req('PUT', body), { params: { id: sid, itemId: line.id } });
    expect((await put({ quantity: 2 })).status).toBe(409);
    expect((await put({ quantityDelta: 1 })).status).toBe(409);
    expect((await put({ modifierIds: [cheese] })).status).toBe(409);
    expect((await put({ specialInstructions: 'bem moreno' })).status).toBe(200);
    expect((await lines(sid)).map((l) => [l.quantity, l.specialInstructions])).toEqual([[1, 'bem moreno']]);
    // Undo of the add removes the whole weighing
    expect((await put({ quantityDelta: -1 })).status).toBe(200);
    expect(await lines(sid)).toHaveLength(0);
  });

  it('goes to the kitchen with its weight and takes kg × ficha from stock at the close', async () => {
    const sid = await newSession();
    await add(sid, { menuItemId: breadItem.id, weightGrams: 500 });
    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    const kitchen = await prisma.orderItem.findMany({ where: { order: { orderSessionId: sid } } });
    expect(kitchen.map((k) => [k.quantity, k.weightGrams])).toEqual([[1, 500]]);
    const before = Number((await prisma.stock.findFirst({ where: { ingredientId: flour.id } })).currentQuantity);
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED', closedAt: new Date() } });
    await settleSessionStock(prisma, rid, sid);
    const after = Number((await prisma.stock.findFirst({ where: { ingredientId: flour.id } })).currentQuantity);
    expect(after).toBeCloseTo(before - 0.4);
  });

  it('reports the kg sold and the money charged', async () => {
    const from = new Date(Date.now() - 3600_000);
    const sales = await itemSalesInRange(rid, from, new Date(Date.now() + 60_000));
    const bread = sales.find((s) => s.recipeId === breadRecipe.id);
    // 350 + 300 + 300 + 500 g (the undone line is gone)
    expect(bread.byWeight).toBe(true);
    expect(bread.quantity).toBeCloseTo(1.45);
    expect(bread.revenue).toBeCloseTo(6.62 + 5.67 + 5.67 + 9.45);
  });
});
