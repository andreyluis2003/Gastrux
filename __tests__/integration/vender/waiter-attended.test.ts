// @ts-nocheck
/** "Atendido": the staff dismisses a table's waiter call without a payment (owner, 2026-10-12) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as attended } from '../../../app/api/comanda/sessions/[id]/waiter-attended/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('waiter call attended', () => {
  let A, B, cook;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const post = (id) => attended(new Request(`http://x/api/comanda/sessions/${id}/waiter-attended`, { method: 'POST' }) as any, { params: { id } });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `cook-${tag}@x.test`, name: 'Cozinha', password: 'x', role: 'COOK', active: true } });
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
    cook = u.id;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cook } });
    await prisma.user.deleteMany({ where: { id: cook } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  it('any staff member dismisses the call, and it leaves a trace', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 5, payAtWaiterRequestedAt: new Date() } });
    as(cook, A.restaurantId);
    const res = await post(s.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ attended: true });
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).payAtWaiterRequestedAt).toBeNull();
    expect(await prisma.auditLog.count({ where: { entityId: s.id } })).toBe(1);
    expect(await (await post(s.id)).json()).toEqual({ attended: false }); // nothing left to dismiss
  });

  it('another restaurant cannot dismiss it', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 6, payAtWaiterRequestedAt: new Date() } });
    as(B.ownerId, B.restaurantId);
    expect((await post(s.id)).status).toBe(404);
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).payAtWaiterRequestedAt).not.toBeNull();
  });
});
