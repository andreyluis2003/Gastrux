// @ts-nocheck
/**
 * Compras: a list marked Recebido puts its items in stock (2026-10-13: the status changed and nothing
 * else, so a purchase never reached Estoque nor the ingredient cost). Parcial puts in the checked items;
 * Recebido later puts in the rest. Each item enters once.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT as putList } from '../../../app/api/shopping-lists/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('Compras: receiving a list puts it in stock', () => {
  let ownerId, rid, catId;
  const email = `sl-${tag}@gastrux.test`;
  const put = (id, body) => putList(new Request(`http://x/api/shopping-lists/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any, { params: { id } });
  const newIngredient = async (code, unit = 'kg') =>
    (await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: catId, code: `${code}-${tag}`, name: code, standardUnit: unit, purchaseUnit: unit } })).id;
  const stockOf = async (ingredientId) => (await prisma.stock.findFirst({ where: { ingredientId } }))?.currentQuantity ?? null;
  const newList = async (items) => {
    const list = await prisma.shoppingList.create({ data: { restaurantId: rid, listDate: new Date(), status: 'ORDERED' } });
    for (const it of items) {
      await prisma.shoppingListItem.create({ data: { restaurantId: rid, shoppingListId: list.id, priority: 'MEDIUM', ...it } });
    }
    return list.id;
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SL ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    catId = (await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `SL ${tag}` } })).id;
    const s = { user: { id: ownerId, email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  });
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { userId: ownerId } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('Recebido: every item enters stock (stock created when missing) and the cost follows the list price', async () => {
    const rice = await newIngredient('Arroz');
    const oil = await newIngredient('Oleo', 'l');
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: oil, currentQuantity: 1 } });
    const id = await newList([
      { ingredientId: rice, quantity: 5, unit: 'kg', estimatedCost: 30 },
      { ingredientId: oil, quantity: 2, unit: 'l', estimatedCost: 18 },
      { ingredientId: null, quantity: 1, unit: 'un', estimatedCost: 4, notes: 'Item não cadastrado: Guardanapo' },
    ]);
    const res = await put(id, { status: 'RECEIVED' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toEqual({ entered: 2, skipped: ['Guardanapo'] });
    expect(await stockOf(rice)).toBe(5);
    expect(await stockOf(oil)).toBe(3);
    expect((await prisma.ingredient.findUnique({ where: { id: rice } })).referenceCost).toBeCloseTo(6);
    const moves = await prisma.stockMovement.findMany({ where: { ingredientId: rice } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ movementType: 'ENTRY', quantity: 5, referenceType: 'SHOPPING_LIST_ITEM' });
  });

  it('a second Recebido (double tap, retry) puts nothing in again', async () => {
    const rice = await newIngredient('Arroz2');
    const id = await newList([{ ingredientId: rice, quantity: 5, unit: 'kg', estimatedCost: 30 }]);
    await Promise.all([put(id, { status: 'RECEIVED' }), put(id, { status: 'RECEIVED' })]);
    expect((await put(id, { status: 'RECEIVED' })).status).toBe(200);
    expect(await stockOf(rice)).toBe(5);
  });

  it('Parcial puts in the checked items; Recebido later puts in only the rest', async () => {
    const a = await newIngredient('Tomate');
    const b = await newIngredient('Cebola');
    const id = await newList([
      { ingredientId: a, quantity: 3, unit: 'kg', estimatedCost: 15, checked: true },
      { ingredientId: b, quantity: 2, unit: 'kg', estimatedCost: 8 },
    ]);
    expect((await put(id, { status: 'PARTIAL' })).status).toBe(200);
    expect(await stockOf(a)).toBe(3);
    expect(await stockOf(b)).toBeNull();
    expect((await put(id, { status: 'RECEIVED' })).status).toBe(200);
    expect(await stockOf(a)).toBe(3);
    expect(await stockOf(b)).toBe(2);
  });

  it('an item bought in grams enters an ingredient counted in kg converted', async () => {
    const cheese = await newIngredient('Queijo');
    const id = await newList([{ ingredientId: cheese, quantity: 500, unit: 'g', estimatedCost: 25 }]);
    expect((await put(id, { status: 'RECEIVED' })).status).toBe(200);
    expect(await stockOf(cheese)).toBeCloseTo(0.5);
    expect((await prisma.ingredient.findUnique({ where: { id: cheese } })).referenceCost).toBeCloseTo(50);
  });

  it('an unknown status is refused', async () => {
    const id = await newList([]);
    expect((await put(id, { status: 'DELIVERED' })).status).toBe(400);
  });
});
