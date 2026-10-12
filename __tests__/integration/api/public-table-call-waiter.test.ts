// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST as callWaiter } from '../../../app/api/public/table/[qrToken]/call-waiter/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('pagar com o garçom', () => {
  let A, table, session;
  const tag = crypto.randomBytes(3).toString('hex');
  const call = async (qrToken = table.qrToken) => {
    const res = await callWaiter(new Request(`https://x/api/public/table/${qrToken}/call-waiter`, { method: 'POST' }) as any, { params: { qrToken } });
    return { status: res.status, body: await res.json() };
  };
  const alerts = () => prisma.notification.findMany({ where: { restaurantId: A.restaurantId, data: { path: ['kind'], equals: 'table-call-waiter' } } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA;
    await saveConnection(A.restaurantId, TOKENS);
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `S ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 8, sectionId: section.id, capacity: 4, qrToken: `wait-${tag}-qrtoken01` } });
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    session = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 8, status: 'OPEN' } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  it('stamps the comanda and tells the staff in the bell', async () => {
    expect(await call()).toEqual({ status: 200, body: { called: true } });
    expect((await prisma.orderSession.findUnique({ where: { id: session.id } })).payAtWaiterRequestedAt).not.toBeNull();
    const [a] = await alerts();
    expect(a).toMatchObject({ type: 'PAYMENT_PENDING', userId: null, title: 'Mesa 8 quer pagar com o garçom', actionUrl: '/vender' });
  });

  it('at most one alert a minute, however many taps', async () => {
    await Promise.all([call(), call(), call()]);
    expect(await call()).toMatchObject({ body: { called: false, alreadyCalled: true } });
    expect(await alerts()).toHaveLength(1);
    await prisma.orderSession.update({ where: { id: session.id }, data: { payAtWaiterRequestedAt: new Date(Date.now() - 61_000) } });
    expect((await call()).body.called).toBe(true);
    expect(await alerts()).toHaveLength(2);
  });

  it('with two open comandas on the table, the call lands on the one the map shows (the oldest), like QR orders', async () => {
    const newer = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 8, status: 'OPEN', openedAt: new Date(Date.now() + 60_000) } });
    await call();
    expect((await prisma.orderSession.findUnique({ where: { id: session.id } })).payAtWaiterRequestedAt).not.toBeNull();
    expect((await prisma.orderSession.findUnique({ where: { id: newer.id } })).payAtWaiterRequestedAt).toBeNull();
  });

  it('refuses what it must', async () => {
    expect((await call('nao-existe-0123456789')).status).toBe(404);
    await prisma.orderSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    expect((await call()).status).toBe(409);
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'starter' } });
    try {
      expect((await call()).status).toBe(403);
    } finally {
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'business' } });
    }
  });
});
