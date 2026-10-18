// @ts-nocheck
/**
 * Final review of the plans of 2026-10-18 (I-2): "Suspender" set subscriptionStatus 'past_due' and "Reativar"
 * set 'active', which read as a paid plan, so a client whose trial was over got Business for free.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { PATCH } from '../../../app/api/admin/customers/[id]/route';
import { restaurantPlanAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const TEAM = `equipe-${tag}@gastrux.test`;
const DAY = 86_400_000;

describe('platform suspend / reactivate never hand out a plan', () => {
  let rid: string, ownerId: string, teamId: string;
  const envBefore = process.env.PLATFORM_ADMIN_EMAILS;
  const act = (action: string) => PATCH(new Request(`https://x/api/admin/customers/${rid}`, { method: 'PATCH', body: JSON.stringify({ action }) }) as any, { params: { id: rid } });
  const set = (data: any) => prisma.restaurant.update({ where: { id: rid }, data: { isInternal: false, ...data } });

  beforeAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = TEAM;
    teamId = (await prisma.user.create({ data: { email: TEAM, name: 'Equipe', password: 'x', role: 'OWNER' } })).id;
    ownerId = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Susp ${tag}`, ownerId, status: 'TRIAL' } })).id;
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: teamId, email: TEAM, role: 'OWNER' }, expires: '2099-01-01' });
  });

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = envBefore;
    await prisma.subscription.deleteMany({ where: { userId: ownerId } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, teamId] } } });
  });

  it('suspending a trial in time locks it', async () => {
    await set({ subscriptionTier: 'business', subscriptionStatus: 'trialing', status: 'TRIAL', trialEndsAt: new Date(Date.now() + 10 * DAY) });
    expect((await act('suspend')).status).toBe(200);
    expect((await restaurantPlanAccess(rid)).state).toBe('locked');
  });

  it('reactivating an expired trial does not give Business: it stays locked', async () => {
    await set({ subscriptionTier: 'business', subscriptionStatus: 'canceled', status: 'SUSPENDED', trialEndsAt: new Date(Date.now() - DAY) });
    expect((await act('reactivate')).status).toBe(200);
    expect((await restaurantPlanAccess(rid)).state).toBe('locked');
  });

  it('reactivating a trial still in time gives the trial back', async () => {
    await set({ subscriptionTier: 'business', subscriptionStatus: 'canceled', status: 'SUSPENDED', trialEndsAt: new Date(Date.now() + 5 * DAY) });
    await act('reactivate');
    expect((await restaurantPlanAccess(rid)).state).toBe('trial');
  });

  it('reactivating a client who pays gives the paid plan back', async () => {
    await prisma.subscription.create({ data: { userId: ownerId, restaurantId: rid, gateway: 'MERCADO_PAGO', gatewaySubscriptionId: `pre-${tag}`, tier: 'pro', billingCycle: 'monthly', amount: 149, status: 'active', currentPeriodEnd: new Date(Date.now() + 20 * DAY) } });
    await set({ subscriptionTier: 'pro', subscriptionStatus: 'canceled', status: 'SUSPENDED', trialEndsAt: null });
    await act('reactivate');
    expect((await restaurantPlanAccess(rid)).state).toBe('paid');
  });
});
