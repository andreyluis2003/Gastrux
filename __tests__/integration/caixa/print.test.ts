// @ts-nocheck
/**
 * Cash register receipts (spec §8.1, §8.2): the 80 mm receipt of an entry and the closing report of a
 * CLOSED shift, both scoped to the restaurant.
 */
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as entryTicket } from '../../../app/api/print/cash-entry/[id]/route';
import { GET as closeTicket } from '../../../app/api/print/cash-session/[id]/route';
import { openSession, addEntry, closeSession, ensureDefaultRegister } from '../../../lib/caixa/sessions';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash register receipts', () => {
  let A, B, reg, owner;
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url = 'http://x') => new Request(url) as any;

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    reg = await ensureDefaultRegister(A.restaurantId);
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });

  it('entry receipt and closing report, scoped to the restaurant', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 100 });
    const { entry } = await addEntry(owner, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'cofre' });
    as(A.ownerId, A.restaurantId);

    const t = await (await entryTicket(req(), { params: { id: entry.id } })).json();
    expect(t).toMatchObject({ typeLabel: 'Sangria', amountCents: 2000, registerName: 'Caixa principal', description: 'cofre', methodLabel: 'Dinheiro' });

    expect((await closeTicket(req(), { params: { id: session.id } })).status).toBe(404);
    await closeSession(owner, session.id, { counted: { dinheiro: 80 } });
    const c = await (await closeTicket(req(), { params: { id: session.id } })).json();
    expect(c.rows.find((r) => r.label === 'Dinheiro')).toEqual({ label: 'Dinheiro', expected: 8000, counted: 8000, difference: 0 });
    expect(c.openingFloatCents).toBe(10000);

    as(B.ownerId, B.restaurantId);
    expect((await entryTicket(req(), { params: { id: entry.id } })).status).toBe(404);
    expect((await closeTicket(req(), { params: { id: session.id } })).status).toBe(404);
  });
});
