// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  refundConnectPayment: jest.fn(),
}));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  refundPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { refundConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { refundPayment } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST } from '../../../app/api/pagamentos/mp/refund/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('POST /api/pagamentos/mp/refund', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.paymentRefund.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
    refundConnectPayment.mockResolvedValue({ id: 9001 });
    refundPayment.mockResolvedValue({ id: 9002 });
  });

  const refund = (body: any) =>
    POST(new Request('https://gastrux.test/api/pagamentos/mp/refund', { method: 'POST', body: JSON.stringify(body) }) as any);

  const makeConnectPayment = (restaurantId = A.restaurantId) =>
    prisma.payment.create({
      data: { restaurantId, amount: 100, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
    });

  it("refunds a Connect payment fully with the restaurant's token and records the Connect gateway", async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(200);
    expect(refundConnectPayment).toHaveBeenCalledTimes(1);
    const [client, mpId, amount] = refundConnectPayment.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(mpId).toBe('4242');
    expect(amount).toBeUndefined();
    expect(refundPayment).not.toHaveBeenCalled();

    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('REFUNDED');
    const record = await prisma.paymentRefund.findFirst({ where: { paymentId: payment.id } });
    expect(record.gateway).toBe('MERCADO_PAGO_CONNECT');
    expect(record.gatewayRefundId).toBe('9001');
  });

  it('refunds partially', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id, amount: 30 });

    expect(res.status).toBe(200);
    expect(refundConnectPayment.mock.calls[0][2]).toBe(30);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(updated.amountRefunded)).toBe(30);
  });

  const expectInvalidAmountRejected = async (badAmount: number) => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id, amount: badAmount });

    expect(res.status).toBe(400);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect(refundPayment).not.toHaveBeenCalled();
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  };

  it('rejects amount 0 with 400 instead of refunding the whole payment', () => expectInvalidAmountRejected(0));

  it('rejects a negative amount with 400', () => expectInvalidAmountRejected(-5));

  it("404s for another restaurant's payment and never calls Mercado Pago", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    const payment = await makeConnectPayment(B.restaurantId);

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(404);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it('answers 409 and refunds nothing when the connection is unavailable', async () => {
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(409);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it('keeps the legacy path for platform MERCADO_PAGO payments', async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO', status: 'APPROVED' },
    });
    await prisma.mercadoPagoTransaction.create({
      data: { paymentId: payment.id, preferenceId: `pref-${crypto.randomBytes(4).toString('hex')}`, mpPaymentId: '888' },
    });

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(200);
    expect(refundPayment).toHaveBeenCalledWith('888', undefined);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect((await prisma.paymentRefund.findFirst({ where: { paymentId: payment.id } })).gateway).toBe('MERCADO_PAGO');
  });
});
