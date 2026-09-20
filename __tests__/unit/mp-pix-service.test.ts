// @ts-nocheck
/**
 * createPixForTarget - the parts that must hold without a database:
 *  - the advisory lock is taken with $executeRaw (pg_advisory_xact_lock returns
 *    void, which Prisma cannot read through $queryRaw);
 *  - a Payment is cancelled ONLY when Mercado Pago definitely rejected the call
 *    (4xx). A timeout / socket error / 5xx may have created a live charge, and a
 *    CANCELLED row can no longer be approved, so it must stay PENDING.
 * DB-free: prisma, the connection service and the payments module are mocked.
 */

const tx = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  $queryRaw: jest.fn(),
  payment: { findFirst: jest.fn(), create: jest.fn() },
};

const prismaMock = {
  $transaction: jest.fn(async (fn) => fn(tx)),
  payment: { create: jest.fn(), update: jest.fn() },
};

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));
jest.mock('../../lib/mercadopago-connect/connection-service', () => ({
  getMpClientForRestaurant: jest.fn(),
  markNeedsReconnect: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/mercadopago-connect/payments', () => {
  const actual = jest.requireActual('../../lib/mercadopago-connect/payments');
  return { ...actual, createConnectPix: jest.fn() };
});

import { createPixForTarget } from '../../lib/mercadopago-connect/pix-service';
import { getMpClientForRestaurant, markNeedsReconnect } from '../../lib/mercadopago-connect/connection-service';
import { createConnectPix } from '../../lib/mercadopago-connect/payments';

const orderTarget = {
  restaurantId: 'rest-1',
  orderId: 'order-1',
  sessionId: null,
  amount: 42.5,
  description: 'Pedido #1',
  metadata: { orderId: 'order-1' },
};
const manualTarget = { ...orderTarget, orderId: null, metadata: {} };
const payer = { email: 'a@b.co', name: 'Ana' };

const PAYMENT = { id: 'pay-1', createdAt: new Date() };
const MP_OK = {
  id: 987,
  point_of_interaction: { transaction_data: { qr_code: 'qr', qr_code_base64: 'b64', ticket_url: 'url' } },
  date_of_expiration: '2026-09-20T12:30:00.000-03:00',
};

const statusWritten = () =>
  prismaMock.payment.update.mock.calls.map(([arg]) => arg?.data?.status).filter(Boolean);

describe('createPixForTarget', () => {
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getMpClientForRestaurant as jest.Mock).mockResolvedValue({});
    tx.payment.findFirst.mockResolvedValue(null);
    tx.payment.create.mockResolvedValue(PAYMENT);
    prismaMock.payment.create.mockResolvedValue(PAYMENT);
    prismaMock.payment.update.mockResolvedValue({});
  });

  afterEach(() => errSpy.mockRestore());

  it('serializes an order PIX with $executeRaw (never $queryRaw) and passes a transaction timeout', async () => {
    (createConnectPix as jest.Mock).mockResolvedValue(MP_OK);

    const res = await createPixForTarget(orderTarget, payer);

    expect(res.ok).toBe(true);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    const opts = prismaMock.$transaction.mock.calls[0][1];
    expect(opts.timeout).toBeGreaterThanOrEqual(10_000);
  });

  it('takes no lock and no transaction for a manual staff PIX', async () => {
    (createConnectPix as jest.Mock).mockResolvedValue(MP_OK);

    const res = await createPixForTarget(manualTarget, payer);

    expect(res.ok).toBe(true);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.payment.create).toHaveBeenCalledTimes(1);
  });

  it('cancels the row when Mercado Pago definitely rejects the call (400)', async () => {
    (createConnectPix as jest.Mock).mockRejectedValue(Object.assign(new Error('bad request'), { status: 400 }));

    const res = await createPixForTarget(orderTarget, payer);

    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(statusWritten()).toEqual(['CANCELLED']);
  });

  it('cancels the row and asks to reconnect on a 401', async () => {
    (createConnectPix as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));

    const res = await createPixForTarget(orderTarget, payer);

    expect(res).toMatchObject({ ok: false, status: 409, code: 'ONLINE_PAYMENT_UNAVAILABLE' });
    expect(markNeedsReconnect).toHaveBeenCalledWith('rest-1', expect.any(String));
    expect(statusWritten()).toEqual(['CANCELLED']);
  });

  it.each([
    ['a client-side timeout (no status)', new Error('timeout of 8000ms exceeded')],
    ['a socket error', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })],
    ['a 500', Object.assign(new Error('server error'), { status: 500 })],
    ['a 504', Object.assign(new Error('gateway timeout'), { status: 504 })],
  ])('does NOT cancel the row on %s: the charge may exist and must stay payable', async (_label, error) => {
    (createConnectPix as jest.Mock).mockRejectedValue(error);

    const res = await createPixForTarget(orderTarget, payer);

    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(statusWritten()).toEqual([]);
    expect(markNeedsReconnect).not.toHaveBeenCalled();
  });

  it('never cancels once Mercado Pago accepted, even if both local writes fail', async () => {
    (createConnectPix as jest.Mock).mockResolvedValue(MP_OK);
    prismaMock.payment.update.mockRejectedValue(new Error('db down'));

    const res = await createPixForTarget(orderTarget, payer);

    expect(res.ok).toBe(true);
    expect(statusWritten()).toEqual([]);
  });
});
