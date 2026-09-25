// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { GET as deliveryMenu } from '../../../app/api/public/delivery/menu/[restaurantId]/route';
import { GET as qrMenu } from '../../../app/api/public/menu/[qrToken]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('acceptsOnlinePayment flag on the public menus', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let qrToken: string;
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;

    // TableSection has @@unique([restaurantId, name]): a random suffix keeps re-runs collision-free.
    const section = await prisma.tableSection.create({
      data: { restaurantId: A.restaurantId, name: `Salão ${crypto.randomBytes(4).toString('hex')}`, capacity: 10 },
    });
    qrToken = `qr-${crypto.randomBytes(12).toString('hex')}`;
    await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 1, sectionId: section.id, capacity: 4, qrToken } });
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
  });

  const delivery = async (restaurantId: string) =>
    (await deliveryMenu(new Request('https://gastrux.test/x') as any, { params: { restaurantId } })).json();
  const qr = async () => (await qrMenu(new Request('https://gastrux.test/x') as any, { params: { qrToken } })).json();

  it('is false without a connection and true with an active one (delivery menu)', async () => {
    expect((await delivery(A.restaurantId)).restaurant.acceptsOnlinePayment).toBe(false);
    await saveConnection(A.restaurantId, TOKENS);
    expect((await delivery(A.restaurantId)).restaurant.acceptsOnlinePayment).toBe(true);
  });

  it("does not leak another restaurant's connection", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    expect((await delivery(A.restaurantId)).restaurant.acceptsOnlinePayment).toBe(false);
  });

  it('is exposed on the QR menu as well', async () => {
    expect((await qr()).restaurant.acceptsOnlinePayment).toBe(false);
    await saveConnection(A.restaurantId, TOKENS);
    expect((await qr()).restaurant.acceptsOnlinePayment).toBe(true);
  });

  it('never exposes token material', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const text = JSON.stringify(await delivery(A.restaurantId)) + JSON.stringify(await qr());
    expect(text).not.toMatch(/APP_USR|TG-r|accessToken|refreshToken|v1:/);
  });
});
