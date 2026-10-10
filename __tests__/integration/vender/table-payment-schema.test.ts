// @ts-nocheck
/** Pay at the table, stage 1 (spec 2026-10-10 §5.3): an online payment links to its comanda and shift */
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('table online payments schema', () => {
  let A: any;
  beforeAll(async () => { A = (await createMultiRestaurantScenario()).restaurantA; });
  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  it('stores the comanda, the shift, the share mode and when it was applied; deleting the comanda keeps the payment', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', payAtWaiterRequestedAt: new Date() } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: 'Caixa', isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: A.ownerId, openingFloatCents: 0, status: 'OPEN' } });
    const p = await prisma.payment.create({
      data: {
        restaurantId: A.restaurantId, amount: 12.5, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED',
        orderSessionId: s.id, cashSessionId: shift.id, tableShareMode: 'ALL', appliedToBillAt: new Date(), customerDocument: '12345678909',
      },
    });
    const read = await prisma.payment.findUnique({ where: { id: p.id }, include: { orderSession: true, cashSession: true } });
    expect(read.orderSession.id).toBe(s.id);
    expect(read.cashSession.id).toBe(shift.id);
    expect(read.tableShareMode).toBe('ALL');
    expect(read.appliedToBillAt).toBeInstanceOf(Date);

    await prisma.orderSession.delete({ where: { id: s.id } });
    expect((await prisma.payment.findUnique({ where: { id: p.id } })).orderSessionId).toBeNull();
  });
});
