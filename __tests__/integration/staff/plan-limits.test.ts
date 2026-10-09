// @ts-nocheck
/**
 * Plans (owner decision 2026-10-09): the KDS on every plan with Starter 1 / Pro 3 kitchen stations;
 * customer notes from Pro; restaurant campaigns from Business.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as NEW_STATION } from '../../../app/api/kds/stations/route';
import { POST as NEW_NOTE } from '../../../app/api/customers/[id]/interactions/route';
import { POST as NEW_CAMPAIGN } from '../../../app/api/admin/messaging/campaigns/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const post = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('plan limits: kitchen stations, customer notes, campaigns', () => {
  let rid: string, ownerId: string, customerId: string;
  const email = `pl-${tag}@gastrux.test`;
  const plan = (tier: string) => prisma.restaurant.update({ where: { id: rid }, data: { subscriptionTier: tier } });
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Pl ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    customerId = (await prisma.customer.create({ data: { restaurantId: rid, name: 'Bia', email: `bia-${tag}@gastrux.test` } })).id;
    const s = { user: { id: ownerId, email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.kitchenStation.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('Starter opens one kitchen station, Pro three', async () => {
    await plan('starter');
    expect((await NEW_STATION(post({ name: 'Cozinha' }))).status).toBeLessThan(300);
    const second = await NEW_STATION(post({ name: 'Bar' }));
    expect(second.status).toBe(403);
    expect((await second.json()).error).toMatch(/estações da cozinha/);

    await plan('pro');
    expect((await NEW_STATION(post({ name: 'Bar' }))).status).toBeLessThan(300);
    expect((await NEW_STATION(post({ name: 'Forno' }))).status).toBeLessThan(300);
    expect((await NEW_STATION(post({ name: 'Sobremesa' }))).status).toBe(403);

    await plan('business');
    expect((await NEW_STATION(post({ name: 'Sobremesa' }))).status).toBeLessThan(300);
  });

  it('customer notes from Pro', async () => {
    await plan('starter');
    expect((await NEW_NOTE(post({ type: 'COMMENT', subject: 'Prefere mesa', notes: 'Janela' }), { params: { id: customerId } })).status).toBe(403);
    await plan('pro');
    expect((await NEW_NOTE(post({ type: 'COMMENT', subject: 'Prefere mesa', notes: 'Janela' }), { params: { id: customerId } })).status).toBeLessThan(300);
  });

  it('campaigns from Business', async () => {
    for (const tier of ['starter', 'pro']) {
      await plan(tier);
      expect((await NEW_CAMPAIGN(post({}))).status).toBe(403);
    }
    await plan('business');
    // Past the plan check: the empty body is then refused for its missing fields
    expect((await NEW_CAMPAIGN(post({}))).status).toBe(400);
  });
});
