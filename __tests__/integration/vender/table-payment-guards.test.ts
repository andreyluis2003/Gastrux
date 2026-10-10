// @ts-nocheck
/**
 * Pay at the table, stage 1 (final review 2026-10-10): money paid online at the table counts wherever the
 * bill is protected by "it already has payments", and follows the comanda when it is merged.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as MERGE } from '../../../app/api/comanda/sessions/[id]/merge/route';
import { PUT as SESSION_PUT, DELETE as CANCEL } from '../../../app/api/comanda/sessions/[id]/route';
import { DELETE as ITEM_DELETE } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';
import { POST as MOVE } from '../../../app/api/comanda/sessions/[id]/move-items/route';
import { applyTablePayment } from '../../../lib/comanda/table-payment';
import { billHasPayments, loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const json = (method: string, body: any) =>
  new NextRequest('http://x', { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } });

describe('online table payments and the bill guards', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, sec: string;
  let n = 1;
  const table = async () => (await prisma.table.create({ data: { restaurantId: rid, number: n++, sectionId: sec, capacity: 4, qrToken: `g${n}${tag}` } })).id;
  // qty x 50,00 + 10%
  const comanda = async (qty: number) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: await table(), status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: qty } });
    return s.id;
  };
  const paidOnline = async (sid: string, amount: number) => {
    const p = await prisma.payment.create({
      data: { restaurantId: rid, amount, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', orderSessionId: sid },
    });
    await applyTablePayment(rid, p.id);
    return p;
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `tg-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `TG ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `G${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `tg-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);

  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('billHasPayments counts applied online money, and not a payment that was never applied', async () => {
    const sid = await comanda(1);
    await prisma.payment.create({ data: { restaurantId: rid, amount: 10, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', orderSessionId: sid } });
    expect(await billHasPayments(prisma, rid, sid)).toBe(false);
    await paidOnline(sid, 20);
    expect(await billHasPayments(prisma, rid, sid)).toBe(true);
  });

  it('merging a comanda with an applied online payment keeps that money on the target bill', async () => {
    const target = await comanda(1); // 50 + 5
    const source = await comanda(2); // 100 + 10
    const p = await paidOnline(source, 30);
    const res = await MERGE(json('POST', { sourceSessionId: source }), { params: { id: target } });
    expect(res.status).toBe(200);
    expect((await prisma.payment.findUnique({ where: { id: p.id } })).orderSessionId).toBe(target);
    expect(await loadBill(prisma, rid, target)).toMatchObject({ subtotalCents: 15_000, serviceCents: 1_500, paidCents: 3_000, remainingCents: 13_500 });
    expect((await loadBill(prisma, rid, source)).paidCents).toBe(0);
  });

  it('merging comandas whose online money goes over the joined bill is refused', async () => {
    const target = await comanda(1); // 50, service waived below: 50
    await prisma.orderSession.update({ where: { id: target }, data: { serviceChargeEligible: false } });
    const source = await comanda(1);
    await prisma.orderSession.update({ where: { id: source }, data: { serviceChargeEligible: false } });
    await paidOnline(target, 40);
    await paidOnline(source, 40);
    await prisma.orderSessionItem.deleteMany({ where: { sessionId: source } });
    const res = await MERGE(json('POST', { sourceSessionId: source }), { params: { id: target } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('OVERPAID');
  });

  it('an item cannot be removed after an online payment', async () => {
    const sid = await comanda(2);
    await paidOnline(sid, 30);
    const item = await prisma.orderSessionItem.findFirst({ where: { sessionId: sid } });
    const res = await ITEM_DELETE(json('DELETE', {}), { params: { id: sid, itemId: item.id } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/já tem pagamentos/);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: sid } })).toBe(1);
  });

  it('items cannot be moved out after an online payment', async () => {
    const sid = await comanda(2);
    await paidOnline(sid, 30);
    const item = await prisma.orderSessionItem.findFirst({ where: { sessionId: sid } });
    const res = await MOVE(json('POST', { itemIds: [item.id], tableId: await table() }), { params: { id: sid } });
    expect(res.status).toBe(409);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: sid } })).toBe(1);
  });

  it('the legacy close refuses a bill with an online payment', async () => {
    const sid = await comanda(2);
    await paidOnline(sid, 30);
    const res = await SESSION_PUT(json('PUT', { status: 'CLOSED', paymentMethod: 'CASH', cashSessionId: shiftId }), { params: { id: sid } });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('PARTIAL_PAYMENTS');
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).status).toBe('OPEN');
  });

  it('a comanda with an online payment cannot be cancelled until it is refunded through Mercado Pago', async () => {
    const sid = await comanda(2);
    const p = await paidOnline(sid, 30);
    const res = await CANCEL(json('DELETE', { reason: 'cliente desistiu', cashSessionId: shiftId }), { params: { id: sid } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Pagamento online: estorne pelo Mercado Pago antes de cancelar');
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).status).toBe('OPEN');
    // Once Mercado Pago gave it all back, the cancel goes through
    await prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED', amountRefunded: 30 } });
    expect((await CANCEL(json('DELETE', { reason: 'cliente desistiu', cashSessionId: shiftId }), { params: { id: sid } })).status).toBe(200);
  });
});
