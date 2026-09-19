// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
  createPixPreference: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { createCheckoutPreference, createPixPreference } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST } from '../../../app/api/pagamentos/mp/checkout/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PREFERENCE = { id: 'pref-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

describe('POST /api/pagamentos/mp/checkout', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ['CREDENTIALS_ENCRYPTION_KEY', 'NEXTAUTH_URL'].forEach((k) => (saved[k] = process.env[k]));
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    Object.entries(saved).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
    createCheckoutPreference.mockResolvedValue(PREFERENCE);
    createPixPreference.mockResolvedValue(PREFERENCE);
  });

  const checkout = (body: any) =>
    POST(new Request('https://gastrux.test/api/pagamentos/mp/checkout', { method: 'POST', body: JSON.stringify(body) }) as any);

  const BODY = {
    orderId: 'order-1',
    items: [{ id: 'i1', title: 'Pizza', quantity: 2, unitPrice: 30 }],
    payer: { email: 'cli@ex.com', name: 'Cliente' },
  };

  it('rejects unauthenticated requests', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await checkout(BODY)).status).toBe(401);
  });

  it('answers 409 and creates nothing when the restaurant has no connection', async () => {
    const res = await checkout(BODY);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
  });

  it("does not use another restaurant's connection", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    expect((await checkout(BODY)).status).toBe(409);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it("creates the payment and the preference with the restaurant's own token", async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const res = await checkout(BODY);
    const body = await res.json();

    expect(res.status).toBe(201);
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    expect(payment).toMatchObject({ restaurantId: A.restaurantId, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' });
    expect(Number(payment.amount)).toBe(60);

    const [input, client] = createCheckoutPreference.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(input.externalReference).toBe(payment.id);
    expect(input.notificationUrl).toBe(`https://gastrux.test/api/pagamentos/mp/webhook?rid=${A.restaurantId}`);

    const tx = await prisma.mercadoPagoTransaction.findFirst({ where: { paymentId: payment.id } });
    expect(tx.preferenceId).toBe('pref-1');
  });

  it('uses the PIX preference with the restaurant client when pixOnly is set', async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const res = await checkout({ ...BODY, pixOnly: true });

    expect(res.status).toBe(201);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(createPixPreference.mock.calls[0][1].accessToken).toBe('APP_USR-a');
  });
});
