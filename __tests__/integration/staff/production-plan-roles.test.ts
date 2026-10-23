// @ts-nocheck
/**
 * Planejamento de produção (2026-10-23): the routes checked the global session role ('COOK'), so a cashier
 * could change plans, and the cook saw buttons that failed and the costs. Now: the role in this restaurant;
 * the cook reads quantities, without costs.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST, POST as CREATE } from '../../../app/api/production-plans/route';
import { GET as ONE, POST as ADD_ITEM } from '../../../app/api/production-plans/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (url, body?) => new NextRequest(`http://x${url}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined);

describe('production plan roles', () => {
  let rid, owner, cook, cashier, recipeId, planId, userIds = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `pp-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Pp ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const mk = async (k, role) => {
      const u = await prisma.user.create({ data: { email: `pp-${k}-${tag}@gastrux.test`, name: k, password: 'x', role, currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      return { id: u.id, email: u.email, role };
    };
    cook = await mk('c', 'COOK');
    cashier = await mk('x', 'CASHIER');
    userIds = [o.id, cook.id, cashier.id];
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    const frango = await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: cat.id, code: `F${tag}`, name: 'Frango', standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 30 } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Espeto', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10,
      ingredients: { create: [{ ingredientId: frango.id, quantity: 0.1, unit: 'kg' }] } } })).id;
  }, 60000);
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.productionPlanItem.deleteMany({ where: { restaurantId: rid } });
    await prisma.productionPlan.deleteMany({ where: { restaurantId: rid } });
    await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { currentRestaurantId: null } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('the cashier and the cook cannot create a plan', async () => {
    for (const u of [cashier, cook]) {
      as(u);
      expect((await CREATE(req('/api/production-plans', { planDate: '2026-10-24' }))).status).toBe(403);
    }
  });

  it('the owner creates a plan and adds 20 espetos at R$ 3,00', async () => {
    as(owner);
    const res = await CREATE(req('/api/production-plans', { planDate: '2026-10-24' }));
    expect(res.status).toBeLessThan(300);
    planId = (await prisma.productionPlan.findFirst({ where: { restaurantId: rid } })).id;
    const add = await ADD_ITEM(req(`/api/production-plans/${planId}`, { recipeId, quantity: 20 }), { params: { id: planId } });
    expect(add.status).toBeLessThan(300);
    const one = await (await ONE(req(`/api/production-plans/${planId}`), { params: { id: planId } })).json();
    expect(one.canManage).toBe(true);
    expect(one.items[0].estimatedCost).toBeCloseTo(60, 2);
  });

  it('the cook reads the quantities without costs or prices', async () => {
    as(cook);
    const list = await (await LIST(req('/api/production-plans'))).json();
    expect(list.canManage).toBe(false);
    expect(list.plans[0]).toMatchObject({ id: planId, totalCost: null });
    expect(list.plans[0].items[0]).toMatchObject({ quantity: 20, estimatedCost: null, recipe: { name: 'Espeto' } });
    expect(list.plans[0].items[0].recipe.sellingPrice).toBeUndefined();
    const one = await (await ONE(req(`/api/production-plans/${planId}`), { params: { id: planId } })).json();
    expect(one).toMatchObject({ canManage: false, totalCost: null });
    expect(one.items[0].estimatedCost).toBeNull();
  });
});
