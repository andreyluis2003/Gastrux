// @ts-nocheck
/** Opening a table returns its open comanda (spec 2026-10-07, 7): never two comandas on one table */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST } from '../../../app/api/comanda/sessions/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const open = (body: any) => POST(new NextRequest('http://x/api/comanda/sessions', { method: 'POST', body: JSON.stringify(body) }));

describe('opening a table that is already open', () => {
  let rid: string, ownerId: string, tableId: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `mesa-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Mesa ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 9, sectionId: sec.id, capacity: 4, qrToken: `m${tag}` } })).id;
    const session = { user: { id: ownerId, email: `mesa-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('two waiters tapping the same free table at once get the same comanda', async () => {
    const [a, b] = await Promise.all([open({ tableId }), open({ tableId })]);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja.id).toBe(jb.id);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await prisma.orderSession.count({ where: { tableId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).toBe(1);
  });

  it('after the table is closed, a tap opens a new comanda', async () => {
    await prisma.orderSession.updateMany({ where: { tableId }, data: { status: 'CLOSED', closedAt: new Date() } });
    const res = await open({ tableId });
    expect(res.status).toBe(201);
  });

  it('a comanda by name always opens a new one', async () => {
    const [a, b] = await Promise.all([open({ customerName: 'João' }), open({ customerName: 'João' })]);
    expect((await a.json()).id).not.toBe((await b.json()).id);
  });
});
