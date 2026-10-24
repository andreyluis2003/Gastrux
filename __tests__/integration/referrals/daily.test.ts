// @ts-nocheck
/** The daily referral job: confirm after 7 days, earn, apply on Stripe (plan 2026-10-24 indicacao, Task 5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('../../../lib/stripe-connect', () => ({
  stripe: {
    customers: { createBalanceTransaction: jest.fn() },
    charges: { list: jest.fn() },
  },
}));
jest.mock('../../../lib/mercado-pago', () => ({ getPayment: jest.fn() }));
jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue({ provider: 'resend' }) }));
import { stripe } from '../../../lib/stripe-connect';
import { getPayment } from '../../../lib/mercado-pago';
import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { runReferralDaily } from '../../../lib/referrals/daily';
import { applyEarnedOnStripe } from '../../../lib/referrals/apply-stripe';
import { POST as dailyRoute } from '../../../app/api/referrals/daily/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const users: string[] = [];
const DAY = 86_400_000;
const NOW = new Date('2026-11-20T15:00:00Z');

async function restaurant(opts: { tier?: string; status?: string; stripe?: boolean; paying?: boolean; cnpj?: string; internal?: boolean; ownerId?: string } = {}) {
  let ownerId = opts.ownerId;
  if (!ownerId) {
    const u = await prisma.user.create({ data: { email: `rfd-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', stripeCustomerId: opts.stripe ? `cus_${tag}_${seq++}` : null } });
    users.push(u.id);
    ownerId = u.id;
  }
  const r = await prisma.restaurant.create({
    data: {
      name: `Rfd ${seq++} ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: opts.tier ?? 'pro',
      subscriptionStatus: opts.status ?? 'active', isInternal: !!opts.internal, cnpj: opts.cnpj ?? null,
    },
  });
  if (opts.paying) {
    await prisma.subscription.create({ data: { userId: ownerId, restaurantId: r.id, tier: opts.tier ?? 'pro', gateway: 'STRIPE', gatewaySubscriptionId: `sub_${tag}_${seq++}`, amount: 149, status: 'active' } });
  }
  return { rid: r.id, ownerId };
}

/** A referral whose referred restaurant paid `daysAgo` days before NOW */
async function confirming(referrer, referredOpts = {}, daysAgo = 8, gateway = 'STRIPE') {
  const referred = await restaurant({ stripe: true, ...referredOpts });
  const row = await prisma.referral.create({
    data: { referrerRestaurantId: referrer.rid, referredRestaurantId: referred.rid, status: 'CONFIRMING', gateway, firstChargeRef: `in_${tag}_${seq++}`, firstChargeAt: new Date(NOW.getTime() - daysAgo * DAY) },
  });
  return { row, referred };
}
const reload = (id) => prisma.referral.findUnique({ where: { id } });

beforeEach(() => {
  jest.clearAllMocks();
  (stripe.charges.list as jest.Mock).mockResolvedValue({ data: [{ id: 'ch_1', amount_refunded: 0, refunded: false }] });
  (stripe.customers.createBalanceTransaction as jest.Mock).mockImplementation(async (_c, body, opts) => ({ id: `cbtxn_${opts.idempotencyKey}`, amount: body.amount }));
  (getPayment as jest.Mock).mockResolvedValue({ id: 1, status: 'approved' });
});
afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { userId: { in: users } } });
  await prisma.restaurant.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

it('after 7 days an active referred restaurant earns, and a Stripe referrer gets one credit of -14900', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  const { row } = await confirming(referrer);
  await runReferralDaily(NOW);
  const r = await reload(row.id);
  expect(r).toMatchObject({ status: 'APPLIED', amountCents: 14900 });
  expect(r.appliedRef).toBe(`cbtxn_referral-${row.id}`);
  const calls = (stripe.customers.createBalanceTransaction as jest.Mock).mock.calls;
  expect(calls).toHaveLength(1);
  expect(calls[0][1]).toMatchObject({ amount: -14900, currency: 'brl' });
  expect(calls[0][2]).toEqual({ idempotencyKey: `referral-${row.id}` });
  const mails = (sendTransactionalEmail as jest.Mock).mock.calls.filter((c) => /1 mês grátis/.test(c[0].subject));
  expect(mails).toHaveLength(1);
});

it('run twice: one credit', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  await confirming(referrer);
  await runReferralDaily(NOW);
  await runReferralDaily(NOW);
  expect((stripe.customers.createBalanceTransaction as jest.Mock).mock.calls).toHaveLength(1);
});

it('before 7 days nothing moves', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  const { row } = await confirming(referrer, {}, 3);
  await runReferralDaily(NOW);
  expect((await reload(row.id)).status).toBe('CONFIRMING');
});

it('the referred restaurant cancelled: CANCELLED, no credit', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  const { row } = await confirming(referrer, { status: 'canceled' });
  await runReferralDaily(NOW);
  expect(await reload(row.id)).toMatchObject({ status: 'CANCELLED' });
  expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
});

it('the first Stripe charge was refunded: CANCELLED', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  (stripe.charges.list as jest.Mock).mockResolvedValue({ data: [{ id: 'ch_1', amount_refunded: 14900, refunded: true }] });
  const { row } = await confirming(referrer);
  await runReferralDaily(NOW);
  expect((await reload(row.id)).status).toBe('CANCELLED');
});

it('the first Mercado Pago charge was refunded: CANCELLED', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  (getPayment as jest.Mock).mockResolvedValue({ id: 1, status: 'refunded' });
  const { row } = await confirming(referrer, {}, 8, 'MERCADO_PAGO');
  await runReferralDaily(NOW);
  expect((await reload(row.id)).status).toBe('CANCELLED');
});


it('the referred store belongs to the referrer owner (another store of the same person): CANCELLED', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  const own = await restaurant({ ownerId: referrer.ownerId });
  const row = await prisma.referral.create({
    data: { referrerRestaurantId: referrer.rid, referredRestaurantId: own.rid, status: 'CONFIRMING', gateway: 'STRIPE', firstChargeRef: 'in_x', firstChargeAt: new Date(NOW.getTime() - 8 * DAY) },
  });
  await runReferralDaily(NOW);
  expect(await reload(row.id)).toMatchObject({ status: 'CANCELLED' });
});


it('the 13th month of the year is CANCELLED "limite do ano"', async () => {
  const referrer = await restaurant({ stripe: true, paying: true });
  for (let i = 0; i < 12; i++) {
    const r = await restaurant({});
    await prisma.referral.create({ data: { referrerRestaurantId: referrer.rid, referredRestaurantId: r.rid, status: 'APPLIED', earnedAt: new Date('2026-03-01T12:00:00Z'), amountCents: 14900 } });
  }
  const { row } = await confirming(referrer);
  await runReferralDaily(NOW);
  expect(await reload(row.id)).toMatchObject({ status: 'CANCELLED', cancelReason: 'limite do ano' });
});

it('a referrer still in trial keeps the month EARNED; the Stripe checkout applies it', async () => {
  const referrer = await restaurant({ stripe: true, status: 'trialing' });
  const { row } = await confirming(referrer);
  await runReferralDaily(NOW);
  expect((await reload(row.id)).status).toBe('EARNED');
  expect(stripe.customers.createBalanceTransaction).not.toHaveBeenCalled();
  const customer = (await prisma.user.findUnique({ where: { id: referrer.ownerId } })).stripeCustomerId;
  expect(await applyEarnedOnStripe(referrer.rid, customer)).toBe(1);
  expect((await reload(row.id)).status).toBe('APPLIED');
});

it('an internal referrer or referred: CANCELLED', async () => {
  const referrer = await restaurant({ stripe: true, paying: true, internal: true });
  const { row } = await confirming(referrer);
  const referrer2 = await restaurant({ stripe: true, paying: true });
  const { row: row2 } = await confirming(referrer2, { internal: true });
  await runReferralDaily(NOW);
  expect((await reload(row.id)).status).toBe('CANCELLED');
  expect((await reload(row2.id)).status).toBe('CANCELLED');
});

it('the daily route needs CRON_SECRET', async () => {
  process.env.CRON_SECRET = 'segredo-teste';
  expect((await dailyRoute(new NextRequest('http://x/api/referrals/daily', { method: 'POST' }))).status).toBe(401);
  const ok = await dailyRoute(new NextRequest('http://x/api/referrals/daily', { method: 'POST', headers: { authorization: 'Bearer segredo-teste' } }));
  expect(ok.status).toBe(200);
});

it('a CNPJ already used by a store of the referrer cannot be saved on the referred store (unique in the database)', async () => {
  const cnpj = `7${Date.now()}`.slice(-14);
  const referrer = await restaurant({ stripe: true, paying: true, cnpj });
  const { referred } = await confirming(referrer);
  await expect(prisma.restaurant.update({ where: { id: referred.rid }, data: { cnpj } })).rejects.toThrow();
});
