// @ts-nocheck
/**
 * Races found by the final review of 2026-10-05:
 * - a sale committing while the shift is being closed went into the closed shift without being counted
 *   (no late flag, no alert, stored expected amount without it);
 * - two reopen/cancel requests of the same paid bill could both reverse its money.
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
import { PUT as updateComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { openSession, closeSession, ensureDefaultRegister } from '../../../lib/caixa/sessions';
import { resolveSaleShift, recordSaleEntries } from '../../../lib/caixa/sale';
import { settlePayments } from '../../../lib/caixa/rules';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash register races', () => {
  let A, B, reg, owner, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  const put = (id, body) => updateComanda(new Request(`http://x/api/comanda/sessions/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body),
  }) as any, { params: { id } });

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
  });

  it('a close waits for a sale already holding the shift, and counts it', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    let resolved: () => void; const saleHoldsShift = new Promise<void>((r) => { resolved = r; });
    let release: () => void; const gate = new Promise<void>((r) => { release = r; });

    const sale = prisma.$transaction(async (tx) => {
      const target = await resolveSaleShift(tx, { restaurantId: A.restaurantId, cashSessionId: session.id, replay: false, legacy: false });
      resolved();
      await gate;
      await recordSaleEntries(tx, { restaurantId: A.restaurantId, target, orderSessionId: `s-${tag}`, settled: settlePayments(3000, [{ method: 'dinheiro', amount: 30 }]), createdById: A.ownerId });
    }, { timeout: 20000 });

    await saleHoldsShift;
    const closing = closeSession(owner, session.id, { counted: { dinheiro: 30 } });
    await new Promise((r) => setTimeout(r, 400));
    release();
    const [, result] = await Promise.all([sale, closing]);

    expect(result.expected.dinheiro).toBe(3000);
    expect(result.difference.dinheiro).toBe(0);
  });

  it('two reopen requests of the same paid bill reverse its money once', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 8 } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity: 1 } });
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] })).status).toBe(200);

    const body = { status: 'OPEN', cashSessionId: session.id, reason: 'cliente pediu mais' };
    const statuses = (await Promise.all([put(s.id, body), put(s.id, body)])).map((r) => r.status).sort();

    expect(statuses).toEqual([200, 422]);
    expect(await prisma.cashSessionEntry.count({ where: { orderSessionId: s.id, type: 'REFUND' } })).toBe(1);
  });
});
