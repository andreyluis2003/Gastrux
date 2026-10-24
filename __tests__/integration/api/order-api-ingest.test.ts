// @ts-nocheck
/** One pipeline for incoming delivery orders (plan 2026-10-23 api-de-pedidos, Task 4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ingestDeliveryOrder, acceptDeliveryOrder, rejectDeliveryOrder } from '../../../lib/delivery-orders/ingest';
import { parseOrderApiInput } from '../../../lib/delivery-orders/input';
import { salesInRange } from '../../../lib/finance/month-sales';
import { changeOrderStatus } from '../../../lib/kds/order-status';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let seq = 0;

describe('ingestDeliveryOrder', () => {
  let rid, ownerId, integrationId, member, espeto, refri;
  const input = (codigo, over: any = {}) => {
    const body = {
      codigo, cliente: { nome: 'Ana Lima', celular: `(11) 9${String(70000000 + seq++).padStart(8, '0')}` }, retirada: false,
      entrega: { endereco: 'Rua A, 10' },
      itens: [{ codigo: 'ESP-01', nome: 'Espeto da casa', quantidade: 2, precoUnitario: 14 }, { nome: 'Refrigerante lata', quantidade: 2, precoUnitario: 6 }],
      taxaEntrega: 7, desconto: 0, total: 47, pagamento: { forma: 'PIX', pago: true }, ...over,
    };
    const r = parseOrderApiInput(body);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const ingest = (codigo, over?, platform = 'gastrux_api') => ingestDeliveryOrder({ restaurantId: rid, integrationId, platform, input: input(codigo, over) });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `oai-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Oai ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
    member = { userId: ownerId, restaurantId: rid, role: 'OWNER' };
    integrationId = (await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'gastrux_api', apiKey: 'x', webhookSecret: 'y' } })).id;
    const recipe = (name) => prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10 } });
    espeto = await recipe('Espeto de picanha');
    refri = await recipe('Refrigerante lata');
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Espetos', position: 1, active: true } });
    await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Espeto de picanha', price: 14, recipeId: espeto.id, code: 'ESP-01' } });
  }, 60000);
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId: rid } });
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.auditLog.deleteMany({ where: { userId: ownerId } });
    await prisma.user.delete({ where: { id: ownerId } });
  });

  it('accepted by itself: the kitchen order carries the values, and they reach the sales', async () => {
    const before = await salesInRange(rid, new Date(Date.now() - 3600e3), new Date(Date.now() + 3600e3));
    const r = await ingest(`A-${tag}`);
    expect(r.duplicate).toBe(false);
    expect(r.externalOrder.status).toBe('CONFIRMED');
    const order = await prisma.order.findUnique({ where: { id: r.kitchenOrderId }, include: { items: true } });
    expect(Number(order.subtotal)).toBe(40);
    expect([Number(order.fees), Number(order.discount ?? 0), Number(order.total)]).toEqual([7, 0, 47]);
    expect(order).toMatchObject({ paymentMethod: 'ONLINE_PIX', paymentStatus: 'APPROVED', orderType: 'DELIVERY' });
    // The product code picked the right recipe, the name the other one
    expect(order.items.map((i) => i.recipeId).sort()).toEqual([espeto.id, refri.id].sort());
    const after = await salesInRange(rid, new Date(Date.now() - 3600e3), new Date(Date.now() + 3600e3));
    expect(after.deliveryCents - before.deliveryCents).toBe(4700);
  });

  it('with "Aceitar" required: waits, rings the bell, accept creates the kitchen order once; reject only while waiting', async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { deliveryAutoAccept: false } });
    try {
      const r = await ingest(`B-${tag}`);
      expect(r.externalOrder.status).toBe('PENDING');
      expect(r.kitchenOrderId).toBeNull();
      expect(await prisma.notification.count({ where: { restaurantId: rid, data: { path: ['externalOrderId'], equals: r.externalOrder.id } } })).toBe(1);
      const first = await acceptDeliveryOrder(rid, r.externalOrder.id, { userId: ownerId });
      expect(first.kitchenOrderId).toBeTruthy();
      const second = await acceptDeliveryOrder(rid, r.externalOrder.id, { userId: ownerId });
      expect(second.kitchenOrderId).toBe(first.kitchenOrderId);
      expect(await prisma.order.count({ where: { externalOrderId: r.externalOrder.id } })).toBe(1);
      await expect(rejectDeliveryOrder(member, r.externalOrder.id, 'cliente desistiu')).rejects.toMatchObject({ status: 409 });
      const w = await ingest(`C-${tag}`);
      await expect(rejectDeliveryOrder(member, w.externalOrder.id, 'x')).rejects.toMatchObject({ status: 400 });
      await rejectDeliveryOrder(member, w.externalOrder.id, 'fora da área de entrega');
      expect((await prisma.externalOrder.findUnique({ where: { id: w.externalOrder.id } })).status).toBe('CANCELLED');
      expect(await prisma.order.count({ where: { externalOrderId: w.externalOrder.id } })).toBe(0);
    } finally {
      await prisma.restaurant.update({ where: { id: rid }, data: { deliveryAutoAccept: true } });
    }
  });

  it('the same order twice at once: one external order, one kitchen order', async () => {
    const [x, y] = await Promise.all([ingest(`D-${tag}`), ingest(`D-${tag}`)]);
    expect(x.externalOrder.id).toBe(y.externalOrder.id);
    expect([x.duplicate, y.duplicate].sort()).toEqual([false, true]);
    expect(await prisma.externalOrder.count({ where: { restaurantId: rid, externalOrderId: `D-${tag}` } })).toBe(1);
    expect(await prisma.order.count({ where: { externalOrderId: x.externalOrder.id } })).toBe(1);
  });

  it('an unknown item still goes to the kitchen as text, and its value stays in the total', async () => {
    const r = await ingest(`E-${tag}`, { itens: [{ nome: 'Espeto da casa', codigo: 'ESP-01', quantidade: 1, precoUnitario: 14 }, { nome: 'Item que não existe', quantidade: 1, precoUnitario: 9 }], total: 30 });
    const order = await prisma.order.findUnique({ where: { id: r.kitchenOrderId } });
    expect(Number(order.total)).toBe(30);
    expect(order.specialInstructions).toContain('Item que não existe');
  });

  it('the API order makes the customer and earns cashback when the kitchen completes it; a platform order makes no customer', async () => {
    const r = await ingest(`F-${tag}`, { cliente: { nome: 'Carla Dias', celular: '(11) 97777-1234' } });
    const order = await prisma.order.findUnique({ where: { id: r.kitchenOrderId } });
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
    expect(customer).toMatchObject({ restaurantId: rid, phoneDigits: '11977771234', name: 'Carla Dias' });
    await changeOrderStatus(rid, order.id, 'COMPLETED');
    const credit = await prisma.cashbackCredit.findFirst({ where: { orderId: order.id } });
    expect(credit?.amountCents).toBe(200); // 5% of the R$ 40 of items
    const keetaId = (await prisma.deliveryIntegration.create({ data: { restaurantId: rid, platform: 'keeta', apiKey: 'k', webhookSecret: 'k' } })).id;
    const k = await ingestDeliveryOrder({ restaurantId: rid, integrationId: keetaId, platform: 'keeta', input: input(`G-${tag}`, { cliente: { nome: 'Do app', celular: '(11) 96666-0000' } }) });
    expect((await prisma.order.findUnique({ where: { id: k.kitchenOrderId } })).customerId).toBeNull();
    expect(await prisma.customer.count({ where: { restaurantId: rid, phoneDigits: '11966660000' } })).toBe(0);
  });
});
