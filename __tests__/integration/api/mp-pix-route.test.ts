// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  getConnectPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
// The service under test writes through the app's own Prisma client, not this
// file's instance: spying on a local client would never be hit.
import { prisma as appPrisma } from '../../../lib/prisma';
import { createConnectPix, getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST as createPix } from '../../../app/api/pagamentos/mp/pix/route';
import { POST as createManualPix } from '../../../app/api/pagamentos/mp/pix/manual/route';
import { GET as pixStatus } from '../../../app/api/pagamentos/mp/pix/status/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

const MP_PIX_RESPONSE = {
  id: 4242,
  status: 'pending',
  date_of_expiration: '2026-09-19T10:30:00.000-03:00',
  point_of_interaction: { transaction_data: { qr_code: 'QR-CODE', qr_code_base64: 'QR-B64', ticket_url: 'https://ticket' } },
};

describe('public PIX routes', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const savedUrl = process.env.NEXTAUTH_URL;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    // OrderSessionItem (and OrderSessionItemModifier) cascade from the session;
    // the ItemModifier rows they point at must be deleted after them.
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.itemModifier.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
    process.env.NEXTAUTH_URL = savedUrl;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    createConnectPix.mockResolvedValue(MP_PIX_RESPONSE);
  });

  const makeOrder = (restaurantId: string, overrides = {}) =>
    prisma.order.create({
      data: { restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total: 57.9, paymentStatus: 'PENDING', ...overrides },
    });

  const post = (body: any) =>
    createPix(new Request('https://gastrux.test/api/pagamentos/mp/pix', { method: 'POST', body: JSON.stringify(body) }) as any);

  const status = (paymentId: string) =>
    pixStatus(new Request(`https://gastrux.test/api/pagamentos/mp/pix/status?paymentId=${paymentId}`) as any);

  describe('POST /pix (delivery order)', () => {
    it('requires orderId or qrToken', async () => {
      expect((await post({})).status).toBe(400);
    });

    it('404s for an unknown order', async () => {
      expect((await post({ orderId: 'does-not-exist' })).status).toBe(404);
    });

    it('answers 409 and creates nothing when the restaurant has no connection', async () => {
      const order = await makeOrder(A.restaurantId);

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(createConnectPix).not.toHaveBeenCalled();
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });

    it("never uses another restaurant's connection for this restaurant's order", async () => {
      await saveConnection(B.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(409);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it('computes the amount on the server, ignoring any amount sent by the browser', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);

      const res = await post({ orderId: order.id, amount: 1, payerEmail: 'cli@ex.com', payerName: 'Maria Souza' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ success: true, qrCode: 'QR-CODE', qrCodeBase64: 'QR-B64', ticketUrl: 'https://ticket', amount: 57.9 });

      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      expect(payment).toMatchObject({ restaurantId: A.restaurantId, orderId: order.id, gateway: 'MERCADO_PAGO_CONNECT', method: 'PIX', status: 'PENDING', gatewayPaymentId: '4242' });
      expect(Number(payment.amount)).toBe(57.9);
      expect(payment.platformFee).toBeNull();

      const call = createConnectPix.mock.calls[0];
      expect(call[1]).toMatchObject({ paymentId: body.paymentId, restaurantId: A.restaurantId, amount: 57.9, payer: { email: 'cli@ex.com', name: 'Maria Souza' } });
    });

    it('reuses the pending PIX for the same order instead of creating another', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);

      const first = await (await post({ orderId: order.id })).json();
      const second = await (await post({ orderId: order.id })).json();

      expect(second.paymentId).toBe(first.paymentId);
      expect(second.qrCode).toBe('QR-CODE');
      expect(createConnectPix).toHaveBeenCalledTimes(1);
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });

    it('refuses an order that is already paid or cancelled', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const paid = await makeOrder(A.restaurantId, { paymentStatus: 'APPROVED' });
      const cancelled = await makeOrder(A.restaurantId, { status: 'CANCELLED' });

      expect((await post({ orderId: paid.id })).status).toBe(409);
      expect((await post({ orderId: cancelled.id })).status).toBe(409);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it('cancels the pending payment and asks to reconnect when Mercado Pago answers 401', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);
      createConnectPix.mockRejectedValue({ status: 401, message: 'unauthorized' });

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(409);
      expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      expect(payment.status).toBe('CANCELLED');
    });

    it('returns 502 and cancels the payment on other Mercado Pago errors', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);
      createConnectPix.mockRejectedValue(new Error('MP down'));

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(502);
      expect((await getConnection(A.restaurantId)).status).toBe('ACTIVE');
      expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('CANCELLED');
    });

    it('keeps the payment PENDING and retries when the local write fails after Mercado Pago succeeded (I3)', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);
      const realUpdate = appPrisma.payment.update.bind(appPrisma.payment);
      const spy = jest
        .spyOn(appPrisma.payment, 'update')
        .mockImplementationOnce(() => Promise.reject(new Error('db write failed')))
        .mockImplementation((args: any) => realUpdate(args));

      try {
        const res = await post({ orderId: order.id });
        const body = await res.json();

        // The QR is valid and must reach the customer.
        expect(res.status).toBe(200);
        expect(body.qrCode).toBe('QR-CODE');

        const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
        // NEVER CANCELLED: a live Mercado Pago charge exists with this id as
        // external_reference and CANCELLED -> APPROVED is not a transition.
        expect(payment.status).toBe('PENDING');
        // The retry stored the Mercado Pago id and the QR.
        expect(payment.gatewayPaymentId).toBe('4242');
        expect(JSON.parse(payment.metadata).pix.qrCode).toBe('QR-CODE');
      } finally {
        spy.mockRestore();
      }
    });

    it('still returns the PIX and leaves the payment PENDING when both local writes fail', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);
      const spy = jest
        .spyOn(appPrisma.payment, 'update')
        .mockRejectedValue(new Error('db write failed'));

      try {
        const res = await post({ orderId: order.id });

        expect(res.status).toBe(200);
        expect((await res.json()).qrCode).toBe('QR-CODE');
      } finally {
        spy.mockRestore();
      }

      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      // The webhook (and the status reconciliation, which accepts a PIX with a
      // null gatewayPaymentId) can still approve it.
      expect(payment.status).toBe('PENDING');
      expect(payment.gatewayPaymentId).toBeNull();
    });
  });

  describe('POST /pix (table tab via qrToken)', () => {
    // items: [quantity, unitPrice, modifierAdjustments?]
    const makeTable = async (
      restaurantId: string,
      ownerId: string,
      items: Array<[number, number] | [number, number, number[]]>
    ) => {
      // Sections are unique per (restaurantId, name) and this helper runs in more
      // than one test without deleting sections, so the name gets a random suffix.
      const section = await prisma.tableSection.create({
        data: { restaurantId, name: `Salão ${crypto.randomBytes(4).toString('hex')}`, capacity: 20 },
      });
      const qrToken = `qr-${crypto.randomBytes(12).toString('hex')}`;
      const table = await prisma.table.create({ data: { restaurantId, number: 7, sectionId: section.id, capacity: 4, qrToken } });
      const recipe = await prisma.recipe.create({
        data: { code: `R-${crypto.randomBytes(3).toString('hex')}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', restaurantId },
      });
      const session = await prisma.orderSession.create({ data: { restaurantId, userId: ownerId, tableId: table.id, tableNumber: 7, status: 'OPEN' } });
      for (const [quantity, price, adjustments] of items) {
        const item = await prisma.orderSessionItem.create({
          data: { sessionId: session.id, recipeId: recipe.id, quantity, price },
        });
        for (const priceAdjustment of adjustments || []) {
          // The comanda stores the surcharge on the link row, copied from the
          // ItemModifier, exactly like the modifiers route does.
          const modifier = await prisma.itemModifier.create({
            data: { restaurantId, name: `Extra ${crypto.randomBytes(3).toString('hex')}`, priceAdjustment },
          });
          await prisma.orderSessionItemModifier.create({
            data: { sessionItemId: item.id, modifierId: modifier.id, priceAdjustment },
          });
        }
      }
      return { qrToken, table, session };
    };

    it("charges the sum of the open tab's items, computed on the server", async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken, session } = await makeTable(A.restaurantId, A.ownerId, [[2, 10.5], [1, 20]]);

      const res = await post({ qrToken, amount: 1 });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.amount).toBe(41);
      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      expect(payment.orderId).toBeNull();
      expect(payment.restaurantId).toBe(A.restaurantId);
      expect(JSON.parse(payment.metadata)).toMatchObject({ source: 'table', sessionId: session.id, tableNumber: 7 });
      expect(createConnectPix.mock.calls[0][1].description).toBe('Mesa 7');
    });

    it("adds the paid modifiers of each line to the tab's amount (I1)", async () => {
      await saveConnection(A.restaurantId, TOKENS);
      // Line 1: 2 x 10.50 + (2.00 + 0.50) = 23.50  (the adjustments are added
      // once per line, not per unit - one OrderSessionItemModifier row exists
      // per (sessionItem, modifier) whatever the quantity).
      // Line 2: 1 x 20.00 + 1.25 = 21.25
      // Total: 44.75  (without modifiers it would have been 41.00)
      const { qrToken } = await makeTable(A.restaurantId, A.ownerId, [
        [2, 10.5, [2, 0.5]],
        [1, 20, [1.25]],
      ]);

      const res = await post({ qrToken });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.amount).toBe(44.75);
      expect(createConnectPix.mock.calls[0][1].amount).toBe(44.75);
      expect(Number((await prisma.payment.findUnique({ where: { id: body.paymentId } })).amount)).toBe(44.75);
    });

    it('sums in integer cents, so repeated cent prices do not drift', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken } = await makeTable(A.restaurantId, A.ownerId, [
        [1, 0.1],
        [1, 0.2],
        [1, 0.1, [0.1]],
      ]);

      const body = await (await post({ qrToken })).json();

      expect(body.amount).toBe(0.5);
    });

    it('reuses the pending PIX for the same tab and amount', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken } = await makeTable(A.restaurantId, A.ownerId, [[1, 30]]);

      const first = await (await post({ qrToken })).json();
      const second = await (await post({ qrToken })).json();

      expect(second.paymentId).toBe(first.paymentId);
      expect(second.qrCode).toBe('QR-CODE');
      expect(createConnectPix).toHaveBeenCalledTimes(1);
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });

    it('answers 409 PIX_IN_PROGRESS while another request is still creating the QR (I2/R19)', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken, session } = await makeTable(A.restaurantId, A.ownerId, [[1, 30]]);
      // A PENDING row for the same tab and amount that has NO stored PIX data
      // yet: exactly what a concurrent request leaves behind between the row
      // creation and the Mercado Pago answer.
      await prisma.payment.create({
        data: {
          restaurantId: A.restaurantId,
          amount: 30,
          method: 'PIX',
          gateway: 'MERCADO_PAGO_CONNECT',
          status: 'PENDING',
          metadata: JSON.stringify({ source: 'table', sessionId: session.id }),
        },
      });

      const res = await post({ qrToken });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('PIX_IN_PROGRESS');
      // No SECOND live charge was created for the same tab.
      expect(createConnectPix).not.toHaveBeenCalled();
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });

    it('treats a data-less PENDING row older than 2 minutes as abandoned and creates a new PIX', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken, session } = await makeTable(A.restaurantId, A.ownerId, [[1, 30]]);
      await prisma.payment.create({
        data: {
          restaurantId: A.restaurantId,
          amount: 30,
          method: 'PIX',
          gateway: 'MERCADO_PAGO_CONNECT',
          status: 'PENDING',
          metadata: JSON.stringify({ source: 'table', sessionId: session.id }),
          createdAt: new Date(Date.now() - 3 * 60 * 1000),
        },
      });

      const res = await post({ qrToken });

      expect(res.status).toBe(200);
      expect(createConnectPix).toHaveBeenCalledTimes(1);
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(2);
    });

    it('404s for an unknown table and 409s when there is no open tab', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      expect((await post({ qrToken: 'unknown-token-1234567890' })).status).toBe(404);

      const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `S2 ${crypto.randomBytes(4).toString('hex')}`, capacity: 4 } });
      const qrToken = `qr-${crypto.randomBytes(12).toString('hex')}`;
      await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 8, sectionId: section.id, capacity: 2, qrToken } });
      expect((await post({ qrToken })).status).toBe(409);
    });
  });

  describe('GET /pix/status', () => {
    const makePayment = (overrides = {}) =>
      prisma.payment.create({
        data: { restaurantId: A.restaurantId, amount: 50, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING', gatewayPaymentId: '4242', ...overrides },
      });

    it('requires a payment id and 404s for unknown or non-Connect payments', async () => {
      expect((await pixStatus(new Request('https://gastrux.test/api/pagamentos/mp/pix/status') as any)).status).toBe(400);
      expect((await status('nope')).status).toBe(404);
      const manual = await makePayment({ gateway: 'MANUAL' });
      expect((await status(manual.id)).status).toBe(404);
    });

    it('reads our database and never returns payer data', async () => {
      const payment = await makePayment({ status: 'APPROVED', customerEmail: 'secret@payer.com' });

      const res = await status(payment.id);
      const body = await res.json();

      expect(body).toEqual({ status: 'approved', approved: true });
      expect(JSON.stringify(body)).not.toContain('secret@payer.com');
      expect(getConnectPayment).not.toHaveBeenCalled();
    });

    it('does not call Mercado Pago for a young pending payment', async () => {
      const payment = await makePayment();
      expect(await (await status(payment.id)).json()).toEqual({ status: 'pending', approved: false });
      expect(getConnectPayment).not.toHaveBeenCalled();
    });

    it('reconciles an old pending payment with Mercado Pago when the webhook is late', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const payment = await makePayment({ createdAt: new Date(Date.now() - 2 * 60 * 1000) });
      getConnectPayment.mockResolvedValue({ id: 4242, status: 'approved', status_detail: 'accredited', external_reference: payment.id, transaction_amount: 50, fee_details: [] });

      const body = await (await status(payment.id)).json();

      expect(body).toEqual({ status: 'approved', approved: true });
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
    });
  });

  describe('POST /pix/manual (staff, no order)', () => {
    const asStaff = () =>
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'CASHIER' },
      });

    const manual = (body: any) =>
      createManualPix(
        new Request('https://gastrux.test/api/pagamentos/mp/pix/manual', { method: 'POST', body: JSON.stringify(body) }) as any
      );

    it('rejects unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect((await manual({ amount: 10 })).status).toBe(401);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it.each([[0], [-5], ['abc'], [null], [1e9]])('rejects the invalid amount %p', async (amount) => {
      asStaff();
      await saveConnection(A.restaurantId, TOKENS);

      expect((await manual({ amount })).status).toBe(400);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it('answers 409 when the restaurant has no connection', async () => {
      asStaff();

      const res = await manual({ amount: 10 });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it("creates the PIX for the session's own restaurant and ignores a restaurantId or orderId in the body", async () => {
      asStaff();
      await saveConnection(A.restaurantId, TOKENS);
      await saveConnection(B.restaurantId, TOKENS);

      const res = await manual({ amount: 12.34, description: 'Balcão', restaurantId: B.restaurantId, orderId: 'ignored' });
      const body = await res.json();

      expect(res.status).toBe(200);
      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      expect(payment).toMatchObject({ restaurantId: A.restaurantId, orderId: null, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' });
      expect(Number(payment.amount)).toBe(12.34);
      expect(JSON.parse(payment.metadata)).toMatchObject({ source: 'manual' });
      expect(createConnectPix.mock.calls[0][1]).toMatchObject({
        restaurantId: A.restaurantId,
        amount: 12.34,
        description: 'Balcão',
      });
    });

    it('creates a new PIX on every call, because there is no order or tab to reuse', async () => {
      asStaff();
      await saveConnection(A.restaurantId, TOKENS);

      const first = await (await manual({ amount: 10 })).json();
      const second = await (await manual({ amount: 10 })).json();

      expect(second.paymentId).not.toBe(first.paymentId);
      expect(createConnectPix).toHaveBeenCalledTimes(2);
    });
  });
});
