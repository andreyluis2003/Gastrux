// @ts-nocheck
/** The referral link gives 45 days at signup (plan 2026-10-24 indicacao, Task 3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('../../../lib/email/transactional', () => ({ sendTransactionalEmail: jest.fn().mockResolvedValue({ provider: 'resend' }) }));
jest.mock('../../../lib/onboarding/emails', () => ({ sendWelcomeIfDue: jest.fn().mockResolvedValue('skipped') }));
import { sendTransactionalEmail } from '../../../lib/email/transactional';
import { POST as signup } from '../../../app/api/signup/route';
import { GET as lookup } from '../../../app/api/referrals/lookup/route';
import { newReferralCode } from '../../../lib/referrals/rules';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;
const emails: string[] = [];
const DAY = 86_400_000;

async function referrer(extra = {}) {
  const o = await prisma.user.create({ data: { email: `rfs-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  emails.push(o.email);
  const code = newReferralCode();
  const r = await prisma.restaurant.create({ data: { name: `Cantina ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false, referralCode: code, ...extra } });
  return { rid: r.id, name: r.name, code, ownerEmail: o.email };
}

async function signUp(body: Record<string, unknown>, cookie?: string) {
  const email = `rfs-n-${seq++}-${tag}@gastrux.test`;
  emails.push(email);
  const res = await signup(new NextRequest('http://x/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify({ email, password: 'Teste#12345', name: 'Novo', acceptedTerms: true, ...body }),
  }));
  const u = await prisma.user.findUnique({ where: { email } });
  const r = u ? await prisma.restaurant.findFirst({ where: { ownerId: u.id } }) : null;
  return { res, user: u, restaurant: r, days: r ? (r.trialEndsAt.getTime() - Date.now()) / DAY : 0 };
}

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.restaurantUser.deleteMany({ where: { userId: { in: ids } } });
  await prisma.restaurant.deleteMany({ where: { ownerId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
});
beforeEach(() => (sendTransactionalEmail as jest.Mock).mockClear());

it('a valid code gives 45 days and a TRIAL referral; the referrer gets one e-mail', async () => {
  const ref = await referrer();
  const s = await signUp({ referralCode: ref.code });
  expect(s.res.status).toBe(201);
  expect(s.days).toBeGreaterThan(44.9);
  expect(s.days).toBeLessThanOrEqual(45);
  expect((s.user.trialEndsAt.getTime() - Date.now()) / DAY).toBeGreaterThan(44.9);
  const row = await prisma.referral.findUnique({ where: { referredRestaurantId: s.restaurant.id } });
  expect(row).toMatchObject({ referrerRestaurantId: ref.rid, status: 'TRIAL' });
  await new Promise((r) => setTimeout(r, 50));
  const calls = (sendTransactionalEmail as jest.Mock).mock.calls.filter((c) => c[0].to === ref.ownerEmail);
  expect(calls).toHaveLength(1);
});

it('a code typed with spaces and lower case is normalized', async () => {
  const ref = await referrer();
  const s = await signUp({ referralCode: ` ${ref.code.toLowerCase().slice(0, 3)} ${ref.code.toLowerCase().slice(3)} ` });
  expect(s.days).toBeGreaterThan(44.9);
});

it('an unknown code: 30 days, the signup still works', async () => {
  const s = await signUp({ referralCode: 'ZZZZZZ' });
  expect(s.res.status).toBe(201);
  expect(s.days).toBeLessThanOrEqual(30);
  expect(await prisma.referral.count({ where: { referredRestaurantId: s.restaurant.id } })).toBe(0);
});

it('the code of an internal restaurant is ignored', async () => {
  const ref = await referrer({ isInternal: true });
  const s = await signUp({ referralCode: ref.code });
  expect(s.days).toBeLessThanOrEqual(30);
});

it('the cookie gx_ref is used when the body has no code', async () => {
  const ref = await referrer();
  const s = await signUp({}, `gx_ref=${ref.code}`);
  expect(s.days).toBeGreaterThan(44.9);
});

it('lookup returns only the restaurant name', async () => {
  const ref = await referrer();
  const res = await lookup(new NextRequest(`http://x/api/referrals/lookup?code=${ref.code.toLowerCase()}`));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ name: ref.name });
  expect((await lookup(new NextRequest('http://x/api/referrals/lookup?code=ZZZZZZ'))).status).toBe(404);
});
