// @ts-nocheck
/** Merging another comanda into this one (spec 2026-10-07, 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as MERGE } from '../../../app/api/comanda/sessions/[id]/merge/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('merge comandas', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, sec: string;
  let n = 1;
  const table = async () => (await prisma.table.create({ data: { restaurantId: rid, number: n++, sectionId: sec, capacity: 4, qrToken: `m${n}${tag}` } })).id;
  const comanda = async (qty: number) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: await table(), status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: qty } });
    return s.id;
  };
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `mg-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Mg ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `M${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `mg-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('items and partial payments come over; the source is kept as merged and its table is free', async () => {
    const target = await comanda(1); // 50 + 5
    const source = await comanda(2); // 100 + 10
    await PAY(req({ payments: [{ method: 'pix', amount: '30,00' }], cashSessionId: shiftId }), { params: { id: source } });
    const res = await MERGE(req({ sourceSessionId: source }), { params: { id: target } });
    expect(res.status).toBe(200);
    const bill = await loadBill(prisma, rid, target);
    expect(bill).toMatchObject({ subtotalCents: 15_000, serviceCents: 1_500, paidCents: 3_000, remainingCents: 13_500 });
    const src = await prisma.orderSession.findUnique({ where: { id: source } });
    expect([src.status, src.mergedIntoId]).toEqual(['CANCELLED', target]);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: source } })).toBe(0);
  });

  it('A into B and B into A at once: one wins, the other is refused, nothing hangs', async () => {
    const a = await comanda(1);
    const b = await comanda(1);
    const res = await Promise.all([MERGE(req({ sourceSessionId: b }), { params: { id: a } }), MERGE(req({ sourceSessionId: a }), { params: { id: b } })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  }, 30000);

  it('a comanda cannot be merged into itself; a closed one cannot take part', async () => {
    const a = await comanda(1);
    expect((await MERGE(req({ sourceSessionId: a }), { params: { id: a } })).status).toBe(400);
    const closed = await comanda(1);
    await prisma.orderSession.update({ where: { id: closed }, data: { status: 'CLOSED', closedAt: new Date() } });
    expect((await MERGE(req({ sourceSessionId: closed }), { params: { id: a } })).status).toBe(409);
  });
});
