// @ts-nocheck
/** Adding an item: the 140-character note limit applies when adding too, not only when editing */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('adding an item: the note limit', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `lim-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Lim ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `L${tag}`, name: 'Coca', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca', price: 6, recipeId: recipe.id, position: 0 } })).id;
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `lim-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a note over 140 characters is refused, as when editing', async () => {
    const res = await ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ menuItemId, quantity: 1, specialInstructions: 'x'.repeat(141) }) }), { params: { id: sid } });
    expect(res.status).toBe(400);
  });
});
