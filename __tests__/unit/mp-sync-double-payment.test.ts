// @ts-nocheck
/**
 * A second APPROVED payment for an order that is already paid must be reported
 * (Sentry + operator alert), once per pair, without ever breaking the sync.
 * DB-free: prisma, the connection service, the Mercado Pago fetch, Sentry and
 * the alert service are mocked.
 */
const prismaMock = {
  payment: { findFirst: jest.fn(), updateMany: jest.fn() },
  order: { updateMany: jest.fn() },
  mercadoPagoTransaction: { updateMany: jest.fn() },
};
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/mercado-pago', () => ({
  mapMPStatusToPaymentStatus: (s: string) => ({ approved: 'APPROVED', pending: 'PENDING', rejected: 'DECLINED', refunded: 'REFUNDED' }[s] ?? 'PENDING'),
}));
jest.mock('@/lib/mercadopago-connect/connection-service', () => ({
  getMpClientForRestaurant: jest.fn(),
  markNeedsReconnect: jest.fn(),
}));
jest.mock('@/lib/mercadopago-connect/payments', () => ({
  getConnectPayment: jest.fn(),
  isUnauthorizedError: jest.fn(() => false),
}));
jest.mock('@/lib/sentry', () => ({ captureException: jest.fn() }));
jest.mock('@/lib/payment-alert-service', () => ({ createPaymentAlert: jest.fn() }));

import { captureException } from '@/lib/sentry';
import { createPaymentAlert } from '@/lib/payment-alert-service';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { getConnectPayment } from '@/lib/mercadopago-connect/payments';
import { syncRestaurantPayment } from '@/lib/mercadopago-connect/payment-sync';

const PAYMENT = (over: any = {}) => ({
  id: 'pay-2',
  restaurantId: 'rest-1',
  orderId: 'order-1',
  gateway: 'MERCADO_PAGO_CONNECT',
  method: 'CARD',
  gatewayPaymentId: null,
  status: 'PENDING',
  amount: 50,
  metadata: null,
  ...over,
});
const MP = { id: 999, external_reference: 'pay-2', status: 'approved', status_detail: 'accredited', transaction_amount: 50, fee_details: [] };

describe('double payment on an already paid order', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getMpClientForRestaurant as jest.Mock).mockResolvedValue({});
    (getConnectPayment as jest.Mock).mockResolvedValue(MP);
    prismaMock.payment.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.mercadoPagoTransaction.updateMany.mockResolvedValue({ count: 1 });
    (createPaymentAlert as jest.Mock).mockResolvedValue({ id: 'alert-1' });
    // findFirst serves both the tenant lookup and the "other approved payment" lookup
    prismaMock.payment.findFirst.mockImplementation(async (args: any) =>
      args.where.status === 'APPROVED' ? { id: 'pay-1' } : PAYMENT()
    );
  });
  afterEach(() => errSpy.mockRestore());

  it('a normal approval (the order moves to APPROVED) raises nothing', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 1 });
    const result = await syncRestaurantPayment('rest-1', '999');
    expect(result).toEqual({ updated: true, status: 'APPROVED' });
    expect(createPaymentAlert).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('the order was already paid and ANOTHER payment is approved: alert + Sentry, ids only, approval kept', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const result = await syncRestaurantPayment('rest-1', '999');

    expect(result).toEqual({ updated: true, status: 'APPROVED' });
    // the other-payment lookup is scoped to this order and restaurant and excludes this payment
    const lookup = prismaMock.payment.findFirst.mock.calls.map((c) => c[0]).find((a) => a.where.status === 'APPROVED');
    expect(lookup.where).toEqual({ orderId: 'order-1', restaurantId: 'rest-1', status: 'APPROVED', id: { not: 'pay-2' } });

    expect(createPaymentAlert).toHaveBeenCalledTimes(1);
    const alert = (createPaymentAlert as jest.Mock).mock.calls[0][0];
    expect(alert.restaurantId).toBe('rest-1');
    expect(alert.dedupeKey).toBe('double-payment:pay-1:pay-2'); // sorted pair
    expect(alert.title).toMatch(/duas vezes/);

    expect(captureException).toHaveBeenCalledTimes(1);
    const [error, context] = (captureException as jest.Mock).mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(context).toMatchObject({ restaurantId: 'rest-1', orderId: 'order-1', paymentIds: ['pay-1', 'pay-2'] });
    expect(JSON.stringify(context)).not.toMatch(/@|email|nome|name/i);

    // the linked writes after the report still ran
    expect(prismaMock.mercadoPagoTransaction.updateMany).toHaveBeenCalledTimes(1);
  });

  it('the dedupe key is the same whichever payment of the pair is processed second', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.payment.findFirst.mockImplementation(async (args: any) =>
      args.where.status === 'APPROVED' ? { id: 'pay-0' } : PAYMENT()
    );
    await syncRestaurantPayment('rest-1', '999');
    expect((createPaymentAlert as jest.Mock).mock.calls[0][0].dedupeKey).toBe('double-payment:pay-0:pay-2');
  });

  it('the order was already paid but by no other payment: nothing is reported', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.payment.findFirst.mockImplementation(async (args: any) => (args.where.status === 'APPROVED' ? null : PAYMENT()));
    await syncRestaurantPayment('rest-1', '999');
    expect(createPaymentAlert).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('a webhook retry (self-healing branch) reuses the key, and an existing alert is not reported to Sentry again', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.payment.findFirst.mockImplementation(async (args: any) =>
      args.where.status === 'APPROVED' ? { id: 'pay-1' } : PAYMENT({ status: 'APPROVED', gatewayPaymentId: '999' })
    );
    (createPaymentAlert as jest.Mock).mockResolvedValue({ id: 'alert-1', duplicate: true });

    const result = await syncRestaurantPayment('rest-1', '999');

    expect(result).toEqual({ updated: false, reason: 'no-transition' });
    expect(createPaymentAlert).toHaveBeenCalledTimes(1);
    expect((createPaymentAlert as jest.Mock).mock.calls[0][0].dedupeKey).toBe('double-payment:pay-1:pay-2');
    expect(captureException).not.toHaveBeenCalled();
  });

  it('never throws out of the sync when the report itself fails', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    (createPaymentAlert as jest.Mock).mockRejectedValue(new Error('alert store down'));
    await expect(syncRestaurantPayment('rest-1', '999')).resolves.toEqual({ updated: true, status: 'APPROVED' });

    prismaMock.payment.findFirst.mockImplementation(async (args: any) => {
      if (args.where.status === 'APPROVED') throw new Error('db blip');
      return PAYMENT();
    });
    await expect(syncRestaurantPayment('rest-1', '999')).resolves.toEqual({ updated: true, status: 'APPROVED' });
    expect(prismaMock.mercadoPagoTransaction.updateMany).toHaveBeenCalledTimes(2);
  });

  it('a refund (order moves off APPROVED) never runs the double payment check', async () => {
    (getConnectPayment as jest.Mock).mockResolvedValue({ ...MP, status: 'refunded' });
    prismaMock.payment.findFirst.mockImplementation(async () => PAYMENT({ status: 'APPROVED', gatewayPaymentId: '999' }));
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    await syncRestaurantPayment('rest-1', '999');
    expect(createPaymentAlert).not.toHaveBeenCalled();
  });
});
