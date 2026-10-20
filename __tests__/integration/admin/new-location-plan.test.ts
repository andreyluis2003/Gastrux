// @ts-nocheck
/**
 * Review of the plans of 2026-10-18 (2026-10-19): a new store was created with subscriptionTier 'starter',
 * which now means "no plan", so the second store of a Business owner (trial or paying) was born locked.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { POST } from '../../../app/api/admin/multi-location/route';
import { restaurantPlanAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 86_400_000;

describe('a new store gets the plan of the store it was created from', () => {
  let ownerId: string, firstId: string;
  const created: string[] = [];
  const create = async (name: string) => {
    const res = await POST(new Request('https://x/api/admin/multi-location', { method: 'POST', body: JSON.stringify({ name }) }) as any);
    const body = await res.json();
    if (body.restaurant?.id) created.push(body.restaurant.id);
    return { res, body };
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    firstId = (await prisma.restaurant.create({ data: { name: `Loja 1 ${tag}`, ownerId, status: 'TRIAL', isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() + 20 * DAY) } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: firstId, userId: ownerId, role: 'OWNER', permissions: ['ALL'], isActive: true, acceptedAt: new Date() } });
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: firstId } });
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId, role: 'OWNER' }, expires: '2099-01-01' });
  });

  afterAll(async () => {
    const ids = [firstId, ...created];
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: null } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('during the Business trial: the second store is a trial with the same end, not locked', async () => {
    const { res, body } = await create(`Loja 2 ${tag}`);
    expect(res.status).toBe(201);
    const second = await prisma.restaurant.findUnique({ where: { id: body.restaurant.id } });
    const first = await prisma.restaurant.findUnique({ where: { id: firstId } });
    expect(second).toMatchObject({ subscriptionTier: 'business', subscriptionStatus: 'trialing', status: 'TRIAL', isInternal: false });
    expect(second.trialEndsAt.getTime()).toBe(first.trialEndsAt.getTime());
    expect((await restaurantPlanAccess(body.restaurant.id)).locked).toBe(false);
  });

  // 2026-10-20: the limit counted only ACTIVE stores, so a trial owner (stores in TRIAL) had no limit
  it('during the Business trial: a third store is refused (Business has 2)', async () => {
    const { res } = await create(`Loja 3 ${tag}`);
    expect(res.status).toBe(403);
    expect(await prisma.restaurant.count({ where: { ownerId } })).toBe(2);
  });
});
