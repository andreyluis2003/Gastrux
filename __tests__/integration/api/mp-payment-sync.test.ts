// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  getConnectPayment: jest.fn(),
}));

import { getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('mercadopago-connect/payment-sync', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
    await cleanupMultiTenantData(ids);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  let order: any;
  let payment: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });

    await saveConnection(A.restaurantId, TOKENS);
    order = await prisma.order.create({
      data: { restaurantId: A.restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total: 50, paymentStatus: 'PENDING' },
    });
    payment = await prisma.payment.create({
      data: {
        restaurantId: A.restaurantId,
        orderId: order.id,
        amount: 50,
        method: 'PIX',
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'PENDING',
        gatewayPaymentId: '555',
      },
    });
  });

  const mpPayment = (overrides = {}) => ({
    id: 555,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: payment.id,
    transaction_amount: 50,
    fee_details: [{ amount: 1.5 }, { amount: 0.5 }],
    ...overrides,
  });

  const reload = async () => ({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    order: await prisma.order.findUnique({ where: { id: order.id } }),
  });

  it('approves the payment, records fees and marks the order paid', async () => {
    getConnectPayment.mockResolvedValue(mpPayment());

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: true, status: 'APPROVED' });
    const { payment: p, order: o } = await reload();
    expect(p.status).toBe('APPROVED');
    expect(p.processedAt).not.toBeNull();
    expect(Number(p.gatewayFee)).toBe(2);
    expect(Number(p.netAmount)).toBe(48);
    expect(p.platformFee).toBeNull();
    expect(o.paymentStatus).toBe('APPROVED');
  });

  it('is idempotent: a repeated notification changes nothing', async () => {
    getConnectPayment.mockResolvedValue(mpPayment());
    await syncRestaurantPayment(A.restaurantId, '555');
    const first = (await reload()).payment;

    const again = await syncRestaurantPayment(A.restaurantId, '555');

    expect(again).toMatchObject({ updated: false, reason: 'no-transition' });
    const second = (await reload()).payment;
    expect(second.processedAt.getTime()).toBe(first.processedAt.getTime());
  });

  it('refuses to approve when the paid amount differs from the payment amount', async () => {
    getConnectPayment.mockResolvedValue(mpPayment({ transaction_amount: 10 }));

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'amount-mismatch' });
    const { payment: p, order: o } = await reload();
    expect(p.status).toBe('PENDING');
    expect(o.paymentStatus).toBe('PENDING');
  });

  it('ignores a PIX whose Mercado Pago id differs from the recorded one', async () => {
    getConnectPayment.mockResolvedValue(mpPayment({ id: 999 }));

    const result = await syncRestaurantPayment(A.restaurantId, '999');

    expect(result).toMatchObject({ updated: false, reason: 'mp-id-mismatch' });
    expect((await reload()).payment.status).toBe('PENDING');
  });

  it('never applies a payment that belongs to another restaurant (tenant guard)', async () => {
    await saveConnection(B.restaurantId, TOKENS);
    getConnectPayment.mockResolvedValue(mpPayment());

    const result = await syncRestaurantPayment(B.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'payment-not-found' });
    expect((await reload()).payment.status).toBe('PENDING');
  });

  it('marks a rejected payment DECLINED and leaves the order pending', async () => {
    getConnectPayment.mockResolvedValue(mpPayment({ status: 'rejected', status_detail: 'cc_rejected_other_reason' }));

    await syncRestaurantPayment(A.restaurantId, '555');

    const { payment: p, order: o } = await reload();
    expect(p.status).toBe('DECLINED');
    expect(o.paymentStatus).toBe('PENDING');
  });

  it('moves an approved payment to REFUNDED', async () => {
    getConnectPayment.mockResolvedValueOnce(mpPayment());
    await syncRestaurantPayment(A.restaurantId, '555');
    getConnectPayment.mockResolvedValueOnce(mpPayment({ status: 'refunded' }));

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: true, status: 'REFUNDED' });
  });

  it('reports no-active-connection without calling Mercado Pago', async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'no-active-connection' });
    expect(getConnectPayment).not.toHaveBeenCalled();
  });

  it('marks the connection NEEDS_RECONNECT when Mercado Pago answers 401', async () => {
    getConnectPayment.mockRejectedValue({ status: 401, message: 'unauthorized' });

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'unauthorized' });
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });
});
