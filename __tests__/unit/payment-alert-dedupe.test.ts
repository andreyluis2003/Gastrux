// @ts-nocheck
/**
 * createPaymentAlert with a dedupeKey: an alert already stored under the same
 * key (for the same restaurant) is not created again. DB-free.
 */
const prismaMock = { notification: { findFirst: jest.fn(), create: jest.fn() } };
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/payment-alerts-bus', () => ({ publishAlertEvent: jest.fn() }));

import { publishAlertEvent } from '@/lib/payment-alerts-bus';
import { createPaymentAlert } from '@/lib/payment-alert-service';

const INPUT = {
  alertType: 'failure' as const,
  title: 'Pedido pago duas vezes',
  message: 'msg',
  paymentId: 'pay-2',
  restaurantId: 'rest-1',
  dedupeKey: 'double-payment:pay-1:pay-2',
};

describe('createPaymentAlert dedupeKey', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.notification.create.mockResolvedValue({ id: 'n-1', createdAt: new Date() });
  });

  it('creates the alert the first time and stores the key', async () => {
    prismaMock.notification.findFirst.mockResolvedValue(null);
    const result = await createPaymentAlert(INPUT);
    expect(result).toEqual({ id: 'n-1' });
    expect(prismaMock.notification.findFirst.mock.calls[0][0].where).toEqual({
      restaurantId: 'rest-1',
      data: { path: ['dedupeKey'], equals: 'double-payment:pay-1:pay-2' },
    });
    expect(prismaMock.notification.create.mock.calls[0][0].data.data.dedupeKey).toBe('double-payment:pay-1:pay-2');
    expect(publishAlertEvent).toHaveBeenCalledTimes(1);
  });

  it('does NOT create or publish a second one for the same key', async () => {
    prismaMock.notification.findFirst.mockResolvedValue({ id: 'n-0' });
    const result = await createPaymentAlert(INPUT);
    expect(result).toEqual({ id: 'n-0', duplicate: true });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
    expect(publishAlertEvent).not.toHaveBeenCalled();
  });

  it('an alert without a key behaves as before (no lookup, no key stored)', async () => {
    const { dedupeKey, ...plain } = INPUT;
    await createPaymentAlert(plain);
    expect(prismaMock.notification.findFirst).not.toHaveBeenCalled();
    expect('dedupeKey' in prismaMock.notification.create.mock.calls[0][0].data.data).toBe(false);
  });

  it('never throws: a failing store yields null', async () => {
    prismaMock.notification.findFirst.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(createPaymentAlert(INPUT)).resolves.toBeNull();
    spy.mockRestore();
  });
});
