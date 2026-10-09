// @ts-nocheck
/** The expiry control (spec 2026-10-09 etiquetas, 4.3, 5.3, 5.4, 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as ONE } from '../../../app/api/labels/[id]/route';
import { POST as SETTLE } from '../../../app/api/labels/[id]/settle/route';
import { GET as BOARD } from '../../../app/api/labels/expiry/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const settle = (id: string, action: string) => SETTLE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action }) }), { params: { id } });

describe('labels: expiry control', () => {
  let rid: string, otherRid: string, recipeId: string, emptyRecipeId: string, tomatoId: string, oilId: string, cook: any, otherCook: any;
  const userIds: string[] = [];
  const label = (data: any) => prisma.foodLabel.create({ data: { restaurantId: rid, itemName: 'X', storage: 'CHILLED', preparedAt: new Date(Date.now() - 864e5), printedById: cook.id, ...data } });
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `le-o-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Le ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    const c = await prisma.user.create({ data: { email: `le-c-${tag}@gastrux.test`, name: 'Caio', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    const oo = await prisma.user.create({ data: { email: `le-x-${tag}@gastrux.test`, name: 'X', password: 'x', role: 'OWNER' } });
    otherRid = (await prisma.restaurant.create({ data: { name: `Le2 ${tag}`, ownerId: oo.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    const oc = await prisma.user.create({ data: { email: `le-oc-${tag}@gastrux.test`, name: 'Y', password: 'x', role: 'COOK', currentRestaurantId: otherRid } });
    await prisma.restaurantUser.create({ data: { restaurantId: otherRid, userId: oc.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    otherCook = { id: oc.id, email: oc.email, role: 'COOK' };
    userIds.push(owner.id, c.id, oo.id, oc.id);
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Geral' } });
    tomatoId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `T${tag}`, name: 'Tomate', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 8 } })).id;
    oilId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `O${tag}`, name: 'Azeite', categoryId: cat.id, standardUnit: 'l', purchaseUnit: 'l', referenceCost: 40 } })).id;
    // Molho: rende 2 kg com 2,5 kg de tomate e 0,1 l de azeite
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `M${tag}`, name: 'Molho', baseYield: 2, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0,
      ingredients: { create: [{ ingredientId: tomatoId, quantity: 2.5, unit: 'kg' }, { ingredientId: oilId, quantity: 0.1, unit: 'l' }] } } })).id;
    emptyRecipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Vazia', baseYield: 0, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0 } })).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.wasteLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.foodLabel.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('discarding an expired preparation writes its ingredients to waste, proportionally, with cost', async () => {
    as(cook);
    const l = await label({ itemType: 'RECIPE', recipeId, itemName: 'Molho', expiresAt: new Date(Date.now() - 3600e3), quantity: 1, unit: 'kg' });
    const res = await settle(l.id, 'DISCARDED');
    expect(res.status).toBe(200);
    const logs = await prisma.wasteLog.findMany({ where: { restaurantId: rid }, orderBy: { estimatedCost: 'desc' } });
    // half the recipe (1 of 2 kg): 1,25 kg tomate (R$ 10,00) and 0,05 l azeite (R$ 2,00)
    expect(logs.map((w) => [w.ingredientId, w.quantity, w.estimatedCost, w.reason])).toEqual([
      [tomatoId, 1.25, 10, 'EXPIRED'],
      [oilId, 0.05, 2, 'EXPIRED'],
    ]);
    expect((await prisma.foodLabel.findUnique({ where: { id: l.id } })).status).toBe('DISCARDED');
    expect((await settle(l.id, 'USED')).status).toBe(409);
  });

  it('discarding an ingredient before it expires: OTHER; without quantity: no waste; recipe of yield 0: no NaN', async () => {
    as(cook);
    await prisma.wasteLog.deleteMany({ where: { restaurantId: rid } });
    const a = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5), quantity: 0.5, unit: 'l' });
    await settle(a.id, 'DISCARDED');
    const [w] = await prisma.wasteLog.findMany({ where: { restaurantId: rid } });
    expect([w.quantity, w.estimatedCost, w.reason]).toEqual([0.5, 20, 'OTHER']);
    const b = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5) });
    await settle(b.id, 'DISCARDED');
    const c = await label({ itemType: 'RECIPE', recipeId: emptyRecipeId, itemName: 'Vazia', expiresAt: new Date(Date.now() + 864e5), quantity: 1, unit: 'kg' });
    expect((await settle(c.id, 'DISCARDED')).status).toBe(200);
    const logs = await prisma.wasteLog.findMany({ where: { restaurantId: rid } });
    expect(logs).toHaveLength(1);
    expect(logs.every((l) => Number.isFinite(l.estimatedCost) && Number.isFinite(l.quantity))).toBe(true);
  });

  it('the board groups expired, today and tomorrow; a cook of another restaurant sees nothing', async () => {
    as(cook);
    const used = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5) });
    await settle(used.id, 'USED');
    const late = await label({ itemType: 'INGREDIENT', ingredientId: tomatoId, itemName: 'Tomate', expiresAt: new Date(Date.now() - 60e3) });
    const board = await (await BOARD(new NextRequest('http://x'))).json();
    expect(board.expired.map((l) => l.id)).toContain(late.id);
    expect(board.history.map((l) => l.id)).toContain(used.id);
    as(otherCook);
    expect((await ONE(new NextRequest('http://x'), { params: { id: late.id } })).status).toBe(404);
    expect((await settle(late.id, 'USED')).status).toBe(404);
  });

  it('Starter: reads the label but cannot settle it or open the board', async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { subscriptionTier: 'starter' } });
    try {
      as(cook);
      const l = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5) });
      const one = await (await ONE(new NextRequest('http://x'), { params: { id: l.id } })).json();
      expect(one).toMatchObject({ id: l.id, canSettle: false });
      const res = await settle(l.id, 'USED');
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Controle de validades/);
      expect((await prisma.foodLabel.findUnique({ where: { id: l.id } })).status).toBe('ACTIVE');
      expect((await BOARD(new NextRequest('http://x'))).status).toBe(403);
    } finally {
      await prisma.restaurant.update({ where: { id: rid }, data: { subscriptionTier: 'pro' } });
    }
  });
});
