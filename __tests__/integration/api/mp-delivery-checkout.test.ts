// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
}));

import { createCheckoutPreference } from '../../../lib/mercado-pago';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST } from '../../../app/api/pagamentos/mp/delivery-checkout/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PREFERENCE = { id: 'pref-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

describe('POST /api/pagamentos/mp/delivery-checkout', () => {
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
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
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
  });

  const makeOrder = (overrides = {}) =>
    prisma.order.create({
      data: {
        restaurantId: A.restaurantId,
        orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`,
        total: 57.9,
        paymentStatus: 'PENDING',
        paymentMethod: 'ONLINE_CARD',
        ...overrides,
      },
    });

  const post = (payload: any) =>
    POST(new Request('https://gastrux.test/api/pagamentos/mp/delivery-checkout', { method: 'POST', body: JSON.stringify(payload) }) as any);

  it('requires an order id and 404s for an unknown order', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ orderId: 'nope' })).status).toBe(404);
  });

  it('refuses an order that was not created with online card, or is already paid', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const cash = await makeOrder({ paymentMethod: 'CASH' });
    const paid = await makeOrder({ paymentStatus: 'APPROVED' });

    expect((await post({ orderId: cash.id })).status).toBe(409);
    expect((await post({ orderId: paid.id })).status).toBe(409);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it("answers 409 and creates nothing without a usable connection, and never uses another restaurant's", async () => {
    const order = await makeOrder();
    expect((await post({ orderId: order.id })).status).toBe(409);

    await saveConnection(B.restaurantId, TOKENS);
    const res = await post({ orderId: order.id });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("creates the payment and the preference with the restaurant's own token and a server-computed amount", async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();

    const res = await post({ orderId: order.id, amount: 1, payerEmail: 'cli@ex.com', payerName: 'Maria Souza' });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, paymentId: expect.any(String), initPoint: 'https://mp/init' });

    const payment = await prisma.payment.findUnique({ where: { id: json.paymentId } });
    expect(payment).toMatchObject({ restaurantId: A.restaurantId, orderId: order.id, gateway: 'MERCADO_PAGO_CONNECT', method: 'MERCADO_PAGO', status: 'PENDING' });
    expect(Number(payment.amount)).toBe(57.9);
    expect(payment.platformFee).toBeNull();

    const [input, client] = createCheckoutPreference.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(input.items[0].unitPrice).toBe(57.9);
    expect(input.externalReference).toBe(payment.id);
    expect(input.notificationUrl).toBe(`https://gastrux.test/api/pagamentos/mp/webhook?rid=${A.restaurantId}`);
    expect(input.excludedPaymentTypes).toEqual(['ticket', 'atm']);
    expect(input.backUrls.success).toContain(`/delivery/${A.restaurantId}?payment=${payment.id}&n=${encodeURIComponent(order.orderNumber)}&result=success`);
    expect(input.payer).toMatchObject({ email: 'cli@ex.com', name: 'Maria Souza' });

    const tx = await prisma.mercadoPagoTransaction.findFirst({ where: { paymentId: payment.id } });
    expect(tx.preferenceId).toBe('pref-1');
  });

  it('reuses the pending checkout for the same order instead of creating another', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();

    const first = await (await post({ orderId: order.id })).json();
    const second = await (await post({ orderId: order.id })).json();

    expect(second).toEqual(first);
    expect(createCheckoutPreference).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('cancels the payment and asks to reconnect when Mercado Pago answers 401', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();
    createCheckoutPreference.mockRejectedValue({ status: 401, message: 'unauthorized' });

    const res = await post({ orderId: order.id });

    expect(res.status).toBe(409);
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
    expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('CANCELLED');
  });

  it('returns 502 and cancels the payment when Mercado Pago definitely rejects the request (4xx)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();
    createCheckoutPreference.mockRejectedValue({ status: 400, message: 'invalid preference' });

    const res = await post({ orderId: order.id });

    expect(res.status).toBe(502);
    expect((await getConnection(A.restaurantId)).status).toBe('ACTIVE');
    expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('CANCELLED');
  });

  it('returns 502 but keeps the payment PENDING when the outcome is ambiguous (timeout or 5xx)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();

    // A timeout or socket error carries no HTTP status; a 5xx carries one >= 500.
    for (const failure of [new Error('MP down'), { status: 503, message: 'unavailable' }]) {
      createCheckoutPreference.mockRejectedValueOnce(failure);
      const res = await post({ orderId: order.id });
      expect(res.status).toBe(502);
    }

    // The preference may exist at Mercado Pago: no row may be CANCELLED, or a
    // real payment could never be recorded by the webhook.
    const rows = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.status === 'PENDING')).toBe(true);
    expect((await getConnection(A.restaurantId)).status).toBe('ACTIVE');
  });
});
