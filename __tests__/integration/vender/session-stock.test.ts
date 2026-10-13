// @ts-nocheck
/** A closed sale takes its ingredients out of stock once, kitchen screen or not (2026-10-13) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { settleSessionStock } from '../../../lib/stock/session-stock';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('stock at the sale', () => {
  let ownerId, rid, otherRid, burger, blend, bread, salt, foreign;
  const stockOf = async (ingredientId) => (await prisma.stock.findFirst({ where: { ingredientId } }))?.currentQuantity ?? null;
  const closedSale = async (lines) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', tableNumber: 1, closedAt: new Date() } });
    for (const [recipeId, quantity] of lines) await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, quantity, price: 30 } });
    return s.id;
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `ss-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `SS2 ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Cat ${tag}` } });
    const ing = (name, code) => prisma.ingredient.create({ data: { restaurantId: rid, categoryId: cat.id, code: `${code}-${tag}`, name, standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 0, referenceCost: 10 } });
    blend = await ing('Blend', 'BL'); bread = await ing('Pão', 'PA'); salt = await ing('Sal', 'SA');
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: blend.id, currentQuantity: 10 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: bread.id, currentQuantity: 20 } });
    // salt has no Stock row: not controlled
    burger = await prisma.recipe.create({ data: { restaurantId: rid, code: `BG-${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', ingredients: { create: [{ ingredientId: blend.id, quantity: 0.15, unit: 'kg' }, { ingredientId: bread.id, quantity: 1, unit: 'un' }, { ingredientId: salt.id, quantity: 0.01, unit: 'kg' }] } } });
    const ocat = await prisma.ingredientCategory.create({ data: { restaurantId: otherRid, name: `OCat ${tag}` } });
    const oing = await prisma.ingredient.create({ data: { restaurantId: otherRid, categoryId: ocat.id, code: `OI-${tag}`, name: 'Alheio', standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 0, referenceCost: 1 } });
    await prisma.stock.create({ data: { restaurantId: otherRid, ingredientId: oing.id, currentQuantity: 5 } });
    foreign = await prisma.recipe.create({ data: { restaurantId: otherRid, code: `FR-${tag}`, name: 'Alheia', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', ingredients: { create: [{ ingredientId: oing.id, quantity: 1, unit: 'un' }] } } });
    foreign.ing = oing;
  });
  afterAll(async () => {
    for (const id of [rid, otherRid]) {
      await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: id } } });
      try { await prisma.restaurant.delete({ where: { id } }); } catch {}
    }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a closed sale takes its controlled ingredients out once; the uncontrolled one is only recorded', async () => {
    const sid = await closedSale([[burger.id, 2]]);
    const b0 = await stockOf(blend.id), p0 = await stockOf(bread.id);
    await settleSessionStock(prisma, rid, sid);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(blend.id)).toBeCloseTo(b0 - 0.3);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 - 2);
    expect(await stockOf(salt.id)).toBeNull();
    const moves = await prisma.stockMovement.findMany({ where: { referenceType: 'ORDER_SESSION', referenceId: sid } });
    expect(moves.map((m) => [m.ingredientId, m.quantity, m.movementType]).sort()).toEqual(
      [[blend.id, -0.3, 'AUTO_DEDUCTION'], [bread.id, -2, 'AUTO_DEDUCTION'], [salt.id, -0.02, 'AUTO_DEDUCTION']].sort()
    );
  });

  it('what the kitchen already took is not taken again', async () => {
    const sid = await closedSale([[burger.id, 1]]);
    const order = await prisma.order.create({ data: { restaurantId: rid, orderNumber: `K-${tag}-1`, orderType: 'DINE_IN', status: 'COMPLETED', total: 30, orderSessionId: sid } });
    await prisma.stockMovement.create({ data: { restaurantId: rid, ingredientId: bread.id, quantity: -1, movementType: 'AUTO_DEDUCTION', referenceType: 'ORDER', referenceId: order.id } });
    const p0 = await stockOf(bread.id);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(bread.id)).toBeCloseTo(p0);
  });

  it('a reopened bill that lost a line gives that stock back once; the kitchen part never comes back', async () => {
    const sid = await closedSale([[burger.id, 3]]);
    await settleSessionStock(prisma, rid, sid);
    const p0 = await stockOf(bread.id);
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'OPEN' } });
    await prisma.orderSessionItem.updateMany({ where: { sessionId: sid }, data: { quantity: 1 } });
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED' } });
    await settleSessionStock(prisma, rid, sid);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 + 2);
  });

  it('an open or cancelled comanda is not settled', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN', tableNumber: 2 } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, quantity: 1, price: 30 } });
    expect((await settleSessionStock(prisma, rid, s.id)).moved).toBe(0);
    expect(await prisma.stockMovement.count({ where: { referenceId: s.id } })).toBe(0);
  });

  it('another restaurant\'s recipe never moves stock', async () => {
    const sid = await closedSale([[foreign.id, 1]]);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(foreign.ing.id)).toBe(5);
  });

  it('two settlements at the same instant deduct once', async () => {
    const sid = await closedSale([[burger.id, 1]]);
    const p0 = await stockOf(bread.id);
    await Promise.all([settleSessionStock(prisma, rid, sid), settleSessionStock(prisma, rid, sid)]);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 - 1);
  });
});
