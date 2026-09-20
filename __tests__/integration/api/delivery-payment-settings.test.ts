// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData, createUserWithRole } from '../helpers/multi-tenant';

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
  let managerA: { userId: string; email: string };
  let cashierA: { userId: string; email: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;

    // Members of restaurant A who are not its owner (ruling R20 fixtures).
    managerA = await createUserWithRole(A.restaurantId, 'MANAGER', 'r28-manager@integration.test');
    cashierA = await createUserWithRole(A.restaurantId, 'CASHIER', 'r28-cashier@integration.test');
    // Globally OWNER (of some other restaurant), but only a CASHIER member here:
    // the case a global-role check would let through.
    await prisma.user.update({ where: { id: cashierA.userId }, data: { role: 'OWNER' } });
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    await prisma.user.deleteMany({ where: { id: { in: [managerA.userId, cashierA.userId] } } });
    if (savedKey === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
  });

  const asUser = (id: string, email: string, role?: string) =>
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id, email, role } });
  const asStaff = (role = 'OWNER') => asUser(A.ownerId, 'owner-a@integration.test', role);
  const asOwnerB = () => asUser(B.ownerId, 'owner-b@integration.test', 'OWNER');

  const putRaw = (raw: string) =>
    PUT(new Request('https://gastrux.test/api/admin/delivery/payment-settings', { method: 'PUT', body: raw }) as any);
  const put = (body: any) => putRaw(JSON.stringify(body));

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

    it('denies a globally-OWNER user who is only a CASHIER member of this restaurant, and saves nothing', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      asUser(cashierA.userId, cashierA.email, 'OWNER');

      const res = await put({ ...VALID, acceptCash: true, voucherBrands: ['VR'] });

      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Apenas o dono, administrador ou gerente pode alterar as formas de pagamento');
      expect((await GET()).status).toBe(403);
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual(VALID);
    });

    it('rejects a session with no role when the user is not a manager here', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      asUser(cashierA.userId, cashierA.email, undefined);

      expect((await GET()).status).toBe(403);
      expect((await put({ ...VALID, acceptCash: true })).status).toBe(403);
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual(VALID);
    });

    it('allows an active MANAGER member of the restaurant', async () => {
      asUser(managerA.userId, managerA.email, 'MANAGER');

      expect((await GET()).status).toBe(200);
      const res = await put(VALID);

      expect(res.status).toBe(200);
      expect((await res.json()).settings).toEqual(VALID);
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual(VALID);
    });

    it("scopes GET and PUT to the caller's own restaurant (B never sees or changes A)", async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      asOwnerB();

      const seen = await (await GET()).json();
      expect(seen.settings.acceptCash).toBe(true);
      expect(seen.settings.voucherBrands).toEqual([]);

      const res = await put({ ...VALID, acceptCash: true, acceptVoucherOnDelivery: false, voucherBrands: [], restaurantId: A.restaurantId });

      expect(res.status).toBe(200);
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual(VALID);
      expect((await getDeliveryPaymentSettings(B.restaurantId)).acceptCash).toBe(true);
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: B.restaurantId } })).toBe(1);
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

    it('answers 400 for a malformed JSON body and saves nothing', async () => {
      asStaff();

      expect((await putRaw('{not json')).status).toBe(400);
      expect((await putRaw('null')).status).toBe(400);
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
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
