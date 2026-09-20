// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
  getPayment: jest.fn(),
  refundPayment: jest.fn(),
}));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  refundConnectPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { createCheckoutPreference, getPayment, refundPayment } from '../../../lib/mercado-pago';
import { refundConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import {
  createUnifiedPayment,
  createUnifiedRefund,
  syncPaymentStatus,
  OnlinePaymentUnavailableError,
} from '../../../lib/payment-unified';
import { POST as unifiedPost, GET as unifiedGet } from '../../../app/api/pagamentos/unified/route';
import { POST as unifiedRefundPost } from '../../../app/api/pagamentos/unified/refund/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PREFERENCE = { id: 'pref-unified-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

describe('unified payments - Mercado Pago never uses the platform token', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ['CREDENTIALS_ENCRYPTION_KEY', 'NEXTAUTH_URL'].forEach((k) => (saved[k] = process.env[k]));
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
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
    // markNeedsReconnect notifies the owner; keep the table clean between tests.
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    Object.entries(saved).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    createCheckoutPreference.mockResolvedValue(PREFERENCE);
    refundConnectPayment.mockResolvedValue({ id: 9001 });
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
  });

  const input = (restaurantId: string, extra = {}) => ({
    restaurantId,
    gateway: 'MERCADO_PAGO',
    amount: 60,
    items: [{ id: 'i1', title: 'Pizza', quantity: 2, unitPrice: 30 }],
    customer: { email: 'cli@ex.com', name: 'Cliente' },
    successUrl: 'https://gastrux.test/ok',
    failureUrl: 'https://gastrux.test/no',
    pendingUrl: 'https://gastrux.test/wait',
    webhookUrl: 'https://evil.example/hook',
    externalReference: 'ref-1',
    ...extra,
  });

  it('refuses and creates nothing when the restaurant has no Mercado Pago connection', async () => {
    await expect(createUnifiedPayment(input(A.restaurantId))).rejects.toBeInstanceOf(OnlinePaymentUnavailableError);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
  });

  it("never uses another restaurant's connection", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    await expect(createUnifiedPayment(input(A.restaurantId))).rejects.toBeInstanceOf(OnlinePaymentUnavailableError);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it("creates a MERCADO_PAGO_CONNECT payment and the preference with the restaurant's own client", async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const result = await createUnifiedPayment(input(A.restaurantId));

    const payment = await prisma.payment.findUnique({ where: { id: result.paymentId } });
    expect(payment).toMatchObject({ restaurantId: A.restaurantId, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' });
    const [prefInput, client] = createCheckoutPreference.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(prefInput.externalReference).toBe(payment.id);
    expect(prefInput.notificationUrl).toBe(`https://gastrux.test/api/pagamentos/mp/webhook?rid=${A.restaurantId}`);
    expect(prefInput.notificationUrl).not.toContain('evil.example');
    expect(result.checkoutUrl).toBe('https://mp/init');
  });

  it('marks the connection NEEDS_RECONNECT and surfaces 409 when Mercado Pago rejects the token (I8)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    createCheckoutPreference.mockRejectedValue({ status: 401, message: 'unauthorized' });

    await expect(createUnifiedPayment(input(A.restaurantId))).rejects.toBeInstanceOf(OnlinePaymentUnavailableError);

    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
    const payment = await prisma.payment.findFirst({ where: { restaurantId: A.restaurantId } });
    expect(payment.status).toBe('DECLINED');
  });

  it('answers 409 ONLINE_PAYMENT_UNAVAILABLE from the route for that same 401 (I8)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    createCheckoutPreference.mockRejectedValue({ status: 401, message: 'unauthorized' });

    const res = await unifiedPost(
      new Request('https://gastrux.test/api/pagamentos/unified', {
        method: 'POST',
        body: JSON.stringify({ gateway: 'MERCADO_PAGO', items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }] }),
      }) as any
    );

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
  });

  it('leaves the connection ACTIVE for a non-401 Mercado Pago failure', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    createCheckoutPreference.mockRejectedValue(new Error('MP down'));

    await expect(createUnifiedPayment(input(A.restaurantId))).rejects.toThrow('MP down');

    expect((await getConnection(A.restaurantId)).status).toBe('ACTIVE');
  });

  it('syncPaymentStatus for a Connect payment answers from our database and never calls Mercado Pago', async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 10, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' },
    });

    expect(await syncPaymentStatus(payment.id)).toBe('PENDING');
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("refunds a Connect payment with the restaurant's client and records the Connect gateway", async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
    });

    const result = await createUnifiedRefund(payment.id, 30);

    expect(result).toMatchObject({ status: 'PARTIALLY_REFUNDED', amount: 30 });
    const [client, mpId, amount] = refundConnectPayment.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(mpId).toBe('4242');
    expect(amount).toBe(30);
    expect(refundPayment).not.toHaveBeenCalled();
    expect((await prisma.paymentRefund.findFirst({ where: { paymentId: payment.id } })).gateway).toBe('MERCADO_PAGO_CONNECT');
  });

  it('refuses to refund a Connect payment when the connection is unavailable, recording nothing', async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
    });

    await expect(createUnifiedRefund(payment.id)).rejects.toThrow();
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect(await prisma.paymentRefund.count({ where: { paymentId: payment.id } })).toBe(0);
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it('keeps the legacy refund path for existing platform MERCADO_PAGO rows', async () => {
    refundPayment.mockResolvedValue({ id: 9002 });
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO', status: 'APPROVED' },
    });
    await prisma.mercadoPagoTransaction.create({
      data: { paymentId: payment.id, preferenceId: `pref-${crypto.randomBytes(4).toString('hex')}`, mpPaymentId: '888' },
    });

    await createUnifiedRefund(payment.id);

    expect(refundPayment).toHaveBeenCalledWith('888', 100);
    expect(refundConnectPayment).not.toHaveBeenCalled();
  });

  describe('POST /api/pagamentos/unified', () => {
    const post = (body: any) =>
      unifiedPost(new Request('https://gastrux.test/api/pagamentos/unified', { method: 'POST', body: JSON.stringify(body) }) as any);

    it('answers 409 with ONLINE_PAYMENT_UNAVAILABLE for a restaurant without a connection', async () => {
      const res = await post({ gateway: 'MERCADO_PAGO', items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }] });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(createCheckoutPreference).not.toHaveBeenCalled();
    });

    it('rejects a gateway a client may not ask for, without creating a row (I9)', async () => {
      await saveConnection(A.restaurantId, TOKENS);

      const res = await post({
        gateway: 'MERCADO_PAGO_CONNECT',
        items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }],
      });

      // MERCADO_PAGO_CONNECT is created by the connect flows only: accepting it
      // here would skip the connection check and leave a DECLINED row behind.
      expect(res.status).toBe(400);
      expect(createCheckoutPreference).not.toHaveBeenCalled();
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });

    it('rejects an unknown gateway with 400 instead of letting it reach Prisma (I9)', async () => {
      const res = await post({ gateway: 'BITCOIN', items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }] });

      expect(res.status).toBe(400);
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });

    it('creates the payment through the restaurant connection when there is one', async () => {
      await saveConnection(A.restaurantId, TOKENS);

      const res = await post({ gateway: 'MERCADO_PAGO', items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }] });

      expect(res.status).toBe(201);
      expect(createCheckoutPreference.mock.calls[0][1].accessToken).toBe('APP_USR-a');
      expect((await prisma.payment.findFirst({ where: { restaurantId: A.restaurantId } })).gateway).toBe('MERCADO_PAGO_CONNECT');
    });
  });

  describe('GET /api/pagamentos/unified', () => {
    const get = (query = '') =>
      unifiedGet(new Request(`https://gastrux.test/api/pagamentos/unified${query}`) as any);

    it('lists the CURRENT restaurant, not the first membership (I9)', async () => {
      // The owner of A is also a member of B, and B sorts first by id often
      // enough that restaurants[0] was a real bug. currentRestaurantId is A.
      await prisma.restaurantUser.upsert({
        where: { restaurantId_userId: { restaurantId: B.restaurantId, userId: A.ownerId } },
        create: { restaurantId: B.restaurantId, userId: A.ownerId, role: 'OWNER' },
        update: { isActive: true },
      });
      const mine = await prisma.payment.create({
        data: { restaurantId: A.restaurantId, amount: 10, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' },
      });
      const theirs = await prisma.payment.create({
        data: { restaurantId: B.restaurantId, amount: 20, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' },
      });

      const body = await (await get()).json();
      const ids = body.payments.map((p: any) => p.id);

      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);

      await prisma.restaurantUser.deleteMany({ where: { restaurantId: B.restaurantId, userId: A.ownerId } });
    });

    it('can filter by MERCADO_PAGO_CONNECT (I9)', async () => {
      const connect = await prisma.payment.create({
        data: { restaurantId: A.restaurantId, amount: 10, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' },
      });
      await prisma.payment.create({
        data: { restaurantId: A.restaurantId, amount: 5, method: 'CASH', gateway: 'MANUAL', status: 'PENDING' },
      });

      const body = await (await get('?gateway=MERCADO_PAGO_CONNECT')).json();

      expect(body.payments.map((p: any) => p.id)).toEqual([connect.id]);
    });

    it('answers 400 for an invalid gateway filter instead of a 500 from Prisma (I9)', async () => {
      expect((await get('?gateway=BITCOIN')).status).toBe(400);
    });
  });

  describe('POST /api/pagamentos/unified/refund', () => {
    it('maps OnlinePaymentUnavailableError to 409, not 500 (I9)', async () => {
      // A Connect payment whose restaurant has no usable connection.
      const payment = await prisma.payment.create({
        data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
      });

      const res = await unifiedRefundPost(
        new Request('https://gastrux.test/api/pagamentos/unified/refund', {
          method: 'POST',
          body: JSON.stringify({ paymentId: payment.id }),
        }) as any
      );

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(refundConnectPayment).not.toHaveBeenCalled();
      expect(await prisma.paymentRefund.count({ where: { paymentId: payment.id } })).toBe(0);
    });
  });
});
