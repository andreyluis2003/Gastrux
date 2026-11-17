// @ts-nocheck
/** Escolher o entregador em "Saiu para entrega" (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { PUT as moveOrder } from '../../../app/api/admin/integrations/orders/[id]/route';
import { POST as dispatchComanda } from '../../../app/api/comanda/sessions/[id]/dispatch/route';
import { ownIntegration } from '../../../lib/delivery-orders/integrations';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('entregador em "Saiu para entrega"', () => {
  let A, B, cashierId, siteA, ze, bia, foreign, inactive;
  const tag = crypto.randomBytes(3).toString('hex');
  let seq = 0;
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url, method = 'GET', body?) => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const order = (data = {}) => prisma.externalOrder.create({ data: {
    restaurantId: A.restaurantId, integrationId: siteA, externalOrderId: `DSP-${tag}-${seq++}`, status: 'READY', totalAmount: 50, deliveryFee: 6,
    customerName: 'Cliente', customerPhone: '11999990000', deliveryAddress: 'Rua A, 1', items: '[]', paidOnline: false, paymentMethod: 'CASH', ...data,
  } });
  const put = async (id, body) => json(await moveOrder(req('http://x', 'PUT', body), { params: { id } }));
  const dispatch = async (id, body) => json(await dispatchComanda(req(`http://x/api/comanda/sessions/${id}/dispatch`, 'POST', body), { params: { id } }));
  /** A comanda opened by a WhatsApp conversation of the given order type */
  const comanda = async (orderType, status = 'SENT_TO_KITCHEN') => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: cashierId, status, customerName: 'Bia' } });
    await prisma.whatsAppConversation.create({ data: {
      restaurantId: A.restaurantId, phoneNumber: `55119${tag}${seq++}`, customerName: 'Bia', state: 'COMPLETED', orderType, orderSessionId: s.id,
      ...(orderType === 'DELIVERY' ? { deliveryAddress: 'Rua A, 1' } : {}),
    } });
    return s;
  };

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `dsp-${tag}@routes.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    cashierId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
    siteA = (await ownIntegration(A.restaurantId, 'delivery_site')).id;
    ze = await prisma.driver.create({ data: { restaurantId: A.restaurantId, name: 'Zé da Moto', dailyRateCents: 4000, perDeliveryCents: 800 } });
    bia = await prisma.driver.create({ data: { restaurantId: A.restaurantId, name: 'Bia Bike', perDeliveryCents: 700 } });
    inactive = await prisma.driver.create({ data: { restaurantId: A.restaurantId, name: 'Antigo', active: false } });
    foreign = await prisma.driver.create({ data: { restaurantId: B.restaurantId, name: 'De Fora' } });
  }, 60000);
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.externalOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.whatsAppConversation.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.driverPayment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.driver.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashierId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await cleanupMultiTenantData(ids);
  });

  it('PICKED_UP with driverId stores driver, name and dispatchedAt', async () => {
    as(cashierId, A.restaurantId);
    const o = await order();
    const before = Date.now();
    const { status } = await put(o.id, { status: 'PICKED_UP', driverId: ze.id, driverName: 'ignorado' });
    expect(status).toBe(200);
    const saved = await prisma.externalOrder.findUnique({ where: { id: o.id } });
    expect(saved).toMatchObject({ status: 'PICKED_UP', driverId: ze.id, driverName: 'Zé da Moto' });
    expect(saved.dispatchedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);

    // Going on to Entregue keeps the first dispatchedAt
    expect((await put(o.id, { status: 'DELIVERED' })).status).toBe(200);
    const delivered = await prisma.externalOrder.findUnique({ where: { id: o.id } });
    expect(delivered.dispatchedAt.getTime()).toBe(saved.dispatchedAt.getTime());
    expect(delivered.driverId).toBe(ze.id);
  });

  it('typed name still works', async () => {
    as(cashierId, A.restaurantId);
    const o = await order();
    expect((await put(o.id, { status: 'PICKED_UP', driverName: '  Primo   do Zé ' })).status).toBe(200);
    const saved = await prisma.externalOrder.findUnique({ where: { id: o.id } });
    expect(saved).toMatchObject({ driverId: null, driverName: 'Primo do Zé' });
    expect(saved.dispatchedAt).toBeInstanceOf(Date);

    // Without any driver it still goes out, with the time
    const bare = await order();
    expect((await put(bare.id, { status: 'PICKED_UP' })).status).toBe(200);
    expect((await prisma.externalOrder.findUnique({ where: { id: bare.id } })).dispatchedAt).toBeInstanceOf(Date);
  });

  it('foreign driver is refused', async () => {
    as(cashierId, A.restaurantId);
    for (const id of [foreign.id, inactive.id, 'nao-existe']) {
      const o = await order();
      const { status, body } = await put(o.id, { status: 'PICKED_UP', driverId: id });
      expect(status).toBe(422);
      expect(body.error).toBe('Entregador não encontrado');
      expect(await prisma.externalOrder.findUnique({ where: { id: o.id } })).toMatchObject({ status: 'READY', driverId: null, dispatchedAt: null });
    }
  });

  it('whatsapp delivery comanda dispatch', async () => {
    as(cashierId, A.restaurantId);
    const s = await comanda('DELIVERY');
    const empty = await loadBill(prisma, A.restaurantId, s.id);
    expect(empty).toMatchObject({ isDelivery: true, driver: null, dispatchedAt: null });

    const first = await dispatch(s.id, { driverId: ze.id });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ isDelivery: true, driver: { id: ze.id, name: 'Zé da Moto' } });
    const saved = await prisma.orderSession.findUnique({ where: { id: s.id } });
    expect(saved).toMatchObject({ driverId: ze.id, driverName: 'Zé da Moto' });
    expect(first.body.dispatchedAt).toBe(saved.dispatchedAt.toISOString());

    // Changing the driver while not paid: allowed, keeps the first time
    const swap = await dispatch(s.id, { driverId: bia.id });
    expect(swap.status).toBe(200);
    expect(swap.body.driver).toEqual({ id: bia.id, name: 'Bia Bike' });
    const typed = await dispatch(s.id, { driverName: '  Primo  ' });
    expect(typed.status).toBe(200);
    expect(typed.body.driver).toEqual({ id: null, name: 'Primo' });
    const after = await prisma.orderSession.findUnique({ where: { id: s.id } });
    expect(after).toMatchObject({ driverId: null, driverName: 'Primo' });
    expect(after.dispatchedAt.getTime()).toBe(saved.dispatchedAt.getTime());

    // A driver of another restaurant, an inactive one, or none at all: refused
    expect((await dispatch(s.id, { driverId: foreign.id })).body.error).toBe('Entregador não encontrado');
    expect((await dispatch(s.id, { driverId: inactive.id })).status).toBe(422);
    expect((await dispatch(s.id, {})).status).toBe(400);

    // A comanda of another restaurant is not found
    as(B.ownerId, B.restaurantId);
    expect((await dispatch(s.id, { driverName: 'X' })).status).toBe(404);
  });

  it('non-delivery comanda is refused', async () => {
    as(cashierId, A.restaurantId);
    const pickup = await comanda('PICKUP');
    const r1 = await dispatch(pickup.id, { driverId: ze.id });
    expect(r1).toEqual({ status: 422, body: { error: 'Esta comanda não é de entrega' } });
    const plain = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: cashierId, customerName: 'Mesa' } });
    expect((await dispatch(plain.id, { driverId: ze.id })).status).toBe(422);
    expect((await loadBill(prisma, A.restaurantId, plain.id)).isDelivery).toBe(false);
    const cancelled = await comanda('DELIVERY', 'CANCELLED');
    expect((await dispatch(cancelled.id, { driverId: ze.id })).status).toBe(422);
    expect(await prisma.orderSession.findUnique({ where: { id: cancelled.id } })).toMatchObject({ driverId: null, dispatchedAt: null });
  });

  it('paid delivery cannot change driver', async () => {
    as(cashierId, A.restaurantId);
    const s = await comanda('DELIVERY', 'CLOSED');
    expect((await dispatch(s.id, { driverId: ze.id })).status).toBe(200);   // a closed (already paid by the customer) comanda still goes out
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: `Caixa ${tag}` } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: cashierId } });
    const pay = await prisma.driverPayment.create({ data: { restaurantId: A.restaurantId, driverId: ze.id, cashSessionId: shift.id, paidCents: 800, createdById: cashierId } });
    await prisma.orderSession.update({ where: { id: s.id }, data: { driverPaymentId: pay.id } });
    const res = await dispatch(s.id, { driverId: bia.id });
    expect(res).toEqual({ status: 409, body: { error: 'Esta entrega já foi paga ao entregador' } });
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).driverId).toBe(ze.id);
    expect((await loadBill(prisma, A.restaurantId, s.id)).driverPaid).toBe(true);
  });
});
