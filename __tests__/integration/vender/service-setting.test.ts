// @ts-nocheck
/** The service charge percent in the restaurant settings (spec 2026-10-07, 4.3): 10 by default, 0 to 30 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET, PATCH } from '../../../app/api/admin/restaurant/settings/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('service charge setting', () => {
  let rid: string, ownerId: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `tx-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Tx ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const s = { user: { id: ownerId, email: `tx-${tag}@gastrux.test`, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  const patch = (body: any) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }));

  it('10% by default; 0 turns it off; 0 to 30 only', async () => {
    expect((await (await GET()).json()).restaurant.serviceChargePercent).toBe(10);
    expect((await patch({ serviceChargePercent: 0 })).status).toBe(200);
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).serviceChargePercent).toBe(0);
    expect((await patch({ serviceChargePercent: 31 })).status).toBe(400);
    expect((await patch({ serviceChargePercent: 12.5 })).status).toBe(400);
  });
});
