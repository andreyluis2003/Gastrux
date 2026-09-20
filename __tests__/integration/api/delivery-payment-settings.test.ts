// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import {
  getDeliveryPaymentSettings,
  saveDeliveryPaymentSettings,
  getDeliveryPaymentOptions,
} from '../../../lib/delivery-payments/settings-service';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { GET, PUT } from '../../../app/api/admin/delivery/payment-settings/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const VALID = {
  acceptCash: false,
  acceptCreditOnDelivery: true,
  acceptDebitOnDelivery: false,
  acceptVoucherOnDelivery: true,
  voucherBrands: ['VR', 'TICKET'],
};

describe('delivery payment settings', () => {
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

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
  });

  const asStaff = (role = 'OWNER') =>
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role },
    });

  const put = (body: any) =>
    PUT(new Request('https://gastrux.test/api/admin/delivery/payment-settings', { method: 'PUT', body: JSON.stringify(body) }) as any);

  describe('service', () => {
    it('returns the defaults when the restaurant never saved settings', async () => {
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual({
        acceptCash: true,
        acceptCreditOnDelivery: true,
        acceptDebitOnDelivery: true,
        acceptVoucherOnDelivery: false,
        voucherBrands: [],
      });
    });

    it('saves and reads back, and keeps restaurants isolated', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual(VALID);
      expect((await getDeliveryPaymentSettings(B.restaurantId)).acceptCash).toBe(true);
    });

    it('overwrites on a second save (one row per restaurant)', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      await saveDeliveryPaymentSettings(A.restaurantId, { ...VALID, acceptCash: true });
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
      expect((await getDeliveryPaymentSettings(A.restaurantId)).acceptCash).toBe(true);
    });

    it('derives the options from the settings and the Mercado Pago connection', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      const offline = await getDeliveryPaymentOptions(A.restaurantId);
      expect(offline.online).toEqual({ pix: false, card: false });
      expect(offline.onDelivery).toEqual({
        cash: false, credit: true, debit: false, voucher: { enabled: true, brands: ['VR', 'TICKET'] },
      });

      await saveConnection(A.restaurantId, TOKENS);
      expect((await getDeliveryPaymentOptions(A.restaurantId)).online).toEqual({ pix: true, card: true });
      expect((await getDeliveryPaymentOptions(B.restaurantId)).online).toEqual({ pix: false, card: false });
    });
  });

  describe('admin route', () => {
    it('rejects unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect((await GET()).status).toBe(401);
      expect((await put(VALID)).status).toBe(401);
    });

    it('denies roles outside the admin set', async () => {
      asStaff('CASHIER');
      expect((await GET()).status).toBe(403);
      expect((await put(VALID)).status).toBe(403);
    });

    it('returns the defaults and the online connection state', async () => {
      asStaff();
      const body = await (await GET()).json();
      expect(body.settings.acceptCash).toBe(true);
      expect(body.online).toEqual({ connected: false });

      await saveConnection(A.restaurantId, TOKENS);
      expect((await (await GET()).json()).online).toEqual({ connected: true });
    });

    it("saves the session's own restaurant and ignores a restaurantId in the body", async () => {
      asStaff();
      const res = await put({ ...VALID, restaurantId: B.restaurantId });

      expect(res.status).toBe(200);
      expect((await res.json()).settings).toEqual(VALID);
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: B.restaurantId } })).toBe(0);
      expect((await getDeliveryPaymentSettings(A.restaurantId)).voucherBrands).toEqual(['VR', 'TICKET']);
    });

    it('answers 400 for invalid input and saves nothing', async () => {
      asStaff();
      const res = await put({ ...VALID, voucherBrands: [] });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Escolha ao menos uma bandeira de vale-refeição');
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });
  });
});
