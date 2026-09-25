// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { GET as deliveryMenu } from '../../../app/api/public/delivery/menu/[restaurantId]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('GET /api/public/delivery/menu - paymentOptions', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(cleanRows);

  const menu = async (restaurantId: string) =>
    (await deliveryMenu(new Request('https://gastrux.test/x') as any, { params: { restaurantId } })).json();

  it('offers the default on-delivery methods and no online methods without a connection', async () => {
    const { restaurant } = await menu(A.restaurantId);
    expect(restaurant.paymentOptions).toEqual({
      online: { pix: false, card: false },
      onDelivery: { cash: true, credit: true, debit: true, voucher: { enabled: false, brands: [] } },
    });
    expect(restaurant.acceptsOnlinePayment).toBe(false);
  });

  it('adds the online methods when the restaurant is connected', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const { restaurant } = await menu(A.restaurantId);
    expect(restaurant.paymentOptions.online).toEqual({ pix: true, card: true });
    expect(restaurant.acceptsOnlinePayment).toBe(true);
  });

  it('reflects the restaurant settings and never another restaurant', async () => {
    await saveDeliveryPaymentSettings(B.restaurantId, {
      acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: true, voucherBrands: ['SODEXO'],
    });

    const b = (await menu(B.restaurantId)).restaurant.paymentOptions.onDelivery;
    expect(b).toEqual({ cash: false, credit: false, debit: false, voucher: { enabled: true, brands: ['SODEXO'] } });
    expect((await menu(A.restaurantId)).restaurant.paymentOptions.onDelivery.cash).toBe(true);
  });

  it('never exposes token material', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    expect(JSON.stringify(await menu(A.restaurantId))).not.toMatch(/APP_USR|TG-r|accessToken|refreshToken|v1:/);
  });
});
