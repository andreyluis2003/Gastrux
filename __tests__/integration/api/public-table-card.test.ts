// @ts-nocheck
/** Pay at the table, stage 3: one card checkout per phone and per part (spec 2026-10-10 §5.1 item 3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
}));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { createCheckoutPreference } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { applyTablePayment } from '../../../lib/comanda/table-payment';
import { POST as postPay } from '../../../app/api/public/table/[qrToken]/pay/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PHONE_A = 'phoneAAAAAAAAAAAAAAAA';
const PHONE_B = 'phoneBBBBBBBBBBBBBBBB';

describe('table card checkout', () => {
  let A, table, session, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  let pref = 0;
  const savedUrl = process.env.NEXTAUTH_URL;

  const pay = async (body) => {
    const res = await postPay(new Request(`https://x/api/public/table/${table.qrToken}/pay`, { method: 'POST', body: JSON.stringify(body) }) as any, { params: { qrToken: table.qrToken } });
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    A = (await createMultiRestaurantScenario()).restaurantA;
    await saveConnection(A.restaurantId, TOKENS);
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Salão ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 6, sectionId: section.id, capacity: 4, qrToken: `card-${tag}-qrtoken01` } });
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    createCheckoutPreference.mockImplementation(async () => { pref++; return { id: `pref-${pref}`, init_point: `https://mp/checkout/${pref}`, sandbox_init_point: null }; });
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: A.restaurantId } } });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    session = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 6, status: 'OPEN', serviceChargeWaived: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: burger.id, price: 30, quantity: 2 } });
  });

  afterAll(async () => {
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: A.restaurantId } } });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
    process.env.NEXTAUTH_URL = savedUrl;
  });

  it('a card part makes a checkout of that part, linked to the comanda, coming back to the table menu', async () => {
    const r = await pay({ method: 'CARD', mode: 'EQUAL', people: 2, cpf: '529.982.247-25', payerKey: PHONE_A });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, initPoint: 'https://mp/checkout/' + pref, amount: 30, sessionId: session.id });
    const row = await prisma.payment.findUnique({ where: { id: r.body.paymentId } });
    expect(row).toMatchObject({ method: 'MERCADO_PAGO', status: 'PENDING', orderSessionId: session.id, tableShareMode: 'EQUAL:2', customerDocument: '52998224725' });
    expect(Number(row.amount)).toBe(30);
    const input = createCheckoutPreference.mock.calls[0][0];
    expect(input.externalReference).toBe(row.id);
    expect(input.backUrls.success).toBe(`https://gastrux.test/menu/${table.qrToken}?payment=${row.id}&result=success`);
    expect(input.excludedPaymentTypes).toEqual(['ticket', 'atm', 'bank_transfer']);
    expect(input.items[0].unitPrice).toBe(30);
  });

  it('two phones, same card part: each gets its own checkout; the same phone gets its own link back', async () => {
    const [a, b] = await Promise.all([
      pay({ method: 'CARD', mode: 'EQUAL', people: 2, payerKey: PHONE_A }),
      pay({ method: 'CARD', mode: 'EQUAL', people: 2, payerKey: PHONE_B }),
    ]);
    expect(a.body.paymentId).not.toBe(b.body.paymentId);
    expect(a.body.initPoint).not.toBe(b.body.initPoint);
    const again = await pay({ method: 'CARD', mode: 'EQUAL', people: 2, payerKey: PHONE_A });
    expect(again.body.paymentId).toBe(a.body.paymentId);
    expect(createCheckoutPreference).toHaveBeenCalledTimes(2);
  });

  it('card applies like a PIX: approved, it counts on the bill and the last part closes it', async () => {
    const a = await pay({ method: 'CARD', mode: 'AMOUNT', amountCents: 2000, payerKey: PHONE_A });
    await prisma.payment.update({ where: { id: a.body.paymentId }, data: { status: 'APPROVED' } });
    expect((await applyTablePayment(A.restaurantId, a.body.paymentId)).outcome).toBe('applied');
    const b = await pay({ method: 'CARD', mode: 'ALL', payerKey: PHONE_B });
    expect(b.body.amount).toBe(40);
    await prisma.payment.update({ where: { id: b.body.paymentId }, data: { status: 'APPROVED' } });
    expect((await applyTablePayment(A.restaurantId, b.body.paymentId)).outcome).toBe('closed');
  });

  it('a CPF typed after the first card tap reaches the payment: the same link, the row carries the CPF (final review)', async () => {
    const first = await pay({ method: 'CARD', mode: 'ALL', payerKey: PHONE_A });
    const again = await pay({ method: 'CARD', mode: 'ALL', cpf: '529.982.247-25', payerKey: PHONE_A });
    expect(again.body.paymentId).toBe(first.body.paymentId);
    expect((await prisma.payment.findUnique({ where: { id: first.body.paymentId } })).customerDocument).toBe('52998224725');
    expect(createCheckoutPreference).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown method', async () => {
    expect((await pay({ method: 'BOLETO', mode: 'ALL', payerKey: PHONE_A })).status).toBe(422);
  });
});
