// @ts-nocheck
/**
 * Owner decision 2026-10-19: an internal account with no plan ('starter', the Starter plan no longer exists)
 * works as Business at least: it used to get 0 AI questions, 1 user and the old Starter features, and an
 * internal 'pro' account lost pay at the table (review M-4).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { restaurantTier } from '../../../lib/tier-guard';
import { tablePaymentPlanAllows } from '../../../lib/mercadopago-connect/table-payment-access';
import { monthlySalesUsage } from '../../../lib/plans/monthly-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('an internal account reads Business at least', () => {
  let ownerId: string;
  const ids: Record<string, string> = {};
  const store = async (key: string, data: any) => {
    ids[key] = (await prisma.restaurant.create({ data: { name: `${key} ${tag}`, ownerId, ...data } })).id;
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `int-${tag}@gastrux.test`, name: 'Int', password: 'x', role: 'OWNER' } })).id;
    await store('internalNoPlan', { isInternal: true, subscriptionTier: 'starter', subscriptionStatus: 'active' });
    await store('internalPro', { isInternal: true, subscriptionTier: 'pro', subscriptionStatus: 'active' });
    await store('internalEnterprise', { isInternal: true, subscriptionTier: 'enterprise', subscriptionStatus: 'active' });
    await store('clientNoPlan', { isInternal: false, subscriptionTier: 'starter', subscriptionStatus: 'canceled' });
  });

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: Object.values(ids) } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('internal is Business at least (no plan or Pro); enterprise stays; a client stays as is', async () => {
    expect(await restaurantTier(ids.internalNoPlan)).toBe('business');
    expect(await restaurantTier(ids.internalPro)).toBe('business');
    expect(await restaurantTier(ids.internalEnterprise)).toBe('enterprise');
    expect(await restaurantTier(ids.clientNoPlan)).toBe('starter');
  });

  it('the features and limits follow it', async () => {
    expect(await tablePaymentPlanAllows(ids.internalNoPlan)).toBe(true);
    expect(await tablePaymentPlanAllows(ids.internalPro)).toBe(true);
    expect((await monthlySalesUsage(ids.internalNoPlan)).limit).toBe(3500);
  });
});
