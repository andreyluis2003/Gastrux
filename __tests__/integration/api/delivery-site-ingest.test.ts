// @ts-nocheck
/**
 * The digital menu (site de delivery) in the order pipeline, with pickup (plan 2026-10-23 api-de-pedidos, Task 4b;
 * owner: the orders of the digital menu, whose link the restaurant sends by WhatsApp, pickup included, come in the
 * Gastrux format).
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/api/tier-middleware', () => ({
  ...jest.requireActual('../../../lib/api/tier-middleware'),
  enforceResourceLimit: jest.fn().mockResolvedValue(null),
}));

import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { POST } from '../../../app/api/public/delivery/order/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('site de delivery in the order pipeline', () => {
  let A, itemA;
  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    const suffix = crypto.randomBytes(4).toString('hex');
    const category = await prisma.menuCategory.create({ data: { restaurantId: A.restaurantId, name: `Cat ${suffix}` } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${suffix}`, name: `Prato ${suffix}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    itemA = (await prisma.menuItem.create({ data: { restaurantId: A.restaurantId, categoryId: category.id, name: `Item ${suffix}`, price: 20, recipeId: recipe.id, active: true, available: true } })).id;
    await saveDeliveryPaymentSettings(A.restaurantId, { acceptCash: true, acceptCreditOnDelivery: true, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] });
  }, 60000);
  afterAll(async () => {
    const ids = [A.restaurantId];
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.externalOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  const post = (payload) => POST(new Request('https://gastrux.test/api/public/delivery/order', { method: 'POST', body: JSON.stringify(payload) }) as any);
  const body = (extra = {}) => ({
    restaurantId: A.restaurantId, customerName: 'Paula', customerPhone: '11977776666', deliveryAddress: 'Rua B, 2',
    items: [{ menuItemId: itemA, quantity: 2 }], deliveryFee: 5, paymentMethod: 'CASH', ...extra,
  });

  it('a delivery order answers as before and is also an order of the pipeline, with its values', async () => {
    const res = await post(body());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.order).toMatchObject({ subtotal: 40, deliveryFee: 5, total: 45, paymentMethod: 'CASH' });
    const order = await prisma.order.findUnique({ where: { id: json.order.id }, include: { externalOrder: { include: { integration: true } } } });
    expect(order.externalOrder).toMatchObject({ status: 'CONFIRMED', externalOrderId: json.order.orderNumber, totalAmount: 45, subtotal: 40, deliveryFee: 5, internalOrderId: order.id, customerId: order.customerId });
    expect(order.externalOrder.integration.platform).toBe('delivery_site');
    expect(order.customerId).toBeTruthy();
  });

  it('pickup: no address, no delivery fee, the kitchen reads RETIRADA NO LOCAL', async () => {
    const res = await post(body({ pickup: true, deliveryAddress: undefined, deliveryFee: 9 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.order).toMatchObject({ deliveryFee: 0, total: 40 });
    const order = await prisma.order.findUnique({ where: { id: json.order.id }, include: { externalOrder: true } });
    const lines = order.specialInstructions.split('\n');
    expect(lines[0]).toBe('RETIRADA NO LOCAL');
    expect(lines.some((l) => l.startsWith('Endereço:'))).toBe(false);
    expect(lines).toContain('Pagamento na retirada: dinheiro — sem troco');
    expect(order.externalOrder.deliveryAddress).toBe('Retirada no local');
  });

  it('delivery without an address is still refused', async () => {
    expect((await post(body({ deliveryAddress: '' }))).status).toBe(400);
  });

  it('the site order goes to the kitchen even when the restaurant requires "Aceitar" (pendência: the online payment needs the order)', async () => {
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { deliveryAutoAccept: false } });
    try {
      const json = await (await post(body())).json();
      expect((await prisma.order.findUnique({ where: { id: json.order.id }, include: { externalOrder: true } })).externalOrder.status).toBe('CONFIRMED');
    } finally {
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { deliveryAutoAccept: true } });
    }
  });
});
