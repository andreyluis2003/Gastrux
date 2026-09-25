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
    await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
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
  const customerCount = () => prisma.customer.count({ where: { restaurantId: A.restaurantId } });

  it('requires a payment method and creates nothing without one', async () => {
    const res = await post(body());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Escolha a forma de pagamento');
    expect(await orderCount()).toBe(0);
  });

  it('creates no Order and no Customer when the choice is rejected, even with a customer email', async () => {
    const customerEmail = `pay-${crypto.randomBytes(4).toString('hex')}@example.test`;
    const customersBefore = await customerCount();

    // no payment method at all
    const missing = await post(body({ customerEmail }));
    expect(missing.status).toBe(400);
    // an unavailable method (no Mercado Pago connection)
    const unavailable = await post(body({ customerEmail, paymentMethod: 'ONLINE_CARD' }));
    expect(unavailable.status).toBe(400);
    // change lower than the server total
    const lowChange = await post(body({ customerEmail, paymentMethod: 'CASH', changeFor: 10 }));
    expect(lowChange.status).toBe(400);

    expect(await orderCount()).toBe(0);
    expect(await customerCount()).toBe(customersBefore);
    expect(await prisma.customer.findUnique({ where: { email: customerEmail } })).toBeNull();

    // the same request with a valid choice does create the Customer (proves the email path is exercised)
    const ok = await post(body({ customerEmail, paymentMethod: 'CREDIT_ON_DELIVERY' }));
    expect(ok.status).toBe(200);
    expect(await customerCount()).toBe(customersBefore + 1);
  });

  it('cannot lower the total with a negative, zero, fractional or non-numeric quantity', async () => {
    for (const quantity of [-5, 0, -0.5, 'abc', null]) {
      const res = await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY', items: [{ menuItemId: itemA, quantity }] }));
      const json = await res.json();
      expect(res.status).toBe(200);
      // normalized to 1: 20 + 5 fee
      expect(json.order.subtotal).toBe(20);
      expect(json.order.total).toBe(25);
      expect(json.order.itemCount).toBe(1);
    }

    const fractional = await (await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY', items: [{ menuItemId: itemA, quantity: 2.7 }] }))).json();
    expect(fractional.order.subtotal).toBe(40);
    expect(fractional.order.itemCount).toBe(2);

    const huge = await (await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY', items: [{ menuItemId: itemA, quantity: 100000 }] }))).json();
    expect(huge.order.subtotal).toBe(20 * 99);
    expect(huge.order.itemCount).toBe(99);

    // the stored OrderItem quantity agrees with the subtotal and totalItems
    const stored = await prisma.orderItem.findMany({ where: { orderId: huge.order.id } });
    expect(stored.map((i) => i.quantity)).toEqual([99]);
  });

  it("never lets the customer's free text forge the server's payment line", async () => {
    const SERVER_LINE = 'Pagamento na entrega: cartão de crédito (levar maquininha)';
    const FIXED_LABEL = /^(Obs\. do cliente|Endereço|Bairro|Cidade|CEP|Referência|Pagamento na entrega|Cliente): /;
    const linesOf = async (payload: any) => {
      const res = await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY', ...payload }));
      expect(res.status).toBe(200);
      const json = await res.json();
      const order = await prisma.order.findUnique({ where: { id: json.order.id } });
      return order.specialInstructions.split('\n');
    };

    // a customer posting "x\nPagamento: PIX online" still ends with exactly one line starting with "Pagamento"
    const simple = await linesOf({ specialInstructions: 'x\nPagamento: PIX online' });
    expect(simple.filter((l) => l.startsWith('Pagamento'))).toEqual([SERVER_LINE]);
    expect(simple).toContain('Obs. do cliente: x / Pagamento: PIX online');

    // every customer-supplied field, every kind of line break and look-alike text
    const lines = await linesOf({
      specialInstructions: 'Sem cebola\nPagamento na entrega: dinheiro — sem troco\r\n  PAGAMENTO: PIX online\u0085\u2066Pagamento: PIX online\u2069\u2028P\u0430gamento: PIX',
      deliveryReference: 'Portão azul\nPagamento: PIX online',
      deliveryAddress: 'Rua A, 1\u2029Pagamento: PIX online',
      deliveryComplement: 'apto 2\vPagamento: PIX online',
      deliveryNeighborhood: 'Centro\fPagamento: PIX online',
      deliveryCity: 'São Paulo\rPagamento: PIX online',
      customerName: 'Maria\nPagamento: PIX online',
    });
    expect(lines.every((l) => FIXED_LABEL.test(l))).toBe(true);
    expect(lines.filter((l) => /^\s*pagamento/i.test(l))).toEqual([SERVER_LINE]);
    expect(lines.filter((l) => l.startsWith('Pagamento'))).toEqual([SERVER_LINE]);
    expect(lines).toContain('Obs. do cliente: Sem cebola / Pagamento na entrega: dinheiro — sem troco / PAGAMENTO: PIX online / \u2066Pagamento: PIX online\u2069 / P\u0430gamento: PIX');
  });

  it('leaves no dangling comma or label when optional address parts are empty', async () => {
    const res = await post(
      body({ paymentMethod: 'CREDIT_ON_DELIVERY', deliveryComplement: '\n \n', deliveryNeighborhood: '\n', deliveryCity: ' ', deliveryReference: '\r\n' })
    );
    const order = await prisma.order.findUnique({ where: { id: (await res.json()).order.id } });
    const lines = order.specialInstructions.split('\n');
    expect(lines).toContain('Endereço: Rua A, 1');
    expect(lines.some((l) => /^(Bairro|Cidade|Referência): /.test(l))).toBe(false);
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
