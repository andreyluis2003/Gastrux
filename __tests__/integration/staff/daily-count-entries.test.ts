// @ts-nocheck
/** Daily count: sold, entries, board (spec 2026-10-16 contagem de espetos, 4.2 to 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as BOARD } from '../../../app/api/daily-count/route';
import { POST as ADD } from '../../../app/api/daily-count/entries/route';
import { DELETE as REMOVE } from '../../../app/api/daily-count/entries/[id]/route';
import { soldByRecipe } from '../../../lib/daily-count/sold';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const add = (body) => ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }));
const board = async () => (await BOARD(new NextRequest('http://x'))).json();
const row = (b, id) => b.rows.find((r) => r.recipeId === id);
let seq = 0;

describe('daily count: sold, entries, board', () => {
  let rid: string, otherRid: string, frango: string, kafta: string, vinagrete: string, otherRecipe: string, owner: any, cook: any, cashier: any;
  const userIds: string[] = [];
  const recipe = (restaurantId, name, dailyCount) =>
    prisma.recipe.create({ data: { restaurantId, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount } });
  const member = async (restaurantId, role, name) => {
    const u = await prisma.user.create({ data: { email: `dc-${role}-${seq++}-${tag}@gastrux.test`, name, password: 'x', role, currentRestaurantId: restaurantId } });
    await prisma.restaurantUser.create({ data: { restaurantId, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    userIds.push(u.id);
    return { id: u.id, email: u.email, role };
  };
  const sell = (restaurantId, recipeId, quantity, at: Date, opts: any = {}) =>
    prisma.order.create({ data: { restaurantId, orderNumber: `DC${tag}${seq++}`, status: opts.orderStatus ?? 'COMPLETED', createdAt: at,
      items: { create: [{ recipeId, quantity, status: opts.itemStatus ?? 'COMPLETED', createdAt: at }] } } });

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `dc-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', businessType: 'espetaria' } });
    userIds.push(o.id);
    rid = (await prisma.restaurant.create({ data: { name: `Dc ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    cook = await member(rid, 'COOK', 'Zé da brasa');
    cashier = await member(rid, 'CASHIER', 'Bia');
    const oo = await prisma.user.create({ data: { email: `dc-x-${tag}@gastrux.test`, name: 'X', password: 'x', role: 'OWNER' } });
    userIds.push(oo.id);
    otherRid = (await prisma.restaurant.create({ data: { name: `Dc2 ${tag}`, ownerId: oo.id, status: 'ACTIVE' } })).id;
    frango = (await recipe(rid, 'Espeto de frango', true)).id;
    kafta = (await recipe(rid, 'Espeto de kafta', true)).id;
    vinagrete = (await recipe(rid, 'Vinagrete', false)).id;
    otherRecipe = (await recipe(otherRid, 'Espeto alheio', true)).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.order.deleteMany({ where: { restaurantId: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('sold counts non-cancelled items of non-cancelled orders of this restaurant in the interval, across midnight', async () => {
    const from = new Date('2026-10-15T21:00:00Z'); // 18:00 BRT
    const to = new Date('2026-10-16T06:00:00Z');   // 03:00 BRT
    await sell(rid, frango, 3, new Date('2026-10-16T02:50:00Z')); // 23:50 BRT
    await sell(rid, frango, 2, new Date('2026-10-16T03:30:00Z')); // 00:30 BRT, next calendar day
    await sell(rid, frango, 5, new Date('2026-10-16T03:31:00Z'), { itemStatus: 'CANCELLED' });
    await sell(rid, frango, 7, new Date('2026-10-16T03:32:00Z'), { orderStatus: 'CANCELLED' });
    await sell(rid, frango, 9, new Date('2026-10-15T20:59:00Z')); // before the night
    await sell(rid, frango, 11, to);                               // the end is exclusive
    await sell(otherRid, otherRecipe, 4, new Date('2026-10-16T03:00:00Z'));
    expect(await soldByRecipe(prisma, rid, [frango, kafta, otherRecipe], from, to)).toEqual({ [frango]: 5 });
  });

  it('first use: the board opens a night, lists the counted items with the espetaria title and asks for the opening', async () => {
    as(cook);
    const b = await board();
    expect(b.title).toBe('Contagem de espetos');
    expect(b.firstUse).toBe(true);
    expect(b.canClose).toBe(false);
    expect(b.rows.map((r) => r.name)).toEqual(['Espeto de frango', 'Espeto de kafta']);
    expect(await prisma.dailyCount.count({ where: { restaurantId: rid, status: 'OPEN' } })).toBe(1);
    // Asking again reuses the same night
    expect((await board()).countId).toBe(b.countId);
    expect(await prisma.dailyCount.count({ where: { restaurantId: rid } })).toBe(1);
  });

  it('cook and cashier tap opening, mounted and loss; the board adds them up with the sales of the night', async () => {
    as(cook);
    expect((await add({ recipeId: frango, kind: 'OPENING', quantity: 8 })).status).toBe(200);
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: 20 })).status).toBe(200);
    as(cashier);
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: '20' })).status).toBe(200);
    expect((await add({ recipeId: frango, kind: 'LOSS', quantity: 2, reason: 'Queimou' })).status).toBe(200);
    const night = await prisma.dailyCount.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await sell(rid, frango, 4, new Date()); // after the night opened, before the board reads "now"
    as(owner);
    const b = await board();
    expect(row(b, frango)).toMatchObject({ opening: 8, mounted: 40, sold: 4, loss: 2, expected: 42 });
    expect(b.canClose).toBe(true);
    expect(b.entries.find((e) => e.kind === 'LOSS')).toMatchObject({ reason: 'Queimou', userName: 'Bia' });
  });

  it('refuses bad input and recipes of another restaurant; nothing is written', async () => {
    as(cook);
    const before = await prisma.dailyCountEntry.count({ where: { restaurantId: rid } });
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: 0 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: 1.5 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'SOLD', quantity: 1 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'LOSS', quantity: 1 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'LOSS', quantity: 1, reason: 'Outro', note: ' ' })).status).toBe(400);
    expect((await add({ recipeId: otherRecipe, kind: 'MOUNTED', quantity: 1 })).status).toBe(404);
    expect(await prisma.dailyCountEntry.count({ where: { restaurantId: rid } })).toBe(before);
  });

  it('an item not marked for the count joins the night once it has an entry', async () => {
    as(cook);
    expect((await add({ recipeId: vinagrete, kind: 'MOUNTED', quantity: 3 })).status).toBe(200);
    expect(row(await board(), vinagrete)).toMatchObject({ mounted: 3, expected: 3 });
  });

  it('opening by hand only on the first night: refused once a night was closed', async () => {
    const night = await prisma.dailyCount.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await prisma.dailyCount.create({ data: { restaurantId: rid, status: 'CLOSED', openedAt: new Date(night.openedAt.getTime() - 864e5), closedAt: new Date(night.openedAt.getTime() - 1) } });
    as(cook);
    const res = await add({ recipeId: kafta, kind: 'OPENING', quantity: 5 });
    expect(res.status).toBe(409);
    expect((await board()).firstUse).toBe(false);
  });

  it('undo: the author within 2 minutes; later only a manager, with audit', async () => {
    as(cook);
    const fresh = await (await add({ recipeId: kafta, kind: 'MOUNTED', quantity: 10 })).json();
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: fresh.id } })).status).toBe(200);
    const old = await (await add({ recipeId: kafta, kind: 'MOUNTED', quantity: 10 })).json();
    await prisma.dailyCountEntry.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 3 * 60 * 1000) } });
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: old.id } })).status).toBe(403);
    as(cashier);
    const others = await (await add({ recipeId: kafta, kind: 'MOUNTED', quantity: 1 })).json();
    as(cook);
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: others.id } })).status).toBe(403);
    as(owner);
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: old.id } })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { restaurantId: rid, entityType: 'DailyCountEntry', entityId: old.id } })).toBe(1);
  });

  it('another restaurant cannot see or delete these entries', async () => {
    const outsider = await member(otherRid, 'MANAGER', 'Fora');
    const anyEntry = await prisma.dailyCountEntry.findFirst({ where: { restaurantId: rid } });
    as(outsider);
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: anyEntry.id } })).status).toBe(404);
    const b = await board();
    expect(b.title).toBe('Contagem do dia');
    expect(b.rows.map((r) => r.name)).toEqual(['Espeto alheio']);
  });
});
