// @ts-nocheck
/** Admin "Gerenciar Mesas": edit a table (number, seats, section, maintenance) and the occupied flag */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET } from '../../../app/api/admin/tables/route';
import { PUT } from '../../../app/api/admin/tables/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const asUser = (email: string, id: string) => {
  const session = { user: { id, email }, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(session);
  (getServerSessionNext as jest.Mock).mockResolvedValue(session);
};
const put = (id: string, body: any) =>
  PUT(new NextRequest(`http://x/api/admin/tables/${id}`, { method: 'PUT', body: JSON.stringify(body) }), { params: { id } });
const list = async () => (await (await GET(new NextRequest('http://x/api/admin/tables'))).json());

describe('admin tables', () => {
  let rid: string, otherRid: string, ownerId: string, cashierId: string, otherOwnerId: string;
  let secA: string, secB: string, otherSec: string;
  let t1: string, t2: string, t3: string, otherTable: string;
  const ownerEmail = `adm-${tag}@gastrux.test`;
  const cashierEmail = `cash-${tag}@gastrux.test`;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: ownerEmail, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    otherOwnerId = (await prisma.user.create({ data: { email: `oth-${tag}@gastrux.test`, name: 'Beto', password: 'x', role: 'OWNER' } })).id;
    cashierId = (await prisma.user.create({ data: { email: cashierEmail, name: 'Caio', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Adm ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Oth ${tag}`, ownerId: otherOwnerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.user.update({ where: { id: cashierId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cashierId, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
    secA = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    secB = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Varanda', capacity: 10 } })).id;
    otherSec = (await prisma.tableSection.create({ data: { restaurantId: otherRid, name: 'Outro', capacity: 10 } })).id;
    t1 = (await prisma.table.create({ data: { restaurantId: rid, number: 1, sectionId: secA, capacity: 4, qrToken: `a${tag}` } })).id;
    t2 = (await prisma.table.create({ data: { restaurantId: rid, number: 2, sectionId: secA, capacity: 2, qrToken: `b${tag}` } })).id;
    t3 = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: secB, capacity: 6, qrToken: `c${tag}` } })).id;
    otherTable = (await prisma.table.create({ data: { restaurantId: otherRid, number: 1, sectionId: otherSec, capacity: 4, qrToken: `d${tag}` } })).id;
  }, 60000);

  afterAll(async () => {
    await prisma.orderSession.deleteMany({ where: { restaurantId: rid } }).catch(() => {});
    for (const r of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id: r } }); } catch {} }
    for (const u of [ownerId, otherOwnerId, cashierId]) { try { await prisma.user.delete({ where: { id: u } }); } catch {} }
  });

  beforeEach(() => asUser(ownerEmail, ownerId));

  it('PUT changes number, capacity, section, maintenance; GET reflects them', async () => {
    const res = await put(t1, { number: 10, capacity: 8, sectionId: secB, isAvailable: false, maintenanceNote: 'Perna quebrada' });
    expect(res.status).toBe(200);
    const body = await list();
    const t = body.tables.find((x) => x.id === t1);
    expect(t).toMatchObject({ number: 10, capacity: 8, sectionId: secB, isAvailable: false, maintenanceNote: 'Perna quebrada' });
    await put(t1, { number: 1, capacity: 4, sectionId: secA, isAvailable: true, maintenanceNote: null });
  });

  it('answers 409 when the number is already used in the target section, changing nothing', async () => {
    const res = await put(t2, { number: 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Já existe a Mesa 1 nesta seção');
    expect((await prisma.table.findUnique({ where: { id: t2 } })).number).toBe(2);
    const moved = await put(t2, { number: 5, sectionId: secB, capacity: 99 });
    expect(moved.status).toBe(409);
    const after = await prisma.table.findUnique({ where: { id: t2 } });
    expect(after).toMatchObject({ number: 2, sectionId: secA, capacity: 2 });
  });

  it('rejects a section of another restaurant (400) and a table of another restaurant (404)', async () => {
    expect((await put(t1, { sectionId: otherSec })).status).toBe(400);
    expect((await put(t1, { sectionId: 123 })).status).toBe(400);
    expect((await put(t1, { sectionId: null })).status).toBe(400);
    expect((await prisma.table.findUnique({ where: { id: t1 } })).sectionId).toBe(secA);
    expect((await put(otherTable, { capacity: 9 })).status).toBe(404);
    expect((await prisma.table.findUnique({ where: { id: otherTable } })).capacity).toBe(4);
  });

  it('validates number and capacity as positive integers', async () => {
    expect((await put(t1, { capacity: 0 })).status).toBe(400);
    expect((await put(t1, { number: -2 })).status).toBe(400);
    expect((await put(t1, { number: 1.5 })).status).toBe(400);
  });

  it('GET marks a table with an open comanda as occupied, not one whose comanda is closed', async () => {
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t1, status: 'OPEN' } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t2, status: 'CLOSED', closedAt: new Date() } });
    const { tables } = await list();
    expect(tables.find((x) => x.id === t1).occupied).toBe(true);
    expect(tables.find((x) => x.id === t2).occupied).toBe(false);
    expect(tables.find((x) => x.id === t3).occupied).toBe(false);
  });

  it('a CASHIER member gets 403 on PUT', async () => {
    asUser(cashierEmail, cashierId);
    const res = await put(t1, { capacity: 12 });
    expect(res.status).toBe(403);
    expect((await prisma.table.findUnique({ where: { id: t1 } })).capacity).toBe(4);
  });
});
