// @ts-nocheck
/** POST /api/recipes/[id]/scale: Escalonar receita (2026-10-19). The screen called this route, which never existed. */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as SCALE } from '../../../app/api/recipes/[id]/scale/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('recipe scale route', () => {
  let rid, other, owner, cook, cashier, recipe, alien;
  const as = (u) => {
    const s = { user: { id: u.id, email: u.email, role: u.role }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const post = (id, body) => SCALE(new NextRequest(`http://x/api/recipes/${id}/scale`, { method: 'POST', body: JSON.stringify(body) }), { params: { id } });
  const member = async (prefix, role) => {
    const u = await prisma.user.create({ data: { email: `${prefix}-${tag}@gastrux.test`, name: prefix, password: 'x', role, currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    return { id: u.id, email: u.email, role };
  };

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `rs-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `RS ${tag}`, ownerId: o.id, status: 'ACTIVE', isInternal: true } })).id;
    other = (await prisma.restaurant.create({ data: { name: `RS2 ${tag}`, ownerId: o.id, status: 'ACTIVE', isInternal: true } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    cook = await member('rs-c', 'COOK');
    cashier = await member('rs-x', 'CASHIER');
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    const picanha = await prisma.ingredient.create({ data: { restaurantId: rid, code: `P${tag}`, name: 'Picanha', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 80 } });
    const sal = await prisma.ingredient.create({ data: { restaurantId: rid, code: `S${tag}`, name: 'Sal', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 2 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: picanha.id, currentQuantity: 5 } });
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Espeto de picanha', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 25,
      ingredients: { create: [{ ingredientId: picanha.id, quantity: 0.2, unit: 'kg' }, { ingredientId: sal.id, quantity: 5, unit: 'g' }] } } });
    alien = await prisma.recipe.create({ data: { restaurantId: other, code: `X${tag}`, name: 'Alheio', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.recipeIngredient.deleteMany({ where: { recipeId: { in: [recipe.id, alien.id] } } }); } catch {}
    try { await prisma.recipe.deleteMany({ where: { id: { in: [recipe.id, alien.id] } } }); } catch {}
    try { await prisma.stock.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.ingredient.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.ingredientCategory.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurantUser.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, other] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id, cashier.id] } } }); } catch {}
  });

  it('the owner gets the insumos of 30 portions, the stock check and the cost', async () => {
    as(owner);
    const res = await post(recipe.id, { quantity: 30 });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.recipeName).toBe('Espeto de picanha');
    const [picanha, sal] = out.lines;
    expect(picanha).toMatchObject({ name: 'Picanha', quantity: 6, unit: 'kg', inStock: 5, enough: false });
    expect(picanha.missing).toBeCloseTo(1, 9);
    expect(sal).toMatchObject({ name: 'Sal', quantity: 150, unit: 'g', inStock: null, enough: null });
    expect(out.totalCost).toBeCloseTo(480.3, 6);
  });

  it('the cook gets the quantities and the stock, never the cost', async () => {
    as(cook);
    const out = await (await post(recipe.id, { quantity: 30 })).json();
    expect(out.lines[0]).toMatchObject({ quantity: 6, enough: false });
    expect(out.lines.every((l) => l.cost === undefined)).toBe(true);
    expect(out.totalCost).toBeUndefined();
    expect(out.missingCost).toBeUndefined();
  });

  it('the cashier is refused', async () => {
    as(cashier);
    expect((await post(recipe.id, { quantity: 30 })).status).toBe(403);
  });

  it('another restaurant\'s recipe is not found; a bad quantity is refused', async () => {
    as(owner);
    expect((await post(alien.id, { quantity: 10 })).status).toBe(404);
    for (const quantity of [0, -1, 'abc', 100001, null]) expect((await post(recipe.id, { quantity })).status).toBe(400);
  });
});
