// @ts-nocheck
/** Relatório de entregadores por período (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { driverReport } from '../../../lib/delivery/driver-report';
import { GET as reportRoute } from '../../../app/api/delivery/drivers/report/route';
import { ownIntegration } from '../../../lib/delivery-orders/integrations';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('relatório de entregadores', () => {
  let A, B, userId, siteA, siteB, ze, old, session, sessionB;
  const tag = crypto.randomBytes(3).toString('hex');
  let seq = 0;
  // 15:00 UTC = 12:00 in São Paulo, so the work day is the same date
  const at = (day: string) => new Date(`${day}T15:00:00Z`);
  const order = (restaurantId, integrationId, data = {}) => prisma.externalOrder.create({ data: {
    restaurantId, integrationId, externalOrderId: `RPT-${tag}-${seq++}`, status: 'DELIVERED', totalAmount: 50, deliveryFee: 6,
    customerName: 'Cliente', customerPhone: '11999990000', deliveryAddress: 'Rua A, 1', items: '[]', paidOnline: false, paymentMethod: 'CASH', ...data,
  } });
  const payment = (restaurantId, cashSessionId, data) => prisma.driverPayment.create({ data: { restaurantId, cashSessionId, createdById: userId, ...data } });
  const row = (rows, key) => rows.find((r) => r.key === key);

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `rpt-${tag}@routes.test`, name: 'Gerente', password: 'x', role: 'MANAGER', active: true } });
    userId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'MANAGER', isActive: true } });
    siteA = (await ownIntegration(A.restaurantId, 'delivery_site')).id;
    siteB = (await ownIntegration(B.restaurantId, 'delivery_site')).id;
    ze = await prisma.driver.create({ data: { restaurantId: A.restaurantId, name: 'Zé da Moto', dailyRateCents: 4000, perDeliveryCents: 800 } });
    old = await prisma.driver.create({ data: { restaurantId: A.restaurantId, name: 'Antigo', active: false, perDeliveryCents: 500 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: `C-${tag}` } });
    session = await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: u.id } });
    const regB = await prisma.cashRegister.create({ data: { restaurantId: B.restaurantId, name: `CB-${tag}` } });
    sessionB = await prisma.cashSession.create({ data: { restaurantId: B.restaurantId, cashRegisterId: regB.id, openedById: u.id } });
  }, 60000);
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.externalOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.driverPayment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.driver.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await cleanupMultiTenantData(ids);
  });

  it('report sums payments in the period', async () => {
    // Two deliveries on 03-10 (one paid), one on 03-11 unpaid, one outside the period, one cancelled
    const p1 = await payment(A.restaurantId, session.id, { driverId: ze.id, deliveryCount: 1, dailyCount: 1, paidCents: 4800, createdAt: at('2026-03-10') });
    await payment(A.restaurantId, session.id, { driverId: ze.id, deliveryCount: 1, paidCents: 900, createdAt: at('2026-02-20') });
    await order(A.restaurantId, siteA, { driverId: ze.id, driverName: ze.name, dispatchedAt: at('2026-03-10'), driverPaymentId: p1.id });
    await order(A.restaurantId, siteA, { driverId: ze.id, driverName: ze.name, dispatchedAt: at('2026-03-10') });
    await order(A.restaurantId, siteA, { driverId: ze.id, driverName: ze.name, dispatchedAt: at('2026-03-11') });
    await order(A.restaurantId, siteA, { driverId: ze.id, driverName: ze.name, dispatchedAt: at('2026-02-20') });
    await order(A.restaurantId, siteA, { driverId: ze.id, driverName: ze.name, dispatchedAt: at('2026-03-10'), status: 'CANCELLED' });
    await prisma.driverPaidDay.create({ data: { driverId: ze.id, workDay: '2026-03-10', driverPaymentId: p1.id } });
    await prisma.driverPaidDay.create({ data: { driverId: ze.id, workDay: '2026-02-20', driverPaymentId: p1.id } });

    const rows = await driverReport(A.restaurantId, '2026-03-01', '2026-03-31');
    expect(row(rows, ze.id)).toMatchObject({ driverName: 'Zé da Moto', active: true, deliveries: 3, dailies: 1, paidCents: 4800, unpaidDeliveries: 2 });
  });

  it('includes deactivated and typed names', async () => {
    await order(A.restaurantId, siteA, { driverId: old.id, driverName: old.name, dispatchedAt: at('2026-03-12') });
    await order(A.restaurantId, siteA, { driverName: 'joão  Silva', dispatchedAt: at('2026-03-12') });
    await order(A.restaurantId, siteA, { driverName: 'João Silva', dispatchedAt: at('2026-03-13') });
    await payment(A.restaurantId, session.id, { driverName: 'João silva', deliveryCount: 1, paidCents: 1200, createdAt: at('2026-03-14') });
    const rows = await driverReport(A.restaurantId, '2026-03-01', '2026-03-31');
    expect(row(rows, old.id)).toMatchObject({ active: false, deliveries: 1, unpaidDeliveries: 1, paidCents: 0 });
    const typed = rows.filter((r) => r.active === null);
    expect(typed).toHaveLength(1);
    expect(typed[0]).toMatchObject({ driverName: 'João silva', deliveries: 2, dailies: 0, paidCents: 1200, unpaidDeliveries: 2 });
  });

  it('other restaurant is not counted', async () => {
    await order(B.restaurantId, siteB, { driverName: 'Estranho', dispatchedAt: at('2026-03-12') });
    await payment(B.restaurantId, sessionB.id, { driverName: 'Estranho', deliveryCount: 1, paidCents: 999, createdAt: at('2026-03-12') });
    const rows = await driverReport(A.restaurantId, '2026-03-01', '2026-03-31');
    expect(rows.find((r) => r.driverName === 'Estranho')).toBeUndefined();
    const other = await driverReport(B.restaurantId, '2026-03-01', '2026-03-31');
    expect(other).toHaveLength(1);
    expect(other[0]).toMatchObject({ driverName: 'Estranho', deliveries: 1, paidCents: 999 });
  });

  it('route answers rows for a manager and refuses an inverted period', async () => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: 'x@x.test' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(A.restaurantId);
    const ok = await reportRoute(new Request('http://x/api/delivery/drivers/report?from=2026-03-01&to=2026-03-31') as any);
    expect(ok.status).toBe(200);
    expect((await ok.json()).rows.length).toBeGreaterThan(0);
    const bad = await reportRoute(new Request('http://x/api/delivery/drivers/report?from=2026-03-31&to=2026-03-01') as any);
    expect(bad.status).toBe(400);
  });
});
