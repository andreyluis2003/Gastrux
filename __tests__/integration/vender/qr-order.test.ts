// @ts-nocheck
/**
 * A customer's QR-code order (final review of tela Vender stage 1, 2026-10-07): it joins the table's
 * open comanda whatever its stage (it used to look only for OPEN and opened a second, hidden comanda
 * once the first had gone to the kitchen), and only takes items of the table's own restaurant.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { POST } from '../../../app/api/public/orders/[qrToken]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const order = (items: any[]) =>
  POST(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ items }) }), { params: { qrToken: `qr${tag}` } });

describe('QR-code order on a table', () => {
  let rid: string, otherRid: string, ownerId: string, tableId: string, ours: string, theirs: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `qr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `QR ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 3, sectionId: sec.id, capacity: 4, qrToken: `qr${tag}` } })).id;
    for (const [r, key] of [[rid, 'ours'], [otherRid, 'theirs']] as const) {
      const recipe = await prisma.recipe.create({ data: { restaurantId: r, code: `Q${key}${tag}`, name: `Prato ${key}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 20 } });
      const cat = await prisma.menuCategory.create({ data: { restaurantId: r, name: 'Pratos', position: 0, active: true } });
      const mi = await prisma.menuItem.create({ data: { restaurantId: r, categoryId: cat.id, name: `Prato ${key}`, price: 20, recipeId: recipe.id, position: 0 } });
      if (key === 'ours') ours = mi.id; else theirs = mi.id;
    }
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('joins the table comanda that already went to the kitchen instead of opening a second one', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'SENT_TO_KITCHEN', sentToKitchenAt: new Date() } });
    const res = await order([{ menuItemId: ours, quantity: 1 }]);
    expect(res.status).toBe(200);
    expect((await res.json()).sessionId).toBe(s.id);
    expect(await prisma.orderSession.count({ where: { tableId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).toBe(1);
  });

  it('refuses a menu item of another restaurant', async () => {
    const res = await order([{ menuItemId: theirs, quantity: 1 }]);
    expect(res.status).toBe(400);
  });
});
