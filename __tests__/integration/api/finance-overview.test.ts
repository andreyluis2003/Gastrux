// @ts-nocheck
/** Relatórios > Financeiro (2026-10-23): the DRE/Caixa numbers, real changes and a projection of the month */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { financeOverview } from '../../../lib/finance/overview';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const DAY = 864e5;
// 2026-10-20 at 15h Brasília
const NOW = new Date('2026-10-20T18:00:00Z');

describe('finance overview', () => {
  let rid, ownerId;
  const order = (total, createdAt, status = 'COMPLETED') =>
    prisma.order.create({ data: { restaurantId: rid, orderNumber: `FO${crypto.randomBytes(4).toString('hex')}`, status, orderType: 'DELIVERY', total, createdAt } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `fo-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Fo ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await order(60, new Date(NOW.getTime() - 60_000)); // today
    await order(40, new Date('2026-10-05T18:00:00Z')); // this month, in the last 30 days
    await order(999, new Date(NOW.getTime() - 60_000), 'CANCELLED'); // never counts
    await order(50, new Date(NOW.getTime() - 40 * DAY)); // the 30 days before (2026-09-10)
    await order(30, new Date('2026-09-25T18:00:00Z')); // last month, in the last 30 days
  });
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId: rid } });
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.delete({ where: { id: ownerId } });
  });

  it('last 30 days, today and the change against the 30 days before', async () => {
    const o = await financeOverview(rid, NOW);
    expect(o.last30).toMatchObject({ first: '2026-09-21', last: '2026-10-20', revenue: 130, sales: 3 });
    expect(o.last30.avgTicket).toBeCloseTo(130 / 3, 2);
    expect(o.today).toEqual({ revenue: 60, sales: 1 });
    expect(o.changes.revenue).toBeCloseTo(160, 1); // 130 vs 50
    expect(o.last30.byMethod).toEqual({ DELIVERY: 130 });
  });

  it('the month: R$ 100 in 20 days of 31 projects R$ 155; last month closed at R$ 80', async () => {
    const o = await financeOverview(rid, NOW);
    expect(o.month).toMatchObject({ ym: '2026-10', revenueSoFar: 100, daysElapsed: 20, daysInMonth: 31, lastMonthRevenue: 80 });
    expect(o.month.projection).toBeCloseTo(155, 2);
  });

  it('no projection in the first 2 days of the month', async () => {
    const o = await financeOverview(rid, new Date('2026-11-02T15:00:00Z'));
    expect(o.month).toMatchObject({ ym: '2026-11', daysElapsed: 2, projection: null });
  });
});
