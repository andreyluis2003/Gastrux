// @ts-nocheck
/** GET /api/recipes/[id]/cost: the ficha shown inside the product (2026-10-18 UX research, proposal 4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as COST } from '../../../app/api/recipes/[id]/cost/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('recipe cost route', () => {
  let rid, other, owner, cook, recipe, alien;
  const as = (u) => {
    const s = { user: { id: u.id, email: u.email, role: u.role }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const get = (id) => COST(new NextRequest(`http://x/api/recipes/${id}/cost`), { params: { id } });

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `rc-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `RC ${tag}`, ownerId: o.id, status: 'ACTIVE', isInternal: true } })).id;
    other = (await prisma.restaurant.create({ data: { name: `RC2 ${tag}`, ownerId: o.id, status: 'ACTIVE', isInternal: true } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const c = await prisma.user.create({ data: { email: `rc-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    cook = { id: c.id, email: c.email, role: 'COOK' };
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    const picanha = await prisma.ingredient.create({ data: { restaurantId: rid, code: `P${tag}`, name: 'Picanha', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 80 } });
    const pao = await prisma.ingredient.create({ data: { restaurantId: rid, code: `B${tag}`, name: 'Pão', categoryId: cat.id, standardUnit: 'un', purchaseUnit: 'un', referenceCost: 0 } });
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Espeto de picanha', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 25,
      ingredients: { create: [{ ingredientId: picanha.id, quantity: 0.15, unit: 'kg' }, { ingredientId: pao.id, quantity: 1, unit: 'un' }] } } });
    alien = await prisma.recipe.create({ data: { restaurantId: other, code: `X${tag}`, name: 'Alheio', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.recipeIngredient.deleteMany({ where: { recipeId: { in: [recipe.id, alien.id] } } }); } catch {}
    try { await prisma.recipe.deleteMany({ where: { id: { in: [recipe.id, alien.id] } } }); } catch {}
    try { await prisma.ingredient.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.ingredientCategory.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, other] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } }); } catch {}
  });

  it('the owner gets the lines, the cost and the insumos without cost', async () => {
    as(owner);
    const res = await get(recipe.id);
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out.cost).toBeCloseTo(12, 6);
    expect(out.lines.map((l) => l.name)).toEqual(['Picanha', 'Pão']);
    expect(out.missingCost).toEqual(['Pão']);
    expect(out).toMatchObject({ recipeName: 'Espeto de picanha', editHref: `/receitas/${recipe.id}` });
  });

  it('another restaurant\'s ficha: 404; the cook does not see costs', async () => {
    as(owner);
    expect((await get(alien.id)).status).toBe(404);
    as(cook);
    expect((await get(recipe.id)).status).toBe(403);
  });
});
