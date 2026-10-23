// @ts-nocheck
/**
 * Relatório executivo (2026-10-23): it was a PDF from an external service (key never set in production) with
 * a "CMV" that summed every stock movement, purchases too. Now a printable page with the DRE's numbers.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET } from '../../../app/api/reports/executive/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const report = (type, days = 7) => GET(new NextRequest(`http://x/api/reports/executive?type=${type}&days=${days}`));

describe('executive report page', () => {
  let rid, owner, cook, userIds = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ex-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Ex ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: o.id, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const c = await prisma.user.create({ data: { email: `ex-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    userIds = [o.id, c.id];

    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    const frango = await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: cat.id, code: `F${tag}`, name: 'Frango', standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 30 } });
    // A name that must not become HTML
    const espeto = await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Espeto <b>frango</b>', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10,
      ingredients: { create: [{ ingredientId: frango.id, quantity: 0.1, unit: 'kg' }] } } });
    // A purchase of 10 kg (R$ 300) is not CMV
    await prisma.stockMovement.create({ data: { restaurantId: rid, ingredientId: frango.id, type: 'ENTRY', quantity: 10, unit: 'kg' } }).catch(() => {});
    // A delivery order today: 4 espetos at R$ 10, cost R$ 12
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `EX${tag}`, status: 'COMPLETED', orderType: 'DELIVERY', total: 40, items: { create: [{ recipeId: espeto.id, quantity: 4 }] } } });
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('CMV: the DRE numbers, the purchase left out, names escaped', async () => {
    as(owner);
    const res = await report('cmv');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('R$&nbsp;12,00'.replace('&nbsp;', ' '));
    expect(html).toContain('30,0%'); // 12 / 40
    expect(html).not.toContain('R$ 300,00');
    expect(html).toContain('Espeto &lt;b&gt;frango&lt;/b&gt;');
    expect(html).not.toContain('<b>frango</b>');
    expect(html).toContain('Imprimir ou salvar em PDF');
  });

  it('menu engineering and waste open on Pro; the full report is Business', async () => {
    as(owner);
    expect((await report('menu-engineering')).status).toBe(200);
    expect((await report('waste')).status).toBe(200);
    expect((await report('comprehensive')).status).not.toBe(200);
  });

  it('refuses the cook and an unknown type or period', async () => {
    as(cook);
    expect((await report('cmv')).status).toBe(403);
    as(owner);
    expect((await report('x')).status).toBe(400);
    expect((await report('cmv', 5)).status).toBe(400);
  });
});
