// @ts-nocheck
/** The owner fills in the invoice details before subscribing; staff never see them. */
import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createPreApproval: jest.fn().mockResolvedValue({ id: 'preapproval-x', init_point: 'https://mp.test/pay' }),
}));
import { getServerSession } from 'next-auth';
import { GET, PUT } from '../../../app/api/billing/profile/route';
import { POST as mpCheckout } from '../../../app/api/billing/mp/checkout-session/route';
import { POST as stripeCheckout } from '../../../app/api/billing/checkout-session/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const details = { document: '529.982.247-25', name: 'Maria Dona', zipCode: '78550-000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Sinop', state: 'MT' };
const json = (url: string, method: string, body: any) => new NextRequest(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const save = (body: any) => PUT(json('http://x/api/billing/profile', 'PUT', body));
const plan = { tierId: 'business', billing: 'monthly', acceptedTerms: true };

describe('invoice details before subscribing', () => {
  let owner, cook, restaurant;
  const as = (u) => (getServerSession as jest.Mock).mockResolvedValue({ user: { id: u.id, email: u.email, role: u.role }, expires: '2099-01-01' });

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `nota-dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `nota-cozinha-${tag}@gastrux.test`, name: 'Cozinha', password: 'x', role: 'COOK' } });
    restaurant = await prisma.restaurant.create({ data: { name: `Nota ${tag}`, ownerId: owner.id, city: 'Sinop', state: 'MT', status: 'TRIAL', subscriptionStatus: 'trialing' } });
    await prisma.user.updateMany({ where: { id: { in: [owner.id, cook.id] } }, data: { currentRestaurantId: restaurant.id } });
    await prisma.restaurantUser.createMany({ data: [
      { restaurantId: restaurant.id, userId: owner.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() },
      { restaurantId: restaurant.id, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() },
    ] });
  });

  afterAll(async () => {
    await prisma.subscription.deleteMany({ where: { restaurantId: restaurant.id } });
    await prisma.restaurant.delete({ where: { id: restaurant.id } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('the checkout on both gateways waits for the details', async () => {
    as(owner);
    for (const route of [mpCheckout, stripeCheckout]) {
      const res = await route(json('http://x/checkout', 'POST', plan));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('BILLING_PROFILE_REQUIRED');
    }
    expect(await prisma.subscription.count({ where: { restaurantId: restaurant.id } })).toBe(0);
  });

  it('starts the form with what the account knows; staff get nothing', async () => {
    as(owner);
    const body = await (await GET()).json();
    expect(body.profile).toBeNull();
    expect(body.suggested).toMatchObject({ name: `Nota ${tag}`, city: 'Sinop', state: 'MT' });

    as(cook);
    expect((await GET()).status).toBe(403);
    expect((await save(details)).status).toBe(403);
  });

  it('refuses a wrong document, saves a right one, and lets the owner correct it', async () => {
    as(owner);
    expect((await save({ ...details, document: '111.111.111-11' })).status).toBe(400);
    expect((await save(details)).status).toBe(200);
    expect(await prisma.billingProfile.findUnique({ where: { restaurantId: restaurant.id } })).toMatchObject({ document: '52998224725', zipCode: '78550000' });

    await save({ ...details, document: '11.222.333/0001-81', name: 'Maria Dona Ltda' });
    expect((await (await GET()).json()).profile).toMatchObject({ document: '11222333000181', name: 'Maria Dona Ltda' });
  });

  it('with the details saved, the Terms are still required', async () => {
    as(owner);
    for (const route of [mpCheckout, stripeCheckout]) {
      const res = await route(json('http://x/checkout', 'POST', { ...plan, acceptedTerms: undefined }));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe('TERMS_REQUIRED');
    }
    expect(await prisma.subscriptionAcceptance.count({ where: { restaurantId: restaurant.id } })).toBe(0);
  });

  it('the accepted Terms pass and leave proof with version, plan, IP and browser', async () => {
    as(owner);
    const res = await mpCheckout(new NextRequest('http://x/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '8.8.8.8, 203.0.113.9', 'user-agent': 'Teste' },
      body: JSON.stringify(plan),
    }));
    expect((await res.json()).code).toBeUndefined();
    const proof = await prisma.subscriptionAcceptance.findFirst({ where: { restaurantId: restaurant.id } });
    expect(proof).toMatchObject({ userId: owner.id, tier: 'business', billingCycle: 'monthly', gateway: 'MERCADO_PAGO', termsVersion: '2026-10-18', ip: '203.0.113.9', userAgent: 'Teste' });
    await prisma.subscriptionAcceptance.deleteMany({ where: { restaurantId: restaurant.id } });
  });
});
