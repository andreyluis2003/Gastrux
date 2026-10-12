// @ts-nocheck
/** What the table sees and how it pays a part (spec 2026-10-10 §5.1, §5.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(async () => ({ id: 515151, status: 'pending', date_of_expiration: new Date(Date.now() + 1800000).toISOString(), point_of_interaction: { transaction_data: { qr_code: 'QR', qr_code_base64: 'B64', ticket_url: 'https://t' } } })),
}));

import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { GET as getBill } from '../../../app/api/public/table/[qrToken]/bill/route';
import { POST as postPay } from '../../../app/api/public/table/[qrToken]/pay/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const KEY = 'phoneKEY1234567890ab';

describe('public table bill and pay', () => {
  let A, B, tableA, tableB, burger, recipeB;
  const tag = crypto.randomBytes(3).toString('hex');

  const bill = async (qrToken, session?) =>
    getBill(new Request(`https://x/api/public/table/${qrToken}/bill${session ? `?session=${session}` : ''}`) as any, { params: { qrToken } });
  const pay = async (qrToken, body) =>
    postPay(new Request(`https://x/api/public/table/${qrToken}/pay`, { method: 'POST', body: JSON.stringify(body) }) as any, { params: { qrToken } });
  const open = (restaurantId, table, data = {}) =>
    prisma.orderSession.create({ data: { restaurantId, userId: restaurantId === A.restaurantId ? A.ownerId : B.ownerId, tableId: table.id, tableNumber: table.number, status: 'OPEN', ...data } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'https://gastrux.test';
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    const secA = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `S ${tag}`, capacity: 20 } });
    const secB = await prisma.tableSection.create({ data: { restaurantId: B.restaurantId, name: `S ${tag}`, capacity: 20 } });
    tableA = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 3, sectionId: secA.id, capacity: 4, qrToken: `pubA-${tag}-0123456789` } });
    tableB = await prisma.table.create({ data: { restaurantId: B.restaurantId, number: 3, sectionId: secB.id, capacity: 4, qrToken: `pubB-${tag}-0123456789` } });
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `RA-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    recipeB = await prisma.recipe.create({ data: { restaurantId: B.restaurantId, code: `RB-${tag}`, name: `Segredo ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.nFeDocument.deleteMany({ where: { config: { restaurantId: A.restaurantId } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.nFeDocument.deleteMany({ where: { config: { restaurantId: A.restaurantId } } });
    await prisma.nFeConfig.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  it('shows the bill of this table only, with items launched by the waiter, service charge and what is left', async () => {
    const s = await open(A.restaurantId, tableA);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 25, quantity: 2 } });
    const sB = await open(B.restaurantId, tableB);
    await prisma.orderSessionItem.create({ data: { sessionId: sB.id, recipeId: recipeB.id, price: 99, quantity: 1 } });
    const res = await bill(tableA.qrToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'OPEN', sessionId: s.id, label: 'Mesa 3', subtotalCents: 5000, totalCents: body.subtotalCents + body.serviceCents, paidCents: 0 });
    expect(body.items).toEqual([{ name: `Burger ${tag}`, quantity: 2, totalCents: 5000 }]);
    expect(JSON.stringify(body)).not.toMatch(/Segredo|userId|restaurantId|cashSession/);
  });

  it('closed while the screen is open: the session of this table says CLOSED with the NFC-e link; another table\'s session says NONE', async () => {
    const s = await open(A.restaurantId, tableA, { status: 'CLOSED', closedAt: new Date() });
    // NFeDocument has no restaurantId of its own: the restaurant comes through its fiscal config
    const config = await prisma.nFeConfig.upsert({
      where: { restaurantId: A.restaurantId },
      update: {},
      create: { restaurantId: A.restaurantId, cnpj: `${Date.now()}`.slice(-14).padStart(14, '2'), nfeApiKey: 'k' },
    });
    await prisma.nFeDocument.create({ data: { configId: config.id, documentType: 'NFCe', documentSeries: 1, documentNumber: Number(`${Date.now()}`.slice(-6)), status: 'authorized', orderSessionId: s.id, qrCodeUrl: 'https://sefaz/consulta?p=1' } });
    const closed = await (await bill(tableA.qrToken, s.id)).json();
    expect(closed).toEqual({ status: 'CLOSED', sessionId: s.id, nfceUrl: 'https://sefaz/consulta?p=1' });
    const sB = await open(B.restaurantId, tableB, { status: 'CLOSED', closedAt: new Date() });
    expect(await (await bill(tableA.qrToken, sB.id)).json()).toEqual({ status: 'NONE' });
    expect(await (await bill(tableA.qrToken)).json()).toEqual({ status: 'NONE' });
  });

  it('a Starter restaurant does not show nor take payments at the table', async () => {
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'starter' } });
    try {
      expect((await bill(tableA.qrToken)).status).toBe(403);
      expect((await pay(tableA.qrToken, { mode: 'ALL', payerKey: KEY })).status).toBe(403);
    } finally {
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'business' } });
    }
  });

  it('pays a part by PIX, linked to the comanda, with the CPF and the share mode', async () => {
    const s = await open(A.restaurantId, tableA, { serviceChargeWaived: true });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity: 2 } });
    const res = await pay(tableA.qrToken, { mode: 'EQUAL', people: 3, cpf: '529.982.247-25', payerKey: KEY });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, amount: 20, sessionId: s.id, qrCode: 'QR' });
    expect(await prisma.payment.findUnique({ where: { id: body.paymentId } })).toMatchObject({ orderSessionId: s.id, customerDocument: '52998224725', tableShareMode: 'EQUAL:3' });
  });

  it('refuses what it must, with a message for the customer', async () => {
    expect((await pay(tableA.qrToken, { mode: 'ALL', payerKey: KEY })).status).toBe(409); // no open comanda
    const s = await open(A.restaurantId, tableA);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 10, quantity: 1 } });
    const low = await pay(tableA.qrToken, { mode: 'AMOUNT', amountCents: 50, payerKey: KEY });
    expect(low.status).toBe(422);
    expect((await low.json()).error).toBe('O valor mínimo é R$ 1,00.');
    expect((await pay(tableA.qrToken, { mode: 'ALL', cpf: '111.111.111-11', payerKey: KEY })).status).toBe(422);
    expect((await pay(tableA.qrToken, { mode: 'ALL' })).status).toBe(422); // no phone key
    expect((await pay('nao-existe-0123456789', { mode: 'ALL', payerKey: KEY })).status).toBe(404);
  });
});
