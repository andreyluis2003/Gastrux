// @ts-nocheck
/**
 * The CMV screen (2026-10-24, found in the video screenshots): sales and losses write their stock movements with a
 * negative quantity, and the screen added them as they were (CMV R$ -176,81); its revenue came from production
 * plans, so a restaurant that sells without plans showed R$ 0,00.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET } from '../../../app/api/cmv/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let ownerId, rid;

beforeAll(async () => {
  const o = await prisma.user.create({ data: { email: `cmvs-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  ownerId = o.id;
  rid = (await prisma.restaurant.create({ data: { name: `Cmvs ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active' } })).id;
  await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
  const s = { user: { id: ownerId, email: o.email, role: 'OWNER' }, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Carnes' } });
  const ing = await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: cat.id, code: `C${tag}`, name: 'Alcatra', standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, referenceCost: 10 } });
  await prisma.stockMovement.createMany({
    data: [
      { restaurantId: rid, ingredientId: ing.id, movementType: 'ENTRY', quantity: 5, reason: 'compra' },
      { restaurantId: rid, ingredientId: ing.id, movementType: 'AUTO_DEDUCTION', quantity: -2, reason: 'venda' },
      { restaurantId: rid, ingredientId: ing.id, movementType: 'LOSS', quantity: -1, reason: 'desperdício' },
    ],
  });
  // A sale of R$ 100 (a delivery kitchen order: no comanda)
  await prisma.order.create({ data: { restaurantId: rid, orderNumber: `CMVS-${tag}`, orderType: 'DELIVERY', status: 'COMPLETED', subtotal: 100, total: 100 } });
}, 60000);
afterAll(async () => {
  await prisma.order.deleteMany({ where: { restaurantId: rid } });
  await prisma.restaurant.delete({ where: { id: rid } });
  await prisma.user.delete({ where: { id: ownerId } });
});

it('consumption and losses are costs (positive), and the revenue is the period sales', async () => {
  const body = await (await GET(new NextRequest('http://x/api/cmv?period=30'))).json();
  expect(body.purchases).toBe(50);
  expect(body.consumption).toBe(20);
  expect(body.losses).toBe(10);
  expect(body.cmv).toBe(30);
  expect(body.estimatedRevenue).toBe(100);
  expect(body.cmvPercent).toBe(30);
  expect(body.topIngredients[0]).toMatchObject({ name: 'Alcatra', consumption: 20, losses: 10, total: 30 });
});

it('the saved snapshot uses the same costs and sales', async () => {
  const { POST } = await import('../../../app/api/cmv/snapshot/route');
  const res = await POST(new NextRequest('http://x/api/cmv/snapshot', { method: 'POST', body: JSON.stringify({ period: 30 }) }));
  expect(res.status).toBeLessThan(300);
  const body = await res.json();
  const snap = body.snapshot ?? body;
  expect(Number(snap.consumption)).toBe(20);
  expect(Number(snap.losses)).toBe(10);
  expect(Number(snap.revenue)).toBe(100);
  expect(Number(snap.cmvPercent)).toBe(30);
});
