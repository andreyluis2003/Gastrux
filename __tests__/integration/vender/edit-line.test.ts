// @ts-nocheck
/**
 * Editing a comanda line (spec 2026-10-07, 4.2): a new line takes quantity, note and modifiers; a
 * line the kitchen already has keeps its modifiers and note.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const put = (sid: string, iid: string, body: any) =>
  PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } }), { params: { id: sid, itemId: iid } });

describe('editing a comanda line', () => {
  let rid: string, otherRid: string, ownerId: string, sid: string, newLine: string, sentLine: string, bacon: string, foreign: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `linha-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Linha ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `L${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    bacon = (await prisma.itemModifier.create({ data: { restaurantId: rid, name: 'Bacon', priceAdjustment: 4 } })).id;
    foreign = (await prisma.itemModifier.create({ data: { restaurantId: otherRid, name: 'Alheio', priceAdjustment: 1 } })).id;
    const sent = new Date(Date.now() - 5 * 60_000);
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'SENT_TO_KITCHEN', sentToKitchenAt: sent } })).id;
    sentLine = (await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 30, quantity: 1, addedAt: new Date(sent.getTime() - 60_000) } })).id;
    newLine = (await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 30, quantity: 1, addedAt: new Date() } })).id;
    const session = { user: { id: ownerId, email: `linha-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a new line takes quantity, note and modifiers (price from the modifier record)', async () => {
    const res = await put(sid, newLine, { quantity: 2, specialInstructions: 'sem cebola', modifierIds: [bacon] });
    expect(res.status).toBe(200);
    const line = await prisma.orderSessionItem.findUnique({ where: { id: newLine }, include: { modifiers: true } });
    expect(line).toMatchObject({ quantity: 2, specialInstructions: 'sem cebola' });
    expect(line.modifiers.map((m) => [m.modifierId, Number(m.priceAdjustment)])).toEqual([[bacon, 4]]);

    expect((await put(sid, newLine, { modifierIds: [] })).status).toBe(200);
    expect(await prisma.orderSessionItemModifier.count({ where: { sessionItemId: newLine } })).toBe(0);
  });

  it('a line the kitchen has: modifiers and note are refused', async () => {
    expect((await put(sid, sentLine, { modifierIds: [bacon] })).status).toBe(409);
    expect((await put(sid, sentLine, { specialInstructions: 'x' })).status).toBe(409);
  });

  it('another restaurant\'s modifier is not found; a note over 140 characters is refused', async () => {
    expect((await put(sid, newLine, { modifierIds: [foreign] })).status).toBe(404);
    expect((await put(sid, newLine, { specialInstructions: 'x'.repeat(141) })).status).toBe(400);
  });
});
