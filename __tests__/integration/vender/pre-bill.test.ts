// @ts-nocheck
/** Pre-bill (spec 2026-10-07, 4.3): marks the table yellow; a new item turns it green again */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PRE_BILL } from '../../../app/api/comanda/sessions/[id]/pre-bill/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { loadSalao } from '../../../lib/vender/salao';
import { buildReceipt } from '../../../lib/print/tickets';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('pre-bill', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `pre-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Pre ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Coca', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca', price: 6, recipeId: recipe.id, position: 0 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    const table = await prisma.table.create({ data: { restaurantId: rid, number: 3, sectionId: sec.id, capacity: 4, qrToken: `pr${tag}` } });
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: table.id, status: 'OPEN' } })).id;
    await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 6, quantity: 2 } });
    const s = { user: { id: ownerId, email: `pre-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('printing the pre-bill turns the table yellow; a new item turns it green again', async () => {
    expect((await PRE_BILL(new NextRequest('http://x', { method: 'POST' }), { params: { id: sid } })).status).toBe(200);
    expect((await loadSalao(rid)).tables[0].session.billRequested).toBe(true);
    await ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ menuItemId, quantity: 1, merge: true }) }), { params: { id: sid } });
    expect((await loadSalao(rid)).tables[0].session.billRequested).toBe(false);
  });

  it('the receipt shows the service charge apart from the items total', async () => {
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: 180 } });
    const r = await buildReceipt(rid, sid);
    expect(r).toMatchObject({ total: 18, serviceCharge: 1.8, grandTotal: 19.8 });
  });
});
