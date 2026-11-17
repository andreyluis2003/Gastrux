// @ts-nocheck
/** Pagar o entregador no acerto: diária + entregas (spec docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md) */
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
import { ownIntegration } from '../../../lib/delivery-orders/integrations';
import { workDayOf } from '../../../lib/delivery/driver-pay';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('pagar o entregador no acerto', () => {
  let A, B, cashierId, shiftId, siteA;
  const tag = crypto.randomBytes(3).toString('hex');
  let seq = 0;
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url, method = 'GET', body?) => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  const json = async (res) => ({ status: res.status, body: await res.json() });
  const driver = (data) => prisma.driver.create({ data: { restaurantId: A.restaurantId, name: `D${tag}-${seq++}`, dailyRateCents: 4000, perDeliveryCents: 800, ...data } });
  const order = (data) => prisma.externalOrder.create({ data: {
    restaurantId: A.restaurantId, integrationId: siteA, externalOrderId: `PAY-${tag}-${seq++}`, status: 'DELIVERED', totalAmount: 50, deliveryFee: 6,
    customerName: 'Cliente', customerPhone: '11999990000', deliveryAddress: 'Rua A, 1', items: '[]', paidOnline: false, paymentMethod: 'CASH',
    dispatchedAt: new Date(), ...data,
  } });
  const comanda = (data) => prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: cashierId, status: 'CLOSED', customerName: 'Bia', dispatchedAt: new Date(), ...data } });
  const get = async () => json(await pending(req(`http://x/api/caixa/sessions/${shiftId}/acerto-entregador`), { params: { id: shiftId } }));
  const post = async (body, id = shiftId) => json(await settle(req(`http://x/api/caixa/sessions/${id}/acerto-entregador`, 'POST', body), { params: { id } }));
  const quoteOf = async (key) => (await get()).body.pay.find((p) => p.key === key)?.quote;

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `dp-${tag}@routes.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    cashierId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
    siteA = (await ownIntegration(A.restaurantId, 'delivery_site')).id;
    as(cashierId, A.restaurantId);
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: 'Caixa principal', isDefault: true } });
    // No cash in the drawer: paying the driver leaves the expected cash negative
    shiftId = (await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: reg.id, openingFloat: '0' })))).body.session.id;
  }, 60000);
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.externalOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.driverPayment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliverySettlement.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.driver.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashierId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await cleanupMultiTenantData(ids);
  });

  it('quote counts paid-online and door deliveries', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name, paymentMethod: 'CASH' });
    await order({ driverId: d.id, driverName: d.name, paymentMethod: 'ONLINE_PIX', paidOnline: true });
    await comanda({ driverId: d.id, driverName: d.name });
    const q = await quoteOf(d.id);
    expect(q).toMatchObject({ deliveryCount: 3, dailyCount: 1, dailyRateCents: 4000, perDeliveryCents: 800 });
    expect(q.suggestedCents).toBe(4000 + 3 * 800);
    expect(q.text).toBe('1 diária × R$ 40,00 + 3 entregas × R$ 8,00 = R$ 64,00');
    // The door money list is unchanged: only the cash order
    const g = (await get()).body.drivers.find((x) => x.driverName === d.name);
    expect(g.orders).toHaveLength(1);
  });

  it('night past midnight is one daily', async () => {
    expect(workDayOf(new Date('2026-11-10T01:30:00Z'))).toBe('2026-11-09'); // 22:30 in São Paulo
    expect(workDayOf(new Date('2026-11-10T04:30:00Z'))).toBe('2026-11-09'); // 01:30 the next day
    expect(workDayOf(new Date('2026-11-10T08:30:00Z'))).toBe('2026-11-10'); // 05:30: a new work day
    as(cashierId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name, dispatchedAt: new Date('2026-11-10T01:30:00Z') });
    await order({ driverId: d.id, driverName: d.name, dispatchedAt: new Date('2026-11-10T04:30:00Z') });
    const q = await quoteOf(d.id);
    expect(q).toMatchObject({ dailyCount: 1, workDays: ['2026-11-09'], deliveryCount: 2, suggestedCents: 5600 });
  });

  it('second settlement same work day pays new deliveries, no second daily', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    const first = await order({ driverId: d.id, driverName: d.name });
    const paid = await post({ pay: { key: d.id, amount: '48,00' } });
    expect(paid.status).toBe(201);
    expect(paid.body.payment.quote).toMatchObject({ dailyCount: 1, deliveryCount: 1, suggestedCents: 4800 });
    expect((await prisma.externalOrder.findUnique({ where: { id: first.id } })).driverPaymentId).toBe(paid.body.payment.id);
    expect(await quoteOf(d.id)).toBeUndefined();

    await order({ driverId: d.id, driverName: d.name });
    const q = await quoteOf(d.id);
    expect(q).toMatchObject({ dailyCount: 0, deliveryCount: 1, suggestedCents: 800, text: '1 entrega × R$ 8,00 = R$ 8,00' });
    expect((await post({ pay: { key: d.id, amount: '8,00' } })).status).toBe(201);
    expect(await prisma.driverPaidDay.count({ where: { driverId: d.id } })).toBe(1);
    const payments = await prisma.driverPayment.findMany({ where: { driverId: d.id }, orderBy: { createdAt: 'asc' } });
    expect(payments.map((p) => [p.dailyCount, p.deliveryCount, p.suggestedCents, p.paidCents])).toEqual([[1, 1, 4800, 4800], [0, 1, 800, 800]]);
  });

  it('cancelled after dispatch does not count', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name });
    await order({ driverId: d.id, driverName: d.name, status: 'CANCELLED' });
    await comanda({ driverId: d.id, driverName: d.name, status: 'CANCELLED' });
    expect(await quoteOf(d.id)).toMatchObject({ deliveryCount: 1, suggestedCents: 4800 });
  });

  it('cashier above suggested is 403, manager passes', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name });
    const over = await post({ pay: { key: d.id, amount: '48,01' } });
    expect(over).toMatchObject({ status: 403, body: { error: 'Pagar ao entregador mais que o calculado exige um gerente' } });
    as(A.ownerId, A.restaurantId);
    const ok = await post({ pay: { key: d.id, amount: '50,00' } });
    expect(ok.status).toBe(201);
    expect((await prisma.driverPayment.findUnique({ where: { id: ok.body.payment.id } })).paidCents).toBe(5000);
    as(cashierId, A.restaurantId);
  });

  it('two settlements at once: one 409', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name });
    await comanda({ driverId: d.id, driverName: d.name });
    const results = await Promise.all([post({ pay: { key: d.id, amount: '56,00' } }), post({ pay: { key: d.id, amount: '56,00' } })]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409).body.error).toBe('Este entregador já foi pago agora. Atualize a tela.');
    expect(await prisma.driverPayment.count({ where: { driverId: d.id } })).toBe(1);
    expect(await prisma.cashSessionEntry.count({ where: { cashSessionId: shiftId, description: { contains: d.name } } })).toBe(1);
  });

  it('a daily already paid by another payment is refused by the database (409, nothing written)', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    const o = await order({ driverId: d.id, driverName: d.name });
    // Another shift paid the day meanwhile (the unique (driverId, workDay) catches it even without the shift lock)
    const other = await prisma.driverPayment.create({ data: { restaurantId: A.restaurantId, driverId: d.id, cashSessionId: shiftId, paidCents: 0, createdById: cashierId } });
    const workDay = workDayOf(o.dispatchedAt);
    // Simulates the race: the day row appears between the quote and the insert
    const spy = jest.spyOn(require('../../../lib/delivery/driver-pay'), 'quoteFor');
    spy.mockImplementationOnce(async (...args) => {
      const real = await jest.requireActual('../../../lib/delivery/driver-pay').quoteFor(...args);
      await prisma.driverPaidDay.create({ data: { driverId: d.id, workDay, driverPaymentId: other.id } });
      return real;
    });
    const res = await post({ pay: { key: d.id, amount: '48,00' } });
    spy.mockRestore();
    expect(res).toMatchObject({ status: 409, body: { error: 'Este entregador já foi pago agora. Atualize a tela.' } });
    expect((await prisma.externalOrder.findUnique({ where: { id: o.id } })).driverPaymentId).toBeNull();
    expect(await prisma.driverPayment.count({ where: { driverId: d.id } })).toBe(1);
  });

  it('payment can leave expected cash negative', async () => {
    as(cashierId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name, paymentMethod: 'ONLINE_PIX', paidOnline: true });
    const res = await post({ pay: { key: d.id, amount: '48,00' } });
    expect(res.status).toBe(201);
    const view = (await json(await detail(req(`http://x/api/caixa/sessions/${shiftId}`), { params: { id: shiftId } }))).body.view;
    // Opening float 0, no cash came in: the cash out leaves the expected cash below zero (expected is computed at close)
    expect(view.session.openingFloatCents).toBe(0);
    const cashIn = view.entries.filter((x) => x.method === 'CASH' && (x.type === 'RECEIPT' || x.type === 'SUPPLY')).reduce((s, x) => s + x.amountCents, 0);
    const cashOut = view.entries.filter((x) => x.method === 'CASH' && x.type === 'EXPENSE').reduce((s, x) => s + x.amountCents, 0);
    expect(cashIn - cashOut).toBeLessThan(0);
    const e = view.entries.find((x) => x.description?.includes(d.name));
    expect(e).toMatchObject({ type: 'EXPENSE', method: 'CASH', amountCents: 4800, category: 'entregador' });
    expect(e.description).toContain('1 diária × R$ 40,00 + 1 entrega × R$ 8,00 = R$ 48,00');
  });

  it('typed-name driver: cap is the delivery fees', async () => {
    as(cashierId, A.restaurantId);
    const name = `Tião ${tag}`;
    const a = await order({ driverName: name, deliveryFee: 6 });
    const b = await order({ driverName: name, deliveryFee: 7, paymentMethod: 'ONLINE_PIX', paidOnline: true });
    const c = await comanda({ driverName: name });
    const key = `name:${name}`;
    const q = await quoteOf(key);
    expect(q).toMatchObject({ deliveryCount: 3, suggestedCents: null, feeCapCents: 1300, dailyCount: 0, text: '' });
    expect(await post({ pay: { key, amount: '13,01' } })).toMatchObject({ status: 403, body: { error: 'Pagar ao entregador mais que as taxas de entrega exige um gerente' } });
    const ok = await post({ pay: { key, amount: '13,00' } });
    expect(ok.status).toBe(201);
    const pay = await prisma.driverPayment.findUnique({ where: { id: ok.body.payment.id } });
    expect(pay).toMatchObject({ driverId: null, driverName: name, deliveryCount: 3, dailyCount: 0, paidCents: 1300 });
    expect(await prisma.driverPaidDay.count({ where: { driverPaymentId: pay.id } })).toBe(0);
    for (const o of [a, b]) expect((await prisma.externalOrder.findUnique({ where: { id: o.id } })).driverPaymentId).toBe(pay.id);
    expect((await prisma.orderSession.findUnique({ where: { id: c.id } })).driverPaymentId).toBe(pay.id);
  });

  it('a driver of another restaurant cannot be paid; no orders and no pay is 400', async () => {
    as(cashierId, A.restaurantId);
    const foreign = await prisma.driver.create({ data: { restaurantId: B.restaurantId, name: `Fora ${tag}`, dailyRateCents: 4000 } });
    expect((await post({ pay: { key: foreign.id, amount: '10,00' } })).status).toBe(404);
    expect(await post({})).toMatchObject({ status: 400, body: { error: 'Escolha os pedidos do acerto' } });
  });

  it('closed shift is 409', async () => {
    as(A.ownerId, A.restaurantId);
    const d = await driver({});
    await order({ driverId: d.id, driverName: d.name });
    expect((await close(req(`http://x/api/caixa/sessions/${shiftId}/close`, 'POST', { counted: { CASH: 0 } }), { params: { id: shiftId } })).status).toBe(200);
    expect(await post({ pay: { key: d.id, amount: '48,00' } })).toMatchObject({ status: 409, body: { error: 'Este caixa já foi fechado' } });
  });
});
