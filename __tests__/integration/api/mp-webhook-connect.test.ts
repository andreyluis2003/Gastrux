// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  getConnectPayment: jest.fn(),
}));
// MP_WEBHOOK_SECRET is a module-level constant of lib/mercado-pago, frozen when this factory
// runs (at the top-level import below, BEFORE any beforeAll). Setting process.env later would
// not change it, so the test secret is pinned here. Keep it equal to SECRET below.
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  MP_WEBHOOK_SECRET: 'test-mp-secret',
  getPayment: jest.fn().mockResolvedValue(null),
  getMerchantOrder: jest.fn(),
  getPreApproval: jest.fn(),
}));

import { getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { getPayment, getMerchantOrder, getPreApproval } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const SECRET = 'test-mp-secret';
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

function signed(dataId: string, query: string, secret = SECRET) {
  const ts = String(Date.now());
  const requestId = `req-${dataId}`;
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return new Request(`https://gastrux.test/api/pagamentos/mp/webhook?${query}`, {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: '{}',
  });
}

describe('POST /api/pagamentos/mp/webhook - restaurant (rid) branch', () => {
  let POST: any;
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedEnv: Record<string, string | undefined> = {};
  const ENV = ['MERCADO_PAGO_ENV', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_WEBHOOK_SECRET_PROD', 'CREDENTIALS_ENCRYPTION_KEY'];

  beforeAll(async () => {
    ENV.forEach((k) => (savedEnv[k] = process.env[k]));
    // Belt and braces: the webhook secret is already pinned by the lib/mercado-pago mock above.
    process.env.MERCADO_PAGO_ENV = 'test';
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET;
    process.env.MERCADO_PAGO_WEBHOOK_SECRET_PROD = SECRET;
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    POST = require('../../../app/api/pagamentos/mp/webhook/route').POST;

    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    ENV.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
  });

  let order: any;
  let payment: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    getPayment.mockResolvedValue(null);
    getMerchantOrder.mockReset();
    getPreApproval.mockReset();
    await cleanRows();
    await saveConnection(A.restaurantId, TOKENS);
    order = await prisma.order.create({
      data: { restaurantId: A.restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total: 50, paymentStatus: 'PENDING' },
    });
    payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, orderId: order.id, amount: 50, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING', gatewayPaymentId: '555' },
    });
    getConnectPayment.mockResolvedValue({
      id: 555, status: 'approved', status_detail: 'accredited', external_reference: payment.id, transaction_amount: 50, fee_details: [],
    });
  });

  const state = async () => ({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    order: await prisma.order.findUnique({ where: { id: order.id } }),
  });

  it('rejects an invalid signature even when rid is present', async () => {
    const res = await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`, 'wrong-secret') as any);
    expect(res.status).toBe(401);
    expect(getConnectPayment).not.toHaveBeenCalled();
    expect((await state()).payment.status).toBe('PENDING');
  });

  it('applies the payment with the restaurant token: approves it and marks the order paid', async () => {
    const res = await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);

    expect(res.status).toBe(200);
    expect(getConnectPayment).toHaveBeenCalledTimes(1);
    expect(getConnectPayment.mock.calls[0][0].accessToken).toBe('APP_USR-a');
    expect(getConnectPayment.mock.calls[0][1]).toBe('555');
    const { payment: p, order: o } = await state();
    expect(p.status).toBe('APPROVED');
    expect(o.paymentStatus).toBe('APPROVED');
  });

  it('never calls the platform-billing lookup for a rid notification', async () => {
    await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('is idempotent when Mercado Pago repeats the notification', async () => {
    await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);
    const first = (await state()).payment;

    const res = await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);

    expect(res.status).toBe(200);
    const second = (await state()).payment;
    expect(second.status).toBe('APPROVED');
    expect(second.processedAt.getTime()).toBe(first.processedAt.getTime());
  });

  it("does not let another restaurant's rid approve this restaurant's payment", async () => {
    await saveConnection(B.restaurantId, TOKENS);

    await POST(signed('555', `topic=payment&id=555&rid=${B.restaurantId}`) as any);

    const { payment: p, order: o } = await state();
    expect(p.status).toBe('PENDING');
    expect(o.paymentStatus).toBe('PENDING');
  });

  it('ignores non-payment topics that carry a rid', async () => {
    const res = await POST(signed('555', `topic=merchant_order&id=555&rid=${A.restaurantId}`) as any);
    expect(res.status).toBe(200);
    expect(getConnectPayment).not.toHaveBeenCalled();
    expect(getPayment).not.toHaveBeenCalled();
    expect(getMerchantOrder).not.toHaveBeenCalled();
  });

  it('ignores preapproval notifications that carry a rid (never reach the platform-billing handlers)', async () => {
    const res = await POST(signed('555', `topic=preapproval&id=555&rid=${A.restaurantId}`) as any);
    expect(res.status).toBe(200);
    expect(getPreApproval).not.toHaveBeenCalled();
    expect(getMerchantOrder).not.toHaveBeenCalled();
    expect(getPayment).not.toHaveBeenCalled();
    expect(getConnectPayment).not.toHaveBeenCalled();
  });

  it('keeps the platform-billing path for notifications WITHOUT rid', async () => {
    const res = await POST(signed('777', 'topic=payment&id=777') as any);

    expect(res.status).toBe(200);
    expect(getPayment).toHaveBeenCalledTimes(1);
    expect(getPayment).toHaveBeenCalledWith('777');
    expect(getConnectPayment).not.toHaveBeenCalled();
  });
});
