// @ts-nocheck
/**
 * Final review of tela Vender stage 2 (2026-10-08): money cases the first tests missed.
 * Each test reproduces one finding; see the ledger of the stage-2 plan.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { POST as REFUND } from '../../../app/api/comanda/sessions/[id]/payments/[entryId]/refund/route';
import { PATCH as WAIVE } from '../../../app/api/comanda/sessions/[id]/bill/route';
import { PUT as SESSION_PUT, DELETE as CANCEL } from '../../../app/api/comanda/sessions/[id]/route';
import { POST as OPEN } from '../../../app/api/comanda/sessions/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { PUT as ITEM_PUT, DELETE as ITEM_DELETE } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const json = (method: string, body: any, key?: string) =>
  new NextRequest('http://x', { method, body: JSON.stringify(body), headers: key ? { 'Idempotency-Key': key } : {} });

describe('bill: review fixes', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, tableId: string, menuItemId: string;
  const pay = (sid: string, payments: any[], extra: any = {}, key?: string) =>
    PAY(json('POST', { payments, cashSessionId: shiftId, ...extra }, key), { params: { id: sid } });
  // A table comanda opened from Vender: 2 x 50,00 = 100,00 + 10% = 110,00
  const tableBill = async () => {
    const res = await OPEN(json('POST', { tableId }));
    const s = await res.json();
    await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'OPEN' } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  const closeOthers = () => prisma.orderSession.updateMany({ where: { tableId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } }, data: { status: 'CLOSED', closedAt: new Date() } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `rev-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Rev ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `V${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pratos', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Prato', price: 50, recipeId, position: 0 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 8, sectionId: sec.id, capacity: 4, qrToken: `v${tag}` } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `rev-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);

  afterEach(closeOthers);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('C1: paying one share in cash gives change against that share, not against the whole remainder', async () => {
    const sid = await tableBill();
    const out = await (await pay(sid, [{ method: 'dinheiro', amount: '100,00' }], { dueCents: 5_500 })).json();
    expect(out).toMatchObject({ closed: false, changeCents: 4_500, bill: { paidCents: 5_500, remainingCents: 5_500 } });
    expect((await pay(sid, [{ method: 'pix', amount: '60,00' }], { dueCents: 5_500 })).status).toBe(400);
  });

  it('I-1: a payment in cash and card: the change belongs to the cash; refunding the card gives the card amount', async () => {
    const sid = await tableBill();
    const out = await (await pay(sid, [{ method: 'dinheiro', amount: '50,00' }, { method: 'credito', amount: '70,00' }])).json();
    const cash = out.bill.payments.find((p) => p.method === 'CASH');
    const card = out.bill.payments.find((p) => p.method === 'CREDIT');
    expect([cash.changeCents, card.changeCents]).toEqual([1_000, 0]);
    expect(cash.amountCents - cash.changeCents + card.amountCents - card.changeCents).toBe(11_000);
  });

  it('I-3: the old close and a partial payment at the same time never take more than the bill', async () => {
    const sid = await tableBill();
    await Promise.all([
      pay(sid, [{ method: 'pix', amount: '10,00' }]),
      SESSION_PUT(json('PUT', { status: 'CLOSED', cashSessionId: shiftId, payments: [{ method: 'pix', amount: '100,00' }] }), { params: { id: sid } }),
    ]);
    const bill = await loadBill(prisma, rid, sid);
    expect(bill.paidCents).toBeLessThanOrEqual(11_000);
  });

  it('I-4: declining the charge when exactly the items were paid closes the bill instead of leaving it stuck', async () => {
    const sid = await tableBill();
    await pay(sid, [{ method: 'pix', amount: '100,00' }]);
    const res = await WAIVE(json('PATCH', { serviceChargeWaived: true }), { params: { id: sid } });
    expect(res.status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).status).toBe('CLOSED');
  });

  it('I-4: items cannot be removed or reduced once the bill has payments (refund first)', async () => {
    const sid = await tableBill();
    const [line] = await prisma.orderSessionItem.findMany({ where: { sessionId: sid } });
    await pay(sid, [{ method: 'pix', amount: '50,00' }]);
    expect((await ITEM_DELETE(json('DELETE', {}), { params: { id: sid, itemId: line.id } })).status).toBe(409);
    expect((await ITEM_PUT(json('PUT', { quantity: 1 }), { params: { id: sid, itemId: line.id } })).status).toBe(409);
  });

  it('I-5: after a manager reopens a bill, its old payments show as given back and cannot be refunded again', async () => {
    const sid = await tableBill();
    const paid = await (await pay(sid, [{ method: 'pix', amount: '110,00' }])).json();
    const entryId = paid.bill.payments[0].id;
    const reopen = await SESSION_PUT(json('PUT', { status: 'OPEN', reason: 'cliente voltou', cashSessionId: shiftId }), { params: { id: sid } });
    expect(reopen.status).toBe(200);
    const bill = await loadBill(prisma, rid, sid);
    expect(bill.payments[0].refunded).toBe(true);
    const again = await REFUND(json('POST', { reason: 'de novo', cashSessionId: shiftId }), { params: { id: sid, entryId } });
    expect(again.status).toBe(422);
  });

  it('I-6: cancelling an open comanda with a partial payment gives the money back', async () => {
    const sid = await tableBill();
    await pay(sid, [{ method: 'pix', amount: '30,00' }]);
    expect((await CANCEL(json('DELETE', { reason: 'cliente desistiu', cashSessionId: shiftId }), { params: { id: sid } })).status).toBe(200);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
  });

  it('I-7: the same payment sent twice (lost answer, second tap) is recorded once', async () => {
    const sid = await tableBill();
    const key = crypto.randomUUID();
    await pay(sid, [{ method: 'pix', amount: '20,00' }], {}, key);
    await pay(sid, [{ method: 'pix', amount: '20,00' }], {}, key);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(2_000);
  });

  it('I-8: no service charge on a comanda that was not opened as a table or a named comanda (WhatsApp, delivery, counter)', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: '5511999990000', status: 'OPEN' } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    expect((await loadBill(prisma, rid, s.id)).serviceCents).toBe(0);
    const named = await (await OPEN(json('POST', { customerName: 'João' }))).json();
    await prisma.orderSessionItem.create({ data: { sessionId: named.id, recipeId, price: 50, quantity: 2 } });
    expect((await loadBill(prisma, rid, named.id)).serviceCents).toBe(1_000);
  });

  it('M6: an item added while a payment closes the bill is refused, never left uncharged', async () => {
    const sid = await tableBill();
    const [, added] = await Promise.all([
      pay(sid, [{ method: 'pix', amount: '110,00' }]),
      ADD(json('POST', { menuItemId, quantity: 1 }), { params: { id: sid } }),
    ]);
    const s = await prisma.orderSession.findUnique({ where: { id: sid }, include: { items: true } });
    if (added.status === 201) {
      // the item made it in before the payment read the bill: then the bill is not fully paid
      expect(s.status).not.toBe('CLOSED');
    } else {
      expect(added.status).toBe(409);
      expect(s.items).toHaveLength(1);
    }
  });
});
