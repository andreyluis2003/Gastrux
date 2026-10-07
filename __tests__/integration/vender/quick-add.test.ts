// @ts-nocheck
/**
 * One-tap adds are merged on the server (final review of tela Vender stage 1, 2026-10-07): quick taps
 * from one or several devices never lose a unit nor create duplicate lines; undo is the inverse of one
 * tap; a closed comanda cannot be changed; lines come back in the order they were added.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { PUT, DELETE } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';
import { GET as GET_SESSION } from '../../../app/api/comanda/sessions/[id]/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) =>
  new NextRequest('http://x', { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } });

describe('one-tap adds and undo on the server', () => {
  let rid: string, ownerId: string, menuItemId: string, recipeId: string, bacon: string;
  const lines = (sid: string) => prisma.orderSessionItem.findMany({ where: { sessionId: sid }, include: { modifiers: true }, orderBy: { addedAt: 'asc' } });
  const tap = (sid: string, extra: any = {}) => ADD(req('POST', { menuItemId, quantity: 1, merge: true, ...extra }), { params: { id: sid } });
  const newSession = async () => (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN' } })).id;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `toque-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Toque ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `T${tag}`, name: 'Coca', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca', price: 6, recipeId, position: 0 } })).id;
    bacon = (await prisma.itemModifier.create({ data: { restaurantId: rid, name: 'Gelo e limão', priceAdjustment: 0 } })).id;
    const session = { user: { id: ownerId, email: `toque-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('five taps at once on a new comanda: one line with 5, no unit lost', async () => {
    const sid = await newSession();
    const res = await Promise.all([1, 2, 3, 4, 5].map(() => tap(sid)));
    expect(res.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    const ls = await lines(sid);
    expect(ls.map((l) => l.quantity)).toEqual([5]);
  });

  it('a tap after the kitchen got the line starts a new line; a tap with a modifier or a note never merges', async () => {
    const sid = await newSession();
    await tap(sid);
    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    await tap(sid);
    await tap(sid, { modifierIds: [bacon] });
    await tap(sid, { specialInstructions: 'sem gelo' });
    await tap(sid);
    expect((await lines(sid)).map((l) => l.quantity)).toEqual([1, 2, 1, 1]);
  });

  it('sending to the kitchen while taps arrive: every unit reaches the kitchen or stays new', async () => {
    const sid = await newSession();
    await tap(sid);
    await Promise.all([SEND(req('POST', {}), { params: { id: sid } }), tap(sid), tap(sid)]);
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    const ls = await lines(sid);
    const sentUnits = ls.filter((l) => s.sentToKitchenAt && l.addedAt <= s.sentToKitchenAt).reduce((n, l) => n + l.quantity, 0);
    const kitchenUnits = (await prisma.orderItem.findMany({ where: { order: { restaurantId: rid, orderSession: { id: sid } } } })).reduce((n, i) => n + i.quantity, 0);
    expect(ls.reduce((n, l) => n + l.quantity, 0)).toBe(3);
    expect(kitchenUnits).toBe(sentUnits);
  });

  it('undo is one tap back: 3 -> 2 -> 1 -> line removed; a line the kitchen has is refused', async () => {
    const sid = await newSession();
    await tap(sid); await tap(sid); await tap(sid);
    const [line] = await lines(sid);
    const undo = () => PUT(req('PUT', { quantityDelta: -1 }), { params: { id: sid, itemId: line.id } });
    expect((await undo()).status).toBe(200);
    expect((await undo()).status).toBe(200);
    expect((await lines(sid)).map((l) => l.quantity)).toEqual([1]);
    const last = await undo();
    expect(last.status).toBe(200);
    expect((await last.json()).deleted).toBe(true);
    expect(await lines(sid)).toEqual([]);

    await tap(sid);
    const [sentLine] = await lines(sid);
    await SEND(req('POST', {}), { params: { id: sid } });
    expect((await PUT(req('PUT', { quantityDelta: -1 }), { params: { id: sid, itemId: sentLine.id } })).status).toBe(409);
  });

  it('a closed comanda cannot be changed by a stale screen', async () => {
    const sid = await newSession();
    await tap(sid);
    const [line] = await lines(sid);
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED', closedAt: new Date() } });
    expect((await PUT(req('PUT', { quantity: 5 }), { params: { id: sid, itemId: line.id } })).status).toBe(409);
    expect((await PUT(req('PUT', { quantityDelta: -1 }), { params: { id: sid, itemId: line.id } })).status).toBe(409);
    expect((await DELETE(req('DELETE', {}), { params: { id: sid, itemId: line.id } })).status).toBe(409);
    expect((await lines(sid)).map((l) => l.quantity)).toEqual([1]);
  });

  it('lines come back in the order they were added, even after edits', async () => {
    const sid = await newSession();
    await tap(sid, { specialInstructions: 'primeiro' });
    await tap(sid, { specialInstructions: 'segundo' });
    await tap(sid, { specialInstructions: 'terceiro' });
    const [first] = await lines(sid);
    await PUT(req('PUT', { quantity: 4 }), { params: { id: sid, itemId: first.id } });
    const body = await (await GET_SESSION(new NextRequest('http://x'), { params: { id: sid } })).json();
    expect(body.items.map((i) => i.specialInstructions)).toEqual(['primeiro', 'segundo', 'terceiro']);
  });
});
