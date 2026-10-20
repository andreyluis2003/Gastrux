// @ts-nocheck
/** DRE revenue, expenses and estimated CMV with the Caixa criterion, Brasília period, managers only (owner 2026-10-16) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as DRE } from '../../../app/api/financeiro/dre/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const dre = (start = '2026-09-01', end = '2026-09-30') => DRE(new NextRequest(`http://x/api/financeiro/dre?startDate=${start}&endDate=${end}`));

describe('DRE with the Caixa criterion', () => {
  let rid, owner, cook, userIds = [];
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `drer-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Drer ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const c = await prisma.user.create({ data: { email: `drer-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    userIds = [o.id, c.id];

    const register = await prisma.cashRegister.create({ data: { name: 'Caixa', restaurantId: rid, isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: register.id, openedById: o.id } });
    // The cost comes from the ficha's insumos (Recipe.costPerPortion is never written by the app; 2026-10-19 the DRE read it as zero)
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Carnes ${tag}` } });
    const carne = await prisma.ingredient.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Carne', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 40 } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Espeto', baseYield: 1, yieldUnit: 'un', portionUnit: 'un',
      ingredients: { create: [{ ingredientId: carne.id, quantity: 100, unit: 'g' }] } } });
    const entry = (data) => prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, createdById: o.id, ...data } });

    // A: counter sale NOT sent to the kitchen, paid at 23:30 of Sept 30 in Brasília (02:30Z of Oct 1)
    const a = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', closedAt: new Date('2026-10-01T02:30:00Z'),
      items: { create: [{ recipeId: recipe.id, quantity: 2, price: 25, addedAt: new Date('2026-10-01T01:00:00Z') }] } } });
    await entry({ type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: a.id, createdAt: new Date('2026-10-01T02:30:00Z') });
    // B: table with 10% service, sent to the kitchen (its kitchen order must not count again)
    const b = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', serviceChargeCents: 300, closedAt: new Date('2026-09-10T23:00:00Z'),
      items: { create: [{ recipeId: recipe.id, quantity: 1, price: 30, addedAt: new Date('2026-09-10T22:00:00Z'), sentAt: new Date('2026-09-10T22:00:00Z') }] } } });
    await entry({ type: 'RECEIPT', method: 'CREDIT', amountCents: 3300, orderSessionId: b.id, createdAt: new Date('2026-09-10T23:00:00Z') });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `DRER${tag}1`, status: 'COMPLETED', orderType: 'DINE_IN', total: 99, orderSessionId: b.id, createdAt: new Date('2026-09-10T22:00:00Z'),
      items: { create: [{ recipeId: recipe.id, quantity: 1, createdAt: new Date('2026-09-10T22:00:00Z') }] } } });
    // C: paid by phone at the table: R$ 30 with R$ 10 refunded
    const cc = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', closedAt: new Date('2026-09-12T23:00:00Z') } });
    await prisma.payment.create({ data: { restaurantId: rid, orderSessionId: cc.id, amount: 30, amountRefunded: 10, method: 'PIX', status: 'APPROVED', appliedToBillAt: new Date('2026-09-12T23:00:00Z') } });
    // Site delivery, no comanda: R$ 45 with R$ 5 discount
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `DRER${tag}2`, status: 'PREPARING', orderType: 'DELIVERY', total: 45, discount: 5, createdAt: new Date('2026-09-20T15:00:00Z'),
      items: { create: [{ recipeId: recipe.id, quantity: 1, createdAt: new Date('2026-09-20T15:00:00Z') }] } } });
    // A cancelled comanda sold nothing
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CANCELLED', items: { create: [{ recipeId: recipe.id, quantity: 9, price: 1, addedAt: new Date('2026-09-15T15:00:00Z') }] } } });
    // October 1, 00:30 in Brasília: October, not September
    const d = await prisma.orderSession.create({ data: { restaurantId: rid, userId: o.id, status: 'CLOSED', closedAt: new Date('2026-10-01T03:30:00Z') } });
    await entry({ type: 'RECEIPT', method: 'CASH', amountCents: 7000, orderSessionId: d.id, createdAt: new Date('2026-10-01T03:30:00Z') });
    // Expense paid from the drawer counts; a withdrawal (money to the safe) does not
    await entry({ type: 'EXPENSE', method: 'CASH', amountCents: 1500, category: 'compras', createdAt: new Date('2026-09-15T15:00:00Z') });
    await entry({ type: 'WITHDRAWAL', method: 'CASH', amountCents: 10000, createdAt: new Date('2026-09-15T16:00:00Z') });
  }, 60000);
  afterAll(async () => {
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: rid } } }); } catch {}
    try { await prisma.recipe.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.ingredient.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('revenue = cash sales + online after refunds + delivery without comanda, in the Brasília month', async () => {
    as(owner);
    const { dre: d, detalhamento } = await (await dre()).json();
    expect(d.receitaBruta).toBeCloseTo(148, 2);   // 50 + 33 + 20 + 45
    expect(d.receitaDineIn).toBeCloseTo(103, 2);  // salão: comandas
    expect(d.receitaDelivery).toBeCloseTo(45, 2);
    expect(d.taxaServico).toBeCloseTo(3, 2);
    expect(d.deducoes.descontos).toBeCloseTo(5, 2);
    expect(d.receitaLiquida).toBeCloseTo(143, 2);
    expect(detalhamento.receitaPorMetodo).toEqual({ CASH: 50, CREDIT: 33, PIX_ONLINE: 20, DELIVERY: 45 });
  });

  it('expenses: drawer expenses count, withdrawals do not', async () => {
    as(owner);
    const { dre: d } = await (await dre()).json();
    expect(d.despesasOperacionais.operacional).toBeCloseTo(15, 2);
  });

  it('estimated CMV uses what was sold (comanda lines + delivery), not the kitchen copy', async () => {
    as(owner);
    const { dre: d } = await (await dre()).json();
    expect(d.cmv).toBeCloseTo(16, 2); // (2 + 1 + 1) × 100 g of carne at R$ 40/kg = R$ 4 each
  });

  it('October starts at 00:00 in Brasília', async () => {
    as(owner);
    const { dre: d } = await (await dre('2026-10-01', '2026-10-31')).json();
    expect(d.receitaBruta).toBeCloseTo(70, 2);
  });

  it('pendências 8/9: an impossible date is a 400, not a rolled-over period or a 500', async () => {
    as(owner);
    expect((await dre('2026-02-01', '2026-02-31')).status).toBe(400);
    expect((await dre('2026-13-01', '2026-13-31')).status).toBe(400);
    expect((await dre('2026-02-01', '2026-02-28')).status).toBe(200);
  });

  it('only owner and manager open the DRE', async () => {
    as(cook);
    expect((await dre()).status).toBe(403);
  });
});
