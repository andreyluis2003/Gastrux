// @ts-nocheck
/** Plans of 2026-10-18 (spec planos-teste-business §5): a new restaurant tries Business for 30 days, no card */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { POST as signup } from '../../../app/api/signup/route';
import { planAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const email = `trial-${crypto.randomBytes(4).toString('hex')}@gastrux.test`;

afterAll(async () => {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return;
  await prisma.restaurantUser.deleteMany({ where: { userId: u.id } });
  await prisma.restaurant.deleteMany({ where: { ownerId: u.id } });
  await prisma.user.delete({ where: { id: u.id } });
});

it('sign-up stores business + trialing + 30 days, not internal', async () => {
  const res = await signup(new Request('http://x/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Teste#12345', name: 'Ana', acceptedTerms: true }),
  }) as any);
  expect(res.status).toBe(201);
  const u = await prisma.user.findUnique({ where: { email } });
  const r = await prisma.restaurant.findFirst({ where: { ownerId: u.id } });
  expect(r).toMatchObject({ subscriptionTier: 'business', subscriptionStatus: 'trialing', status: 'TRIAL', isInternal: false });
  const days = (r.trialEndsAt.getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThanOrEqual(30);
  expect(planAccess(r).state).toBe('trial');
});
