// @ts-nocheck
/** Menu engineering leaves out fichas simples: no cost, so a soda showed a 100% margin (2026-10-12) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET } from '../../../app/api/menu-engineering/route';
import { ensureMenuItemRecipes } from '../../../lib/cardapio/product-recipe';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('menu engineering and fichas simples', () => {
  let ownerId, rid;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `me-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `ME ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  });
  afterAll(async () => {
    try { await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: rid } } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('analyses the restaurant fichas técnicas and lists the items left out', async () => {
    // The cost comes from the insumos (the stored costPerPortion is never written; it read zero, 2026-10-19)
    const icat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    const carne = await prisma.ingredient.create({ data: { restaurantId: rid, code: `C-${tag}`, name: 'Carne', categoryId: icat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 40 } });
    const burger = await prisma.recipe.create({ data: { restaurantId: rid, code: `B-${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30,
      ingredients: { create: [{ ingredientId: carne.id, quantity: 300, unit: 'g' }] } } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    const soda = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Refri lata', price: 6, position: 0 } });
    await ensureMenuItemRecipes(prisma, rid, [soda.id]);
    const sodaRecipe = (await prisma.menuItem.findUnique({ where: { id: soda.id } })).recipeId;
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', tableNumber: 1 } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity: 2 } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: sodaRecipe, price: 6, quantity: 5 } });

    const body = await (await GET(new Request('http://x/api/menu-engineering?period=30') as any)).json();
    expect(body.recipes.map((r) => r.name)).toEqual(['Burger']);
    expect(body.recipes[0].popularityPercent).toBe(100);
    expect(body.withoutFicha).toEqual(['Refri lata']);
    expect(body.recipes[0].costPerPortion).toBeCloseTo(12, 6);
    expect(Math.round(body.recipes[0].profitMargin)).toBe(60);
  });
});
