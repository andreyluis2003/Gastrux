// @ts-nocheck
/** The bill (spec 2026-10-07, 4.3): totals with service charge, payments so far, waiving the charge */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET, PATCH } from '../../../app/api/comanda/sessions/[id]/bill/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('the bill', () => {
  let rid: string, otherRid: string, ownerId: string, sid: string, shiftId: string, recipeId: string;
  const get = async (id = sid) => GET(new NextRequest('http://x'), { params: { id } });
  const patch = (body: any) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: { id: sid } });

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `conta-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Conta ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 58 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    const table = await prisma.table.create({ data: { restaurantId: rid, number: 7, sectionId: sec.id, capacity: 4, qrToken: `c${tag}` } });
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: table.id, status: 'OPEN' } })).id;
    await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId, price: 58, quantity: 2 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const session = { user: { id: ownerId, email: `conta-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('shows subtotal, 10% service charge, total and what is left', async () => {
    const bill = await (await get()).json();
    expect(bill).toMatchObject({ label: 'Mesa 7', percent: 10, applies: true, waived: false, subtotalCents: 11_600, serviceCents: 1_160, totalCents: 12_760, paidCents: 0, remainingCents: 12_760 });
    expect(bill.items).toEqual([expect.objectContaining({ name: 'Pizza', quantity: 2, totalCents: 11_600 })]);
  });

  it('a payment already made is listed and counted', async () => {
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'PIX', amountCents: 6_000, orderSessionId: sid, createdById: ownerId } });
    const bill = await (await get()).json();
    expect(bill.paidCents).toBe(6_000);
    expect(bill.remainingCents).toBe(6_760);
    expect(bill.payments).toEqual([expect.objectContaining({ method: 'PIX', amountCents: 6_000, changeCents: 0, refunded: false })]);
  });

  it('the customer declines the charge: every device sees it; it comes back when asked', async () => {
    expect((await patch({ serviceChargeWaived: true })).status).toBe(200);
    expect(await (await get()).json()).toMatchObject({ waived: true, serviceCents: 0, totalCents: 11_600, remainingCents: 5_600 });
    expect((await patch({ serviceChargeWaived: false })).status).toBe(200);
  });

  it('declining the charge when more than the new total is already paid is refused', async () => {
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'PIX', amountCents: 6_000, orderSessionId: sid, createdById: ownerId } });
    const res = await patch({ serviceChargeWaived: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('estorne');
  });

  it('another restaurant\'s comanda is not found', async () => {
    const foreign = await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: ownerId, customerName: 'X', status: 'OPEN' } });
    expect((await get(foreign.id)).status).toBe(404);
  });
});
