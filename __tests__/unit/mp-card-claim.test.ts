// @ts-nocheck
/**
 * claimCardPayment - the double-tap guard for the delivery card checkout, DB-free:
 *  - the per-order advisory lock is taken with $executeRaw (pg_advisory_xact_lock
 *    returns void, which Prisma cannot read through $queryRaw);
 *  - inside the lock a PENDING row is found WITH OR WITHOUT a stored link;
 *  - three outcomes: reuse (link stored on the MercadoPagoTransaction row),
 *    in-progress (no link yet, younger than the 2-minute window), created
 *    (nothing pending, or the pending one was abandoned).
 */

const tx = {
  $executeRaw: jest.fn().mockResolvedValue(1),
  $queryRaw: jest.fn(),
  payment: { findFirst: jest.fn(), create: jest.fn() },
};
const prismaMock = { $transaction: jest.fn(async (fn) => fn(tx)) };

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }));

import {
  claimCardPayment,
  cardLockKey,
  CARD_REUSE_WINDOW_MS,
  CARD_LINK_VALIDITY_MS,
} from '../../lib/mercadopago-connect/card-claim';
import { IN_PROGRESS_TIMEOUT_MS } from '../../lib/mercadopago-connect/pix-service';

const target = {
  restaurantId: 'rest-1',
  orderId: 'order-1',
  sessionId: null,
  amount: 57.9,
  description: 'Pedido T-1',
  metadata: { source: 'delivery', orderNumber: 'T-1' },
};
const payer = { email: 'a@b.co', name: 'Ana' };
const ago = (ms: number) => new Date(Date.now() - ms);

describe('claimCardPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx.payment.findFirst.mockResolvedValue(null);
    tx.payment.create.mockResolvedValue({ id: 'pay-new' });
  });

  it('locks per restaurant and order with $executeRaw (never $queryRaw) and passes a transaction timeout', async () => {
    await claimCardPayment(target, payer);

    expect(cardLockKey(target)).toBe('card:rest-1:order:order-1');
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw.mock.calls[0].slice(1)).toEqual(['card:rest-1:order:order-1']);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    const opts = prismaMock.$transaction.mock.calls[0][1];
    expect(opts).toMatchObject({ maxWait: 10_000, timeout: 10_000 });
  });

  it('takes the lock BEFORE looking for an existing row', async () => {
    const order: string[] = [];
    tx.$executeRaw.mockImplementationOnce(async () => {
      order.push('lock');
      return 1;
    });
    tx.payment.findFirst.mockImplementationOnce(async () => {
      order.push('find');
      return null;
    });

    await claimCardPayment(target, payer);

    expect(order).toEqual(['lock', 'find']);
  });

  it('matches a pending card row for this restaurant and order whether or not a link is stored', async () => {
    await claimCardPayment(target, payer);

    const { where } = tx.payment.findFirst.mock.calls[0][0];
    expect(where).toMatchObject({
      restaurantId: 'rest-1',
      orderId: 'order-1',
      gateway: 'MERCADO_PAGO_CONNECT',
      method: 'MERCADO_PAGO',
      status: 'PENDING',
      amount: 57.9,
    });
    // No condition on the link or on a gateway id: a row still being created must be seen.
    expect(where).not.toHaveProperty('gatewayPaymentId');
    expect(where).not.toHaveProperty('mercadoPagoData');
    expect(where).not.toHaveProperty('metadata');
    const windowStart = where.createdAt.gte.getTime();
    expect(Date.now() - windowStart).toBeGreaterThanOrEqual(CARD_REUSE_WINDOW_MS - 1000);
    expect(Date.now() - windowStart).toBeLessThanOrEqual(CARD_REUSE_WINDOW_MS + 1000);
  });

  it('keeps the reuse window safely shorter than the link validity', () => {
    expect(CARD_REUSE_WINDOW_MS).toBeLessThan(CARD_LINK_VALIDITY_MS);
  });

  it('reuses a pending row whose link is stored on the transaction row', async () => {
    tx.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      createdAt: ago(10 * 60_000),
      mercadoPagoData: { initPoint: 'https://mp/init' },
    });

    const claim = await claimCardPayment(target, payer);

    expect(claim).toMatchObject({ kind: 'reuse', payment: { id: 'pay-1' }, initPoint: 'https://mp/init' });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('answers in-progress for a row with no link yet that is younger than the in-progress window', async () => {
    tx.payment.findFirst.mockResolvedValue({
      id: 'pay-1',
      createdAt: ago(IN_PROGRESS_TIMEOUT_MS - 30_000),
      mercadoPagoData: null,
    });

    const claim = await claimCardPayment(target, payer);

    expect(claim).toEqual({ kind: 'in-progress' });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('treats a row with no link older than the in-progress window as abandoned and creates a new one', async () => {
    tx.payment.findFirst.mockResolvedValue({
      id: 'pay-old',
      createdAt: ago(IN_PROGRESS_TIMEOUT_MS + 30_000),
      mercadoPagoData: null,
    });

    const claim = await claimCardPayment(target, payer);

    expect(claim).toMatchObject({ kind: 'created', payment: { id: 'pay-new' } });
    expect(tx.payment.create).toHaveBeenCalledTimes(1);
  });

  it('creates a pending MERCADO_PAGO_CONNECT payment from the server-side target', async () => {
    const claim = await claimCardPayment(target, payer);

    expect(claim).toMatchObject({ kind: 'created', payment: { id: 'pay-new' } });
    const { data } = tx.payment.create.mock.calls[0][0];
    expect(data).toMatchObject({
      restaurantId: 'rest-1',
      orderId: 'order-1',
      amount: 57.9,
      currency: 'BRL',
      method: 'MERCADO_PAGO',
      gateway: 'MERCADO_PAGO_CONNECT',
      status: 'PENDING',
      customerEmail: 'a@b.co',
      customerName: 'Ana',
    });
    expect(data).not.toHaveProperty('platformFee');
    expect(JSON.parse(data.metadata)).toMatchObject({ source: 'delivery-card', orderNumber: 'T-1' });
  });
});
