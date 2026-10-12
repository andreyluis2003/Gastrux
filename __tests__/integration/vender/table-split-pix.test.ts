// @ts-nocheck
/** Pay at the table, stage 2: each phone pays its part with its own PIX (spec 2026-10-10 §5.1, §5.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  cancelConnectPayment: jest.fn(async () => ({})),
}));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { createConnectPix, cancelConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { resolvePixTarget } from '../../../lib/mercadopago-connect/pix-target';
import { createPixForTarget } from '../../../lib/mercadopago-connect/pix-service';
import { applyTablePayment } from '../../../lib/comanda/table-payment';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PHONE_A = 'phoneAAAAAAAAAAAAAAAA';
const PHONE_B = 'phoneBBBBBBBBBBBBBBBB';

describe('splitting the table bill: one PIX per phone and per part', () => {
  let A, table, session, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  let mpSeq = 70000;

  const pay = async (share, payerKey) => {
    const r = await resolvePixTarget({ qrToken: table.qrToken, share: { cpf: null, payerKey, ...share } });
    if (!r.ok) return r;
    return createPixForTarget(r.target, { email: 'cliente@exemplo.com', name: 'Cliente' });
  };
  const approve = async (paymentId) => {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: 'APPROVED' } });
    return applyTablePayment(A.restaurantId, paymentId);
  };
  const rows = () => prisma.payment.findMany({ where: { orderSessionId: session.id }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA; // plan business
    await saveConnection(A.restaurantId, TOKENS);
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Salão ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 5, sectionId: section.id, capacity: 4, qrToken: `split-${tag}-qrtoken` } });
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    createConnectPix.mockImplementation(async () => {
      const id = ++mpSeq;
      return { id, status: 'pending', date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(), point_of_interaction: { transaction_data: { qr_code: `qr-${id}`, qr_code_base64: 'b64', ticket_url: `https://mp/${id}` } } };
    });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    // R$ 60,00 with the service charge off, so the numbers stay round
    session = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 5, status: 'OPEN', serviceChargeWaived: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: burger.id, price: 30, quantity: 2 } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  it('two phones, same part: each gets its own PIX of R$ 30,00 (never the other one\'s QR)', async () => {
    const [a, b] = await Promise.all([pay({ mode: 'EQUAL', people: 2 }, PHONE_A), pay({ mode: 'EQUAL', people: 2 }, PHONE_B)]);
    expect(a.ok && b.ok).toBe(true);
    expect(a.pix.paymentId).not.toBe(b.pix.paymentId);
    expect(a.pix.qrCode).not.toBe(b.pix.qrCode);
    const r = await rows();
    expect(r.map((p) => [Number(p.amount), p.status, p.tableShareMode])).toEqual([[30, 'PENDING', 'EQUAL:2'], [30, 'PENDING', 'EQUAL:2']]);
  });

  it('the same phone asking the same part again gets the same PIX back', async () => {
    const first = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    const again = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    expect(again.pix.paymentId).toBe(first.pix.paymentId);
    expect(createConnectPix).toHaveBeenCalledTimes(1);
  });

  it('changes its own part only: the older PIX of that phone is cancelled, the other person\'s stays payable', async () => {
    const a1 = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    const b1 = await pay({ mode: 'EQUAL', people: 2 }, PHONE_B);
    const a2 = await pay({ mode: 'AMOUNT', amountCents: 1000 }, PHONE_A);
    const byId = Object.fromEntries((await rows()).map((p) => [p.id, p]));
    expect(byId[a1.pix.paymentId].status).toBe('CANCELLED');
    expect(byId[b1.pix.paymentId].status).toBe('PENDING');
    expect(byId[a2.pix.paymentId]).toMatchObject({ status: 'PENDING', tableShareMode: 'AMOUNT' });
    expect(cancelConnectPayment).toHaveBeenCalledTimes(1);
  });

  it('the old "pay everything" route (no phone key) never cancels a phone\'s PIX', async () => {
    const a1 = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    const r = await resolvePixTarget({ qrToken: table.qrToken });
    await createPixForTarget(r.target, { email: 'cliente@exemplo.com', name: 'Cliente' });
    expect((await prisma.payment.findUnique({ where: { id: a1.pix.paymentId } })).status).toBe('PENDING');
  });

  it('keeps the CPF on the payment for the note', async () => {
    const r = await resolvePixTarget({ qrToken: table.qrToken, share: { mode: 'ALL', cpf: '52998224725', payerKey: PHONE_A } });
    const out = await createPixForTarget(r.target, { email: 'cliente@exemplo.com', name: 'Cliente' });
    expect((await prisma.payment.findUnique({ where: { id: out.pix.paymentId } })).customerDocument).toBe('52998224725');
  });

  it('two parts paid close the bill; the second part is what is left after the first', async () => {
    const a = await pay({ mode: 'AMOUNT', amountCents: 2500 }, PHONE_A);
    expect((await approve(a.pix.paymentId)).outcome).toBe('applied');
    const b = await pay({ mode: 'EQUAL', people: 2 }, PHONE_B);
    expect(b.pix.amount).toBe(30); // ceil(6000 / 2), less than the R$ 35,00 left
    await approve(b.pix.paymentId);
    const c = await pay({ mode: 'ALL' }, PHONE_A);
    expect(c.pix.amount).toBe(5);
    expect((await approve(c.pix.paymentId)).outcome).toBe('closed');
    expect((await prisma.orderSession.findUnique({ where: { id: session.id } })).status).toBe('CLOSED');
  });

  it('an item added after someone paid raises what is left', async () => {
    const a = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    await approve(a.pix.paymentId);
    await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: burger.id, price: 20, quantity: 1 } });
    const b = await pay({ mode: 'ALL' }, PHONE_B);
    expect(b.pix.amount).toBe(50); // 80 - 30
  });

  it('both pay everything: both are kept, the bill closes once and the manager is told to refund', async () => {
    const [a, b] = await Promise.all([pay({ mode: 'ALL' }, PHONE_A), pay({ mode: 'ALL' }, PHONE_B)]);
    const first = await approve(a.pix.paymentId);
    const second = await approve(b.pix.paymentId);
    expect([first.outcome, second.outcome].sort()).toEqual(['bill-closed', 'closed']);
    expect((await rows()).filter((p) => p.status === 'APPROVED')).toHaveLength(2);
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId, data: { path: ['kind'], equals: 'table-overpaid' } } })).toBe(1);
  });

  it('refuses a part over what is left, and a phone key that is not one', async () => {
    expect(await pay({ mode: 'AMOUNT', amountCents: 6001 }, PHONE_A)).toMatchObject({ ok: false, status: 422 });
    expect(await resolvePixTarget({ qrToken: table.qrToken, share: { mode: 'ALL', cpf: null, payerKey: 'bad' } })).toMatchObject({ ok: false, status: 422 });
  });
});
