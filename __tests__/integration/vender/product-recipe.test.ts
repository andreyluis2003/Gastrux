// @ts-nocheck
/** Ficha simples: a menu item without a ficha técnica sells everywhere (owner, 2026-10-12) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ensureMenuItemRecipes } from '../../../lib/cardapio/product-recipe';

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
});
