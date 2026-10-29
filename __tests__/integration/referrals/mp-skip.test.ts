// @ts-nocheck
/**
 * Mercado Pago referrers get the free month by skipping one charge (plan 2026-10-24 indicacao, Task 6). The sandbox
 * experiment of 2026-10-26..29 (docs/mp-pause-experiment.md) showed that a paused PreApproval is not charged on its
 * date and is not charged later for it either: the daily job pauses it, and resumes it the day after the skipped date.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/stripe-connect', () => ({
  stripe: {
    customers: { createBalanceTransaction: jest.fn(), listBalanceTransactions: jest.fn().mockResolvedValue({ data: [] }) },
    charges: { list: jest.fn() },
  },
}));
jest.mock('../../../lib/mercado-pago', () => ({ getPayment: jest.fn(), getPreApproval: jest.fn(), updatePreApproval: jest.fn() }));
jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue({ provider: 'resend' }) }));
import { stripe } from '../../../lib/stripe-connect';
import { getPreApproval, updatePreApproval } from '../../../lib/mercado-pago';
import { applyEarnedOnMp, resumeSkipped } from '../../../lib/referrals/apply-mp';
import { runReferralDaily } from '../../../lib/referrals/daily';
import { subscriptionGrantsAccess } from '../../../lib/billing/subscription-sync';
import { planAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const users: string[] = [];
const DAY = 86_400_000;
const NOW = new Date('2026-11-20T15:00:00Z');
const NEXT = '2026-12-05T10:37:51.000-04:00';

/** MP state of each PreApproval, changed by the mocked updatePreApproval */
let mp: Record<string, { status: string; next_payment_date: string }>;

async function mpReferrer(opts: { tier?: string; subStatus?: string; mpStatus?: string } = {}) {
  const u = await prisma.user.create({ data: { email: `rfm-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  users.push(u.id);
  const r = await prisma.restaurant.create({
    data: { name: `Rfm ${seq++} ${tag}`, ownerId: u.id, status: 'ACTIVE', subscriptionTier: opts.tier ?? 'pro', subscriptionStatus: 'active' },
  });
  const pre = `pre_${tag}_${seq++}`;
  await prisma.subscription.create({
    data: { userId: u.id, restaurantId: r.id, tier: opts.tier ?? 'pro', gateway: 'MERCADO_PAGO', gatewaySubscriptionId: pre, amount: 149, status: opts.subStatus ?? 'active' },
  });
  mp[pre] = { status: opts.mpStatus ?? 'authorized', next_payment_date: NEXT };
  return { rid: r.id, ownerId: u.id, pre };
}

async function earned(referrer, daysAgo = 1) {
  const o = await prisma.user.create({ data: { email: `rfm-${seq++}-${tag}@gastrux.test`, name: 'Outro', password: 'x', role: 'OWNER' } });
  users.push(o.id);
  const referred = await prisma.restaurant.create({ data: { name: `Rfm ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active' } });
  return prisma.referral.create({
    data: { referrerRestaurantId: referrer.rid, referredRestaurantId: referred.id, status: 'EARNED', gateway: 'MERCADO_PAGO', earnedAt: new Date(NOW.getTime() - daysAgo * DAY) },
  });
}
const reload = (id) => prisma.referral.findUnique({ where: { id } });

beforeEach(() => {
  jest.clearAllMocks();
  mp = {};
  (getPreApproval as jest.Mock).mockImplementation(async (id) => ({ id, ...mp[id] }));
  (updatePreApproval as jest.Mock).mockImplementation(async (id, status) => {
    mp[id].status = status;
    return { id, ...mp[id] };
  });
});
afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
  await prisma.restaurant.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

it('an earned month pauses the PreApproval once, until the day after the skipped charge', async () => {
  const referrer = await mpReferrer();
  const row = await earned(referrer);
  expect(await applyEarnedOnMp(referrer.rid, NOW)).toBe(1);
  expect(await applyEarnedOnMp(referrer.rid, NOW)).toBe(0);
  expect(updatePreApproval).toHaveBeenCalledTimes(1);
  expect(updatePreApproval).toHaveBeenCalledWith(referrer.pre, 'paused');
  const r = await reload(row.id);
  expect(r).toMatchObject({ status: 'APPLIED', appliedRef: referrer.pre, amountCents: 14900 });
  expect(r.resumeAt.toISOString()).toBe(new Date(new Date(NEXT).getTime() + DAY).toISOString());
  expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
});

it('the daily job applies it and, after resumeAt, resumes the PreApproval once', async () => {
  const referrer = await mpReferrer({ tier: 'business' });
  const row = await earned(referrer);
  await runReferralDaily(NOW);
  expect(await reload(row.id)).toMatchObject({ status: 'APPLIED', amountCents: 19900 });
  expect(mp[referrer.pre].status).toBe('paused');

  // The day of the skipped charge: still paused
  await runReferralDaily(new Date(NEXT));
  expect(mp[referrer.pre].status).toBe('paused');

  const after = new Date(new Date(NEXT).getTime() + DAY + 60_000);
  await runReferralDaily(after);
  expect(mp[referrer.pre].status).toBe('authorized');
  expect((await reload(row.id)).resumeAt).toBeNull();
  await runReferralDaily(after);
  expect((updatePreApproval as jest.Mock).mock.calls.filter((c) => c[1] === 'authorized')).toHaveLength(1);
});

it('a second earned month waits for the first resume', async () => {
  const referrer = await mpReferrer();
  const first = await earned(referrer, 2);
  const second = await earned(referrer, 1);
  expect(await applyEarnedOnMp(referrer.rid, NOW)).toBe(1);
  expect(await reload(first.id)).toMatchObject({ status: 'APPLIED' });
  expect(await reload(second.id)).toMatchObject({ status: 'EARNED' });

  const after = new Date(new Date(NEXT).getTime() + DAY + 60_000);
  mp[referrer.pre].next_payment_date = '2027-01-05T10:37:51.000-04:00';
  await resumeSkipped(after);
  expect(await applyEarnedOnMp(referrer.rid, after)).toBe(1);
  expect(await reload(second.id)).toMatchObject({ status: 'APPLIED', appliedRef: referrer.pre });
  expect(mp[referrer.pre].status).toBe('paused');
});

it('a PreApproval that is not authorized at MP (failing charge, paused by hand) is not touched', async () => {
  const late = await mpReferrer({ subStatus: 'past_due', mpStatus: 'paused' });
  const lateRow = await earned(late);
  const odd = await mpReferrer({ mpStatus: 'paused' });
  const oddRow = await earned(odd);
  expect(await applyEarnedOnMp(late.rid, NOW)).toBe(0);
  expect(await applyEarnedOnMp(odd.rid, NOW)).toBe(0);
  expect(updatePreApproval).not.toHaveBeenCalled();
  expect(await reload(lateRow.id)).toMatchObject({ status: 'EARNED' });
  expect(await reload(oddRow.id)).toMatchObject({ status: 'EARNED' });
});

it('a pause that fails at MP leaves the month EARNED for the next run', async () => {
  const referrer = await mpReferrer();
  const row = await earned(referrer);
  (updatePreApproval as jest.Mock).mockRejectedValueOnce(new Error('MP 500'));
  expect(await applyEarnedOnMp(referrer.rid, NOW)).toBe(0);
  expect(await reload(row.id)).toMatchObject({ status: 'EARNED', appliedRef: null, resumeAt: null });
  expect(await applyEarnedOnMp(referrer.rid, NOW)).toBe(1);
});

it('an owner who cancelled while paused is not resumed', async () => {
  const referrer = await mpReferrer();
  const row = await earned(referrer);
  await applyEarnedOnMp(referrer.rid, NOW);
  mp[referrer.pre].status = 'cancelled';
  await resumeSkipped(new Date(new Date(NEXT).getTime() + 2 * DAY));
  expect((updatePreApproval as jest.Mock).mock.calls.filter((c) => c[1] === 'authorized')).toHaveLength(0);
  expect((await reload(row.id)).resumeAt).toBeNull();
});

it('the referrer keeps the plan while the PreApproval is paused by a referral', async () => {
  // The MP webhook syncs a paused PreApproval as past_due (mapMPPreApprovalStatus)
  expect(subscriptionGrantsAccess({ status: 'past_due' }, NOW)).toBe(true);
  expect(planAccess({ subscriptionTier: 'pro', subscriptionStatus: 'past_due', trialEndsAt: null, isInternal: false } as any, NOW)).toMatchObject({ locked: false });
});
