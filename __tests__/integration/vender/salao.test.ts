// @ts-nocheck
/**
 * The Vender map (spec 2026-10-07, 4.1): tables with their open comanda, comandas without a table,
 * totals in cents, new lines counted, only the logged-in restaurant.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { loadSalao } from '../../../lib/vender/salao';
import { GET } from '../../../app/api/vender/salao/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('GET /api/vender/salao', () => {
  let rid: string, otherRid: string, ownerId: string, t1: string, t2: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `salao-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Salao ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    t1 = (await prisma.table.create({ data: { restaurantId: rid, number: 1, sectionId: sec.id, capacity: 4, qrToken: `a${tag}` } })).id;
    t2 = (await prisma.table.create({ data: { restaurantId: rid, number: 2, sectionId: sec.id, capacity: 4, qrToken: `b${tag}` } })).id;
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } });
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t1, status: 'SENT_TO_KITCHEN', openedAt: new Date(Date.now() - 30 * 60_000), sentToKitchenAt: new Date(Date.now() - 10 * 60_000) } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 50, quantity: 2, addedAt: new Date(Date.now() - 20 * 60_000) } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 7.5, quantity: 1, addedAt: new Date() } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN' } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t2, status: 'CLOSED', closedAt: new Date() } });
    await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: ownerId, customerName: `Vazou ${tag}`, status: 'OPEN' } });
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('tables with their open comanda, totals in cents, new lines counted; closed comandas free the table', async () => {
    const salao = await loadSalao(rid);
    expect(salao.sections.map((s) => s.name)).toEqual(['Salão']);
    const [one, two] = salao.tables;
    expect(one).toMatchObject({ id: t1, number: 1, sectionName: 'Salão' });
    expect(one.session).toMatchObject({ label: 'Mesa 1', totalCents: 10750, itemCount: 2, newCount: 1, openedBy: 'Ana' });
    expect(two).toMatchObject({ id: t2, session: null });
    expect(salao.others.map((o) => o.label)).toEqual(['João']);
  });

  it('only the logged-in restaurant', async () => {
    const session = { user: { id: ownerId, email: `salao-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
    const res = await GET(new NextRequest('http://x/api/vender/salao'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(`Vazou ${tag}`);
    expect(text).toContain('João');
  });

  it('a restaurant without tables still lists its comandas', async () => {
    const salao = await loadSalao(otherRid);
    expect(salao.tables).toEqual([]);
    expect(salao.others.map((o) => o.label)).toEqual([`Vazou ${tag}`]);
  });
});
