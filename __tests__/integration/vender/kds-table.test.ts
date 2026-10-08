// @ts-nocheck
/** Every kitchen order of a comanda shows its table, also after the table changes (spec 2026-10-07, 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as KDS } from '../../../app/api/kds/orders/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { buildKitchenTicket } from '../../../lib/print/tickets';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) => new NextRequest('http://x', { method, body: JSON.stringify(body) });

describe('KDS table label', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string, t9: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `kds-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Kds ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `K${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pratos', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Prato', price: 30, recipeId: recipe.id, position: 0 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    const t5 = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `k5${tag}` } })).id;
    t9 = (await prisma.table.create({ data: { restaurantId: rid, number: 9, sectionId: sec.id, capacity: 4, qrToken: `k9${tag}` } })).id;
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t5, tableNumber: 5, status: 'OPEN', serviceChargeEligible: true } })).id;
    const s = { user: { id: ownerId, email: `kds-${tag}@gastrux.test`, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('two sends, then the comanda moves to table 9: both kitchen cards and tickets say table 9', async () => {
    await ADD(req('POST', { menuItemId, quantity: 1 }), { params: { id: sid } });
    await SEND(req('POST', {}), { params: { id: sid } });
    await ADD(req('POST', { menuItemId, quantity: 1 }), { params: { id: sid } });
    await SEND(req('POST', {}), { params: { id: sid } });
    await prisma.orderSession.update({ where: { id: sid }, data: { tableId: t9, tableNumber: 9 } });
    const body = await (await KDS(new NextRequest('http://x/api/kds/orders'))).json();
    const mine = (body.orders ?? body).filter((o) => o.restaurantId === rid);
    expect(mine).toHaveLength(2);
    expect(mine.map((o) => o.orderSession?.table?.number ?? o.orderSession?.tableNumber)).toEqual([9, 9]);
    const tickets = await Promise.all(mine.map((o) => buildKitchenTicket(rid, o.id)));
    expect(tickets.every((t) => JSON.stringify(t).includes('9'))).toBe(true);
  });
});
