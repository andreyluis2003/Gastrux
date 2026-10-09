// @ts-nocheck
/** Shelf life on the recipe and ingredient forms (spec 2026-10-09 etiquetas, 4.1, 5.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT as UPDATE_RECIPE } from '../../../app/api/recipes/[id]/route';
import { PUT as UPDATE_INGREDIENT } from '../../../app/api/ingredients/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('shelf life on recipes and ingredients', () => {
  let rid: string, ownerId: string, recipeId: string, ingredientId: string, categoryId: string;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ls-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ls ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `LS${tag}`, name: 'Arroz', baseYield: 1, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0 } })).id;
    categoryId = (await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Laticínios' } })).id;
    ingredientId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `LSI${tag}`, name: 'Creme', categoryId, standardUnit: 'l', purchaseUnit: 'l', referenceCost: 1 } })).id;
    const s = { user: { id: ownerId, email: o.email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { userId: ownerId } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('new items get the defaults (preparation 0/3/30, ingredient -/3/-)', async () => {
    const r = await prisma.recipe.findUnique({ where: { id: recipeId } });
    const i = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    expect([r.shelfLifeAmbientDays, r.shelfLifeChilledDays, r.shelfLifeFrozenDays]).toEqual([0, 3, 30]);
    expect([i.shelfLifeAmbientDays, i.shelfLifeChilledDays, i.shelfLifeFrozenDays]).toEqual([null, 3, null]);
  });

  it('the forms save the days; empty clears; invalid is refused', async () => {
    const put = (body: any) => UPDATE_RECIPE(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ name: 'Arroz', baseYield: 1, yieldUnit: 'kg', portionUnit: 'g', ...body }) }), { params: { id: recipeId } });
    expect((await put({ shelfLifeAmbientDays: '', shelfLifeChilledDays: '5', shelfLifeFrozenDays: 60 })).status).toBeLessThan(300);
    const r = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect([r.shelfLifeAmbientDays, r.shelfLifeChilledDays, r.shelfLifeFrozenDays]).toEqual([null, 5, 60]);
    expect((await put({ shelfLifeChilledDays: -2 })).status).toBe(400);
    const ing = await UPDATE_INGREDIENT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ name: 'Creme', categoryId, referenceCost: 1, shelfLifeChilledDays: '4' }) }), { params: { id: ingredientId } });
    expect(ing.status).toBeLessThan(300);
    expect((await prisma.ingredient.findUnique({ where: { id: ingredientId } })).shelfLifeChilledDays).toBe(4);
  });
});
