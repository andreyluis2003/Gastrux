// @ts-nocheck
/**
 * Cash register shifts (docs/superpowers/specs/2026-10-04-caixa-turnos-design.md §4): a register has
 * at most one OPEN shift (partial unique index), and ledger lines are stored in cents.
 */
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash sessions schema', () => {
  let A: any;
  let B: any;
  let register: any;
  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA;
    B = s.restaurantB;
    register = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: 'Caixa teste', isDefault: true } });
  });
  afterAll(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  it('allows only one OPEN shift per register (partial unique index)', async () => {
    const base = { restaurantId: A.restaurantId, cashRegisterId: register.id, openedById: A.ownerId, openingFloatCents: 0 };
    const first = await prisma.cashSession.create({ data: { ...base, status: 'OPEN' } });
    await expect(prisma.cashSession.create({ data: { ...base, status: 'OPEN' } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.cashSession.update({ where: { id: first.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await expect(prisma.cashSession.create({ data: { ...base, status: 'OPEN' } })).resolves.toBeTruthy();
  });

  it('stores ledger lines in cents with method and direction', async () => {
    const session = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' } });
    const entry = await prisma.cashSessionEntry.create({
      data: { restaurantId: A.restaurantId, cashSessionId: session.id, type: 'ADJUSTMENT', method: 'CASH', amountCents: 150, direction: 'IN', createdById: A.ownerId },
    });
    expect(entry).toMatchObject({ amountCents: 150, direction: 'IN', afterClose: false });
  });
});
