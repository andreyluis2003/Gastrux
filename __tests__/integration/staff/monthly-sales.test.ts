// @ts-nocheck
/**
 * Sales per month per plan (plans of 2026-10-18): Pro 1.000, Business 3.500,
 * Enterprise unlimited. A sale is a closed comanda (table, name, counter, quick sale) or a delivery /
 * online order. Going over warns (80%, 100%, firmer after two months over) and never blocks a sale.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { monthlySalesUsage, noteSalesThresholds } from '../../../lib/plans/monthly-sales';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const NOW = new Date('2026-10-20T15:00:00.000Z');
const LAST_MONTH = new Date('2026-09-15T15:00:00.000Z');

describe('monthly sales per plan', () => {
  let rid: string, ownerId: string, recipeId: string;
  const email = `ms-${tag}@gastrux.test`;
  const closed = (n: number, at: Date) => prisma.orderSession.createMany({
    data: Array.from({ length: n }, () => ({ restaurantId: rid, userId: ownerId, status: 'CLOSED', closedAt: at, openedAt: at })),
  });
  const alerts = () => prisma.notification.findMany({ where: { restaurantId: rid, data: { path: ['kind'], equals: 'plan_sales' } }, orderBy: { createdAt: 'asc' } });
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Ms ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `MS${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const s = { user: { id: ownerId, email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.order.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('counts closed comandas and delivery orders of the month, nothing else', async () => {
    await closed(2, NOW);
    await closed(1, LAST_MONTH);
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN' } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `D1-${tag}`, orderType: 'DELIVERY', createdAt: NOW } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `D2-${tag}`, orderType: 'DELIVERY', status: 'CANCELLED', createdAt: NOW } });
    const withComanda = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', closedAt: NOW } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `K1-${tag}`, orderType: 'DINE_IN', orderSessionId: withComanda.id, createdAt: NOW } });

    const u = await monthlySalesUsage(rid, NOW);
    expect(u).toMatchObject({ tier: 'pro', limit: 1000, used: 4 });
  });

  it('warns at 80% and 100% once each, and the second month over is firmer', async () => {
    await closed(796, NOW); // 800 of 1000
    await noteSalesThresholds(rid, NOW);
    await noteSalesThresholds(rid, NOW);
    expect((await alerts()).map((a) => a.data.level)).toEqual([80]);

    await closed(200, NOW); // 1000 of 1000
    await noteSalesThresholds(rid, NOW);
    let all = await alerts();
    expect(all.map((a) => a.data.level)).toEqual([80, 100]);
    expect(all[1].message).not.toMatch(/segundo mês seguido/);

    // September over the limit too: October's 100% says it is the second month in a row
    await prisma.notification.deleteMany({ where: { id: all[1].id } });
    await closed(1000, LAST_MONTH);
    await noteSalesThresholds(rid, NOW);
    all = await alerts();
    expect(all[1].message).toMatch(/segundo mês seguido/);
    expect(all[1].userId).toBeNull();
  });

  it('over the limit, a comanda still goes to the kitchen (never blocks a sale)', async () => {
    expect((await monthlySalesUsage(rid, new Date())).used).toBeGreaterThanOrEqual(0);
    await closed(1100, new Date());
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN' } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 1 } });
    const res = await SEND(new NextRequest('http://x', { method: 'POST', body: '{}' }), { params: { id: s.id } });
    expect(res.status).toBe(200);
  });
});
