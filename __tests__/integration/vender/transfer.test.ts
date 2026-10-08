// @ts-nocheck
/** Transferring a comanda to another table (spec 2026-10-07, 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as TRANSFER } from '../../../app/api/comanda/sessions/[id]/transfer/route';
import { POST as OPEN } from '../../../app/api/comanda/sessions/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('transfer a table', () => {
  let rid: string, otherRid: string, ownerId: string, sec: string, foreignTable: string;
  const t: Record<number, string> = {};
  const open = async (n: number) => (await (await OPEN(req({ tableId: t[n] }))).json()).id;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `tr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Tr ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    for (const n of [1, 2, 3, 4, 10]) t[n] = (await prisma.table.create({ data: { restaurantId: rid, number: n, sectionId: sec, capacity: 4, qrToken: `t${n}${tag}` } })).id;
    const osec = await prisma.tableSection.create({ data: { restaurantId: otherRid, name: 'Outro', capacity: 20 } });
    foreignTable = (await prisma.table.create({ data: { restaurantId: otherRid, number: 1, sectionId: osec.id, capacity: 4, qrToken: `f${tag}` } })).id;
    const s = { user: { id: ownerId, email: `tr-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('moves the whole comanda to a free table; the old table is free', async () => {
    const sid = await open(1);
    const res = await TRANSFER(req({ tableId: t[2] }), { params: { id: sid } });
    expect(res.status).toBe(200);
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    expect([s.tableId, s.tableNumber]).toEqual([t[2], 2]);
    const reopened = await open(1);
    expect(reopened).not.toBe(sid);
  });

  it('a busy table answers TABLE_BUSY with its comanda (the screen offers to merge)', async () => {
    const a = await open(3);
    const b = await open(4);
    const res = await TRANSFER(req({ tableId: t[4] }), { params: { id: a } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'TABLE_BUSY', targetSessionId: b });
  });

  it('another restaurant\'s table is not found; the audit records the move', async () => {
    const sid = (await prisma.orderSession.findFirst({ where: { tableId: t[2], status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).id;
    expect((await TRANSFER(req({ tableId: foreignTable }), { params: { id: sid } })).status).toBe(404);
    const log = await prisma.auditLog.findFirst({ where: { entityId: sid, entityType: 'OrderSession' }, orderBy: { createdAt: 'desc' } });
    expect(String(log?.changes ?? '')).toContain('transfer');
  });

  it('two comandas moved to the same free table at once: only one gets it', async () => {
    await prisma.orderSession.updateMany({ where: { tableId: t[1], status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } }, data: { status: 'CLOSED', closedAt: new Date() } });
    const x = await open(1);
    const y = (await (await OPEN(req({ customerName: 'João' }))).json()).id;
    const res = await Promise.all([TRANSFER(req({ tableId: t[10] }), { params: { id: x } }), TRANSFER(req({ tableId: t[10] }), { params: { id: y } })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.orderSession.count({ where: { tableId: t[10], status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).toBe(1);
  });
});
