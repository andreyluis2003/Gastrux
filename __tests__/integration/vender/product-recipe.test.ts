// @ts-nocheck
/** Ficha simples: a menu item without a ficha técnica sells everywhere (owner, 2026-10-12) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { ensureMenuItemRecipes } from '../../../lib/cardapio/product-recipe';
import { seedStarterTemplate } from '../../../lib/onboarding/seed-template';
import { checkTierLimit } from '../../../lib/tier-guard';
import { getDashboardStats } from '../../../lib/dashboard/stats';
import { POST as createRoute } from '../../../app/api/cardapio/itens/route';
import { PUT as updateRoute, DELETE as deleteRoute } from '../../../app/api/cardapio/itens/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('ficha simples', () => {
  let ownerId, rid, otherRid, cat, otherCat;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `pr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `PR ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `PR2 ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    otherCat = await prisma.menuCategory.create({ data: { restaurantId: otherRid, name: 'Bebidas', position: 0, active: true } });
  });
  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const json = (method, body) => new Request('http://x/api/cardapio/itens', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any;
  const createItem = (body) => createRoute(json('POST', body));
  const updateItem = (id, body) => updateRoute(json('PUT', body), { params: { id } });
  const item = (restaurantId, categoryId, name) => prisma.menuItem.create({ data: { restaurantId, categoryId, name, description: '350 ml', price: 6, position: 0 } });

  it('links a ficha simples with the item name and price, no ingredients', async () => {
    const mi = await item(rid, cat.id, `Refri ${tag}`);
    expect(await ensureMenuItemRecipes(prisma, rid, [mi.id])).toBe(1);
    const linked = await prisma.menuItem.findUnique({ where: { id: mi.id }, include: { recipe: { include: { ingredients: true } } } });
    expect(linked.recipe).toMatchObject({ restaurantId: rid, name: `Refri ${tag}`, description: '350 ml', sellingPrice: 6, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' });
    expect(linked.recipe.code).toMatch(/^PROD-[0-9A-F]{8}$/);
    expect(linked.recipe.ingredients).toEqual([]);
    expect(await ensureMenuItemRecipes(prisma, rid, [mi.id])).toBe(0); // already linked
  });

  it('two sales of the same item at the same instant create one ficha', async () => {
    const mi = await item(rid, cat.id, `Agua ${tag}`);
    await Promise.all([ensureMenuItemRecipes(prisma, rid, [mi.id]), ensureMenuItemRecipes(prisma, rid, [mi.id])]);
    expect(await prisma.recipe.count({ where: { restaurantId: rid, name: `Agua ${tag}` } })).toBe(1);
  });

  it('never links another restaurant\'s item', async () => {
    const theirs = await item(otherRid, otherCat.id, `Suco ${tag}`);
    expect(await ensureMenuItemRecipes(prisma, rid, [theirs.id])).toBe(0);
    expect((await prisma.menuItem.findUnique({ where: { id: theirs.id } })).recipeId).toBeNull();
  });

  it('without ids, links every unlinked item of the restaurant', async () => {
    await item(rid, cat.id, `Cerveja ${tag}`);
    expect(await ensureMenuItemRecipes(prisma, rid)).toBeGreaterThanOrEqual(1);
    expect(await prisma.menuItem.count({ where: { restaurantId: rid, recipeId: null } })).toBe(0);
  });

  it('the example menu of a new account has no item without a ficha', async () => {
    const fresh = (await prisma.restaurant.create({ data: { name: `Seed ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    try {
      await seedStarterTemplate(fresh, 'hamburgueria');
      expect(await prisma.menuItem.count({ where: { restaurantId: fresh } })).toBeGreaterThan(0);
      expect(await prisma.menuItem.count({ where: { restaurantId: fresh, recipeId: null } })).toBe(0);
    } finally {
      await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: fresh } } });
      await prisma.restaurant.delete({ where: { id: fresh } });
    }
  });

  it('an item created in the Cardápio digital without a ficha gets one; unlinking keeps it selling and leaves the old recipe', async () => {
    as(ownerId, rid);
    const res = await createItem({ categoryId: cat.id, name: `Novo ${tag}`, price: 9 });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.recipeId).not.toBeNull();
    const real = await prisma.recipe.create({ data: { restaurantId: rid, code: `R-${tag}`, name: 'Real', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    expect((await updateItem(created.id, { recipeId: real.id })).status).toBe(200);
    expect((await updateItem(created.id, { recipeId: '' })).status).toBe(200);
    const after = await prisma.menuItem.findUnique({ where: { id: created.id } });
    expect(after.recipeId).not.toBeNull();
    expect(after.recipeId).not.toBe(real.id);
    expect(await prisma.recipe.findUnique({ where: { id: real.id } })).not.toBeNull();
  });

  it('renaming an item renames its ficha simples (the comanda, kitchen and cupom read the ficha), never a real ficha', async () => {
    as(ownerId, rid);
    const created = await (await createItem({ categoryId: cat.id, name: `Refri lata ${tag}`, price: 6 })).json();
    await updateItem(created.id, { name: `Coca lata ${tag}`, price: 7 });
    const simple = await prisma.menuItem.findUnique({ where: { id: created.id }, include: { recipe: true } });
    expect(simple.recipe.name).toBe(`Coca lata ${tag}`);
    expect(simple.recipe.sellingPrice).toBe(7);
    const real = await prisma.recipe.create({ data: { restaurantId: rid, code: `RR-${tag}`, name: 'Burger da cozinha', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    await updateItem(created.id, { recipeId: real.id });
    await updateItem(created.id, { name: `Burger ${tag}` });
    expect((await prisma.recipe.findUnique({ where: { id: real.id } })).name).toBe('Burger da cozinha');
  });

  it('fichas simples do not count toward the plan recipe limit nor the home "Receitas" card (final review)', async () => {
    const lim = (await prisma.restaurant.create({ data: { name: `Lim ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    try {
      const c = await prisma.menuCategory.create({ data: { restaurantId: lim, name: 'Bebidas', position: 0, active: true } });
      for (let i = 0; i < 12; i++) await item(lim, c.id, `Bebida ${i} ${tag}`);
      await ensureMenuItemRecipes(prisma, lim);
      await prisma.recipe.create({ data: { restaurantId: lim, code: `OWN-${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
      const check = await checkTierLimit(lim, 'recipes');
      expect(check.current).toBe(1);
      expect(check.allowed).toBe(true);
      expect((await getDashboardStats(lim)).recipes.value).toBe(1);
    } finally {
      await prisma.restaurant.delete({ where: { id: lim } });
    }
  });

  describe('no orphan fichas simples (final review)', () => {
    const simpleOf = async (id) => (await prisma.menuItem.findUnique({ where: { id }, include: { recipe: true } })).recipe;
    const realFicha = (name) => prisma.recipe.create({ data: { restaurantId: rid, code: `RF-${crypto.randomBytes(3).toString('hex')}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });

    it('linking the item to a real ficha retires its ficha simples', async () => {
      as(ownerId, rid);
      const created = await (await createItem({ categoryId: cat.id, name: `Burger ${tag}`, price: 30 })).json();
      const simple = await simpleOf(created.id);
      const real = await realFicha('Burger da cozinha');
      await updateItem(created.id, { recipeId: real.id });
      expect((await prisma.recipe.findUnique({ where: { id: simple.id } })).active).toBe(false);
    });

    it('"Sem ficha técnica" on an item already on its ficha simples keeps that same ficha', async () => {
      as(ownerId, rid);
      const created = await (await createItem({ categoryId: cat.id, name: `Gelo ${tag}`, price: 2 })).json();
      const before = await simpleOf(created.id);
      await updateItem(created.id, { recipeId: '' });
      const after = await simpleOf(created.id);
      expect(after.id).toBe(before.id);
      expect(after.active).toBe(true);
    });

    it('renaming an item never renames a ficha simples another item also uses', async () => {
      as(ownerId, rid);
      const y = await (await createItem({ categoryId: cat.id, name: `Limonada ${tag}`, price: 8 })).json();
      const x = await (await createItem({ categoryId: cat.id, name: `Outro ${tag}`, price: 9 })).json();
      const ySimple = await simpleOf(y.id);
      await updateItem(x.id, { recipeId: ySimple.id });
      await updateItem(x.id, { name: `Renomeado ${tag}` });
      expect((await prisma.recipe.findUnique({ where: { id: ySimple.id } })).name).toBe(`Limonada ${tag}`);
    });

    it('removing an item retires its ficha simples', async () => {
      as(ownerId, rid);
      const created = await (await createItem({ categoryId: cat.id, name: `Sai ${tag}`, price: 3 })).json();
      const simple = await simpleOf(created.id);
      expect((await deleteRoute(json('DELETE', {}), { params: { id: created.id } })).status).toBeLessThan(300);
      expect((await prisma.recipe.findUnique({ where: { id: simple.id } })).active).toBe(false);
    });
  });
});
