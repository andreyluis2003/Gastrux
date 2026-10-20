// @ts-nocheck
/**
 * 2026-10-20: the Várias lojas dashboard summed every kitchen order (an open comanda included) and showed
 * the revenue of every store the person belonged to, as a cook too. Now: the Caixa/DRE sales, only the
 * stores the person owns or manages.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { GET } from '../../../app/api/admin/multi-location/dashboard/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('Várias lojas dashboard', () => {
  let userId: string, ownedId: string, cookId: string, otherOwnerId: string;

  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `dono-${tag}@gastrux.test`, name: 'Dono', password: 'x', role: 'OWNER' } })).id;
    otherOwnerId = (await prisma.user.create({ data: { email: `outro-${tag}@gastrux.test`, name: 'Outro', password: 'x', role: 'OWNER' } })).id;
    ownedId = (await prisma.restaurant.create({ data: { name: `Minha ${tag}`, ownerId: userId } })).id;
    cookId = (await prisma.restaurant.create({ data: { name: `Onde cozinho ${tag}`, ownerId: otherOwnerId } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: ownedId, userId, role: 'OWNER', permissions: ['ALL'], isActive: true, acceptedAt: new Date() } });
    await prisma.restaurantUser.create({ data: { restaurantId: cookId, userId, role: 'COOK', permissions: [], isActive: true, acceptedAt: new Date() } });

    const order = (restaurantId: string, total: number, orderSessionId: string | null = null) =>
      prisma.order.create({ data: { restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total, orderSessionId } });
    // A delivery sale counts; a kitchen order of a comanda still open was not paid and does not
    const open = await prisma.orderSession.create({ data: { restaurantId: ownedId, userId, status: 'OPEN' } });
    await order(ownedId, 50);
    await order(ownedId, 80, open.id);
    await order(cookId, 999);
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, role: 'OWNER' }, expires: '2099-01-01' });
  });

  afterAll(async () => {
    const ids = [ownedId, cookId];
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurant.deleteMany({ where: { id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherOwnerId] } } });
  });

  it('shows only the managed store, with the paid sales', async () => {
    const res = await GET({ nextUrl: new URL('https://x/api/admin/multi-location/dashboard?period=7') } as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.locations.map((l) => l.id)).toEqual([ownedId]);
    expect(body.locations[0].metrics).toMatchObject({ totalRevenue: 50, totalOrders: 1, ordersToday: 1, avgTicket: 50 });
    expect(body.consolidated).toMatchObject({ totalRevenue: 50, totalOrders: 1, totalLocations: 1 });
  });
});
