// @ts-nocheck
/** Refunding a partial payment (spec 2026-10-07, 4.3): manager, reason, once, net of the change */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { POST as REFUND } from '../../../app/api/comanda/sessions/[id]/payments/[entryId]/refund/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('refunding a partial payment', () => {
  let rid: string, ownerId: string, cashierId: string, shiftId: string, sid: string;
  const as = (id: string, email: string) => {
    const s = { user: { id, email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const refund = (entryId: string, reason: string) =>
    REFUND(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ reason, cashSessionId: shiftId }) }), { params: { id: sid, entryId } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `est-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    cashierId = (await prisma.user.create({ data: { email: `cx-${tag}@gastrux.test`, name: 'Caixa', password: 'x', role: 'CASHIER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Est ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    for (const [uid, role] of [[ownerId, 'OWNER'], [cashierId, 'CASHIER']] as const) {
      await prisma.user.update({ where: { id: uid }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: uid, role, permissions: [], acceptedAt: new Date() } });
    }
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 100 } });
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN', serviceChargeEligible: true } })).id;
    await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 100, quantity: 1 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    for (const id of [ownerId, cashierId]) { try { await prisma.user.delete({ where: { id } }); } catch {} }
  });

  it('a cashier cannot refund; a manager refunds once, net of the change, and the amount is owed again', async () => {
    as(ownerId, `est-${tag}@gastrux.test`);
    const paid = await (await PAY(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ payments: [{ method: 'dinheiro', amount: '50,00' }], cashSessionId: shiftId }) }), { params: { id: sid } })).json();
    const entryId = paid.bill.payments[0].id;

    as(cashierId, `cx-${tag}@gastrux.test`);
    expect((await refund(entryId, 'lançado errado')).status).toBe(403);

    as(ownerId, `est-${tag}@gastrux.test`);
    expect((await refund(entryId, 'x')).status).toBe(400);
    const ok = await refund(entryId, 'lançado errado');
    expect(ok.status).toBe(200);
    const bill = await ok.json();
    expect(bill.paidCents).toBe(0);
    expect(bill.payments[0].refunded).toBe(true);
    const refundRow = await prisma.cashSessionEntry.findFirst({ where: { orderSessionId: sid, type: 'REFUND' } });
    expect(refundRow).toMatchObject({ method: 'CASH', amountCents: 5_000 });

    expect((await refund(entryId, 'de novo')).status).toBe(422);
  });
});
