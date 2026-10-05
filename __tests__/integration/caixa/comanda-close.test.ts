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

  it('refused with 409 CASH_SESSION_REQUIRED when no shift is open; the comanda stays open', async () => {
    const s = await comanda([[30, 1]]);
    const res = await put(s.id, { status: 'CLOSED', payments: [{ method: 'pix', amount: 30 }] });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('OPEN');
  });

  it('an ONLINE sale against a shift closed meanwhile is refused (Review Focus 2)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    await closeSession(owner, session.id, { counted: {} });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] }, crypto.randomUUID())).status).toBe(409);
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
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
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
    expect((await del({ reason: 'cliente desistiu' })).status).toBe(409);
    expect((await del({ reason: 'cliente desistiu', cashSessionId: session.id })).status).toBe(200);
    expect((await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents])).toEqual(expect.arrayContaining([['REFUND', 'PIX', 3000]]));
  });

  it("another restaurant's shift is refused", async () => {
    const regB = await ensureDefaultRegister(B.restaurantId);
    const { session } = await openSession({ userId: B.ownerId, restaurantId: B.restaurantId, role: 'OWNER' }, { cashRegisterId: regB.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] })).status).toBe(409);
  });
});
