// @ts-nocheck
/**
 * I12: PUT /api/pagamentos/[id] let any authenticated member of the restaurant
 * set an arbitrary status on any of its payments, including flipping a
 * MERCADO_PAGO_CONNECT payment to APPROVED or REFUNDED by hand. Those rows are
 * driven by the signed webhook and the refund route, which check the gateway
 * status, the amount and the allowed transitions.
 *
 * Written, NOT run (ruling R2: no DATABASE_URL in this worktree).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { PUT, GET } from '../../../app/api/pagamentos/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('PUT /api/pagamentos/[id]', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
  });

  const put = (id: string, body: any) =>
    PUT(
      new Request(`https://gastrux.test/api/pagamentos/${id}`, { method: 'PUT', body: JSON.stringify(body) }) as any,
      { params: { id } }
    );

  const makePayment = (gateway: string, overrides = {}) =>
    prisma.payment.create({
      data: {
        restaurantId: A.restaurantId,
        amount: 100,
        method: 'PIX',
        gateway,
        status: 'PENDING',
        gatewayPaymentId: `mp-${crypto.randomBytes(4).toString('hex')}`,
        ...overrides,
      },
    });

  it('refuses to change the status of a MERCADO_PAGO_CONNECT payment', async () => {
    const payment = await makePayment('MERCADO_PAGO_CONNECT');

    const res = await put(payment.id, { status: 'APPROVED' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('O status deste pagamento é controlado pelo Mercado Pago');
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING');
  });

  it('refuses REFUNDED on a MERCADO_PAGO_CONNECT payment too', async () => {
    const payment = await makePayment('MERCADO_PAGO_CONNECT', { status: 'APPROVED' });

    const res = await put(payment.id, { status: 'REFUNDED', refundedAt: new Date().toISOString() });

    expect(res.status).toBe(409);
    const unchanged = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(unchanged.status).toBe('APPROVED');
    expect(unchanged.refundedAt).toBeNull();
  });

  it('still allows other fields on a Connect payment when no status is sent', async () => {
    const payment = await makePayment('MERCADO_PAGO_CONNECT', { status: 'APPROVED' });
    const when = new Date('2026-09-19T12:00:00.000Z');

    const res = await put(payment.id, { processedAt: when.toISOString() });

    expect(res.status).toBe(200);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated.status).toBe('APPROVED');
    expect(updated.processedAt.toISOString()).toBe(when.toISOString());
  });

  it('keeps the existing behavior for other gateways', async () => {
    const payment = await makePayment('MANUAL');

    const res = await put(payment.id, { status: 'APPROVED' });

    expect(res.status).toBe(200);
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it("404s for another restaurant's payment before looking at the gateway", async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: B.restaurantId, amount: 10, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' },
    });

    const res = await put(payment.id, { status: 'APPROVED' });

    expect(res.status).toBe(404);
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('PENDING');
  });

  it('GET stays tenant-scoped', async () => {
    const mine = await makePayment('MERCADO_PAGO_CONNECT');
    const res = await GET(new Request(`https://gastrux.test/api/pagamentos/${mine.id}`) as any, {
      params: { id: mine.id },
    });
    expect(res.status).toBe(200);
  });
});
