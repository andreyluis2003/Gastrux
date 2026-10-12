// @ts-nocheck
/**
 * A line the kitchen has, removed or reduced on the comanda, leaves the kitchen too (prod 2026-10-12: the
 * removed item stayed on the KDS, so "Cancelar comanda" stayed blocked until someone completed it there).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT as putLine, DELETE as deleteLine } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';
import { DELETE as cancelComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { sendSessionToKitchen } from '../../../lib/kds/send-session';
import { changeOrderStatus } from '../../../lib/kds/order-status';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) => new NextRequest('http://x', { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } });

describe('a line the kitchen has leaves the kitchen when it leaves the comanda', () => {
  let rid: string, ownerId: string, burger, salad, cheese;

  const comanda = async (lines: Array<[any, number]>) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN', tableNumber: 9 } });
    const ids = [];
    for (const [recipe, quantity] of lines) ids.push((await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 10, quantity } })).id);
    await sendSessionToKitchen(rid, s.id);
    return { s, ids };
  };
  const kitchen = (sessionId: string) => prisma.order.findMany({ where: { orderSessionId: sessionId }, include: { items: true } });
  const remove = (sid: string, iid: string) => deleteLine(req('DELETE', { reason: 'cliente desistiu' }), { params: { id: sid, itemId: iid } });

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `kw-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `KW ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Cat ${tag}` } });
    cheese = await prisma.ingredient.create({ data: { restaurantId: rid, code: `I${tag}`, name: 'Queijo', categoryId: cat.id, standardUnit: 'g', purchaseUnit: 'kg', referenceCost: 0.05 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: cheese.id, currentQuantity: 1000 } }).catch(() => null);
    burger = await prisma.recipe.create({ data: { restaurantId: rid, code: `B${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    salad = await prisma.recipe.create({ data: { restaurantId: rid, code: `S${tag}`, name: 'Salada', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    await prisma.recipeIngredient.create({ data: { recipeId: burger.id, ingredientId: cheese.id, quantity: 20, unit: 'g' } });
    const session = { user: { id: ownerId, email: `kw-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('removing one of two sent lines cancels its kitchen item; the order goes on with the other', async () => {
    const { s, ids } = await comanda([[burger, 1], [salad, 1]]);
    expect((await remove(s.id, ids[0])).status).toBe(200);
    const [order] = await kitchen(s.id);
    expect(order.status).toBe('PENDING');
    expect(order.items.map((i) => [i.recipeId === burger.id ? 'burger' : 'salad', i.status]).sort()).toEqual([['burger', 'CANCELLED'], ['salad', 'PENDING']]);
  });

  it('removing the last line cancels the kitchen order, so the comanda can be cancelled', async () => {
    const { s, ids } = await comanda([[salad, 1]]);
    expect((await remove(s.id, ids[0])).status).toBe(200);
    expect((await kitchen(s.id))[0].status).toBe('CANCELLED');
    const res = await cancelComanda(req('DELETE', { reason: 'mesa foi embora' }), { params: { id: s.id } });
    expect(res.status).toBe(200);
  });

  it('a line removed after the kitchen started is recorded as a loss of its ingredients', async () => {
    const { s, ids } = await comanda([[burger, 2], [salad, 1]]);
    const [order] = await kitchen(s.id);
    await changeOrderStatus(rid, order.id, 'PREPARING');
    expect((await remove(s.id, ids[0])).status).toBe(200);
    const waste = await prisma.wasteLog.findMany({ where: { restaurantId: rid, ingredientId: cheese.id } });
    expect(waste.map((w) => Number(w.quantity))).toEqual([40]);
    expect((await kitchen(s.id))[0].status).toBe('PREPARING');
    await prisma.wasteLog.deleteMany({ where: { restaurantId: rid } });
  });

  it('reducing a sent line takes the difference out of the kitchen item', async () => {
    const { s, ids } = await comanda([[burger, 3]]);
    expect((await putLine(req('PUT', { quantity: 1, reason: 'errou a quantidade' }), { params: { id: s.id, itemId: ids[0] } })).status).toBe(200);
    const [order] = await kitchen(s.id);
    expect(order.status).toBe('PENDING');
    expect(order.items.map((i) => [i.quantity, i.status])).toEqual([[1, 'PENDING']]);
  });

  it('completing an order leaves out the stock of a cancelled item', async () => {
    const { s, ids } = await comanda([[burger, 1], [salad, 1]]);
    await remove(s.id, ids[0]);
    const [order] = await kitchen(s.id);
    for (const st of ['PREPARING', 'READY', 'COMPLETED']) await changeOrderStatus(rid, order.id, st);
    const moves = await prisma.stockMovement.findMany({ where: { restaurantId: rid, referenceId: order.id, ingredientId: cheese.id } });
    expect(moves).toHaveLength(0);
  });
});
