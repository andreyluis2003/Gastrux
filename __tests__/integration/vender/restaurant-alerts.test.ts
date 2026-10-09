// @ts-nocheck
/**
 * The restaurant's own alerts (no user: NFC-e rejected, cash close difference, kitchen order stuck)
 * reach the owner and managers (2026-10-09). Every screen asked only for the user's own
 * notifications, so "o gerente foi alertado" reached nobody.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST } from '../../../app/api/notifications/list/route';
import { POST as READ } from '../../../app/api/notifications/read/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (id: string, email: string) => {
  const s = { user: { id, email }, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};

describe('restaurant alerts reach the managers', () => {
  let rid: string, ownerId: string, cashierId: string, alertId: string;
  const ownerEmail = `ra-o-${tag}@gastrux.test`;
  const cashierEmail = `ra-c-${tag}@gastrux.test`;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: ownerEmail, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Ra ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    cashierId = (await prisma.user.create({ data: { email: cashierEmail, name: 'Caio', password: 'x', role: 'CASHIER', currentRestaurantId: rid } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cashierId, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
    alertId = (await prisma.notification.create({
      data: { restaurantId: rid, type: 'SYSTEM_ERROR', severity: 'HIGH', title: 'NFC-e rejeitada', message: 'NCM inexistente' },
    })).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [ownerId, cashierId] } } }); } catch {}
  });

  it('the owner sees it, counts it as unread and marks it read', async () => {
    as(ownerId, ownerEmail);
    const body = await (await LIST(new NextRequest('http://x/api/notifications/list'))).json();
    expect(body.notifications.map((n) => n.id)).toContain(alertId);
    expect(body.unreadCount).toBe(1);
    const read = await READ(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ notificationId: alertId }) }));
    expect(read.status).toBe(200);
    expect((await prisma.notification.findUnique({ where: { id: alertId } })).read).toBe(true);
  });

  it('a cashier does not see it', async () => {
    as(cashierId, cashierEmail);
    const body = await (await LIST(new NextRequest('http://x/api/notifications/list'))).json();
    expect(body.notifications.map((n) => n.id)).not.toContain(alertId);
  });
});
