// @ts-nocheck
/**
 * Encomendas (spec 2026-10-26 encomendas): a comanda with status ENCOMENDA and a pickup time. It stays off
 * the salão, takes a deposit without closing, keeps its status when sent to the kitchen, and becomes a sale
 * only when the customer picks it up.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as LIST, POST as CREATE } from '../../../app/api/encomendas/route';
import { POST as PICKUP } from '../../../app/api/encomendas/[id]/retirar/route';
import { GET as OPEN_SESSIONS } from '../../../app/api/comanda/sessions/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { itemSalesInRange } from '../../../lib/finance/item-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body?: any) =>
  new NextRequest('http://x', { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } });
const tomorrow = () => new Date(Date.now() + 24 * 3600_000).toISOString();

describe('encomendas', () => {
  let rid, otherRid, ownerId, cookId, shiftId, cakeItem, cakeRecipe, flour;
  const as = (userId, email) => {
    const session = { user: { id: userId, email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  };
  const asOwner = () => as(ownerId, `enc-${tag}@gastrux.test`);
  const create = async (body) => CREATE(req('POST', body));
  const newOrder = async (extra = {}) => {
    const res = await create({ customerName: 'Ana', customerPhone: '11988887777', pickupAt: tomorrow(), notes: 'Escrever Parabéns, Ana', ...extra });
    expect(res.status).toBe(201);
    return (await res.json()).id;
  };
  const addCake = (sid) => ADD(req('POST', { menuItemId: cakeItem.id, quantity: 1 }), { params: { id: sid } });
  const pay = (sid, amount) => PAY(req('POST', { payments: [{ method: 'PIX', amount }], cashSessionId: shiftId }), { params: { id: sid } });
  const statusOf = async (sid) => (await prisma.orderSession.findUnique({ where: { id: sid } })).status;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `enc-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    cookId = (await prisma.user.create({ data: { email: `enc-cook-${tag}@gastrux.test`, name: 'Bia', password: 'x', role: 'COOK' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Enc ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Enc2 ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    for (const [userId, role] of [[ownerId, 'OWNER'], [cookId, 'COOK']]) {
      await prisma.user.update({ where: { id: userId }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId, role, permissions: role === 'OWNER' ? ['ALL'] : [], acceptedAt: new Date() } });
    }
    const icat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Cat ${tag}` } });
    flour = await prisma.ingredient.create({ data: { restaurantId: rid, categoryId: icat.id, code: `FA-${tag}`, name: 'Farinha', standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 0, referenceCost: 5 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: flour.id, currentQuantity: 10 } });
    cakeRecipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `BO-${tag}`, name: 'Bolo de aniversário', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', ingredients: { create: [{ ingredientId: flour.id, quantity: 1, unit: 'kg' }] } } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bolos', position: 0, active: true } });
    cakeItem = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Bolo de aniversário', price: 120, recipeId: cakeRecipe.id } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    // Another restaurant's encomenda never shows here
    await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: ownerId, status: 'ENCOMENDA', customerName: 'Outra', pickupAt: new Date() } });
    asOwner();
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) {
      await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: id } } });
      try { await prisma.restaurant.delete({ where: { id } }); } catch {}
    }
    for (const id of [ownerId, cookId]) { try { await prisma.user.delete({ where: { id } }); } catch {} }
  });

  it('creates an encomenda with the customer, the pickup time and the note', async () => {
    const sid = await newOrder();
    const s = await prisma.orderSession.findUnique({ where: { id: sid }, include: { customer: true } });
    expect([s.status, s.restaurantId, s.customerName, s.notes, s.serviceChargeEligible, s.tableId]).toEqual(['ENCOMENDA', rid, 'Ana', 'Escrever Parabéns, Ana', false, null]);
    expect(s.pickupAt.getTime()).toBeGreaterThan(Date.now());
    // The phone puts the customer in the CRM (cashback)
    expect(s.customer?.name).toBe('Ana');
  });

  it('refuses no name, no or a bad pickup time, and a pickup in the past', async () => {
    for (const body of [{ pickupAt: tomorrow() }, { customerName: 'Ana' }, { customerName: 'Ana', pickupAt: 'amanhã' }, { customerName: 'Ana', pickupAt: new Date(Date.now() - 2 * 86400_000).toISOString() }]) {
      expect([JSON.stringify(body), (await create(body)).status]).toEqual([JSON.stringify(body), 400]);
    }
  });

  it('is for the counter: the kitchen cannot create one', async () => {
    as(cookId, `enc-cook-${tag}@gastrux.test`);
    try {
      expect((await create({ customerName: 'Ana', pickupAt: tomorrow() })).status).toBe(403);
    } finally { asOwner(); }
  });

  it('stays off the salão list of open comandas', async () => {
    const sid = await newOrder();
    const open = await (await OPEN_SESSIONS(req('GET'))).json();
    expect(open.map((s) => s.id)).not.toContain(sid);
  });

  it('takes a deposit and even a full payment without closing', async () => {
    const sid = await newOrder();
    expect((await addCake(sid)).status).toBe(201);
    expect((await pay(sid, '50.00')).status).toBe(200);
    expect(await statusOf(sid)).toBe('ENCOMENDA');
    expect((await pay(sid, '70.00')).status).toBe(200);
    expect(await statusOf(sid)).toBe('ENCOMENDA');
    expect(await prisma.cashSessionEntry.count({ where: { orderSessionId: sid } })).toBe(2);
  });

  it('keeps its status when sent to the kitchen', async () => {
    const sid = await newOrder();
    await addCake(sid);
    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    expect(await statusOf(sid)).toBe('ENCOMENDA');
  });

  it('lists the encomendas by pickup time with what was paid and what is left', async () => {
    const later = await newOrder({ customerName: 'Depois', pickupAt: new Date(Date.now() + 5 * 86400_000).toISOString() });
    const sooner = await newOrder({ customerName: 'Antes', pickupAt: new Date(Date.now() + 3600_000).toISOString() });
    await addCake(sooner);
    await pay(sooner, '30.00');
    const { encomendas } = await (await LIST(req('GET'))).json();
    expect(encomendas.every((e) => e.restaurantId === undefined)).toBe(true);
    expect(encomendas.some((e) => e.customerName === 'Outra')).toBe(false);
    const ids = encomendas.map((e) => e.id);
    expect(ids.indexOf(sooner)).toBeLessThan(ids.indexOf(later));
    const s = encomendas.find((e) => e.id === sooner);
    expect([s.customerName, s.totalCents, s.paidCents, s.remainingCents, s.items]).toEqual(['Antes', 12000, 3000, 9000, [{ name: 'Bolo de aniversário', quantity: 1, weightGrams: null }]]);
  });

  it('does not count as sold before the pickup', async () => {
    const sid = await newOrder();
    await addCake(sid);
    const sold = (await itemSalesInRange(rid, new Date(Date.now() - 3600_000), new Date(Date.now() + 60_000))).find((i) => i.recipeId === cakeRecipe.id);
    expect(sold?.quantity ?? 0).toBe(0);
  });

  it('pickup with money left: becomes an open comanda counted from now', async () => {
    const sid = await newOrder();
    await addCake(sid);
    await prisma.orderSessionItem.updateMany({ where: { sessionId: sid }, data: { addedAt: new Date(Date.now() - 3 * 86400_000) } });
    await pay(sid, '20.00');
    const res = await PICKUP(req('POST'), { params: { id: sid } });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('OPEN');
    expect(await statusOf(sid)).toBe('OPEN');
    const [line] = await prisma.orderSessionItem.findMany({ where: { sessionId: sid } });
    expect(Date.now() - line.addedAt.getTime()).toBeLessThan(60_000);
    // Twice is refused: it is not an encomenda any more
    expect((await PICKUP(req('POST'), { params: { id: sid } })).status).toBe(409);
  });

  it('pickup of a paid encomenda closes the sale and takes the stock', async () => {
    const sid = await newOrder();
    await addCake(sid);
    await pay(sid, '120.00');
    const before = Number((await prisma.stock.findFirst({ where: { ingredientId: flour.id } })).currentQuantity);
    const res = await PICKUP(req('POST'), { params: { id: sid } });
    expect((await res.json()).status).toBe('CLOSED');
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    expect([s.status, !!s.closedAt]).toEqual(['CLOSED', true]);
    const after = Number((await prisma.stock.findFirst({ where: { ingredientId: flour.id } })).currentQuantity);
    expect(after).toBeCloseTo(before - 1);
  });

  it('an empty encomenda cannot be picked up; another restaurant\'s is not found', async () => {
    const sid = await newOrder();
    expect((await PICKUP(req('POST'), { params: { id: sid } })).status).toBe(400);
    const theirs = await prisma.orderSession.findFirst({ where: { restaurantId: otherRid, status: 'ENCOMENDA' } });
    expect((await PICKUP(req('POST'), { params: { id: theirs.id } })).status).toBe(404);
  });
});
