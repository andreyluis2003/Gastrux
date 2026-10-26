// @ts-nocheck
/** Acerto com o entregador (spec docs/superpowers/specs/2026-10-26-acerto-entregador-design.md) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { POST as openShift } from '../../../app/api/caixa/sessions/route';
import { GET as detail } from '../../../app/api/caixa/sessions/[id]/route';
import { POST as close } from '../../../app/api/caixa/sessions/[id]/close/route';
import { GET as pending, POST as settle } from '../../../app/api/caixa/sessions/[id]/acerto-entregador/route';
import { PUT as moveOrder } from '../../../app/api/admin/integrations/orders/[id]/route';
import { ownIntegration } from '../../../lib/delivery-orders/integrations';
import { salesInRange } from '../../../lib/finance/month-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('acerto com o entregador', () => {
  let A, B, cashierId, shiftId, siteA;
  const tag = crypto.randomBytes(3).toString('hex');
  let seq = 0;
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url, method = 'GET', body?) => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const order = (rid, integrationId, data) => prisma.externalOrder.create({ data: {
    restaurantId: rid, integrationId, externalOrderId: `DLV-${tag}-${seq++}`, status: 'DELIVERED', totalAmount: 50, deliveryFee: 6,
    customerName: 'Cliente', customerPhone: '11999990000', deliveryAddress: 'Rua A, 1', items: '[]', paidOnline: false, paymentMethod: 'CASH', ...data,
  } });
  const get = async (id = shiftId) => json(await pending(req(`http://x/api/caixa/sessions/${id}/acerto-entregador`), { params: { id } }));
  const post = async (body, id = shiftId) => json(await settle(req(`http://x/api/caixa/sessions/${id}/acerto-entregador`, 'POST', body), { params: { id } }));

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `ae-${tag}@routes.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    cashierId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
    siteA = (await ownIntegration(A.restaurantId, 'delivery_site')).id;
    as(cashierId, A.restaurantId);
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: 'Caixa principal', isDefault: true } });
    shiftId = (await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: reg.id, openingFloat: '100,00' })))).body.session.id;
  }, 60000);
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.externalOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliverySettlement.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashierId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await cleanupMultiTenantData(ids);
  });

  it('"Saiu para entrega" takes the driver name', async () => {
    as(cashierId, A.restaurantId);
    const o = await order(A.restaurantId, siteA, { status: 'READY' });
    const res = await moveOrder(req('http://x', 'PUT', { status: 'PICKED_UP', driverName: '  Zé da moto  ' }), { params: { id: o.id } });
    expect(res.status).toBe(200);
    expect((await prisma.externalOrder.findUnique({ where: { id: o.id } })).driverName).toBe('Zé da moto');
    await prisma.externalOrder.delete({ where: { id: o.id } });
  });

  it('lists what each driver brings back, and only orders paid at the door that went out', async () => {
    as(cashierId, A.restaurantId);
    const ze = [
      await order(A.restaurantId, siteA, { driverName: 'Zé', paymentMethod: 'CASH', totalAmount: 50 }),
      await order(A.restaurantId, siteA, { driverName: 'Zé', paymentMethod: 'CASH', totalAmount: 32.5, status: 'PICKED_UP' }),
      await order(A.restaurantId, siteA, { driverName: 'Zé', paymentMethod: 'CREDIT_ON_DELIVERY', totalAmount: 40 }),
      await order(A.restaurantId, siteA, { driverName: 'Zé', paymentMethod: 'VOUCHER_ON_DELIVERY', totalAmount: 20 }),
    ];
    await order(A.restaurantId, siteA, { driverName: 'Zé', paymentMethod: 'ONLINE_PIX', paidOnline: true });   // paid online
    await order(A.restaurantId, siteA, { driverName: 'Zé', status: 'CANCELLED' });                            // cancelled
    await order(A.restaurantId, siteA, { driverName: 'Zé', status: 'READY' });                                // not out yet
    await order(A.restaurantId, siteA, { driverName: null, paymentMethod: 'DEBIT_ON_DELIVERY', totalAmount: 15 });
    const siteB = (await ownIntegration(B.restaurantId, 'delivery_site')).id;
    await order(B.restaurantId, siteB, { driverName: 'Zé' });                                                 // other restaurant

    const { status, body } = await get();
    expect(status).toBe(200);
    const zeGroup = body.drivers.find((d) => d.driverName === 'Zé');
    expect(zeGroup.orders.map((o) => o.id).sort()).toEqual(ze.map((o) => o.id).sort());
    expect(zeGroup).toMatchObject({ cashCents: 8250, creditCents: 4000, debitCents: 0, otherCents: 2000, deliveryFeeCents: 2400 });
    expect(body.drivers.find((d) => d.driverName === null).orders).toHaveLength(1);
    expect(body.driverNames).toContain('Zé');
  });

  it('settles: receipts per method in the drawer, difference with a reason, driver pay; never twice; no extra revenue', async () => {
    as(cashierId, A.restaurantId);
    const { body } = await get();
    const ze = body.drivers.find((d) => d.driverName === 'Zé');
    const ids = ze.orders.map((o) => o.id);
    const day = new Date(Date.now() - 3600_000);
    const before = await salesInRange(A.restaurantId, day, new Date(Date.now() + 3600_000));

    // Short of cash without a reason: refused
    expect((await post({ driverName: 'Zé', orderIds: ids, receivedCash: '80,00' })).status).toBe(400);
    // The cashier pays the driver up to the delivery fees (R$ 24,00 here), not more
    expect((await post({ driverName: 'Zé', orderIds: ids, receivedCash: '82,50', driverPay: '30,00' })).status).toBe(403);

    const ok = await post({ driverName: 'Zé', orderIds: ids, receivedCash: '80,00', reason: 'faltou troco', driverPay: '24,00' });
    expect(ok.status).toBe(201);
    const entries = await prisma.cashSessionEntry.findMany({ where: { cashSessionId: shiftId }, orderBy: { createdAt: 'asc' } });
    const lines = entries.map((e) => [e.type, e.method, e.amountCents, e.direction, e.category, e.orderSessionId]);
    expect(lines).toEqual(expect.arrayContaining([
      ['RECEIPT', 'CASH', 8250, null, null, null],
      ['RECEIPT', 'CREDIT', 4000, null, null, null],
      ['RECEIPT', 'OTHER', 2000, null, null, null],
      ['ADJUSTMENT', 'CASH', 250, 'OUT', null, null],
      ['EXPENSE', 'CASH', 2400, null, 'entregador', null],
    ]));
    expect(entries.every((e) => e.deliverySettlementId === ok.body.settlement.id)).toBe(true);
    const settled = await prisma.externalOrder.findMany({ where: { id: { in: ids } }, select: { settlementId: true } });
    expect(settled.every((o) => o.settlementId === ok.body.settlement.id)).toBe(true);

    // Gone from the list; a second settle of the same orders is refused
    expect((await get()).body.drivers.find((d) => d.driverName === 'Zé')).toBeUndefined();
    expect((await post({ driverName: 'Zé', orderIds: ids, receivedCash: '82,50' })).status).toBe(409);

    // The drawer expects the cash that came in; the sales and the DRE do not count the delivery again
    const view = (await json(await detail(req(`http://x/api/caixa/sessions/${shiftId}`), { params: { id: shiftId } }))).body.view;
    expect(view.sales.totalCents).toBe(0);
    const after = await salesInRange(A.restaurantId, day, new Date(Date.now() + 3600_000));
    expect(after.totalCents).toBe(before.totalCents);
  });

  it('an order of another restaurant, or one not paid at the door, cannot be settled', async () => {
    as(cashierId, A.restaurantId);
    const siteB = (await ownIntegration(B.restaurantId, 'delivery_site')).id;
    const foreign = await order(B.restaurantId, siteB, { driverName: 'Zé' });
    const online = await order(A.restaurantId, siteA, { driverName: 'Zé', paymentMethod: 'ONLINE_CARD', paidOnline: true });
    expect((await post({ driverName: 'Zé', orderIds: [foreign.id], receivedCash: '50,00' })).status).toBe(409);
    expect((await post({ driverName: 'Zé', orderIds: [online.id], receivedCash: '50,00' })).status).toBe(409);
    expect((await post({ driverName: 'Zé', orderIds: [], receivedCash: '0' })).status).toBe(400);
  });

  it('a closed shift takes no settlement', async () => {
    as(A.ownerId, A.restaurantId);
    const o = await order(A.restaurantId, siteA, { driverName: 'Lia', paymentMethod: 'CASH', totalAmount: 10 });
    expect((await close(req(`http://x/api/caixa/sessions/${shiftId}/close`, 'POST', { counted: { CASH: 0 } }), { params: { id: shiftId } })).status).toBe(200);
    expect((await post({ driverName: 'Lia', orderIds: [o.id], receivedCash: '10,00' })).status).toBe(409);
  });
});
