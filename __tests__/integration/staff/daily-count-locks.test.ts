// @ts-nocheck
/**
 * Daily count and the night's lock (pendências 2026-10-23). A "close" here holds the night FOR UPDATE the way
 * lib/daily-count/close.ts does, and the other request is sent while the lock is held, so each test proves the
 * wait instead of accepting either order.
 * - M4: two first taps at once; the loser's INSERT waits on the open-night unique index. A caught P2002 left the
 *   transaction aborted and the retry read failed with 500.
 * - M2: an undo sent during a close deleted an entry the frozen line had already counted.
 * - M10: an entry sent during a close waits and lands in the new night.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as ADD } from '../../../app/api/daily-count/entries/route';
import { DELETE as REMOVE } from '../../../app/api/daily-count/entries/[id]/route';
import { openNight } from '../../../lib/daily-count/service';
import { loadHistory } from '../../../lib/daily-count/history';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
let seq = 0;

describe('daily count: the night lock', () => {
  let rid: string, owner: any, frango: string;

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `dcl-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', businessType: 'espetaria' } });
    rid = (await prisma.restaurant.create({ data: { name: `Dcl ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    frango = (await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}${seq++}`, name: 'Espeto de frango', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount: true } })).id;
  }, 60000);
  afterAll(async () => {
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.delete({ where: { id: owner.id } });
  });

  /** Closes the open night like closeNight: lock it, wait, mark it CLOSED and open the next one */
  const slowClose = (nightId: string) => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "daily_counts" WHERE "id" = ${nightId} FOR UPDATE`;
    await sleep(800);
    await tx.dailyCount.update({ where: { id: nightId }, data: { status: 'CLOSED', closedAt: new Date(), closedById: owner.id } });
    return (await tx.dailyCount.create({ data: { restaurantId: rid }, select: { id: true } })).id;
  }, { timeout: 10_000 });

  it('M4: the first tap that loses the race gets the night the other one created', async () => {
    let createdId: string;
    const first = prisma.$transaction(async (tx) => {
      createdId = (await tx.dailyCount.create({ data: { restaurantId: rid }, select: { id: true } })).id;
      await sleep(800);
    }, { timeout: 10_000 });
    await sleep(200);
    const second = prisma.$transaction((tx) => openNight(tx, rid), { timeout: 10_000 });
    await first;
    expect((await second).id).toBe(createdId);
    expect(await prisma.dailyCount.count({ where: { restaurantId: rid, status: 'OPEN' } })).toBe(1);
  }, 30000);

  it('M2: an undo sent during a close waits and is refused, the entry the close counted stays', async () => {
    as(owner);
    const night = await openNight(prisma, rid);
    const entry = await prisma.dailyCountEntry.create({ data: { countId: night.id, restaurantId: rid, recipeId: frango, kind: 'MOUNTED', quantity: 4, userId: owner.id } });
    const closing = slowClose(night.id);
    await sleep(200);
    const res = await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: entry.id } });
    await closing;
    expect(res.status).toBe(409);
    expect(await prisma.dailyCountEntry.findUnique({ where: { id: entry.id } })).not.toBeNull();
  }, 30000);

  it('M10: an entry sent during a close waits for it and lands in the new night', async () => {
    as(owner);
    const night = await openNight(prisma, rid);
    const closing = slowClose(night.id);
    await sleep(200);
    const res = await ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ recipeId: frango, kind: 'MOUNTED', quantity: 5 }) }));
    const nextId = await closing;
    expect(res.status).toBe(200);
    expect((await res.json()).countId).toBe(nextId);
  }, 30000);

  it('M11: the history sums a renamed recipe as one item, under its latest name', async () => {
    const line = (name: string, sold: number) => ({ recipeId: frango, recipeName: name, opening: 0, mounted: sold, sold, loss: 0, expected: 0, counted: 0, difference: 0, unitCost: 2 });
    const night = (closedAt: Date, name: string, sold: number) => prisma.dailyCount.create({
      data: { restaurantId: rid, status: 'CLOSED', openedAt: new Date(closedAt.getTime() - 3600e3), closedAt, closedById: owner.id, lines: { create: [line(name, sold)] } },
    });
    await night(new Date(Date.now() - 2 * 864e5), 'Espeto frango', 3);
    await night(new Date(Date.now() - 864e5), 'Espeto de frango', 4);
    const h = await loadHistory(rid, 4);
    const rows = h.byItem.filter((i) => i.recipeName.includes('rango'));
    expect(rows).toEqual([expect.objectContaining({ recipeName: 'Espeto de frango', sold: 7 })]);
    // Lines of deleted recipes (recipeId null) never merge with each other
    for (const name of ['Espeto apagado A', 'Espeto apagado B']) {
      await prisma.dailyCount.create({ data: { restaurantId: rid, status: 'CLOSED', openedAt: new Date(Date.now() - 7200e3), closedAt: new Date(Date.now() - 3600e3), closedById: owner.id,
        lines: { create: [{ ...line(name, 2), recipeId: null }] } } });
    }
    const gone = (await loadHistory(rid, 4)).byItem.filter((i) => i.recipeName.startsWith('Espeto apagado'));
    expect(gone.map((i) => i.recipeName).sort()).toEqual(['Espeto apagado A', 'Espeto apagado B']);
  });
});
