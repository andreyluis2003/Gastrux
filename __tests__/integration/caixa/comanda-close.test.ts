// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { PUT as updateComanda, DELETE as deleteComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { openSession, closeSession, ensureDefaultRegister } from '../../../lib/caixa/sessions';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('closing a comanda records the payments in the shift', () => {
  let A, B, reg, owner, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const put = (id, body, key?) => updateComanda(new Request(`http://x/api/comanda/sessions/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
  }) as any, { params: { id } });
  const comanda = async (lines: Array<[number, number, number?]>) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 3 } });
    for (const [price, qty, modifier] of lines) {
      const item = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price, quantity: qty } });
      if (modifier) {
        const m = await prisma.itemModifier.create({ data: { name: `Extra ${tag}`, priceAdjustment: modifier, restaurantId: A.restaurantId } });
        await prisma.orderSessionItemModifier.create({ data: { sessionItemId: item.id, modifierId: m.id, priceAdjustment: modifier } });
      }
    }
    return s;
  };
  const entriesOf = (orderSessionId) => prisma.cashSessionEntry.findMany({ where: { orderSessionId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    reg = await ensureDefaultRegister(A.restaurantId);
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });
  beforeEach(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    as(A.ownerId, A.restaurantId);
  });

  it('two methods with change: one receipt per method and one change line', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 2]]); // 60,00
    const res = await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }, { method: 'cartao de credito', amount: 20 }] });
    expect(res.status).toBe(200);
    const lines = (await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents]);
    expect(lines).toEqual(expect.arrayContaining([['RECEIPT', 'CASH', 5000], ['RECEIPT', 'CREDIT', 2000], ['CHANGE', 'CASH', 1000]]));
    expect(lines).toHaveLength(3);
  });

  it('total with quantities and modifiers matches the comanda total (Review Focus 5)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[10.33, 3, 0.5]]); // 3 x (10,33 + 0,50) = 32,49
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: '32.48' }] })).status).toBe(400);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: '32.49' }] })).status).toBe(200);
  });

  it('refused with 422 CASH_SESSION_REQUIRED when no shift is open; the comanda stays open', async () => {
    const s = await comanda([[30, 1]]);
    const res = await put(s.id, { status: 'CLOSED', payments: [{ method: 'pix', amount: 30 }] });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('OPEN');
  });

  it('an ONLINE sale against a shift closed meanwhile is refused (Review Focus 2)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    await closeSession(owner, session.id, { counted: {} });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] }, crypto.randomUUID())).status).toBe(422);
  });

  it('an OFFLINE replay lands late in the closed shift, recalculates and alerts', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    await closeSession(owner, session.id, { counted: {} });
    const s = await comanda([[30, 1]]);
    const res = await put(s.id, { status: 'CLOSED', cashSessionId: session.id, queuedAt: new Date().toISOString(), payments: [{ method: 'dinheiro', amount: 30 }] }, crypto.randomUUID());
    expect(res.status).toBe(200);
    const shift = await prisma.cashSession.findUnique({ where: { id: session.id } });
    expect(shift.lateEntries).toBe(1);
    expect(shift.expectedCents.dinheiro).toBe(3000);
    expect((await entriesOf(s.id))[0].afterClose).toBe(true);
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId, title: { contains: 'após o fechamento' } } })).toBe(1);
  });

  it('a replay with the same Idempotency-Key does not record twice', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    const key = crypto.randomUUID();
    const body = { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    await put(s.id, body, key);
    await put(s.id, body, key);
    expect(await entriesOf(s.id)).toHaveLength(1);
  });

  it('two different devices closing the same comanda: only one records (Review Focus 1)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    const body = { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    const results = await Promise.all([put(s.id, body, crypto.randomUUID()), put(s.id, body, crypto.randomUUID())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
    expect(await entriesOf(s.id)).toHaveLength(1);
  });

  it('paying a bill that is already closed (stale tab) says so instead of "closed" (browser check 2026-10-05)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    const body = { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    expect((await put(s.id, body)).status).toBe(200);
    const again = await put(s.id, body);
    expect(again.status).toBe(422);
    expect((await again.json()).code).toBe('ALREADY_CLOSED');
    expect(await entriesOf(s.id)).toHaveLength(1);
  });

  it('legacy body (single paymentMethod) records one receipt in the default register shift', async () => {
    await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', paymentMethod: 'cartao de debito' })).status).toBe(200);
    expect((await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents])).toEqual([['RECEIPT', 'DEBIT', 3000]]);
  });

  it('reopening a closed comanda reverses its receipts and change in the open shift', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }] });
    expect((await put(s.id, { status: 'OPEN', cashSessionId: session.id, reason: 'cliente pediu mais' })).status).toBe(200);
    const types = (await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents, e.direction]);
    expect(types).toEqual(expect.arrayContaining([['REFUND', 'CASH', 5000, null], ['ADJUSTMENT', 'CASH', 2000, 'IN']]));
  });

  it('cancelling a CLOSED paid comanda (DELETE) reverses its payments; without a shift id it is refused', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] });
    const del = (body) => deleteComanda(new Request(`http://x/api/comanda/sessions/${s.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any, { params: { id: s.id } });
    expect((await del({ reason: 'cliente desistiu' })).status).toBe(422);
    expect((await del({ reason: 'cliente desistiu', cashSessionId: session.id })).status).toBe(200);
    expect((await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents])).toEqual(expect.arrayContaining([['REFUND', 'PIX', 3000]]));
  });

  it('cancelling a comanda the kitchen is still working on is refused; once the kitchen is done it goes (2026-10-12)', async () => {
    const s = await comanda([[30, 1]]);
    const order = await prisma.order.create({ data: { restaurantId: A.restaurantId, orderNumber: `K-${tag}-${Date.now()}`, orderSessionId: s.id, status: 'PREPARING' } });
    const del = () => deleteComanda(new Request(`http://x/api/comanda/sessions/${s.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'mesa foi embora' }) }) as any, { params: { id: s.id } });
    const refused = await del();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ code: 'KITCHEN_OPEN' });
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('OPEN');
    await prisma.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
    expect((await del()).status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('CANCELLED');
    await prisma.order.delete({ where: { id: order.id } });
  });

  it('a closed bill is not reopened while its table has another open comanda (two bills on one table) (2026-10-12)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const sec = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Reab ${tag}`, capacity: 10 } });
    const table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 41, sectionId: sec.id, capacity: 4, qrToken: `reab-${tag}-0123456` } });
    const old = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableId: table.id, tableNumber: 41 } });
    await prisma.orderSessionItem.create({ data: { sessionId: old.id, recipeId: burger.id, price: 30, quantity: 1 } });
    await put(old.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'credito', amount: 30 }] });
    const next = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableId: table.id, tableNumber: 41 } });

    const refused = await put(old.id, { status: 'OPEN', cashSessionId: session.id, reason: 'lançado por engano' });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toMatch(/Mesa 41 já tem outra comanda aberta/);
    expect((await prisma.orderSession.findUnique({ where: { id: old.id } })).status).toBe('CLOSED');

    await prisma.orderSession.update({ where: { id: next.id }, data: { status: 'CANCELLED' } });
    expect((await put(old.id, { status: 'OPEN', cashSessionId: session.id, reason: 'lançado por engano' })).status).toBe(200);
    await prisma.orderSession.deleteMany({ where: { id: { in: [old.id, next.id] } } });
    await prisma.table.delete({ where: { id: table.id } });
    await prisma.tableSection.delete({ where: { id: sec.id } });
  });

  it('closing with payments answers the waiter call, so a reopened bill does not come back as "Chamou o garçom" (stage 4 review)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    await prisma.orderSession.update({ where: { id: s.id }, data: { payAtWaiterRequestedAt: new Date() } });
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'credito', amount: 30 }] })).status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).payAtWaiterRequestedAt).toBeNull();
    await prisma.orderSession.update({ where: { id: s.id }, data: { payAtWaiterRequestedAt: new Date() } }); // an old stamp left by earlier code
    expect((await put(s.id, { status: 'OPEN', cashSessionId: session.id, reason: 'faltou um item' })).status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).payAtWaiterRequestedAt).toBeNull();
  });

  it("another restaurant's shift is refused", async () => {
    const regB = await ensureDefaultRegister(B.restaurantId);
    const { session } = await openSession({ userId: B.ownerId, restaurantId: B.restaurantId, role: 'OWNER' }, { cashRegisterId: regB.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] })).status).toBe(422);
  });

  it('a legacy body replayed by an old device queue (Idempotency-Key) lands late in the last default shift (spec 6.1)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    await closeSession(owner, session.id, { counted: {} });
    const s = await comanda([[30, 1]]);
    const res = await put(s.id, { status: 'CLOSED', paymentMethod: 'pix' }, crypto.randomUUID());
    expect(res.status).toBe(200);
    const lines = await entriesOf(s.id);
    expect(lines.map((e) => [e.type, e.method, e.amountCents, e.afterClose])).toEqual([['RECEIPT', 'PIX', 3000, true]]);
    expect((await prisma.cashSession.findUnique({ where: { id: session.id } })).lateEntries).toBe(1);
  });

  it('closing the bill takes its ingredients out of stock (2026-10-13)', async () => {
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: A.restaurantId, name: `CC ${tag}` } });
    const bread = await prisma.ingredient.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, code: `CCB-${tag}`, name: 'Pão', standardUnit: 'un', purchaseUnit: 'un' } });
    await prisma.stock.create({ data: { restaurantId: A.restaurantId, ingredientId: bread.id, currentQuantity: 10 } });
    await prisma.recipeIngredient.create({ data: { recipeId: burger.id, ingredientId: bread.id, quantity: 1, unit: 'un' } });
    try {
      const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
      const s = await comanda([[30, 3]]);
      expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 90 }] })).status).toBe(200);
      expect((await prisma.stock.findFirst({ where: { ingredientId: bread.id } })).currentQuantity).toBe(7);
    } finally {
      await prisma.recipeIngredient.deleteMany({ where: { recipeId: burger.id } });
    }
  });
});
