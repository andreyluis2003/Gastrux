/** writeSiteOrder: ExternalOrder + Order of the delivery site (spec 2026-11-10 cardapio-da-semana). */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { writeSiteOrder } from '../../../lib/delivery-site/write-order';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('writeSiteOrder', () => {
  let rid, recipeId;
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `wso-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `WSO ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, name: `Feijoada ${tag}`, code: `WSO-${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } })).id;
  });

  const input = (over = {}) => ({
    restaurantId: rid, orderNumber: `DLV-T-${crypto.randomBytes(3).toString('hex')}`, customerId: null,
    customerName: 'Maria', customerPhone: '(34) 99999-0000', customerEmail: null, isPickup: false,
    deliveryAddress: 'Rua A, 1', deliveryCity: 'Sinop', deliveryZipCode: '78550-000', kitchenNote: 'Sem cebola',
    items: [{ recipeId, name: 'Feijoada', quantity: 2, specialInstructions: 'bem passada' }],
    subtotal: 40, deliveryFee: 5, discount: 3, total: 42, paymentMethod: 'CASH', cashChangeFor: 50, voucherBrand: null, ...over,
  });

  it('cria ExternalOrder e Order ligados', async () => {
    const i = input();
    const r = await writeSiteOrder(i);
    const ext = await prisma.externalOrder.findUnique({ where: { id: r.externalOrderId }, include: { integration: true } });
    const order = await prisma.order.findUnique({ where: { id: r.orderId }, include: { items: true } });
    expect(ext.integration.platform).toBe('delivery_site');
    expect(ext.status).toBe('CONFIRMED');
    expect(ext.internalOrderId).toBe(r.orderId);
    expect(Number(ext.totalAmount)).toBe(42);
    expect(JSON.parse(ext.items)).toEqual([{ name: 'Feijoada', quantity: 2 }]);
    expect(ext.deliveryAddress).toBe('Rua A, 1');
    expect(order.orderType).toBe('DELIVERY');
    expect(order.status).toBe('PENDING');
    expect(order.externalOrderId).toBe(r.externalOrderId);
    expect(order.totalItems).toBe(2);
    expect(Number(order.total)).toBe(42);
    expect(Number(order.fees)).toBe(5);
    expect(Number(order.discount)).toBe(3);
    expect(Number(order.cashChangeFor)).toBe(50);
    expect(order.specialInstructions).toBe('Sem cebola');
    expect(order.items).toHaveLength(1);
    expect(order.items[0].specialInstructions).toBe('bem passada');
  });

  it('apaga o ExternalOrder quando o Order falha', async () => {
    const i = input({ items: [{ recipeId: 'nao-existe', name: 'X', quantity: 1 }] });
    await expect(writeSiteOrder(i)).rejects.toBeTruthy();
    expect(await prisma.externalOrder.count({ where: { restaurantId: rid, externalOrderId: i.orderNumber } })).toBe(0);
  });
});
