// @ts-nocheck
/** The referred restaurant's first charge (plan 2026-10-24 indicacao, Task 4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { noteFirstCharge, noteFirstStripeInvoice } from '../../../lib/referrals/charges';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const users: string[] = [];

async function owner(extra = {}) {
  const u = await prisma.user.create({ data: { email: `rfc-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', ...extra } });
  users.push(u.id);
  const r = await prisma.restaurant.create({ data: { name: `Rfc ${seq++} ${tag}`, ownerId: u.id, status: 'TRIAL', subscriptionTier: 'business', subscriptionStatus: 'trialing', isInternal: false } });
  return { userId: u.id, rid: r.id };
}

async function referredPair() {
  const referrer = await owner();
  const referred = await owner({ stripeCustomerId: `cus_${tag}_${seq++}` });
  const row = await prisma.referral.create({ data: { referrerRestaurantId: referrer.rid, referredRestaurantId: referred.rid } });
  const customer = (await prisma.user.findUnique({ where: { id: referred.userId } })).stripeCustomerId;
  return { referrer, referred, row, customer };
}

afterAll(async () => {
  await prisma.restaurant.deleteMany({ where: { ownerId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
});

const statusOf = async (id) => (await prisma.referral.findUnique({ where: { id } }));

it('a charged Stripe invoice moves TRIAL to CONFIRMING with the invoice', async () => {
  const p = await referredPair();
  await noteFirstStripeInvoice({ id: `in_${tag}_1`, customer: p.customer, amount_paid: 19900, created: 1_800_000_000 });
  expect(await statusOf(p.row.id)).toMatchObject({ status: 'CONFIRMING', gateway: 'STRIPE', firstChargeRef: `in_${tag}_1` });
  expect((await statusOf(p.row.id)).firstChargeAt.getTime()).toBe(1_800_000_000 * 1000);
});

it('the same invoice twice, or a later one, changes nothing more', async () => {
  const p = await referredPair();
  await noteFirstStripeInvoice({ id: `in_${tag}_2`, customer: p.customer, amount_paid: 19900, created: 1_800_000_000 });
  await noteFirstStripeInvoice({ id: `in_${tag}_2`, customer: p.customer, amount_paid: 19900, created: 1_800_000_000 });
  await noteFirstStripeInvoice({ id: `in_${tag}_3`, customer: p.customer, amount_paid: 19900, created: 1_802_000_000 });
  expect(await statusOf(p.row.id)).toMatchObject({ status: 'CONFIRMING', firstChargeRef: `in_${tag}_2` });
});

it('the R$ 0,00 invoice of a starting trial does not count', async () => {
  const p = await referredPair();
  await noteFirstStripeInvoice({ id: `in_${tag}_0`, customer: p.customer, amount_paid: 0, created: 1_800_000_000 });
  expect((await statusOf(p.row.id)).status).toBe('TRIAL');
});

it('an approved Mercado Pago recurring charge counts', async () => {
  const p = await referredPair();
  await noteFirstCharge(p.referred.userId, { gateway: 'MERCADO_PAGO', ref: `mp-${tag}`, at: new Date() });
  expect(await statusOf(p.row.id)).toMatchObject({ status: 'CONFIRMING', gateway: 'MERCADO_PAGO', firstChargeRef: `mp-${tag}` });
});

it('an owner without a referral: nothing happens, nothing throws', async () => {
  const o = await owner({ stripeCustomerId: `cus_${tag}_none` });
  await expect(noteFirstStripeInvoice({ id: `in_${tag}_x`, customer: `cus_${tag}_none`, amount_paid: 100, created: 1 })).resolves.toBeUndefined();
  await expect(noteFirstCharge(o.userId, { gateway: 'STRIPE', ref: 'x', at: new Date() })).resolves.toBeUndefined();
});

it("the referrer's own charges never move the referrer's referrals", async () => {
  const p = await referredPair();
  await noteFirstCharge(p.referrer.userId, { gateway: 'STRIPE', ref: 'in_referrer', at: new Date() });
  expect((await statusOf(p.row.id)).status).toBe('TRIAL');
});
