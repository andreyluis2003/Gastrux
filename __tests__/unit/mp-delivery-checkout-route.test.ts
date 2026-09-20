// @ts-nocheck
/**
 * POST /api/pagamentos/mp/delivery-checkout - the route decisions that hold
 * without a database (prisma, the connection service, the target resolver, the
 * claim and the Mercado Pago call are all mocked).
 */

const prismaMock = {
  order: { findUnique: jest.fn() },
  payment: { update: jest.fn() },
  mercadoPagoTransaction: { create: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/mercado-pago', () => ({ createCheckoutPreference: jest.fn() }));
jest.mock('@/lib/mercadopago-connect/connection-service', () => ({
  getMpClientForRestaurant: jest.fn(),
  markNeedsReconnect: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/lib/mercadopago-connect/pix-target', () => ({ resolvePixTarget: jest.fn() }));
jest.mock('@/lib/mercadopago-connect/card-claim', () => ({
  ...jest.requireActual('@/lib/mercadopago-connect/card-claim'),
  claimCardPayment: jest.fn(),
}));

import { createCheckoutPreference } from '@/lib/mercado-pago';
import { getMpClientForRestaurant, markNeedsReconnect } from '@/lib/mercadopago-connect/connection-service';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { claimCardPayment } from '@/lib/mercadopago-connect/card-claim';
import { POST } from '../../app/api/pagamentos/mp/delivery-checkout/route';

const TARGET = {
  restaurantId: 'rest-1',
  orderId: 'order-1',
  sessionId: null,
  amount: 57.9,
  description: 'Pedido T-1',
  metadata: { source: 'delivery', orderNumber: 'T-1' },
};
const PREFERENCE = { id: 'pref-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

const post = (payload: any) =>
  POST(new Request('https://gastrux.test/api/pagamentos/mp/delivery-checkout', { method: 'POST', body: JSON.stringify(payload) }) as any);

describe('delivery-checkout route', () => {
  const savedUrl = process.env.NEXTAUTH_URL;
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    (resolvePixTarget as jest.Mock).mockResolvedValue({ ok: true, target: TARGET });
    prismaMock.order.findUnique.mockResolvedValue({ orderNumber: 'T-1', paymentMethod: 'ONLINE_CARD' });
    (getMpClientForRestaurant as jest.Mock).mockResolvedValue({ accessToken: 'APP_USR-a' });
    (claimCardPayment as jest.Mock).mockResolvedValue({ kind: 'created', payment: { id: 'pay-1' } });
    (createCheckoutPreference as jest.Mock).mockResolvedValue(PREFERENCE);
    prismaMock.payment.update.mockResolvedValue({});
    prismaMock.mercadoPagoTransaction.create.mockResolvedValue({});
  });

  afterEach(() => {
    errSpy.mockRestore();
    if (savedUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = savedUrl;
  });

  it('creates the checkout with the restaurant client, a server amount, and a link that expires', async () => {
    const res = await post({ orderId: 'order-1', amount: 1 });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, paymentId: 'pay-1', initPoint: 'https://mp/init' });
    const [input, client] = (createCheckoutPreference as jest.Mock).mock.calls[0];
    expect(client).toEqual({ accessToken: 'APP_USR-a' });
    expect(input.items[0].unitPrice).toBe(57.9);
    expect(input.externalReference).toBe('pay-1');
    expect(input.expires).toBe(true);
    expect(new Date(input.expirationDateTo).getTime()).toBeGreaterThan(new Date(input.expirationDateFrom).getTime());
  });

  it('answers 409 CHECKOUT_IN_PROGRESS and calls Mercado Pago nowhere when a checkout is being created', async () => {
    (claimCardPayment as jest.Mock).mockResolvedValue({ kind: 'in-progress' });

    const res = await post({ orderId: 'order-1' });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.code).toBe('CHECKOUT_IN_PROGRESS');
    expect(typeof json.error).toBe('string');
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(prismaMock.mercadoPagoTransaction.create).not.toHaveBeenCalled();
  });

  it('returns the SAME payment and link for a reusable checkout without creating a preference', async () => {
    (claimCardPayment as jest.Mock).mockResolvedValue({ kind: 'reuse', payment: { id: 'pay-1' }, initPoint: 'https://mp/init' });

    const res = await post({ orderId: 'order-1' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, paymentId: 'pay-1', initPoint: 'https://mp/init' });
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it('refuses before claiming anything: not an online-card order, or no usable connection', async () => {
    prismaMock.order.findUnique.mockResolvedValue({ orderNumber: 'T-1', paymentMethod: 'CASH' });
    expect((await post({ orderId: 'order-1' })).status).toBe(409);

    prismaMock.order.findUnique.mockResolvedValue({ orderNumber: 'T-1', paymentMethod: 'ONLINE_CARD' });
    (getMpClientForRestaurant as jest.Mock).mockResolvedValue(null);
    const res = await post({ orderId: 'order-1' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');

    expect(claimCardPayment).not.toHaveBeenCalled();
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not a URL', 'gastrux.test'],
    ['not http(s)', 'ftp://gastrux.test'],
  ])('answers 500 and creates nothing when NEXTAUTH_URL is %s', async (_label, value) => {
    if (value === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = value;

    const res = await post({ orderId: 'order-1' });

    expect(res.status).toBe(500);
    expect(typeof (await res.json()).error).toBe('string');
    expect(errSpy).toHaveBeenCalled();
    expect(claimCardPayment).not.toHaveBeenCalled();
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it('cancels only on a definite rejection; a 401 also asks to reconnect', async () => {
    (createCheckoutPreference as jest.Mock).mockRejectedValue({ status: 401 });
    const res = await post({ orderId: 'order-1' });

    expect(res.status).toBe(409);
    expect(markNeedsReconnect).toHaveBeenCalledWith('rest-1', expect.any(String));
    expect(prismaMock.payment.update).toHaveBeenCalledWith({ where: { id: 'pay-1' }, data: { status: 'CANCELLED' } });
  });

  it.each([
    ['a timeout (no status)', new Error('timeout')],
    ['a 503', { status: 503 }],
  ])('keeps the payment PENDING on %s (the preference may exist)', async (_label, error) => {
    (createCheckoutPreference as jest.Mock).mockRejectedValue(error);

    const res = await post({ orderId: 'order-1' });

    expect(res.status).toBe(502);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });

  it('still returns the link when storing the transaction row fails after Mercado Pago accepted', async () => {
    prismaMock.mercadoPagoTransaction.create.mockRejectedValue(new Error('db down'));

    const res = await post({ orderId: 'order-1' });

    expect(res.status).toBe(200);
    expect(prismaMock.payment.update).not.toHaveBeenCalled();
  });
});
