// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/api/tier-middleware', () => ({
  ...jest.requireActual('../../../lib/api/tier-middleware'),
  enforceResourceLimit: jest.fn().mockResolvedValue(null),
}));

import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { POST } from '../../../app/api/public/delivery/order/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const ALL_OFF = { acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] };

describe('POST /api/public/delivery/order - payment choice', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let itemA: string;
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  const makeMenuItem = async (restaurantId: string) => {
    const suffix = crypto.randomBytes(4).toString('hex');
    const category = await prisma.menuCategory.create({ data: { restaurantId, name: `Cat ${suffix}` } });
    const recipe = await prisma.recipe.create({
      data: { restaurantId, code: `R-${suffix}`, name: `Prato ${suffix}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' },
    });
    const item = await prisma.menuItem.create({
      data: { restaurantId, categoryId: category.id, name: `Item ${suffix}`, price: 20, recipeId: recipe.id, active: true, available: true },
    });
    return item.id;
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    itemA = await makeMenuItem(A.restaurantId);
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(cleanRows);

  // menu item 20 + delivery fee 5 = server total 25
  const body = (extra = {}) => ({
    restaurantId: A.restaurantId,
    customerName: 'Maria',
    customerPhone: '11999999999',
    deliveryAddress: 'Rua A, 1',
    items: [{ menuItemId: itemA, quantity: 1 }],
    deliveryFee: 5,
    ...extra,
  });

  const post = (payload: any) =>
    POST(new Request('https://gastrux.test/api/public/delivery/order', { method: 'POST', body: JSON.stringify(payload) }) as any);

  const orderCount = () => prisma.order.count({ where: { restaurantId: A.restaurantId } });

  it('requires a payment method and creates nothing without one', async () => {
    const res = await post(body());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Escolha a forma de pagamento');
    expect(await orderCount()).toBe(0);
  });

  it('rejects an online method when the restaurant has no Mercado Pago connection, accepts it with one', async () => {
    const denied = await post(body({ paymentMethod: 'ONLINE_PIX' }));
    expect(denied.status).toBe(400);
    expect(await orderCount()).toBe(0);

    await saveConnection(A.restaurantId, TOKENS);
    const res = await post(body({ paymentMethod: 'ONLINE_PIX' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.order.paymentMethod).toBe('ONLINE_PIX');
    const order = await prisma.order.findUnique({ where: { id: json.order.id } });
    expect(order.paymentMethod).toBe('ONLINE_PIX');
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.specialInstructions).toContain('Pagamento: PIX online');
  });

  it('stores cash with change and tells the driver how much change to bring', async () => {
    const res = await post(body({ paymentMethod: 'CASH', changeFor: 100 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.order.paymentSummary).toBe('Pagamento na entrega: dinheiro — troco para R$ 100,00 (levar R$ 75,00 de troco)');
    const order = await prisma.order.findUnique({ where: { id: json.order.id } });
    expect(order.paymentMethod).toBe('CASH');
    expect(Number(order.cashChangeFor)).toBe(100);
    expect(order.voucherBrand).toBeNull();
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.specialInstructions).toContain('Pagamento na entrega: dinheiro — troco para R$ 100,00');
  });

  it('validates change against the SERVER total, ignoring any total sent by the browser', async () => {
    const res = await post(body({ paymentMethod: 'CASH', changeFor: 10, total: 1 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('O valor para troco deve ser maior ou igual ao total do pedido');
    expect(await orderCount()).toBe(0);
  });

  it('accepts credit and debit on delivery by default and refuses them once the restaurant turns them off', async () => {
    expect((await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY' }))).status).toBe(200);
    expect((await post(body({ paymentMethod: 'DEBIT_ON_DELIVERY' }))).status).toBe(200);

    await saveDeliveryPaymentSettings(A.restaurantId, ALL_OFF);
    expect((await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY' }))).status).toBe(400);
    expect((await post(body({ paymentMethod: 'CASH' }))).status).toBe(400);
  });

  it('keeps vouchers off by default and needs an accepted brand once enabled', async () => {
    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'VR' }))).status).toBe(400);

    await saveDeliveryPaymentSettings(A.restaurantId, { ...ALL_OFF, acceptCash: true, acceptVoucherOnDelivery: true, voucherBrands: ['VR'] });
    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY' }))).status).toBe(400);
    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'ALELO' }))).status).toBe(400);

    const res = await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'vr' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.order.paymentSummary).toBe('Pagamento na entrega: vale-refeição/alimentação VR (levar maquininha)');
    expect((await prisma.order.findUnique({ where: { id: json.order.id } })).voucherBrand).toBe('VR');
  });

  it("never applies another restaurant's settings or connection", async () => {
    await saveDeliveryPaymentSettings(B.restaurantId, { ...ALL_OFF, acceptCash: true, acceptVoucherOnDelivery: true, voucherBrands: ['VR'] });
    await saveConnection(B.restaurantId, TOKENS);

    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'VR' }))).status).toBe(400);
    expect((await post(body({ paymentMethod: 'ONLINE_CARD' }))).status).toBe(400);
    expect(await orderCount()).toBe(0);
  });

  it('refuses every method when the restaurant offers nothing', async () => {
    await saveDeliveryPaymentSettings(A.restaurantId, ALL_OFF);
    for (const paymentMethod of ['ONLINE_PIX', 'ONLINE_CARD', 'CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY']) {
      expect((await post(body({ paymentMethod, voucherBrand: 'VR' }))).status).toBe(400);
    }
    expect(await orderCount()).toBe(0);
  });
});
