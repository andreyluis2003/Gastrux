// @ts-nocheck
/** Printing food labels (spec 2026-10-09 etiquetas, 4.1, 4.2, 5.1) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as CREATE, GET as RECENT } from '../../../app/api/labels/route';
import { GET as ITEMS } from '../../../app/api/labels/items/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const post = (body: any, key?: string) => new NextRequest('http://x/api/labels', {
  method: 'POST', body: JSON.stringify(body), headers: key ? { 'Idempotency-Key': key } : {},
});

describe('printing food labels', () => {
  let rid: string, otherRid: string, recipeId: string, ingredientId: string, otherBatchId: string;
  const users: Record<string, any> = {};
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `lp-o-${tag}@gastrux.test`, name: 'Ana Souza', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Lp ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    for (const role of ['OWNER', 'COOK', 'CASHIER']) {
      const u = role === 'OWNER' ? owner : await prisma.user.create({ data: { email: `lp-${role.toLowerCase()}-${tag}@gastrux.test`, name: role, password: 'x', role } });
      await prisma.user.update({ where: { id: u.id }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      users[role] = { id: u.id, email: u.email, role };
    }
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `LP${tag}`, name: 'Molho de tomate', baseYield: 2, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0 } })).id;
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Laticínios' } });
    ingredientId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `LI${tag}`, name: 'Leite integral', categoryId: cat.id, standardUnit: 'l', purchaseUnit: 'l', referenceCost: 5 } })).id;
    const otherOwner = await prisma.user.create({ data: { email: `lp-x-${tag}@gastrux.test`, name: 'X', password: 'x', role: 'OWNER' } });
    users.OTHER = { id: otherOwner.id };
    otherRid = (await prisma.restaurant.create({ data: { name: `Lp2 ${tag}`, ownerId: otherOwner.id, status: 'ACTIVE' } })).id;
    const cat2 = await prisma.ingredientCategory.create({ data: { restaurantId: otherRid, name: 'Outros' } });
    const otherIng = await prisma.ingredient.create({ data: { restaurantId: otherRid, code: `LX${tag}`, name: 'Outro', categoryId: cat2.id, standardUnit: 'l', purchaseUnit: 'l', referenceCost: 1 } });
    otherBatchId = (await prisma.ingredientBatch.create({ data: { ingredientId: otherIng.id, batchNumber: 'B1', expirationDate: new Date('2027-01-01'), initialQuantity: 1, currentQuantity: 1, unit: 'l' } })).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.foodLabel.deleteMany({ where: { restaurantId: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u: any) => u.id) } } }); } catch {}
  });

  it('lists recipes and ingredients with their storages (defaults: preparation 0/3/30, ingredient -/3/-)', async () => {
    as(users.COOK);
    const items = await (await ITEMS(new NextRequest('http://x'))).json();
    const recipe = items.find((i) => i.id === recipeId);
    const ing = items.find((i) => i.id === ingredientId);
    expect(recipe).toMatchObject({ type: 'RECIPE', name: 'Molho de tomate', unit: 'kg', storages: ['AMBIENT', 'CHILLED', 'FROZEN'], batches: [] });
    expect(ing).toMatchObject({ type: 'INGREDIENT', unit: 'l', storages: ['CHILLED'] });
  });

  it('a cook prints 3 equal labels: 3 records, expiry from the item, the name kept', async () => {
    as(users.COOK);
    const res = await CREATE(post({ itemType: 'RECIPE', itemId: recipeId, storage: 'CHILLED', quantity: 1.5, copies: 3 }));
    expect(res.status).toBe(201);
    const { ids } = await res.json();
    expect(ids).toHaveLength(3);
    const labels = await prisma.foodLabel.findMany({ where: { id: { in: ids } } });
    for (const l of labels) {
      expect(l).toMatchObject({ restaurantId: rid, itemName: 'Molho de tomate', storage: 'CHILLED', quantity: 1.5, unit: 'kg', status: 'ACTIVE', printedById: users.COOK.id });
      expect(l.expiresAt.getTime() - l.preparedAt.getTime()).toBe(3 * 864e5);
    }
  });

  it('a double tap prints once (same Idempotency-Key)', async () => {
    as(users.COOK);
    const key = crypto.randomUUID();
    const a = await (await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED' }, key))).json();
    const b = await (await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED' }, key))).json();
    expect(b.ids).toEqual(a.ids);
    expect(await prisma.foodLabel.count({ where: { id: { in: a.ids } } })).toBe(1);
  });

  it('refuses: storage without days and no date, a date in the past, copies out of 1-20, a batch of another restaurant', async () => {
    as(users.COOK);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'FROZEN' }))).status).toBe(400);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED', expiresAt: '2020-01-01T10:00:00.000Z' }))).status).toBe(400);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED', copies: 21 }))).status).toBe(400);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED', batchId: otherBatchId }))).status).toBe(404);
  });

  it('a manual date for a storage without days, saved as default only by a manager', async () => {
    as(users.COOK);
    const when = new Date(Date.now() + 5 * 864e5).toISOString();
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'FROZEN', expiresAt: when, saveAsDefaultDays: 30 }))).status).toBe(201);
    expect((await prisma.ingredient.findUnique({ where: { id: ingredientId } })).shelfLifeFrozenDays).toBeNull();
    as(users.OWNER);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'FROZEN', expiresAt: when, saveAsDefaultDays: 30 }))).status).toBe(201);
    expect((await prisma.ingredient.findUnique({ where: { id: ingredientId } })).shelfLifeFrozenDays).toBe(30);
  });

  it('the cashier gets 403; the recent list has the newest first and only this restaurant', async () => {
    as(users.CASHIER);
    expect((await CREATE(post({ itemType: 'RECIPE', itemId: recipeId, storage: 'CHILLED' }))).status).toBe(403);
    expect((await RECENT(new NextRequest('http://x'))).status).toBe(403);
    as(users.COOK);
    const recent = await (await RECENT(new NextRequest('http://x'))).json();
    expect(recent.length).toBeGreaterThanOrEqual(4);
    expect(recent.every((l) => l.restaurantId === rid)).toBe(true);
    expect(new Date(recent[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(recent[recent.length - 1].createdAt).getTime());
  });
});
