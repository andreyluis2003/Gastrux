// @ts-nocheck
/** Pay at the table, stage 1 (spec 2026-10-10 §5.4): an approved online payment is applied once and closes the bill */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
import { autoEmitNFCe } from '../../../lib/nfe/emit-session';
import { applyTablePayment } from '../../../lib/comanda/table-payment';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('applyTablePayment', () => {
  let rid: string, ownerId: string, recipeId: string, tableId: string, regId: string;
  // 2 x 50,00 = 100,00 + 10% = 110,00
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeEligible: true, payAtWaiterRequestedAt: new Date() } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  const approved = (sid: string, amount: number, extra: any = {}) => prisma.payment.create({
    data: { restaurantId: rid, amount, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', orderSessionId: sid, ...extra },
  });
  const alerts = (kind: string) => prisma.notification.findMany({ where: { restaurantId: rid, data: { path: ['kind'], equals: kind } } });
  const openShift = () => prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: regId, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `ta-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `TA ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `T${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `ta${tag}` } })).id;
    regId = (await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } })).id;
  }, 60000);

  beforeEach(async () => {
    (autoEmitNFCe as jest.Mock).mockClear();
    await prisma.notification.deleteMany({ where: { restaurantId: rid } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: rid } });
  });

  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a part leaves the bill open, records the shift and clears the waiter request', async () => {
    const shift = await openShift();
    const sid = await newBill();
    const p = await approved(sid, 50);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toEqual({ outcome: 'applied', overpaidCents: 0, withoutShift: false });
    const row = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(row.cashSessionId).toBe(shift.id);
    expect(row.appliedToBillAt).toBeInstanceOf(Date);
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).payAtWaiterRequestedAt).toBeNull();
    expect((await loadBill(prisma, rid, sid)).remainingCents).toBe(6_000);
    expect(autoEmitNFCe).not.toHaveBeenCalled();
  });

  it('the payment that reaches the total closes the bill with the service charge and issues ONE NFC-e with the last CPF', async () => {
    await openShift();
    const sid = await newBill();
    const a = await approved(sid, 55, { customerDocument: '11111111111' });
    const b = await approved(sid, 55, { customerDocument: '22222222222' });
    await applyTablePayment(rid, a.id);
    const r = await applyTablePayment(rid, b.id);
    expect(r.outcome).toBe('closed');
    expect(await prisma.orderSession.findUnique({ where: { id: sid } })).toMatchObject({ status: 'CLOSED', serviceChargeCents: 1_000 });
    expect(autoEmitNFCe).toHaveBeenCalledTimes(1);
    expect((autoEmitNFCe as jest.Mock).mock.calls[0][0]).toMatchObject({ orderSessionId: sid, customerCPF: '22222222222' });
    expect(await alerts('table-paid')).toHaveLength(1);
  });

  it('applies once: a repeated call changes nothing and issues nothing new', async () => {
    await openShift();
    const sid = await newBill();
    const p = await approved(sid, 110);
    expect((await applyTablePayment(rid, p.id)).outcome).toBe('closed');
    expect((await applyTablePayment(rid, p.id)).outcome).toBe('already-applied');
    expect(autoEmitNFCe).toHaveBeenCalledTimes(1);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(11_000);
  });

  it('two at once: both are counted, the bill closes once, the NFC-e is issued once', async () => {
    await openShift();
    const sid = await newBill();
    const a = await approved(sid, 55);
    const b = await approved(sid, 55);
    const res = await Promise.all([applyTablePayment(rid, a.id), applyTablePayment(rid, b.id)]);
    expect(res.map((r) => r.outcome).sort()).toEqual(['applied', 'closed']);
    expect(autoEmitNFCe).toHaveBeenCalledTimes(1);
  });

  it('more than the total: the bill closes and the manager is told how much was paid over', async () => {
    await openShift();
    const sid = await newBill();
    const p = await approved(sid, 122);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toMatchObject({ outcome: 'closed', overpaidCents: 1_200 });
    const over = await alerts('table-overpaid');
    expect(over).toHaveLength(1);
    expect(over[0].message).toContain('R$ 12,00');
  });

  it('a payment that arrives after the bill was closed is kept, not applied twice, and reported as paid over in full', async () => {
    await openShift();
    const sid = await newBill();
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED', closedAt: new Date() } });
    const p = await approved(sid, 30);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toMatchObject({ outcome: 'bill-closed', overpaidCents: 3_000 });
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).status).toBe('CLOSED');
    expect(await alerts('table-overpaid')).toHaveLength(1);
  });

  it('without an open shift the payment still counts and the manager is warned', async () => {
    const sid = await newBill();
    const p = await approved(sid, 40);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toMatchObject({ outcome: 'applied', withoutShift: true });
    expect((await prisma.payment.findUnique({ where: { id: p.id } })).cashSessionId).toBeNull();
    expect(await alerts('table-no-shift')).toHaveLength(1);
  });

  it('ignores payments that are not approved, not linked to a comanda, or from another restaurant', async () => {
    const sid = await newBill();
    const pending = await approved(sid, 10, { status: 'PENDING' });
    const loose = await prisma.payment.create({ data: { restaurantId: rid, amount: 10, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED' } });
    expect((await applyTablePayment(rid, pending.id)).outcome).toBe('not-a-table-payment');
    expect((await applyTablePayment(rid, loose.id)).outcome).toBe('not-a-table-payment');
    expect((await applyTablePayment('other-restaurant', (await approved(sid, 10)).id)).outcome).toBe('not-a-table-payment');
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
  });
});
