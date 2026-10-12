// @ts-nocheck
/**
 * Every refund done at Mercado Pago ends recorded once in Gastrux (prod 2026-10-12: a refund made from the
 * "Estornar" button became REFUNDED through the Mercado Pago notice with no refund record, amountRefunded 0,
 * and the next click said "só pagamentos aprovados").
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  refundConnectPayment: jest.fn(),
  getConnectPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { refundConnectPayment, getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';
import { POST } from '../../../app/api/pagamentos/mp/refund/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('refund records match what Mercado Pago refunded', () => {
  let A;
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  const refund = (body) => POST(new Request('https://gastrux.test/api/pagamentos/mp/refund', { method: 'POST', body: JSON.stringify(body) }) as any);
  const makePayment = () =>
    prisma.payment.create({ data: { restaurantId: A.restaurantId, amount: 1, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '5555' } });
  const mpRefunded = (paymentId, refundId = 777) => ({
    id: 5555, status: 'refunded', status_detail: 'refunded', external_reference: paymentId,
    transaction_amount: 1, transaction_amount_refunded: 1, refunds: [{ id: refundId, amount: 1 }], fee_details: [],
  });
  const mpApproved = (paymentId) => ({ id: 5555, status: 'approved', external_reference: paymentId, transaction_amount: 1, transaction_amount_refunded: 0, refunds: [], fee_details: [] });
  const rowOf = (id) => prisma.payment.findUnique({ where: { id }, include: { refunds: true } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA;
    await saveConnection(A.restaurantId, TOKENS);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await prisma.paymentRefund.deleteMany({ where: { payment: { restaurantId: A.restaurantId } } });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' } });
  });

  afterAll(async () => {
    await prisma.paymentRefund.deleteMany({ where: { payment: { restaurantId: A.restaurantId } } });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  it('(b) a refund announced by the Mercado Pago notice is recorded: amount, date and one refund record', async () => {
    const p = await makePayment();
    getConnectPayment.mockResolvedValue(mpRefunded(p.id));
    await syncRestaurantPayment(A.restaurantId, '5555');
    const row = await rowOf(p.id);
    expect(row.status).toBe('REFUNDED');
    expect(Number(row.amountRefunded)).toBe(1);
    expect(row.refundedAt).not.toBeNull();
    expect(row.refunds.map((r) => [Number(r.amount), r.status, r.gatewayRefundId])).toEqual([[1, 'completed', '777']]);
  });

  it('(b) the button and the notice together leave ONE refund record, whatever arrives first', async () => {
    const p = await makePayment();
    refundConnectPayment.mockResolvedValue({ id: 777 });
    expect((await refund({ paymentId: p.id })).status).toBe(200);
    getConnectPayment.mockResolvedValue(mpRefunded(p.id));
    await syncRestaurantPayment(A.restaurantId, '5555');
    expect((await rowOf(p.id)).refunds).toHaveLength(1);

    const q = await makePayment();
    await prisma.payment.update({ where: { id: q.id }, data: { gatewayPaymentId: '5556' } });
    getConnectPayment.mockResolvedValue({ ...mpRefunded(q.id, 888), id: 5556 });
    await syncRestaurantPayment(A.restaurantId, '5556');
    const row = await rowOf(q.id);
    expect(row.refunds).toHaveLength(1);
    expect(Number(row.amountRefunded)).toBe(1);
  });

  it('(a) Mercado Pago refunded but answered with an error: the button checks and records it', async () => {
    const p = await makePayment();
    refundConnectPayment.mockRejectedValue(Object.assign(new Error('timeout'), { status: undefined }));
    getConnectPayment.mockResolvedValue(mpRefunded(p.id, 999));
    const res = await refund({ paymentId: p.id });
    expect(res.status).toBe(200);
    const row = await rowOf(p.id);
    expect(row.status).toBe('REFUNDED');
    expect(row.refunds.map((r) => r.gatewayRefundId)).toEqual(['999']);
  });

  it('(a) Mercado Pago really did not refund: the error stays and nothing is written', async () => {
    const p = await makePayment();
    refundConnectPayment.mockRejectedValue(Object.assign(new Error('insufficient balance'), { status: 400 }));
    getConnectPayment.mockResolvedValue(mpApproved(p.id));
    const res = await refund({ paymentId: p.id });
    expect(res.status).toBe(424);
    const row = await rowOf(p.id);
    expect(row.status).toBe('APPROVED');
    expect(row.refunds).toHaveLength(0);
  });

  it('(c) a payment already refunded says so', async () => {
    const p = await makePayment();
    await prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED' } });
    const res = await refund({ paymentId: p.id });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Este pagamento já foi estornado.');
    expect(refundConnectPayment).not.toHaveBeenCalled();
  });
});
