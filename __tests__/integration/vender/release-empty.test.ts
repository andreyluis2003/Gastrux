// @ts-nocheck
/** A comanda opened by a tap and left with nothing on it frees its table (owner, 2026-10-12): no manager, no reason */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as release } from '../../../app/api/comanda/sessions/[id]/release/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('releasing an empty comanda', () => {
  let A, B, waiter, burger, table;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const post = (id) => release(new Request(`http://x/api/comanda/sessions/${id}/release`, { method: 'POST' }) as any, { params: { id } });
  const comanda = (data = {}) =>
    prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableId: table.id, tableNumber: table.number, ...data } });
  const statusOf = async (id) => (await prisma.orderSession.findUnique({ where: { id } })).status;

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `garcom-${tag}@x.test`, name: 'Garçom', password: 'x', role: 'CASHIER', active: true } });
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
    waiter = u.id;
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const sec = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Salão ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 7, sectionId: sec.id, capacity: 4, qrToken: `r${tag}` } });
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: waiter } });
    await prisma.user.deleteMany({ where: { id: waiter } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(() => as(waiter, A.restaurantId));

  it('a staff member (not a manager) frees the table of an empty comanda, and it leaves a trace', async () => {
    const s = await comanda();
    const res = await post(s.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ released: true });
    expect(await statusOf(s.id)).toBe('CANCELLED');
    expect(await prisma.auditLog.count({ where: { entityId: s.id } })).toBe(1);
  });

  it('a comanda with an item stays open', async () => {
    const s = await comanda();
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity: 1 } });
    expect(await (await post(s.id)).json()).toEqual({ released: false });
    expect(await statusOf(s.id)).toBe('OPEN');
    await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'CLOSED' } });
  });

  it('a comanda with an online payment (even a pending PIX) stays open', async () => {
    const s = await comanda();
    await prisma.payment.create({ data: { restaurantId: A.restaurantId, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING', method: 'PIX', amount: 1, orderSessionId: s.id } });
    expect(await (await post(s.id)).json()).toEqual({ released: false });
    expect(await statusOf(s.id)).toBe('OPEN');
    await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'CLOSED' } });
  });

  it('a comanda with money in the cash shift stays open', async () => {
    const s = await comanda({ tableId: null });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: `Caixa ${tag}` } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: A.ownerId, openingFloatCents: 0 } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: A.restaurantId, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 100, orderSessionId: s.id, createdById: A.ownerId } });
    expect(await (await post(s.id)).json()).toEqual({ released: false });
    await prisma.cashSessionEntry.deleteMany({ where: { cashSessionId: shift.id } });
    await prisma.cashSession.delete({ where: { id: shift.id } });
    await prisma.cashRegister.delete({ where: { id: reg.id } });
    await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'CLOSED' } });
  });

  it('a closed comanda is not touched', async () => {
    const s = await comanda({ status: 'CLOSED' });
    expect(await (await post(s.id)).json()).toEqual({ released: false });
    expect(await statusOf(s.id)).toBe('CLOSED');
  });

  it('another restaurant cannot release it', async () => {
    const s = await comanda();
    as(B.ownerId, B.restaurantId);
    expect((await post(s.id)).status).toBe(404);
    expect(await statusOf(s.id)).toBe('OPEN');
    await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'CLOSED' } });
  });
});
