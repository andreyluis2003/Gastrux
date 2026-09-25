// @ts-nocheck
/**
 * Status route reconciliation (DB-free): the pure decision, the return-URL
 * helpers and the route wiring with prisma and the sync mocked.
 */
const prismaMock = { payment: { findFirst: jest.fn(), findUnique: jest.fn() } };
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('@/lib/mercadopago-connect/payment-sync', () => ({ syncRestaurantPayment: jest.fn() }));

import { syncRestaurantPayment } from '@/lib/mercadopago-connect/payment-sync';
import { parseMpPaymentId, reconcileTarget, RECONCILE_AFTER_MS } from '@/lib/mercadopago-connect/status-reconcile';
import { readPaymentReturnParams, statusPollUrl } from '@/lib/delivery-payments/return-params';
import { GET } from '../../app/api/pagamentos/mp/pix/status/route';

const OLD = new Date(Date.now() - RECONCILE_AFTER_MS - 5000);
const row = (over: any = {}) => ({
  id: 'pay-1',
  status: 'PENDING',
  restaurantId: 'rest-1',
  gatewayPaymentId: null,
  createdAt: OLD,
  ...over,
});
const get = (qs: string) => GET(new Request(`https://gastrux.test/api/pagamentos/mp/pix/status?${qs}`) as any);

describe('parseMpPaymentId', () => {
  it('accepts digits only, up to 20 chars', () => {
    expect(parseMpPaymentId('1234567890')).toBe('1234567890');
    expect(parseMpPaymentId('1'.repeat(20))).toBe('1'.repeat(20));
  });
  it.each(['', 'abc', '12 34', '12a', '-1', '1.5', '1'.repeat(21), '../../x', '12\n', 'null', null, undefined])(
    'ignores a malformed id (%p)',
    (raw) => expect(parseMpPaymentId(raw as any)).toBeNull()
  );
});

describe('reconcileTarget', () => {
  it('no id from the return URL and no recorded id: nothing to ask (unchanged behaviour)', () => {
    expect(reconcileTarget(row(), null)).toBeNull();
  });
  it('the id recorded on our row wins over the one from the URL', () => {
    expect(reconcileTarget(row({ gatewayPaymentId: '111' }), '222')).toBe('111');
    expect(reconcileTarget(row({ gatewayPaymentId: '111' }), null)).toBe('111');
  });
  it('PENDING and PROCESSING with no recorded id use the id from the return URL', () => {
    expect(reconcileTarget(row(), '222')).toBe('222');
    expect(reconcileTarget(row({ status: 'PROCESSING' }), '222')).toBe('222');
    expect(reconcileTarget(row({ status: 'PROCESSING', gatewayPaymentId: '111' }), null)).toBe('111');
  });
  it('does not ask before the webhook had time to arrive', () => {
    expect(reconcileTarget(row({ createdAt: new Date() }), '222')).toBeNull();
  });
  it.each(['APPROVED', 'DECLINED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK', 'SETTLED'])(
    'never asks for a %s row',
    (status) => {
      expect(reconcileTarget(row({ status }), '222')).toBeNull();
      expect(reconcileTarget(row({ status, gatewayPaymentId: '111' }), '222')).toBeNull();
    }
  );
  it('never asks for a row without a restaurant', () => {
    expect(reconcileTarget(row({ restaurantId: null }), '222')).toBeNull();
  });
});

describe('return URL helpers', () => {
  it('reads payment_id, falls back to collection_id, ignores non-numeric ids', () => {
    expect(readPaymentReturnParams('?payment=p1&n=T-1&payment_id=123&collection_id=456')).toEqual({
      paymentId: 'p1',
      orderNumber: 'T-1',
      mpPaymentId: '123',
    });
    expect(readPaymentReturnParams('?payment=p1&n=T-1&collection_id=456')?.mpPaymentId).toBe('456');
    expect(readPaymentReturnParams('?payment=p1&n=T-1&payment_id=null')?.mpPaymentId).toBeNull();
    expect(readPaymentReturnParams('?payment=p1&n=T-1')?.mpPaymentId).toBeNull();
  });
  it('is not a return without our payment id and the order number, and reads no status from the URL', () => {
    expect(readPaymentReturnParams('?payment=p1')).toBeNull();
    expect(readPaymentReturnParams('?n=T-1&payment_id=1')).toBeNull();
    expect(
      Object.keys(readPaymentReturnParams('?payment=p1&n=T-1&status=approved&collection_status=approved')!)
    ).toEqual(['paymentId', 'orderNumber', 'mpPaymentId']);
  });
  it('appends mpPaymentId to the poll only when there is one', () => {
    expect(statusPollUrl('p 1', null)).toBe('/api/pagamentos/mp/pix/status?paymentId=p%201');
    expect(statusPollUrl('p1', '123')).toBe('/api/pagamentos/mp/pix/status?paymentId=p1&mpPaymentId=123');
  });
});

describe('GET /api/pagamentos/mp/pix/status', () => {
  let errSpy: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (syncRestaurantPayment as jest.Mock).mockResolvedValue({ updated: true });
  });
  afterEach(() => errSpy.mockRestore());

  it('card with no recorded MP id, old enough, valid mpPaymentId: syncs once with the ROW restaurant and answers from our row', async () => {
    prismaMock.payment.findFirst.mockResolvedValue(row());
    prismaMock.payment.findUnique.mockResolvedValue(row({ status: 'APPROVED' }));
    const res = await get('paymentId=pay-1&mpPaymentId=98765&restaurantId=evil-rest');
    expect(syncRestaurantPayment).toHaveBeenCalledTimes(1);
    expect(syncRestaurantPayment).toHaveBeenCalledWith('rest-1', '98765');
    expect(await res.json()).toEqual({ status: 'approved', approved: true });
  });

  it('no mpPaymentId: unchanged, no sync', async () => {
    prismaMock.payment.findFirst.mockResolvedValue(row());
    const res = await get('paymentId=pay-1');
    expect(syncRestaurantPayment).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ status: 'pending', approved: false });
  });

  it('malformed mpPaymentId is ignored', async () => {
    prismaMock.payment.findFirst.mockResolvedValue(row());
    await get('paymentId=pay-1&mpPaymentId=12abc');
    await get('paymentId=pay-1&mpPaymentId=' + '9'.repeat(30));
    expect(syncRestaurantPayment).not.toHaveBeenCalled();
  });

  it('a PROCESSING row is reconciled with its recorded id (in_process no longer stuck)', async () => {
    prismaMock.payment.findFirst.mockResolvedValue(row({ status: 'PROCESSING', gatewayPaymentId: '111' }));
    prismaMock.payment.findUnique.mockResolvedValue(row({ status: 'PROCESSING', gatewayPaymentId: '111' }));
    await get('paymentId=pay-1');
    expect(syncRestaurantPayment).toHaveBeenCalledWith('rest-1', '111');
  });

  it('an already approved or terminal row never syncs', async () => {
    for (const status of ['APPROVED', 'DECLINED', 'REFUNDED']) {
      prismaMock.payment.findFirst.mockResolvedValue(row({ status }));
      await get('paymentId=pay-1&mpPaymentId=98765');
    }
    expect(syncRestaurantPayment).not.toHaveBeenCalled();
  });

  it('a failing sync is swallowed and the answer still comes from our row', async () => {
    prismaMock.payment.findFirst.mockResolvedValue(row());
    (syncRestaurantPayment as jest.Mock).mockRejectedValue(new Error('MP down'));
    const res = await get('paymentId=pay-1&mpPaymentId=98765');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'pending', approved: false });
  });
});
