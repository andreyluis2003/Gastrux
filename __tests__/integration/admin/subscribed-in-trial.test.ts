// @ts-nocheck
/**
 * Deferred from the review of the plans of 2026-10-18: an owner who subscribes during the 30-day trial gets
 * a gateway trial for the days left (subscriptionStatus 'trialing'). It still showed 'Teste grátis: faltam N
 * dias / Escolher plano', locked the restaurant if the first charge was answered late, and the platform
 * 'Estender teste' turned the Pro plan into a Business trial.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { restaurantPlanAccess } from '../../../lib/billing/plan-access';
import { extendTrial } from '../../../lib/admin/trial';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 86_400_000;

describe('a subscription made during the trial is a paid plan', () => {
  let rid: string, ownerId: string;
  const set = (data: any) => prisma.restaurant.update({ where: { id: rid }, data: { isInternal: false, ...data } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Assinou ${tag}`, ownerId, status: 'TRIAL' } })).id;
  });

  afterAll(async () => {
    await prisma.platformClientNote.deleteMany({ where: { restaurantId: rid } });
    await prisma.subscription.deleteMany({ where: { userId: ownerId } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.deleteMany({ where: { id: ownerId } });
  });

  it('before subscribing it is a trial with the days left', async () => {
    await set({ subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: new Date(Date.now() + 10 * DAY) });
    expect(await restaurantPlanAccess(rid)).toMatchObject({ state: 'trial', daysLeft: 10 });
  });

  it('after subscribing: paid, no days left, not locked when the trial date passes', async () => {
    const trialEnd = new Date(Date.now() + 10 * DAY);
    await prisma.subscription.create({ data: { userId: ownerId, restaurantId: rid, gateway: 'STRIPE', gatewaySubscriptionId: `sub-${tag}`, tier: 'pro', billingCycle: 'monthly', amount: 149, status: 'trialing', trialEnd } });
    await set({ subscriptionTier: 'pro', subscriptionStatus: 'trialing', trialEndsAt: trialEnd });
    expect(await restaurantPlanAccess(rid)).toEqual({ state: 'paid', locked: false, daysLeft: null });
    await set({ trialEndsAt: new Date(Date.now() - DAY) });
    expect((await restaurantPlanAccess(rid)).locked).toBe(false);
  });

  it('the platform cannot extend it into a Business trial', async () => {
    const res = await extendTrial({ restaurantId: rid, days: 7, reason: 'teste', actor: { id: ownerId, email: 'equipe@gastrux.test' } });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).subscriptionTier).toBe('pro');
  });

  it('once the gateway cancels it, the restaurant locks again', async () => {
    await prisma.subscription.updateMany({ where: { userId: ownerId }, data: { status: 'canceled' } });
    await set({ subscriptionTier: 'starter', subscriptionStatus: 'canceled', trialEndsAt: new Date(Date.now() - DAY) });
    expect((await restaurantPlanAccess(rid)).state).toBe('locked');
  });
});
