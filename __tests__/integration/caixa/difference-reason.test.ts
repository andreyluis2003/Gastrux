// @ts-nocheck
/**
 * Caixa: a close with a difference asks its reason (2026-10-13: the blind close showed the difference and
 * nobody had to explain it). The reason is written once on the closed shift, by who closed it or a manager.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { openSession, closeSession, ensureDefaultRegister, setDifferenceReason } from '../../../lib/caixa/sessions';
import { CashRuleError } from '../../../lib/caixa/rules';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('reason of a cash difference', () => {
  let A, register, cashier, cashier2, owner;
  const tag = crypto.randomBytes(3).toString('hex');
  const users: string[] = [];

  beforeAll(async () => {
    A = (await createMultiRestaurantScenario()).restaurantA;
    register = await ensureDefaultRegister(A.restaurantId);
    const mkUser = async (role, n) => {
      const u = await prisma.user.create({ data: { email: `${role}${n}-${tag}@caixa.test`, name: role, password: 'x', role, active: true } });
      users.push(u.id);
      await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role, isActive: true } });
      return { userId: u.id, restaurantId: A.restaurantId, role };
    };
    cashier = await mkUser('CASHIER', 1);
    cashier2 = await mkUser('CASHIER', 2);
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
  });
  afterAll(async () => {
    const ids = [A.restaurantId];
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
  });

  const closedShortBy20 = async (notes?) => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    await closeSession(cashier, session.id, { counted: { dinheiro: '80' }, notes });
    return session.id;
  };
  const rule = async (p) => { try { await p; } catch (e) { return e instanceof CashRuleError ? e.status : e; } return 'ok'; };

  it('who closed writes the reason; it joins the notes and the audit', async () => {
    const id = await closedShortBy20('troco conferido');
    await setDifferenceReason(cashier, id, '  Troco dado a mais na mesa 4  ');
    const s = await prisma.cashSession.findUnique({ where: { id } });
    expect(s.closingNotes).toBe('troco conferido\nMotivo da diferença: Troco dado a mais na mesa 4');
    expect(await prisma.auditLog.count({ where: { restaurantId: A.restaurantId, entityId: id, action: 'UPDATE' } })).toBe(1);
  });

  it('only once: a second reason is refused (409)', async () => {
    const id = await closedShortBy20();
    await setDifferenceReason(cashier, id, 'Troco errado');
    expect(await rule(setDifferenceReason(owner, id, 'Outra coisa'))).toBe(409);
    expect((await prisma.cashSession.findUnique({ where: { id } })).closingNotes).toBe('Motivo da diferença: Troco errado');
  });

  it('another cashier cannot write it (403); a manager can', async () => {
    const id = await closedShortBy20();
    expect(await rule(setDifferenceReason(cashier2, id, 'Troco errado'))).toBe(403);
    expect(await rule(setDifferenceReason(owner, id, 'Conferido com o caixa'))).toBe('ok');
  });

  it('refused on an open shift, on a shift without difference, and when too short (422/409)', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 0 });
    expect(await rule(setDifferenceReason(cashier, session.id, 'Troco errado'))).toBe(409);
    await closeSession(cashier, session.id, { counted: { dinheiro: '0' } });
    expect(await rule(setDifferenceReason(cashier, session.id, 'Troco errado'))).toBe(409);
    const id = await closedShortBy20();
    expect(await rule(setDifferenceReason(cashier, id, 'ab'))).toBe(422);
  });
});
