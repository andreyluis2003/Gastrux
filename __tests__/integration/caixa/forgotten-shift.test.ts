// __tests__/integration/caixa/forgotten-shift.test.ts
// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { ensureDefaultRegister } from '../../../lib/caixa/sessions';
import { POST as staleCheck } from '../../../app/api/kds/stale-check/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('forgotten shift alert', () => {
  let A, B;
  beforeAll(async () => { const s = await createMultiRestaurantScenario(); A = s.restaurantA; B = s.restaurantB; process.env.CRON_SECRET = 'test-cron'; });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });

  it('alerts once for a shift open more than 16 h, never for a recent one', async () => {
    const reg = await ensureDefaultRegister(A.restaurantId);
    await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: A.ownerId, openedAt: new Date(Date.now() - 17 * 3600_000) } });
    const regB = await ensureDefaultRegister(B.restaurantId);
    await prisma.cashSession.create({ data: { restaurantId: B.restaurantId, cashRegisterId: regB.id, openedById: B.ownerId, openedAt: new Date(Date.now() - 3600_000) } });
    const call = () => staleCheck(new Request('http://x/api/kds/stale-check', { method: 'POST', headers: { authorization: 'Bearer test-cron' } }) as any);
    expect((await call()).status).toBe(200);
    await call();
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId, title: { contains: 'aberto há mais de 16 horas' } } })).toBe(1);
    expect(await prisma.notification.count({ where: { restaurantId: B.restaurantId, title: { contains: 'aberto há mais de' } } })).toBe(0);
  });
});
