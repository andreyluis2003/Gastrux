// @ts-nocheck
/**
 * "Bad day" scenario 6 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * a payment whose status is UNCERTAIN. Each case states the DESIRED behaviour
 * (detects / informs / recovers / preserves the record). A case that documents a
 * known gap is written with `it.failing`: the suite stays green, and the test flips
 * to a failure the day the gap is fixed, so it must then be changed to a plain `it`.
 * `it.todo` marks behaviour that has no entry point to call yet.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  getConnectPayment: jest.fn(),
  searchConnectPaymentsByReference: jest.fn(),
}));

import { getConnectPayment, searchConnectPaymentsByReference } from '../../../lib/mercadopago-connect/payments';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';
import { sweepPendingPayments } from '../../../lib/mercadopago-connect/payment-sweep';
import { GET as pixStatus } from '../../../app/api/pagamentos/mp/pix/status/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('bad day 6: payment with an uncertain status', () => {
  let A: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  let order: any;
  let payment: any;

  const wipe = async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { OR: [{ restaurantId: A.restaurantId }, { userId: A.ownerId }] } });
    await prisma.order.deleteMany({ where: { restaurantId: A.restaurantId } });
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA;
  });

  afterAll(async () => {
    await wipe();
    await cleanupMultiTenantData([A.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await wipe();
    await saveConnection(A.restaurantId, TOKENS);
    order = await prisma.order.create({
      data: { restaurantId: A.restaurantId, orderNumber: `BD-${crypto.randomBytes(4).toString('hex')}`, total: 50, paymentStatus: 'PENDING' },
    });
    payment = await prisma.payment.create({
      data: {
        restaurantId: A.restaurantId,
        orderId: order.id,
        amount: 50,
        method: 'PIX',
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'PENDING',
        gatewayPaymentId: '777',
      },
    });
  });

  const mp = (overrides = {}) => ({
    id: 777,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: payment.id,
    transaction_amount: 50,
    fee_details: [],
    ...overrides,
  });
  const reload = async () => ({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    order: await prisma.order.findUnique({ where: { id: order.id } }),
  });
  // Makes the payment look `ms` old and never checked since (the sweep reads updatedAt as "last checked").
  const age = (ms: number) =>
    prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - ms), updatedAt: new Date(Date.now() - ms) } });
  const poll = () => pixStatus(new Request(`http://localhost/api/pagamentos/mp/pix/status?paymentId=${payment.id}`) as any);
  const alerts = () => prisma.notification.findMany({ where: { restaurantId: A.restaurantId } });

  describe('the webhook never arrives', () => {
    it('recovers when the customer page polls after 30 s (reconciles with Mercado Pago)', async () => {
      await age(31_000);
      getConnectPayment.mockResolvedValue(mp());

      const res = await (await poll()).json();

      expect(res).toEqual({ status: 'approved', approved: true });
      const { payment: p, order: o } = await reload();
      expect(p.status).toBe('APPROVED');
      expect(o.paymentStatus).toBe('APPROVED');
    });

    it('does not ask Mercado Pago inside the first 30 s (the webhook still has time)', async () => {
      getConnectPayment.mockResolvedValue(mp());

      const res = await (await poll()).json();

      expect(res.status).toBe('pending');
      expect(getConnectPayment).not.toHaveBeenCalled();
    });

    // G1 (fixed 2026-09-23): only the customer's open page used to reconcile, so a customer who
    // paid and closed the page, on a payment whose webhook was lost, stayed PENDING until someone
    // polled. POST /api/pagamentos/mp/reconcile (cron) now sweeps old PENDING/PROCESSING payments.
    it('recovers with NO page open (server-side sweep of old PENDING payments) (G1)', async () => {
      await age(10 * 60_000);
      getConnectPayment.mockResolvedValue(mp());

      const summary = await sweepPendingPayments();

      expect(summary).toMatchObject({ examined: 1, resolved: 1 });
      const { payment: p, order: o } = await reload();
      expect(p.status).toBe('APPROVED');
      expect(o.paymentStatus).toBe('APPROVED');
    });

    it.todo('shows the operator an "em conferência" badge after 5 minutes of PENDING (no such state exists yet)');
    it.todo('lists "Pagamentos a conferir" with a "Conferir agora" button and an audited manual mark-as-paid');
  });

  describe('the webhook arrives late or repeated', () => {
    it('a late webhook after the page already healed the payment credits nothing twice', async () => {
      await age(31_000);
      getConnectPayment.mockResolvedValue(mp());
      await poll();
      const first = (await reload()).payment;

      const late = await syncRestaurantPayment(A.restaurantId, '777');

      expect(late).toMatchObject({ updated: false, reason: 'no-transition' });
      const second = (await reload()).payment;
      expect(second.processedAt.getTime()).toBe(first.processedAt.getTime());
      expect((await alerts()).filter((n) => n.title === 'Pedido pago duas vezes')).toHaveLength(0);
    });

    it('five notifications at the same instant approve the payment exactly once', async () => {
      getConnectPayment.mockResolvedValue(mp());

      const results = await Promise.all(Array.from({ length: 5 }, () => syncRestaurantPayment(A.restaurantId, '777')));

      expect(results.filter((r) => r.updated)).toHaveLength(1);
      const { payment: p, order: o } = await reload();
      expect(p.status).toBe('APPROVED');
      expect(o.paymentStatus).toBe('APPROVED');
      expect(await prisma.payment.count({ where: { orderId: order.id, status: 'APPROVED' } })).toBe(1);
    });

    it('an older "pending" notification arriving after "approved" cannot undo it', async () => {
      getConnectPayment.mockResolvedValueOnce(mp());
      await syncRestaurantPayment(A.restaurantId, '777');

      getConnectPayment.mockResolvedValueOnce(mp({ status: 'pending' }));
      const stale = await syncRestaurantPayment(A.restaurantId, '777');

      expect(stale.updated).toBe(false);
      expect((await reload()).payment.status).toBe('APPROVED');
    });
  });

  describe('the status stays in_process / pending for hours', () => {
    it('keeps the order UNPAID while in_process, then pays it when Mercado Pago finally approves', async () => {
      getConnectPayment.mockResolvedValueOnce(mp({ status: 'in_process', status_detail: 'pending_review_manual' }));
      const held = await syncRestaurantPayment(A.restaurantId, '777');
      expect(held).toMatchObject({ updated: true, status: 'PROCESSING' });
      let s = await reload();
      expect(s.payment.status).toBe('PROCESSING');
      expect(s.order.paymentStatus).toBe('PENDING');

      getConnectPayment.mockResolvedValueOnce(mp());
      await syncRestaurantPayment(A.restaurantId, '777');
      s = await reload();
      expect(s.payment.status).toBe('APPROVED');
      expect(s.order.paymentStatus).toBe('APPROVED');
    });

    it('a rejected attempt can still be paid afterwards (customer retries)', async () => {
      getConnectPayment.mockResolvedValueOnce(mp({ status: 'rejected', status_detail: 'cc_rejected_other_reason' }));
      await syncRestaurantPayment(A.restaurantId, '777');
      expect((await reload()).payment.status).toBe('DECLINED');

      getConnectPayment.mockResolvedValueOnce(mp());
      await syncRestaurantPayment(A.restaurantId, '777');
      expect((await reload()).order.paymentStatus).toBe('APPROVED');
    });

    it.todo('offers the customer a different payment method after 30 minutes and cancels the order after 2 hours');
  });

  describe('money arrives for a payment we already gave up on', () => {
    // G2 (fixed 2026-09-23): CANCELLED used to have no outgoing transition, so an approval that
    // reached a CANCELLED payment was dropped as "no-transition": the customer was charged, the
    // row said CANCELLED and nothing alerted the operator. Now the approval is recorded and a
    // critical alert asks the operator to honor or refund it (no automatic refund).
    it('a payment approved AFTER we cancelled it is recorded and raises ONE critical alert (G2)', async () => {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
      getConnectPayment.mockResolvedValue(mp());

      const first = await syncRestaurantPayment(A.restaurantId, '777');
      const repeat = await syncRestaurantPayment(A.restaurantId, '777');

      expect(first).toMatchObject({ updated: true, status: 'APPROVED' });
      expect(repeat).toMatchObject({ updated: false, reason: 'no-transition' });
      const { payment: p, order: o } = await reload();
      expect(p.status).toBe('APPROVED');
      expect(p.processedAt).not.toBeNull();
      expect(o.paymentStatus).toBe('APPROVED');
      const late = (await alerts()).filter((n) => n.title === 'Pagamento recebido após cancelamento');
      expect(late).toHaveLength(1);
      expect(late[0].severity).toBe('CRITICAL');
      expect(late[0].data).toMatchObject({ paymentId: payment.id, dedupeKey: `late-payment:${payment.id}` });
    });

    it('a late approval with the WRONG amount is still refused (amount guard unchanged)', async () => {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } });
      getConnectPayment.mockResolvedValue(mp({ transaction_amount: 10 }));

      const res = await syncRestaurantPayment(A.restaurantId, '777');

      expect(res).toMatchObject({ updated: false, reason: 'amount-mismatch' });
      expect((await reload()).payment.status).toBe('CANCELLED');
    });

    it('a normal approval of a PENDING payment raises no late-payment alert', async () => {
      getConnectPayment.mockResolvedValue(mp());
      await syncRestaurantPayment(A.restaurantId, '777');
      expect((await alerts()).filter((n) => n.title === 'Pagamento recebido após cancelamento')).toHaveLength(0);
    });

    it('two approved payments on the same order raise ONE critical "pago duas vezes" alert', async () => {
      getConnectPayment.mockResolvedValueOnce(mp());
      await syncRestaurantPayment(A.restaurantId, '777');
      const second = await prisma.payment.create({
        data: {
          restaurantId: A.restaurantId, orderId: order.id, amount: 50, method: 'PIX',
          gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING', gatewayPaymentId: '888',
        },
      });

      getConnectPayment.mockResolvedValue(mp({ id: 888, external_reference: second.id }));
      await syncRestaurantPayment(A.restaurantId, '888');
      await syncRestaurantPayment(A.restaurantId, '888');

      const doubles = (await alerts()).filter((n) => n.title === 'Pedido pago duas vezes');
      expect(doubles).toHaveLength(1);
      expect(doubles[0].severity).toBe('CRITICAL');
    });
  });

  describe('Mercado Pago times out after creating the charge', () => {
    // mp-pix-route.test.ts covers the request side (the row stays PENDING, R23). This is the
    // recovery side: the charge exists at Mercado Pago but we never stored its id.
    it('the sweep finds the orphan charge by our reference and records the payment', async () => {
      await prisma.payment.update({ where: { id: payment.id }, data: { gatewayPaymentId: null } });
      await age(10 * 60_000);
      searchConnectPaymentsByReference.mockResolvedValue([mp()]);
      getConnectPayment.mockResolvedValue(mp());

      const summary = await sweepPendingPayments();

      expect(summary).toMatchObject({ examined: 1, resolved: 1 });
      const { payment: p, order: o } = await reload();
      expect(p.status).toBe('APPROVED');
      expect(p.gatewayPaymentId).toBe('777');
      expect(o.paymentStatus).toBe('APPROVED');
    });
  });
});
