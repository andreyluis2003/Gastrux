// @ts-nocheck
/** Pay at the table, stage 1 (spec 2026-10-10 §5.4): the bill sums the cash register and the applied online payments */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
import { autoEmitNFCe } from '../../../lib/nfe/emit-session';
import { loadBill, emitClosedBillFor } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('bill with online payments', () => {
  let rid: string, ownerId: string, recipeId: string, tableId: string, shiftId: string;
  // 2 x 50,00 = 100,00 + 10% = 110,00
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  // Applied a little after the cash entries and in call order, so the order of the list never depends on clock ticks
  let seq = 0;
  const online = (sid: string, amount: number, extra: any = {}) => prisma.payment.create({
    data: { restaurantId: rid, amount, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', orderSessionId: sid, appliedToBillAt: new Date(Date.now() + 1_000 * ++seq), ...extra },
  });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `bo-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `BO ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `B${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `bo${tag}` } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
  }, 60000);

  afterAll(async () => {
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('sums cash and applied online payments; lists online ones with their own label', async () => {
    const sid = await newBill();
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents: 3_000, orderSessionId: sid, createdById: ownerId } });
    await online(sid, 50);
    await online(sid, 20, { method: 'CARD' });
    const bill = await loadBill(prisma, rid, sid);
    expect(bill).toMatchObject({ totalCents: 11_000, paidCents: 10_000, remainingCents: 1_000 });
    expect(bill.payments.map((p) => [p.method, p.amountCents, p.online])).toEqual([
      ['CASH', 3_000, false], ['PIX_ONLINE', 5_000, true], ['CARD_ONLINE', 2_000, true],
    ]);
  });

  it('ignores payments not applied yet, pending ones and other comandas', async () => {
    const sid = await newBill();
    const other = await newBill();
    await online(sid, 50, { appliedToBillAt: null });
    await online(sid, 50, { status: 'PENDING' });
    await online(other, 50);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
  });

  it('a refunded online payment stops counting; a partial refund counts the rest', async () => {
    const sid = await newBill();
    await online(sid, 50, { status: 'REFUNDED', amountRefunded: 50 });
    await online(sid, 40, { status: 'PARTIALLY_REFUNDED', amountRefunded: 10 });
    const bill = await loadBill(prisma, rid, sid);
    expect(bill.paidCents).toBe(3_000);
    expect(bill.payments.find((p) => p.amountCents === 5_000).refunded).toBe(true);
  });

  it('online payments survive a reopening (only cash is given back by the reopen)', async () => {
    const sid = await newBill();
    await online(sid, 60);
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents: 1_000, orderSessionId: sid, createdById: ownerId } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'REFUND', method: 'CASH', amountCents: 1_000, direction: 'OUT', description: 'Reabertura da comanda: teste', orderSessionId: sid, createdById: ownerId } });
    const bill = await loadBill(prisma, rid, sid);
    expect(bill.paidCents).toBe(6_000);
    expect(bill.payments.find((p) => p.online).refunded).toBe(false);
  });

  it('the NFC-e method follows what paid the most, online included', async () => {
    const sid = await newBill();
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents: 1_000, orderSessionId: sid, createdById: ownerId } });
    await online(sid, 100);
    (autoEmitNFCe as jest.Mock).mockClear();
    await emitClosedBillFor(rid, sid, '123.456.789-09', 'Maria');
    expect((autoEmitNFCe as jest.Mock).mock.calls[0][0]).toMatchObject({ restaurantId: rid, orderSessionId: sid, paymentMethod: 'pix', customerCPF: '12345678909', customerName: 'Maria' });
  });
});
