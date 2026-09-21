// @ts-nocheck
/**
 * POST /api/pagamentos/mp/pix must only settle an order that was created for
 * PIX (or has no recorded method), and must refuse the rest BEFORE any write.
 * DB-free: prisma is mocked for the resolver tests; the route tests mock the
 * resolver and the PIX service (the only thing that writes).
 */
const prismaMock = {
  order: { findUnique: jest.fn() },
  table: { findUnique: jest.fn() },
  orderSession: { findFirst: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/mercadopago-connect/pix-service', () => ({
  createPixForTarget: jest.fn(),
  normalizePayer: jest.fn(() => ({ email: null, name: null })),
}));

import { createPixForTarget } from '@/lib/mercadopago-connect/pix-service';
import { orderAcceptsPix, PIX_NOT_FOR_THIS_ORDER, resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { POST } from '../../app/api/pagamentos/mp/pix/route';

const orderRow = (paymentMethod: any) => ({
  id: 'order-1',
  restaurantId: 'rest-1',
  orderNumber: 'T-1',
  total: 57.9,
  status: 'PENDING',
  paymentStatus: 'PENDING',
  paymentMethod,
});
const post = (body: any) =>
  POST(new Request('https://gastrux.test/api/pagamentos/mp/pix', { method: 'POST', body: JSON.stringify(body) }) as any);

describe('orderAcceptsPix', () => {
  it.each([
    ['ONLINE_PIX', true],
    [null, true],
    [undefined, true],
    ['CASH', false],
    ['ONLINE_CARD', false],
    ['CREDIT_ON_DELIVERY', false],
    ['DEBIT_ON_DELIVERY', false],
    ['VOUCHER_ON_DELIVERY', false],
  ])('%p -> %p', (method, expected) => {
    expect(orderAcceptsPix(method as any)).toBe(expected);
  });
});

describe('resolvePixTarget carries the order payment method', () => {
  beforeEach(() => jest.clearAllMocks());

  it('an order target reports how the order was created', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow('CASH'));
    const r: any = await resolvePixTarget({ orderId: 'order-1' });
    expect(r.ok).toBe(true);
    expect(r.target.orderPaymentMethod).toBe('CASH');
    expect(prismaMock.order.findUnique.mock.calls[0][0].select.paymentMethod).toBe(true);
  });

  it('a legacy order (null method) reports null', async () => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow(null));
    const r: any = await resolvePixTarget({ orderId: 'order-1' });
    expect(r.target.orderPaymentMethod).toBeNull();
  });
});

describe('POST /api/pagamentos/mp/pix', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (createPixForTarget as jest.Mock).mockResolvedValue({ ok: true, pix: { paymentId: 'pay-1', qrCode: 'qr' } });
  });
  afterEach(() => errSpy.mockRestore());

  it.each(['ONLINE_PIX', null])('an order created with %p gets its PIX', async (method) => {
    prismaMock.order.findUnique.mockResolvedValue(orderRow(method));
    const res = await post({ orderId: 'order-1' });
    expect(res.status).toBe(200);
    expect(createPixForTarget).toHaveBeenCalledTimes(1);
  });

  it.each(['CASH', 'ONLINE_CARD', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY'])(
    'an order created with %s is refused with 409 and nothing is written',
    async (method) => {
      prismaMock.order.findUnique.mockResolvedValue(orderRow(method));
      const res = await post({ orderId: 'order-1' });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe(PIX_NOT_FOR_THIS_ORDER);
      expect(body.error).toMatch(/PIX/);
      expect(createPixForTarget).not.toHaveBeenCalled();
    }
  );

  it('the QR table flow (qrToken) is unaffected', async () => {
    prismaMock.table.findUnique.mockResolvedValue({ id: 't1', number: 4, restaurantId: 'rest-1' });
    prismaMock.orderSession.findFirst.mockResolvedValue({
      id: 's1',
      items: [{ price: 10, quantity: 2, modifiers: [] }],
    });
    const res = await post({ qrToken: 'qr-abc' });
    expect(res.status).toBe(200);
    expect(createPixForTarget).toHaveBeenCalledTimes(1);
    expect((createPixForTarget as jest.Mock).mock.calls[0][0].orderId).toBeNull();
  });
});
