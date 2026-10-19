// @ts-nocheck
/**
 * Review of the plans of 2026-10-18, M-2: 'Estender teste' on a restaurant whose Mercado Pago plan was
 * canceled was undone when the paid period ended: expireEndedSubscriptions still saw 'pro' on the owner
 * and wrote 'starter' (no plan) over every store, cutting the extension short.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { extendTrial } from '../../../lib/admin/trial';
import { expireEndedSubscriptions } from '../../../lib/billing/subscription-sync';
import { restaurantPlanAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 86_400_000;

describe('an extended trial survives the end of a canceled plan', () => {
  let ownerId: string, rid: string, subId: string;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `canc-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER', subscriptionTier: 'pro', subscriptionStatus: 'canceled' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Canc ${tag}`, ownerId, isInternal: false, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'canceled', billingCycleEnd: new Date(Date.now() - DAY) } })).id;
    subId = (await prisma.subscription.create({ data: { userId: ownerId, restaurantId: rid, gateway: 'MERCADO_PAGO', gatewaySubscriptionId: `pre-${tag}`, tier: 'pro', billingCycle: 'monthly', amount: 149, status: 'canceled', currentPeriodEnd: new Date(Date.now() - DAY) } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { subscriptionId: subId } });
  });

  afterAll(async () => {
    await prisma.platformClientNote.deleteMany({ where: { restaurantId: rid } });
    await prisma.user.update({ where: { id: ownerId }, data: { subscriptionId: null } });
    await prisma.subscription.deleteMany({ where: { userId: ownerId } });
    await prisma.restaurant.deleteMany({ where: { id: rid } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('extend +7, then the sweep of ended plans runs: the store is still in trial', async () => {
    expect((await restaurantPlanAccess(rid)).state).toBe('locked');
    const res = await extendTrial({ restaurantId: rid, days: 7, reason: 'cliente pediu', actor: { id: ownerId, email: 'equipe@gastrux.test' } });
    expect(res.ok).toBe(true);
    await expireEndedSubscriptions();
    expect(await restaurantPlanAccess(rid)).toMatchObject({ state: 'trial', daysLeft: 7 });
    // The owner's own row still goes back to no plan
    expect((await prisma.user.findUnique({ where: { id: ownerId } })).subscriptionTier).toBe('starter');
  });
});
