// __tests__/integration/caixa/sessions.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { openSession, addEntry, closeSession, getSessionView, ensureDefaultRegister, listSessions } from '../../../lib/caixa/sessions';
import { CashRuleError } from '../../../lib/caixa/rules';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash shift service', () => {
  let A, B, register, cashier, owner, cashierB;
  const tag = crypto.randomBytes(3).toString('hex');
  const users: string[] = [];

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    register = await ensureDefaultRegister(A.restaurantId);
    const mkUser = async (restaurantId, role) => {
      const u = await prisma.user.create({ data: { email: `${role}-${tag}-${restaurantId.slice(-4)}@caixa.test`, name: role, password: 'x', role, active: true } });
      users.push(u.id);
      await prisma.restaurantUser.create({ data: { restaurantId, userId: u.id, role, isActive: true } });
      return { userId: u.id, restaurantId, role };
    };
    cashier = await mkUser(A.restaurantId, 'CASHIER');
    cashierB = await mkUser(B.restaurantId, 'CASHIER');
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
  });

  it('ensureDefaultRegister is idempotent and creates "Caixa principal"', async () => {
    const again = await ensureDefaultRegister(A.restaurantId);
    expect(again.id).toBe(register.id);
    expect(again.name).toBe('Caixa principal');
  });

  it('opens one shift; a second open returns the existing one (alreadyOpen)', async () => {
    const [a, b] = await Promise.all([
      openSession(cashier, { cashRegisterId: register.id, openingFloat: '100' }),
      openSession(owner, { cashRegisterId: register.id, openingFloat: 50 }),
    ]);
    expect([a.alreadyOpen, b.alreadyOpen].sort()).toEqual([false, true]);
    expect(a.session.id).toBe(b.session.id);
    expect(await prisma.cashSession.count({ where: { cashRegisterId: register.id, status: 'OPEN' } })).toBe(1);
  });

  it("another restaurant's register is not found", async () => {
    await expect(openSession(cashierB, { cashRegisterId: register.id, openingFloat: 0 })).rejects.toMatchObject({ status: 404 });
  });

  it('sangria and suprimento by a cashier; expense and adjustment only for a manager', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    await addEntry(cashier, session.id, { type: 'SUPPLY', amount: 50, description: 'troco' });
    await addEntry(cashier, session.id, { type: 'WITHDRAWAL', amount: 30, description: 'depósito' });
    await expect(addEntry(cashier, session.id, { type: 'EXPENSE', amount: 10, category: 'compras' })).rejects.toMatchObject({ status: 403 });
    await addEntry(owner, session.id, { type: 'EXPENSE', amount: 10, category: 'compras', description: 'temperos' });
    await expect(addEntry(owner, session.id, { type: 'EXPENSE', amount: 10, category: 'luz' })).rejects.toThrow(CashRuleError);
    const view = await getSessionView(owner, session.id);
    expect(view.expected.dinheiro).toBe(10000 + 5000 - 3000 - 1000);
  });

  it('a cashier cannot take out more cash than expected; a manager can with force', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 10 });
    await expect(addEntry(cashier, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'x' })).rejects.toMatchObject({ status: 409 });
    await expect(addEntry(owner, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'x' })).rejects.toMatchObject({ status: 409 });
    const { entry } = await addEntry(owner, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'cofre', force: true });
    expect(entry.amountCents).toBe(2000);
    expect(await prisma.auditLog.count({ where: { restaurantId: A.restaurantId, entityId: entry.id } })).toBe(1);
  });

  it('blind close: the cashier view hides expected while open; close returns expected, difference and alerts over the limit', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    const open = await getSessionView(cashier, session.id);
    expect(open.expected).toBeNull();
    const result = await closeSession(cashier, session.id, { counted: { dinheiro: '70', pix: 0 }, notes: 'faltou' });
    expect(result.expected.dinheiro).toBe(10000);
    expect(result.difference.dinheiro).toBe(-3000);
    expect(result.alertMethods).toEqual(['CASH']);
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    const closedView = await getSessionView(cashier, session.id);
    expect(closedView.expected.dinheiro).toBe(10000);
  });

  it('a second close returns the stored result without changing it', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 0 });
    await closeSession(cashier, session.id, { counted: { dinheiro: 0 } });
    const again = await closeSession(owner, session.id, { counted: { dinheiro: 999 } });
    expect(again.alreadyClosed).toBe(true);
    expect(again.counted.dinheiro).toBe(0);
  });

  it('entries on a closed shift: only a manager adjustment, which recalculates the difference', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    await closeSession(cashier, session.id, { counted: { dinheiro: 90 } });
    await expect(addEntry(cashier, session.id, { type: 'SUPPLY', amount: 5, description: 'x' })).rejects.toMatchObject({ status: 409 });
    await expect(addEntry(owner, session.id, { type: 'ADJUSTMENT', amount: 10, method: 'dinheiro', description: 'nota achada' })).rejects.toThrow(/direção/);
    await addEntry(owner, session.id, { type: 'ADJUSTMENT', amount: 10, method: 'dinheiro', direction: 'OUT', description: 'pago motoboy sem registro' });
    const s = await prisma.cashSession.findUnique({ where: { id: session.id } });
    expect(s.differenceCents.dinheiro).toBe(0);
  });

  it('history lists closed shifts with sales and difference, scoped to the restaurant', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 0 });
    await closeSession(cashier, session.id, { counted: {} });
    const list = await listSessions(A.restaurantId, {});
    expect(list.map((r) => r.id)).toContain(session.id);
    expect(await listSessions(B.restaurantId, {})).toEqual([]);
  });
});
