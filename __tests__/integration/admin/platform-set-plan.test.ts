// @ts-nocheck
/**
 * Review of the plans of 2026-10-18, M-1: the platform form always sends plan, restaurant status and
 * subscription status. Choosing Pro for a client in trial left 'trialing', so with no gateway subscription
 * the restaurant locked when the trial date passed. The form also offered 'cancelled', which nothing reads.
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

describe('platform: choosing a paid plan gives the plan', () => {
  let rid: string, ownerId: string, teamId: string;
  const envBefore = process.env.PLATFORM_ADMIN_EMAILS;
  const patch = (body: any) => PATCH(new Request(`https://x/api/admin/customers/${rid}`, { method: 'PATCH', body: JSON.stringify(body) }) as any, { params: { id: rid } });
  const trial = () => prisma.restaurant.update({ where: { id: rid }, data: { isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'trialing', status: 'TRIAL', trialEndsAt: new Date(Date.now() + 5 * DAY) } });

  beforeAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = TEAM;
    teamId = (await prisma.user.create({ data: { email: TEAM, name: 'Equipe', password: 'x', role: 'OWNER' } })).id;
    ownerId = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Plano ${tag}`, ownerId, status: 'TRIAL' } })).id;
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: teamId, email: TEAM, role: 'OWNER' }, expires: '2099-01-01' });
  });

  afterAll(async () => {
    process.env.PLATFORM_ADMIN_EMAILS = envBefore;
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, teamId] } } });
  });

  it('Pro chosen on a trial client, form still saying trialing: active, and not locked after the trial date', async () => {
    await trial();
    expect((await patch({ subscriptionTier: 'pro', status: 'TRIAL', subscriptionStatus: 'trialing' })).status).toBe(200);
    expect(await prisma.restaurant.findUnique({ where: { id: rid } })).toMatchObject({ subscriptionTier: 'pro', subscriptionStatus: 'active', status: 'ACTIVE' });
    await prisma.restaurant.update({ where: { id: rid }, data: { trialEndsAt: new Date(Date.now() - DAY) } });
    expect((await restaurantPlanAccess(rid)).state).toBe('paid');
  });

  it('saving the trial client without changing the plan keeps the trial', async () => {
    await trial();
    await patch({ subscriptionTier: 'business', status: 'TRIAL', subscriptionStatus: 'trialing' });
    expect((await restaurantPlanAccess(rid)).state).toBe('trial');
  });

  it("'cancelled' is saved as 'canceled'", async () => {
    await trial();
    await patch({ subscriptionTier: 'business', status: 'SUSPENDED', subscriptionStatus: 'cancelled' });
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).subscriptionStatus).toBe('canceled');
  });
});
