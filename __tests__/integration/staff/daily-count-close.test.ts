// @ts-nocheck
/** Daily count: close, next night, Pro alert, history (spec 2026-10-16 contagem de espetos, 4.5 to 4.7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as BOARD } from '../../../app/api/daily-count/route';
import { POST as ADD } from '../../../app/api/daily-count/entries/route';
import { POST as CLOSE } from '../../../app/api/daily-count/close/route';
import { GET as HISTORY } from '../../../app/api/daily-count/history/route';
import { DELETE as REMOVE } from '../../../app/api/daily-count/entries/[id]/route';
import { differenceAlertText } from '../../../lib/daily-count/close';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const add = (body) => ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }));
const close = (counts, countId?: string) => CLOSE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ counts, countId }) }));
const board = async () => (await BOARD(new NextRequest('http://x'))).json();
let seq = 0;

async function setup(tier: string) {
  const o = await prisma.user.create({ data: { email: `dcc-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', businessType: 'espetaria' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Dcc ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const c = await prisma.user.create({ data: { email: `dcc-c-${seq++}-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
  const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Carnes' } });
  const meat = await prisma.ingredient.create({ data: { restaurantId: rid, code: `F${seq++}${tag}`, name: 'Frango', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 20 } });
  const recipe = (name, dailyCount, qty) => prisma.recipe.create({ data: { restaurantId: rid, code: `R${seq++}${tag}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount,
    ingredients: { create: [{ ingredientId: meat.id, quantity: qty, unit: 'kg' }] } } });
  const frango = (await recipe('Espeto de frango', true, 0.12)).id; // unit cost 2.40
  const kafta = (await recipe('Espeto de kafta', true, 0.1)).id;    // unit cost 2.00
  return { rid, owner: { id: o.id, email: o.email, role: 'OWNER' }, cook: { id: c.id, email: c.email, role: 'COOK' }, frango, kafta, userIds: [o.id, c.id] };
}
const sell = (rid, recipeId, quantity, at = new Date()) =>
  prisma.order.create({ data: { restaurantId: rid, orderNumber: `DCC${tag}${seq++}`, status: 'COMPLETED', createdAt: at, items: { create: [{ recipeId, quantity, status: 'COMPLETED', createdAt: at }] } } });

describe('daily count: close', () => {
  let s, p;
  beforeAll(async () => { s = await setup('starter'); p = await setup('pro'); }, 60000);
  afterAll(async () => {
    for (const x of [s, p]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.order.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });

  it('the cook cannot close', async () => {
    as(s.cook);
    await board();
    expect((await close([{ recipeId: s.frango, counted: 0 }, { recipeId: s.kafta, counted: 0 }])).status).toBe(403);
  });

  it('close freezes the lines with cost, opens the next night with the leftover as opening, Starter gets no alert', async () => {
    as(s.cook);
    await add({ recipeId: s.frango, kind: 'OPENING', quantity: 8 });
    await add({ recipeId: s.frango, kind: 'MOUNTED', quantity: 40 });
    await add({ recipeId: s.kafta, kind: 'MOUNTED', quantity: 10 });
    await add({ recipeId: s.kafta, kind: 'LOSS', quantity: 12, reason: 'Caiu' }); // more than mounted: expected −2
    await sell(s.rid, s.frango, 38);
    as(s.owner);
    const res = await close([{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: '0' }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    const lines = await prisma.dailyCountLine.findMany({ where: { countId: body.closedId }, orderBy: { recipeName: 'asc' } });
    expect(lines.map((l) => [l.recipeName, l.opening, l.mounted, l.sold, l.loss, l.expected, l.counted, l.difference, Math.round(l.unitCost * 100)])).toEqual([
      ['Espeto de frango', 8, 40, 38, 0, 10, 6, -4, 240],
      ['Espeto de kafta', 0, 10, 0, 12, -2, 0, 2, 200],
    ]);
    const closed = await prisma.dailyCount.findUnique({ where: { id: body.closedId } });
    expect(closed).toMatchObject({ status: 'CLOSED', closedById: s.owner.id });
    const next = await prisma.dailyCount.findUnique({ where: { id: body.nextId }, include: { entries: true } });
    expect(next.status).toBe('OPEN');
    expect(next.openedAt.getTime()).toBe(closed.closedAt.getTime());
    expect(next.entries.map((e) => [e.recipeId, e.kind, e.quantity])).toEqual([[s.frango, 'OPENING', 6]]);
    expect(await prisma.notification.count({ where: { restaurantId: s.rid } })).toBe(0);
    // A sale cancelled after the close never changes the frozen lines
    await prisma.orderItem.updateMany({ where: { order: { restaurantId: s.rid } }, data: { status: 'CANCELLED' } });
    expect((await prisma.dailyCountLine.findFirst({ where: { countId: body.closedId, recipeName: 'Espeto de frango' } })).sold).toBe(38);
    // Next night: frango starts at 6, kafta (flag on, leftover 0) stays with 0
    const b = await board();
    expect(b.rows.map((r) => [r.name, r.opening])).toEqual([['Espeto de frango', 6], ['Espeto de kafta', 0]]);
    // Review I3: the leftover carried by the close cannot be undone (it could never be entered again)
    const carried = b.entries.find((e) => e.kind === 'OPENING');
    expect(carried.canDelete).toBe(false);
    const del = await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: carried.id } });
    expect(del.status).toBe(409);
    expect(await prisma.dailyCountEntry.count({ where: { id: carried.id } })).toBe(1);
  });

  it('review I1: a close sent from a stale screen (the night already closed) is refused', async () => {
    as(s.owner);
    const stale = (await board()).countId;
    const counts = [{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }];
    expect((await close(counts, stale)).status).toBe(200);
    const before = await prisma.dailyCount.count({ where: { restaurantId: s.rid } });
    expect((await close(counts, stale)).status).toBe(409);
    expect(await prisma.dailyCount.count({ where: { restaurantId: s.rid } })).toBe(before);
  });

  it('every item needs a count; an unknown item is refused; nothing changes', async () => {
    as(s.owner);
    const open = await prisma.dailyCount.findFirst({ where: { restaurantId: s.rid, status: 'OPEN' } });
    expect((await close([{ recipeId: s.frango, counted: 6 }])).status).toBe(400);
    expect((await close([{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }, { recipeId: p.frango, counted: 1 }])).status).toBe(400);
    expect((await prisma.dailyCount.findUnique({ where: { id: open.id } })).status).toBe('OPEN');
  });

  it('two closes at once: one wins, the other gets 409; exactly one new night', async () => {
    as(s.owner);
    const before = await prisma.dailyCount.count({ where: { restaurantId: s.rid } });
    const counts = [{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }];
    const [a, b] = await Promise.all([close(counts), close(counts)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.dailyCount.count({ where: { restaurantId: s.rid } })).toBe(before + 1);
    expect(await prisma.dailyCount.count({ where: { restaurantId: s.rid, status: 'OPEN' } })).toBe(1);
  });

  it('an entry sent while a close runs lands in the new night, never lost', async () => {
    as(s.owner);
    const counts = [{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }];
    const [closeRes, addRes] = await Promise.all([close(counts), add({ recipeId: s.kafta, kind: 'MOUNTED', quantity: 5 })]);
    expect(closeRes.status).toBe(200);
    expect(addRes.status).toBe(200);
    const entry = await prisma.dailyCountEntry.findUnique({ where: { id: (await addRes.json()).id }, include: { count: true } });
    const { nextId, closedId } = await closeRes.json();
    // Either it was in time for the closed night (then its line counts it) or it went to the new one
    if (entry.countId === closedId) {
      expect((await prisma.dailyCountLine.findFirst({ where: { countId: closedId, recipeId: s.kafta } })).mounted).toBe(5);
    } else {
      expect(entry.countId).toBe(nextId);
    }
  });

  it('Pro: a difference becomes one bell alert for the managers with the missing value', async () => {
    as(p.cook);
    await board();
    await add({ recipeId: p.frango, kind: 'MOUNTED', quantity: 20 });
    await add({ recipeId: p.kafta, kind: 'MOUNTED', quantity: 10 });
    await sell(p.rid, p.frango, 10);
    as(p.owner);
    expect((await close([{ recipeId: p.frango, counted: 6 }, { recipeId: p.kafta, counted: 10 }])).status).toBe(200);
    const alerts = await prisma.notification.findMany({ where: { restaurantId: p.rid } });
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toMatchObject({ userId: null, severity: 'HIGH', actionUrl: '/contagem-do-dia?tab=historico' });
    expect(alerts[0].message).toContain('Espeto de frango: faltam 4');
    expect(alerts[0].message).toContain('R$ 9,60');
    // No difference: no alert
    expect((await close([{ recipeId: p.frango, counted: 6 }, { recipeId: p.kafta, counted: 10 }])).status).toBe(200);
    expect(await prisma.notification.count({ where: { restaurantId: p.rid } })).toBe(1);
  });

  it('history lists closed nights newest first and sums per item', async () => {
    as(s.owner);
    const res = await HISTORY(new NextRequest('http://x/api/daily-count/history?weeks=4'));
    expect(res.status).toBe(200);
    const h = await res.json();
    expect(h.nights.length).toBeGreaterThanOrEqual(3);
    expect(new Date(h.nights[0].closedAt).getTime()).toBeGreaterThanOrEqual(new Date(h.nights[1].closedAt).getTime());
    const first = h.nights[h.nights.length - 1];
    expect(first).toMatchObject({ sold: 38, loss: 12, difference: -2 });
    expect(first.differenceValue).toBeCloseTo(-5.6, 2); // −4 × 2.40 + 2 × 2.00
    // Review I4: missing and extra apart, so a missing item never hides behind another item's extra
    expect(first).toMatchObject({ missing: 4, extra: 2 });
    expect(first.missingValue).toBeCloseTo(9.6, 2);
    expect(h.byItem.find((i) => i.recipeName === 'Espeto de frango').missing).toBeGreaterThanOrEqual(4);
    expect(h.byItem.find((i) => i.recipeName === 'Espeto de frango').sold).toBeGreaterThanOrEqual(38);
    as(s.cook);
    expect((await HISTORY(new NextRequest('http://x/api/daily-count/history'))).status).toBe(200);
  });

  it('alert text lists missing items with their value, and extra items apart', () => {
    expect(differenceAlertText([{ recipeName: 'Espeto de frango', difference: 0, unitCost: 2 }])).toBeNull();
    const t = differenceAlertText([
      { recipeName: 'Espeto de frango', difference: -4, unitCost: 2.4 },
      { recipeName: 'Espeto de kafta', difference: -2, unitCost: 4.4 },
      { recipeName: 'Pão de alho', difference: 3, unitCost: 2.5 },
    ]);
    expect(t.title).toBe('Contagem com diferença');
    expect(t.message).toBe('Espeto de frango: faltam 4 · Espeto de kafta: faltam 2 (R$ 18,40). A mais: Pão de alho: 3.');
    expect(t.missingValue).toBeCloseTo(18.4, 2);
  });
});
