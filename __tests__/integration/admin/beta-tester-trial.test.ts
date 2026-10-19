// @ts-nocheck
/**
 * Review of the plans of 2026-10-18 (2026-10-19): extending a beta tester changed only the User row, so the
 * tester's store locked on the old date; the store was also created as 'starter' (no plan).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { setOwnerTrialEnd } from '../../../lib/admin/trial';
import { restaurantPlanAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 86_400_000;

describe('setOwnerTrialEnd', () => {
  let ownerId: string, betaId: string, paidId: string;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `beta-${tag}@gastrux.test`, name: 'Beta', password: 'x', role: 'OWNER' } })).id;
    betaId = (await prisma.restaurant.create({ data: { name: `Beta ${tag}`, ownerId, status: 'TRIAL', isInternal: false, subscriptionTier: 'starter', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() - DAY) } })).id;
    paidId = (await prisma.restaurant.create({ data: { name: `Paga ${tag}`, ownerId, status: 'ACTIVE', isInternal: false, subscriptionTier: 'pro', subscriptionStatus: 'active' } })).id;
  });

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: [betaId, paidId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('a locked beta store becomes a Business trial up to the new date; a paid store is untouched', async () => {
    expect((await restaurantPlanAccess(betaId)).locked).toBe(true);
    const end = new Date(Date.now() + 15 * DAY);
    expect(await setOwnerTrialEnd(ownerId, end)).toBe(1);
    expect(await prisma.restaurant.findUnique({ where: { id: betaId } })).toMatchObject({ subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: end });
    expect(await restaurantPlanAccess(betaId)).toMatchObject({ state: 'trial', daysLeft: 15 });
    expect(await prisma.restaurant.findUnique({ where: { id: paidId } })).toMatchObject({ subscriptionTier: 'pro', subscriptionStatus: 'active' });
  });
});
