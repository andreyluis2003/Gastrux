// @ts-nocheck
/**
 * Counter sale (POST /api/comanda/quick-sale) with the cash register (spec §6.2): the payments and the
 * change enter the shift; without an open shift the whole sale is refused; a replay records once.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as quickSale } from '../../../app/api/comanda/quick-sale/route';
import { openSession, ensureDefaultRegister } from '../../../lib/caixa/sessions';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('counter sale records its payments in the shift', () => {
  let A, B, reg, owner, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  const sale = (body, key = crypto.randomUUID()) => quickSale(new Request('http://x/api/comanda/quick-sale', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
  }) as any);
  const linesOf = (orderSessionId) => prisma.cashSessionEntry.findMany({ where: { orderSessionId } });
  const item = () => ({ recipeId: burger.id, quantity: 1 });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    reg = await ensureDefaultRegister(A.restaurantId);
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: A.ownerId, email: `${A.ownerId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(A.restaurantId);
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });
  beforeEach(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
  });

  it('records the cash handed over and the change', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    const res = await sale({ clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }] });
    expect(res.status).toBe(201);
    expect((await res.json()).changeCents).toBe(2000);
    expect((await linesOf(clientId)).map((l) => [l.type, l.amountCents]).sort()).toEqual([['CHANGE', 2000], ['RECEIPT', 5000]]);
    expect((await prisma.orderSession.findUnique({ where: { id: clientId } })).status).toBe('CLOSED');
  });

  it('refuses the whole sale without an open shift (no comanda left behind)', async () => {
    const clientId = `bal-${crypto.randomUUID()}`;
    const res = await sale({ clientId, items: [item()], payments: [{ method: 'pix', amount: 30 }] });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
    expect(await prisma.orderSession.findUnique({ where: { id: clientId } })).toBeNull();
  });

  it('refuses payments that do not cover the total, leaving nothing behind', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    expect((await sale({ clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'pix', amount: 29 }] })).status).toBe(400);
    expect(await prisma.orderSession.findUnique({ where: { id: clientId } })).toBeNull();
  });

  it('the same clientId sent again records once', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    const body = { clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    await sale(body);
    const again = await (await sale(body)).json();
    expect(again.alreadyRecorded).toBe(true);
    expect(await linesOf(clientId)).toHaveLength(1);
  });

  it('legacy body (single paymentMethod) uses the default register shift', async () => {
    await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    expect((await sale({ clientId, items: [item()], paymentMethod: 'pix' })).status).toBe(201);
    expect((await linesOf(clientId)).map((l) => [l.type, l.method, l.amountCents])).toEqual([['RECEIPT', 'PIX', 3000]]);
  });

  it('a counter sale interrupted after its payments were recorded is closed by the replay, never left open', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    await prisma.orderSession.create({ data: { id: clientId, restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', customerName: 'Balcão' } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: A.restaurantId, cashSessionId: session.id, type: 'RECEIPT', method: 'PIX', amountCents: 3000, orderSessionId: clientId, createdById: A.ownerId } });
    const res = await sale({ clientId, items: [item()], cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] });
    expect((await res.json()).alreadyRecorded).toBe(true);
    expect((await prisma.orderSession.findUnique({ where: { id: clientId } })).status).toBe('CLOSED');
    expect(await linesOf(clientId)).toHaveLength(1);
  });
});
