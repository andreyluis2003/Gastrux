// @ts-nocheck
/** Each line knows when the kitchen got it (spec 2026-10-07, 7); every kitchen order points to its comanda */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { PUT } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) => new NextRequest('http://x', { method, body: JSON.stringify(body) });

describe('kitchen state per line', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `sent-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Sent ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `S${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pratos', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Prato', price: 30, recipeId: recipe.id, position: 0 } })).id;
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN', serviceChargeEligible: true } })).id;
    const s = { user: { id: ownerId, email: `sent-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a send marks its lines and links its kitchen order; the next send takes only new lines', async () => {
    await ADD(req('POST', { menuItemId, quantity: 1, merge: true }), { params: { id: sid } });
    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    const [first] = await prisma.orderSessionItem.findMany({ where: { sessionId: sid } });
    expect(first.sentAt).not.toBeNull();

    // a tap after the send is a new line (never merged into the sent one)
    await ADD(req('POST', { menuItemId, quantity: 1, merge: true }), { params: { id: sid } });
    const lines = await prisma.orderSessionItem.findMany({ where: { sessionId: sid }, orderBy: { addedAt: 'asc' } });
    expect(lines.map((l) => [l.quantity, !!l.sentAt])).toEqual([[1, true], [1, false]]);

    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    const orders = await prisma.order.findMany({ where: { orderSessionId: sid }, include: { items: true } });
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.items.reduce((n, i) => n + i.quantity, 0))).toEqual([1, 1]);
  });

  it('a sent line keeps its note and modifiers (409)', async () => {
    const [sent] = await prisma.orderSessionItem.findMany({ where: { sessionId: sid, sentAt: { not: null } } });
    expect((await PUT(req('PUT', { specialInstructions: 'x' }), { params: { id: sid, itemId: sent.id } })).status).toBe(409);
  });
});
