// @ts-nocheck
/** Partial payments (spec 2026-10-07, 4.3): each person pays a part; the bill closes itself when paid */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { PUT as CLOSE_LEGACY } from '../../../app/api/comanda/sessions/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('partial payments', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, tableId: string;
  const pay = (sid: string, payments: any[], extra: any = {}) =>
    PAY(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ payments, cashSessionId: shiftId, ...extra }) }), { params: { id: sid } });
  // 2 x 50,00 = 100,00 + 10% = 110,00
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `pag-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Pag ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `P${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `p${tag}` } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const session = { user: { id: ownerId, email: `pag-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('two people pay their half; the second one closes the bill with the service charge recorded', async () => {
    const sid = await newBill();
    const first = await (await pay(sid, [{ method: 'pix', amount: '55,00' }])).json();
    expect(first).toMatchObject({ closed: false, bill: { paidCents: 5_500, remainingCents: 5_500 } });
    const second = await (await pay(sid, [{ method: 'dinheiro', amount: '60,00' }])).json();
    expect(second).toMatchObject({ closed: true, changeCents: 500, bill: { status: 'CLOSED', paidCents: 11_000, remainingCents: 0 } });
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    expect(s).toMatchObject({ status: 'CLOSED', serviceChargeCents: 1_000 });
  });

  it('card or PIX over what is left is refused; a closed bill takes no more payments', async () => {
    const sid = await newBill();
    expect((await pay(sid, [{ method: 'pix', amount: '200,00' }])).status).toBe(400);
    await pay(sid, [{ method: 'pix', amount: '110,00' }]);
    const again = await pay(sid, [{ method: 'pix', amount: '1,00' }]);
    expect(again.status).toBe(422);
  });

  it('two devices pay the remainder at once: only one is accepted', async () => {
    const sid = await newBill();
    const res = await Promise.all([pay(sid, [{ method: 'pix', amount: '110,00' }]), pay(sid, [{ method: 'pix', amount: '110,00' }])]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 422]);
    const paid = await prisma.cashSessionEntry.aggregate({ where: { orderSessionId: sid, type: 'RECEIPT' }, _sum: { amountCents: true } });
    expect(paid._sum.amountCents).toBe(11_000);
  });

  it('without an open cash shift nothing is received', async () => {
    const sid = await newBill();
    const res = await PAY(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ payments: [{ method: 'pix', amount: '10,00' }] }) }), { params: { id: sid } });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
  });

  it('the old close (offline queue) charges the service only when asked, and never over partial payments', async () => {
    const plain = await newBill();
    const r1 = await CLOSE_LEGACY(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status: 'CLOSED', cashSessionId: shiftId, payments: [{ method: 'pix', amount: '110,00' }], serviceCharge: true }) }), { params: { id: plain } });
    expect(r1.status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: plain } })).serviceChargeCents).toBe(1_000);

    const partial = await newBill();
    await pay(partial, [{ method: 'pix', amount: '10,00' }]);
    const r2 = await CLOSE_LEGACY(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status: 'CLOSED', cashSessionId: shiftId, payments: [{ method: 'pix', amount: '100,00' }] }) }), { params: { id: partial } });
    expect(r2.status).toBe(422);
    expect((await r2.json()).code).toBe('PARTIAL_PAYMENTS');
  });
});
