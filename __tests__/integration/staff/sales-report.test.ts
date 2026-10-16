// @ts-nocheck
/** Relatórios › Vendas with the Caixa criterion (owner 2026-10-16) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as REPORT } from '../../../app/api/reports/sales/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const report = () => REPORT(new NextRequest('http://x/api/reports/sales?startDate=2026-09-01&endDate=2026-09-30'));

describe('sales report', () => {
  let rid, otherRid, owner, cook, userIds = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `sr-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Sr ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Sr2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const c = await prisma.user.create({ data: { email: `sr-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    userIds = [o.id, c.id];

    const register = await prisma.cashRegister.create({ data: { name: 'Caixa', restaurantId: rid, isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: register.id, openedById: o.id } });
    const espeto = await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Espeto de frango', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    const cerveja = await prisma.recipe.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Cerveja', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 12 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Espetos', position: 0, active: true } });
    await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Espeto de frango', price: 10, recipeId: espeto.id } });
    const at = new Date('2026-09-10T22:00:00Z');
    const entry = (orderSessionId, amountCents, method = 'CASH') =>
      prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, createdById: o.id, type: 'RECEIPT', method, amountCents, orderSessionId, createdAt: at } });

    // Counter sale never sent to the kitchen: 3 espetos charged at R$ 11 (price changed on the menu)
    const a = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', closedAt: at, items: { create: [{ recipeId: espeto.id, quantity: 3, price: 11, addedAt: at }] } } });
    await entry(a.id, 3300);
    // Table sent to the kitchen: 2 beers; its kitchen order must not count again
    const b = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', closedAt: at, items: { create: [{ recipeId: cerveja.id, quantity: 2, price: 12, addedAt: at, sentAt: at }] } } });
    await entry(b.id, 2400, 'PIX');
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `SR${tag}1`, status: 'COMPLETED', orderSessionId: b.id, createdAt: at, items: { create: [{ recipeId: cerveja.id, quantity: 2, createdAt: at }] } } });
    // Site delivery without comanda: 1 espeto, R$ 15 with the fee
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `SR${tag}2`, status: 'COMPLETED', orderType: 'DELIVERY', total: 15, createdAt: at, items: { create: [{ recipeId: espeto.id, quantity: 1, createdAt: at }] } } });
    // Cancelled comanda and another restaurant: nothing
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CANCELLED', items: { create: [{ recipeId: espeto.id, quantity: 50, price: 10, addedAt: at }] } } });
    const other = await prisma.recipe.create({ data: { restaurantId: otherRid, code: `X${tag}`, name: 'Alheio', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 99 } });
    await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: o.id, status: 'CLOSED', items: { create: [{ recipeId: other.id, quantity: 9, price: 99, addedAt: at }] } } });
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('totals follow the Caixa: R$ 33 + R$ 24 + R$ 15, 3 sales', async () => {
    as(owner);
    const r = await (await report()).json();
    expect(r.totalSales).toBeCloseTo(72, 2);
    expect(r.totalOrders).toBe(3);
    expect(r.averageTicket).toBeCloseTo(24, 2);
  });

  it('top items by what was sold, at the price charged, once each', async () => {
    as(owner);
    const r = await (await report()).json();
    expect(r.topDishes).toEqual([
      { name: 'Espeto de frango', quantity: 4, revenue: 43 }, // 3 × 11 + 1 × 10
      { name: 'Cerveja', quantity: 2, revenue: 24 },
    ]);
  });

  it('categories come from the menu; items off the menu go to "Sem categoria"', async () => {
    as(owner);
    const r = await (await report()).json();
    expect(r.byCategory.map((c) => [c.category, c.sales, Math.round(c.percentage)])).toEqual([
      ['Espetos', 43, 64],
      ['Sem categoria', 24, 36],
    ]);
  });

  it('only owner and manager', async () => {
    as(cook);
    expect((await report()).status).toBe(403);
  });
});
