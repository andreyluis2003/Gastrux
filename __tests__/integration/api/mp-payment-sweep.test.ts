// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  getConnectPayment: jest.fn(),
  searchConnectPaymentsByReference: jest.fn(),
}));

import { getConnectPayment, searchConnectPaymentsByReference } from '../../../lib/mercadopago-connect/payments';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { sweepPendingPayments } from '../../../lib/mercadopago-connect/payment-sweep';
import { POST as reconcileRoute } from '../../../app/api/pagamentos/mp/reconcile/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const MIN = 60_000;

describe('mercadopago-connect/payment-sweep', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const savedCron = process.env.CRON_SECRET;

  const wipe = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { OR: [{ restaurantId: { in: ids } }, { userId: { in: [A.ownerId, B.ownerId] } }] } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.CRON_SECRET = 'cron-secret';
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    await wipe();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
    process.env.CRON_SECRET = savedCron;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await wipe();
    await saveConnection(A.restaurantId, TOKENS);
  });

  /** A PENDING Connect payment of `total` reais, created `ageMs` ago and last touched `checkedMs` ago. */
  async function makePayment({ ageMs = 10 * MIN, checkedMs = ageMs, method = 'PIX', mpId = '900', restaurantId = A.restaurantId, total = 50 } = {}) {
    const order = await prisma.order.create({
      data: { restaurantId, orderNumber: `SW-${crypto.randomBytes(4).toString('hex')}`, total, paymentStatus: 'PENDING' },
    });
    const payment = await prisma.payment.create({
      data: {
        restaurantId, orderId: order.id, amount: total, method, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING',
        gatewayPaymentId: mpId,
        createdAt: new Date(Date.now() - ageMs),
        updatedAt: new Date(Date.now() - checkedMs),
      },
    });
    return { order, payment };
  }
  const mp = (payment: any, over = {}) => ({
    id: 900, status: 'approved', status_detail: 'accredited', external_reference: payment.id,
    transaction_amount: 50, fee_details: [], ...over,
  });
  const reload = async (o: any, p: any) => ({
    payment: await prisma.payment.findUnique({ where: { id: p.id } }),
    order: await prisma.order.findUnique({ where: { id: o.id } }),
  });

  it('records a PIX approved while the webhook was lost (id known)', async () => {
    const { order, payment } = await makePayment();
    getConnectPayment.mockResolvedValue(mp(payment));

    const summary = await sweepPendingPayments();

    expect(summary).toMatchObject({ examined: 1, resolved: 1, unchanged: 0, failed: 0, stoppedEarly: false });
    const s = await reload(order, payment);
    expect(s.payment.status).toBe('APPROVED');
    expect(s.order.paymentStatus).toBe('APPROVED');
    expect(searchConnectPaymentsByReference).not.toHaveBeenCalled();
  });

  it('finds a card payment whose Mercado Pago id was never recorded, by our reference', async () => {
    const { order, payment } = await makePayment({ method: 'CARD', mpId: null });
    searchConnectPaymentsByReference.mockResolvedValue([
      mp(payment, { id: 901, status: 'rejected', status_detail: 'cc_rejected_other_reason' }),
      mp(payment, { id: 902 }),
    ]);
    getConnectPayment.mockImplementation(async (_c, id) =>
      id === '901' ? mp(payment, { id: 901, status: 'rejected' }) : mp(payment, { id: 902 })
    );

    const summary = await sweepPendingPayments();

    expect(summary).toMatchObject({ examined: 1, resolved: 1, failed: 0 });
    const s = await reload(order, payment);
    expect(s.payment.status).toBe('APPROVED');
    expect(s.payment.gatewayPaymentId).toBe('902');
    expect(s.order.paymentStatus).toBe('APPROVED');
  });

  it('leaves a payment PENDING when Mercado Pago has no attempt for it, and does not ask again right away', async () => {
    const { payment } = await makePayment({ method: 'CARD', mpId: null });
    searchConnectPaymentsByReference.mockResolvedValue([]);

    const first = await sweepPendingPayments();
    const second = await sweepPendingPayments();

    expect(first).toMatchObject({ examined: 1, resolved: 0, unchanged: 1 });
    expect(second.examined).toBe(0);
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING');
    expect(searchConnectPaymentsByReference).toHaveBeenCalledTimes(1);
  });

  it('skips payments that are too young, too old, or checked too recently', async () => {
    await makePayment({ ageMs: 1 * MIN }); // webhook / page still have time
    await makePayment({ ageMs: 8 * 24 * 60 * MIN }); // gave up after 7 days
    await makePayment({ ageMs: 3 * 60 * MIN, checkedMs: 10 * MIN }); // slow lane: checked 10 min ago
    await makePayment({ ageMs: 10 * MIN, checkedMs: 30_000 }); // fast lane: checked 30 s ago

    const summary = await sweepPendingPayments();

    expect(summary.examined).toBe(0);
    expect(getConnectPayment).not.toHaveBeenCalled();
  });

  it('checks an older payment again once the hourly interval has passed', async () => {
    const { payment } = await makePayment({ ageMs: 5 * 60 * MIN, checkedMs: 2 * 60 * MIN });
    getConnectPayment.mockResolvedValue(mp(payment, { status: 'in_process' }));

    const summary = await sweepPendingPayments();

    expect(summary).toMatchObject({ examined: 1, resolved: 1 });
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PROCESSING');
  });

  it('never touches payments that are already settled', async () => {
    const { payment } = await makePayment();
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'APPROVED' } });

    expect((await sweepPendingPayments()).examined).toBe(0);
    expect(getConnectPayment).not.toHaveBeenCalled();
  });

  it('one failing payment does not stop the others', async () => {
    const bad = await makePayment({ mpId: '901' });
    const good = await makePayment({ mpId: '902' });
    getConnectPayment.mockImplementation(async (_c, id) => {
      if (id === '901') throw new Error('MP timeout');
      return mp(good.payment, { id: 902 });
    });

    const summary = await sweepPendingPayments();

    expect(summary).toMatchObject({ examined: 2, resolved: 1, failed: 1 });
    expect((await reload(good.order, good.payment)).payment.status).toBe('APPROVED');
    expect((await reload(bad.order, bad.payment)).payment.status).toBe('PENDING');
  });

  it('counts a restaurant without an active connection instead of failing', async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await makePayment({ method: 'CARD', mpId: null });

    const summary = await sweepPendingPayments();

    expect(summary).toMatchObject({ examined: 1, skippedNoConnection: 1, failed: 0 });
    expect(searchConnectPaymentsByReference).not.toHaveBeenCalled();
  });

  it('marks the connection NEEDS_RECONNECT when Mercado Pago answers 401 to the search', async () => {
    await makePayment({ method: 'CARD', mpId: null });
    searchConnectPaymentsByReference.mockRejectedValue({ status: 401, message: 'unauthorized' });

    const summary = await sweepPendingPayments();

    expect(summary).toMatchObject({ examined: 1, skippedNoConnection: 1, failed: 0 });
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });

  it("applies a Mercado Pago payment only to OUR payment of THIS restaurant (tenant guard)", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    const a = await makePayment({ mpId: '903' });
    const b = await makePayment({ mpId: '904', restaurantId: B.restaurantId });
    // Restaurant A's Mercado Pago id comes back carrying restaurant B's payment as its reference.
    getConnectPayment.mockImplementation(async (_c, id) =>
      id === '903' ? mp(b.payment, { id: 903 }) : mp(b.payment, { id: 904 })
    );

    await sweepPendingPayments();

    expect((await reload(a.order, a.payment)).payment.status).toBe('PENDING');
    expect((await reload(b.order, b.payment)).payment.status).toBe('APPROVED');
  });

  it('stops when the time budget runs out and reports it, leaving the rest for the next run', async () => {
    await makePayment({ mpId: '905' });
    await makePayment({ mpId: '906' });

    const summary = await sweepPendingPayments({ budgetMs: -1 });

    expect(summary).toMatchObject({ examined: 0, stoppedEarly: true });
  });

  describe('POST /api/pagamentos/mp/reconcile', () => {
    const call = (headers: Record<string, string> = {}) =>
      reconcileRoute(new Request('https://gastrux.test/api/pagamentos/mp/reconcile', { method: 'POST', headers }) as any);

    it('rejects a call without the cron secret and does no work', async () => {
      await makePayment();
      expect((await call()).status).toBe(401);
      expect((await call({ authorization: 'Bearer wrong' })).status).toBe(401);
      expect(getConnectPayment).not.toHaveBeenCalled();
    });

    it('runs the sweep for a call with the cron secret and answers only counters', async () => {
      const { payment } = await makePayment();
      getConnectPayment.mockResolvedValue(mp(payment));

      const res = await call({ 'x-internal-trigger': 'cron-secret' });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ examined: 1, resolved: 1, unchanged: 0, skippedNoConnection: 0, failed: 0, stoppedEarly: false, expiredSubscriptions: 0 });
    });
  });
});
