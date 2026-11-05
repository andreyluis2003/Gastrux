/**
 * Primeiro acesso guiado (spec 2026-11-05): the guide of the current restaurant, how it sells and the new
 * steps marked done, only for who sets the restaurant up.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET, PATCH } from '../../../app/api/onboarding/guide/route';
import { ownIntegration } from '../../../lib/delivery-orders/integrations';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

const patch = (body: unknown) =>
  PATCH(new NextRequest('http://localhost/api/onboarding/guide', { method: 'PATCH', body: JSON.stringify(body) }));
const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);
const keys = (g) => Object.fromEntries(g.groups.flatMap((x) => x.steps).map((s) => [s.key, s.done]));

describe('primeiro acesso guiado: /api/onboarding/guide', () => {
  let owner, cook, rid;
  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `guide-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER', businessType: 'pizzaria' } });
    cook = await prisma.user.create({ data: { email: `guide-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    rid = (await prisma.restaurant.create({ data: { name: `Guide ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  });
  afterAll(async () => {
    try { await prisma.externalOrder.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('needs a session and is not for the kitchen', async () => {
    as(null);
    expect((await GET()).status).toBe(401);
    as(cook);
    expect((await GET()).status).toBe(403);
    expect((await patch({ mark: 'testOrder' })).status).toBe(403);
  });

  it('a new pizzaria starts with balcão and delivery, nothing done, active, no product yet', async () => {
    as(owner);
    const g = await (await GET()).json();
    expect(g).toMatchObject({ channels: ['balcao', 'delivery'], channelsChosen: false, active: true, hasProducts: false, done: 0 });
    expect(g.groups.map((x) => x.id)).toEqual(['inicio', 'delivery']);
  });

  it('saves how the restaurant sells and refuses what it does not know', async () => {
    as(owner);
    expect((await patch({ channels: ['mesas', 'drone'] })).status).toBe(400);
    expect((await patch({ mark: 'hack' })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    const g = await (await patch({ channels: ['balcao', 'mesas'] })).json();
    expect(g).toMatchObject({ channels: ['balcao', 'mesas'], channelsChosen: true });
    expect(g.groups.map((x) => x.id)).toEqual(['inicio', 'mesas']);
  });

  it('marks keep their first date and do not lose the channels', async () => {
    as(owner);
    await patch({ mark: 'testOrder' });
    const first = (await prisma.restaurant.findUnique({ where: { id: rid } })).onboardingGuide.marks.testOrder;
    await new Promise((r) => setTimeout(r, 5));
    const g = await (await patch({ mark: 'testOrder' })).json();
    const stored = (await prisma.restaurant.findUnique({ where: { id: rid } })).onboardingGuide;
    expect(stored.marks.testOrder).toBe(first);
    expect(stored.channels).toEqual(['balcao', 'mesas']);
    expect(keys(g).teste).toBe(true);
  });

  it('the site test order is done by a real order from the delivery site', async () => {
    as(owner);
    await patch({ channels: ['delivery'] });
    expect(keys(await (await GET()).json()).deliveryOrder).toBe(false);
    const site = await ownIntegration(rid, 'delivery_site');
    await prisma.externalOrder.create({
      data: {
        restaurantId: rid, integrationId: site.id, externalOrderId: `T-${tag}`, status: 'CONFIRMED', totalAmount: 30, subtotal: 30,
        deliveryFee: 0, discount: 0, platformFee: 0, paymentMethod: 'CASH', paidOnline: false, customerName: 'Teste',
        customerPhone: '66999998888', deliveryAddress: 'Retirada no local', items: '[]',
      },
    });
    expect(keys(await (await GET()).json()).deliveryOrder).toBe(true);
  });
});
