// @ts-nocheck
/**
 * Ruling R18: GET /api/pagamentos is tenant-scoped.
 *
 * A normal authenticated caller only ever sees its OWN current restaurant's
 * payments; the `restaurantId` query parameter is ignored for it. Only a
 * platform-admin identity (isPlatformAdminIdentity) keeps the cross-restaurant
 * filter. The same rule applies to the aggregated summary and to POST.
 *
 * Written, NOT run (ruling R2: no DATABASE_URL in this worktree).
 */
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { GET, POST } from '../../../app/api/pagamentos/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('GET /api/pagamentos tenant scoping', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let paymentA: any;
  let paymentB: any;
  const savedAdminEmails = process.env.PLATFORM_ADMIN_EMAILS;

  const asOwnerA = () =>
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });

  const asPlatformAdmin = () =>
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'ADMIN' },
    });

  const list = (query = '') =>
    GET(new Request(`https://gastrux.test/api/pagamentos${query}`) as any);

  beforeAll(async () => {
    delete process.env.PLATFORM_ADMIN_EMAILS;
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;

    paymentA = await prisma.payment.create({
      data: {
        restaurantId: A.restaurantId,
        amount: 10,
        method: 'PIX',
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'APPROVED',
        customerEmail: 'customer-a@example.com',
        customerName: 'Cliente A',
      },
    });
    paymentB = await prisma.payment.create({
      data: {
        restaurantId: B.restaurantId,
        amount: 20,
        method: 'PIX',
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'APPROVED',
        customerEmail: 'customer-b@example.com',
        customerName: 'Cliente B',
      },
    });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    if (savedAdminEmails === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
    else process.env.PLATFORM_ADMIN_EMAILS = savedAdminEmails;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    asOwnerA();
  });

  it('401s without a session', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await list()).status).toBe(401);
  });

  it("returns only the caller's own restaurant payments", async () => {
    const res = await list();
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.payments.map((p: any) => p.id);
    expect(ids).toContain(paymentA.id);
    expect(ids).not.toContain(paymentB.id);
  });

  it("ignores a restaurantId pointing at ANOTHER restaurant", async () => {
    const res = await list(`?restaurantId=${B.restaurantId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.payments.map((p: any) => p.id);
    expect(ids).toContain(paymentA.id);
    expect(ids).not.toContain(paymentB.id);
    expect(body.payments.every((p: any) => p.restaurantId === A.restaurantId)).toBe(true);
  });

  it('scopes the aggregated summary too', async () => {
    const res = await list(`?withSummary=1&restaurantId=${B.restaurantId}`);
    const body = await res.json();
    expect(body.summary.totalCount).toBe(1);
    expect(body.summary.totalAmount).toBe(10);
  });

  it('403s when the caller has no current restaurant', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: 'ghost', email: 'nobody@integration.test', role: 'OWNER' },
    });
    const res = await list();
    expect(res.status).toBe(403);
  });

  it('lets a platform admin filter by another restaurant', async () => {
    asPlatformAdmin();
    const res = await list(`?restaurantId=${B.restaurantId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.payments.map((p: any) => p.id);
    expect(ids).toContain(paymentB.id);
    expect(ids).not.toContain(paymentA.id);
  });

  it('attributes a POSTed payment to the caller restaurant, ignoring the body', async () => {
    const res = await POST(
      new Request('https://gastrux.test/api/pagamentos', {
        method: 'POST',
        body: JSON.stringify({ amount: 5, method: 'CASH', restaurantId: B.restaurantId }),
      }) as any
    );
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.restaurantId).toBe(A.restaurantId);
    await prisma.payment.delete({ where: { id: created.id } });
  });
});
