// @ts-nocheck
/** Pay at the table, stage 1: the table PIX charges what is left and its approval closes the bill */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../../../lib/mercadopago-connect/connection-service', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/connection-service'),
  getMpClientForRestaurant: jest.fn().mockResolvedValue({ fake: 'client' }),
}));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  cancelConnectPayment: jest.fn().mockResolvedValue({}),
  getConnectPayment: jest.fn(),
}));

import { createConnectPix, getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';
import { POST as pixRoute } from '../../../app/api/pagamentos/mp/pix/route';
import { loadBill } from '../../../lib/comanda/bill-service';
import * as tablePayment from '../../../lib/comanda/table-payment';
import { sweepPendingPayments } from '../../../lib/mercadopago-connect/payment-sweep';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let mpSeq = 70_000;

describe('table PIX on the bill', () => {
  let rid: string, ownerId: string, recipeId: string, table: any, regId: string;
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: table.id, status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  const askPix = async () => {
    const res = await pixRoute(new Request('http://localhost/api/pagamentos/mp/pix', { method: 'POST', body: JSON.stringify({ qrToken: table.qrToken }) }) as any);
    return { status: res.status, body: await res.json() };
  };
  const settle = async (paymentId: string, amount: number) => {
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    getConnectPayment.mockResolvedValueOnce({ id: Number(p.gatewayPaymentId), status: 'approved', status_detail: 'accredited', external_reference: paymentId, transaction_amount: amount, fee_details: [] });
    return syncRestaurantPayment(rid, p.gatewayPaymentId);
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    ownerId = (await prisma.user.create({ data: { email: `ts-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `TS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `S${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    table = await prisma.table.create({ data: { restaurantId: rid, number: 8, sectionId: sec.id, capacity: 4, qrToken: `ts${tag}` } });
    regId = (await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } })).id;
    await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: regId, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } });
  }, 60000);

  beforeEach(() => {
    jest.clearAllMocks();
    createConnectPix.mockImplementation(async () => {
      const id = ++mpSeq;
      return { id, status: 'pending', date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(), point_of_interaction: { transaction_data: { qr_code: `qr-${id}`, qr_code_base64: 'b64', ticket_url: `https://mp/${id}` } } };
    });
  });

  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('charges what is left on the bill (service charge included, minus what was paid) and links the comanda', async () => {
    const sid = await newBill();
    const shift = await prisma.cashSession.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 1_000, orderSessionId: sid, createdById: ownerId } });
    const pix = await askPix();
    expect(pix.status).toBe(200);
    expect(pix.body.amount).toBe(100);
    // The customer is told the 10% service charge is inside the amount (owner decision: shown, optional)
    expect(pix.body).toMatchObject({ serviceCents: 1_000, paidCents: 1_000 });
    const row = await prisma.payment.findUnique({ where: { id: pix.body.paymentId } });
    expect(row).toMatchObject({ orderSessionId: sid, tableShareMode: 'ALL' });
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CANCELLED' } });
  });

  it('its approval closes the bill; a repeated notification changes nothing', async () => {
    const sid = await newBill();
    const pix = await askPix();
    expect((await settle(pix.body.paymentId, 110)).updated).toBe(true);
    expect((await loadBill(prisma, rid, sid))).toMatchObject({ status: 'CLOSED', paidCents: 11_000 });
    await settle(pix.body.paymentId, 110);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(11_000);
  });

  it('self-heals: an APPROVED payment that was never applied is applied by the next notification', async () => {
    const sid = await newBill();
    const pix = await askPix();
    await prisma.payment.update({ where: { id: pix.body.paymentId }, data: { status: 'APPROVED', gatewayPaymentId: (await prisma.payment.findUnique({ where: { id: pix.body.paymentId } })).gatewayPaymentId } });
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
    await settle(pix.body.paymentId, 110);
    expect((await loadBill(prisma, rid, sid)).status).toBe('CLOSED');
  });

  it('an approval whose apply failed is applied by the next sweep, without asking Mercado Pago', async () => {
    const sid = await newBill();
    const pix = await askPix();
    const spy = jest.spyOn(tablePayment, 'applyTablePayment').mockRejectedValueOnce(new Error('db hiccup'));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await settle(pix.body.paymentId, 110)).updated).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
    expect(await prisma.payment.findUnique({ where: { id: pix.body.paymentId } })).toMatchObject({ status: 'APPROVED', appliedToBillAt: null });
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
    // The webhook gets its minimum time first
    await prisma.payment.update({ where: { id: pix.body.paymentId }, data: { updatedAt: new Date(Date.now() - 5 * 60_000) } });
    getConnectPayment.mockClear();

    const summary = await sweepPendingPayments();

    expect(summary.appliedToBills).toBeGreaterThanOrEqual(1);
    expect(getConnectPayment).not.toHaveBeenCalled();
    expect((await loadBill(prisma, rid, sid))).toMatchObject({ status: 'CLOSED', paidCents: 11_000 });
    expect((await prisma.payment.findUnique({ where: { id: pix.body.paymentId } })).appliedToBillAt).toBeInstanceOf(Date);
    // Applied once: the next sweep has nothing more for this bill
    await sweepPendingPayments();
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(11_000);
  });

  it('a table with nothing left to pay gets no PIX', async () => {
    const sid = await newBill();
    const shift = await prisma.cashSession.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 11_000, orderSessionId: sid, createdById: ownerId } });
    const pix = await askPix();
    expect(pix.status).toBe(409);
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CANCELLED' } });
  });
});
