// @ts-nocheck
/**
 * Planejamento de produção (2026-10-25, found while recording the tutorial video): a plan made for 26/10 showed
 * 25/10. The page sent the day as UTC midnight, which is 21h of the day before in Brasília, and the screens show
 * the date in Brasília. The plan is the day the owner picked, in Brasília (like brtDayStart elsewhere).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as CREATE } from '../../../app/api/production-plans/route';
import { formatDate } from '../../../lib/formatters';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body) => new NextRequest('http://x/api/production-plans', { method: 'POST', body: JSON.stringify(body) });

describe('production plan date', () => {
  let rid, ownerId;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ppd-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    ownerId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ppd ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    const s = { user: { id: o.id, email: o.email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: ownerId } });
    await prisma.productionPlan.deleteMany({ where: { restaurantId: rid } });
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: null } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.delete({ where: { id: ownerId } });
  });

  it('keeps the day the owner picked, as the page sends it and as older pages sent it', async () => {
    for (const [planDate, day] of [['2026-10-26', '26/10/2026'], ['2026-10-27T00:00:00.000Z', '27/10/2026']]) {
      const res = await CREATE(req({ planDate }));
      expect(res.status).toBeLessThan(300);
      const plan = (await res.json()).plan ?? (await prisma.productionPlan.findFirst({ where: { restaurantId: rid }, orderBy: { createdAt: 'desc' } }));
      const stored = await prisma.productionPlan.findUnique({ where: { id: plan.id } });
      expect([planDate, formatDate(stored.planDate)]).toEqual([planDate, day]);
    }
  });
});
