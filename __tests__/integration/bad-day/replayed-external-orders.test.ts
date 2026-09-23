// @ts-nocheck
/**
 * "Bad day" scenario 3 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * a delivery platform (iFood etc.) sends the same order webhook again, several times, at the
 * same instant, or out of order. Each case states the DESIRED behaviour: exactly ONE order in
 * the kitchen, the platform gets a 2xx (so it stops retrying), nothing is lost, nothing leaks
 * to another restaurant. A case that documents a known gap is written with `it.failing`.
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { POST as webhook } from '../../../app/api/external/orders/webhook/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 3: delivery order webhook replayed', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let dishA: any;
  let dishB: any;
  const SECRET = 'whsec-integration-a';
  const STORE = `store-${crypto.randomBytes(3).toString('hex')}`;
  const tag = crypto.randomBytes(3).toString('hex');

  const mkRecipe = (restaurantId: string, name: string) =>
    prisma.recipe.create({ data: { restaurantId, code: `R-${crypto.randomBytes(3).toString('hex')}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });

  const wipe = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.externalOrder.updateMany({ where: { restaurantId: { in: ids } }, data: { internalOrderId: null } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.externalOrder.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    dishA = await mkRecipe(A.restaurantId, `Feijoada ${tag}`);
    dishB = await mkRecipe(B.restaurantId, `Lasanha ${tag}`);
    await prisma.deliveryIntegration.create({
      data: { restaurantId: A.restaurantId, platform: 'ifood', apiKey: 'k', webhookSecret: SECRET, storeId: STORE },
    });
  });

  afterAll(async () => {
    await wipe();
    await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.recipe.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(wipe);

  const payload = (over: any = {}) => ({
    type: 'order.new',
    orderId: `EXT-${crypto.randomBytes(3).toString('hex')}`,
    storeId: STORE,
    totalAmount: 60,
    customerName: 'Ana',
    customerPhone: '11999990000',
    deliveryAddress: 'Rua 1, 10',
    items: [{ externalItemId: 'x1', name: dishA.name, quantity: 2 }],
    ...over,
  });
  const sign = (body: string, secret = SECRET) => crypto.createHmac('sha256', secret).update(body).digest('hex');
  const send = (data: any, headers: Record<string, string> = {}, signed = true) => {
    const body = JSON.stringify(data);
    return webhook(
      new Request('https://gastrux.test/api/external/orders/webhook', {
        method: 'POST',
        headers: { 'x-platform': 'ifood', ...(signed ? { 'x-webhook-signature': sign(body) } : {}), ...headers },
        body,
      }) as any
    );
  };
  const counts = async (externalId: string) => ({
    external: await prisma.externalOrder.count({ where: { restaurantId: A.restaurantId, externalOrderId: externalId } }),
    orders: await prisma.order.count({ where: { restaurantId: A.restaurantId, externalOrder: { externalOrderId: externalId } } }),
  });
  const ok = (status: number) => status >= 200 && status < 300;

  describe('the same order arrives more than once', () => {
    // R1 (fixed 2026-09-23): createOrderFromExternalOrder never set restaurantId (Order.restaurantId is
    // required), so the kitchen order was NEVER created while the webhook still answered 201.
    it('the first delivery creates one external order and one kitchen order for THIS restaurant (R1)', async () => {
      const data = payload();
      const res = await send(data);

      expect(res.status).toBe(201);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
      const order = await prisma.order.findFirst({ where: { externalOrder: { externalOrderId: data.orderId } }, include: { items: true } });
      expect(order.restaurantId).toBe(A.restaurantId);
      expect(order.orderType).toBe('DELIVERY');
      expect(order.items.map((i) => [i.recipeId, i.quantity])).toEqual([[dishA.id, 2]]);
    });

    // R2: a replay hits the (restaurantId, externalOrderId) unique key and the route answers 500, so the
    // platform keeps retrying. R1 masks the "one kitchen order" half until R1 is fixed.
    it.failing.each([2, 5])('replayed %i times in a row: every answer is 2xx and there is still ONE kitchen order (R2)', async (times) => {
      const data = payload();
      const statuses = [];
      for (let i = 0; i < times; i++) statuses.push((await send(data)).status);

      expect(statuses.every(ok)).toBe(true);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
    });

    it.failing('five deliveries at the same instant produce ONE kitchen order and no 500 (R2)', async () => {
      const data = payload();
      const statuses = (await Promise.all(Array.from({ length: 5 }, () => send(data)))).map((r) => r.status);

      expect(statuses.filter((s) => s >= 500)).toEqual([]);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
    });

    it('the same external id from ANOTHER restaurant is a different order (R1)', async () => {
      await prisma.deliveryIntegration.create({
        data: { restaurantId: B.restaurantId, platform: 'uber_eats', apiKey: 'k', webhookSecret: 'sb', storeId: `${STORE}-b` },
      });
      const data = payload({ orderId: 'SHARED-1' });
      await send(data);
      const body = JSON.stringify({ ...data, storeId: `${STORE}-b`, items: [{ name: dishB.name, quantity: 1 }] });
      const res = await webhook(
        new Request('https://gastrux.test/api/external/orders/webhook', {
          method: 'POST',
          headers: { 'x-platform': 'uber_eats', 'x-webhook-signature': sign(body, 'sb') },
          body,
        }) as any
      );

      expect(ok(res.status)).toBe(true);
      expect(await prisma.externalOrder.count({ where: { externalOrderId: 'SHARED-1' } })).toBe(2);
      expect(await prisma.order.count({ where: { restaurantId: B.restaurantId, externalOrder: { externalOrderId: 'SHARED-1' } } })).toBe(1);
      await prisma.externalOrder.updateMany({ where: { restaurantId: B.restaurantId }, data: { internalOrderId: null } });
      await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: B.restaurantId } });
    });

    it('the kitchen order number ignores orders numbered in another format (no KDS-NaN) (R1)', async () => {
      await prisma.order.create({
        data: { restaurantId: B.restaurantId, orderNumber: `ORD-${tag}-zz`, total: 1, paymentStatus: 'PENDING' },
      });
      const data = payload();

      await send(data);

      const order = await prisma.order.findFirst({ where: { externalOrder: { externalOrderId: data.orderId } } });
      expect(order.orderNumber).toMatch(/^KDS-[0-9]{4,}$/);
    });
  });

  describe('a delivery half-failed earlier, then the platform retries', () => {
    // R8: an external order saved without its kitchen order (first attempt failed) can never be healed:
    // every retry is a 500 on the unique key.
    it.failing('a retry creates the missing kitchen order for an external order that has none (R8)', async () => {
      const data = payload();
      const integration = await prisma.deliveryIntegration.findFirst({ where: { restaurantId: A.restaurantId, storeId: STORE } });
      await prisma.externalOrder.create({
        data: {
          restaurantId: A.restaurantId, integrationId: integration.id, externalOrderId: data.orderId, status: 'PENDING',
          totalAmount: 60, customerName: 'Ana', customerPhone: '1', deliveryAddress: 'Rua 1', items: JSON.stringify(data.items),
        },
      });

      const res = await send(data);

      expect(ok(res.status)).toBe(true);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
    });
  });

  describe('items the kitchen cannot match', () => {
    // R6: no matching recipe -> createOrderFromExternalOrder returns null; the webhook answers 201 and
    // nobody is told that a paid delivery never reached the kitchen.
    it.failing('an order with NO matching recipe is not lost silently (kitchen order or an operator alert) (R6)', async () => {
      const data = payload({ items: [{ externalItemId: 'zz', name: `Prato inexistente ${tag}`, quantity: 1 }] });

      const res = await send(data);

      const c = await counts(data.orderId);
      const alerts = await prisma.notification.count({ where: { restaurantId: A.restaurantId } });
      expect(ok(res.status)).toBe(true);
      expect(c.orders === 1 || alerts > 0).toBe(true);
    });

    // R7 (fixed with R1, 2026-09-23): the recipe lookup had no restaurantId filter and matched by name
    // across ALL restaurants.
    it('a recipe of ANOTHER restaurant is never matched by name (R7)', async () => {
      const data = payload({ items: [{ externalItemId: 'zz', name: dishB.name, quantity: 1 }] });

      await send(data);

      const items = await prisma.orderItem.findMany({ where: { recipeId: dishB.id } });
      expect(items).toHaveLength(0);
    });
  });

  describe('signature', () => {
    it('rejects a body signed with the wrong secret', async () => {
      const data = payload();
      const body = JSON.stringify(data);
      const res = await webhook(
        new Request('https://gastrux.test/api/external/orders/webhook', {
          method: 'POST', headers: { 'x-platform': 'ifood', 'x-webhook-signature': sign(body, 'wrong') }, body,
        }) as any
      );
      expect(res.status).toBe(401);
      expect(await counts(data.orderId)).toEqual({ external: 0, orders: 0 });
    });

    // R3 (fixed 2026-09-23): the check was `if (integration.webhookSecret && signature)`, so leaving the
    // header out skipped it.
    it('rejects a malformed (wrong length) signature without throwing (R3)', async () => {
      const data = payload();
      const res = await send(data, { 'x-webhook-signature': 'abc' }, false);
      expect(res.status).toBe(401);
      expect(await counts(data.orderId)).toEqual({ external: 0, orders: 0 });
    });

    it('rejects a request that omits the signature when the integration has a secret (R3)', async () => {
      const data = payload();
      const res = await send(data, {}, false);
      expect(res.status).toBe(401);
      expect(await counts(data.orderId)).toEqual({ external: 0, orders: 0 });
    });
  });

  describe('status updates out of order', () => {
    const statusEvent = (orderId: string, status: string) => ({ type: 'order.status_changed', orderId, storeId: STORE, status });

    // R4: any status is written as received; there is no state machine like the payments one.
    it.failing('a finished order (DELIVERED) is not moved back by a late older status (R4)', async () => {
      const data = payload();
      await send(data);
      await send(statusEvent(data.orderId, 'DELIVERED'));

      await send(statusEvent(data.orderId, 'PREPARING'));

      const ext = await prisma.externalOrder.findFirst({ where: { restaurantId: A.restaurantId, externalOrderId: data.orderId } });
      expect(ext.status).toBe('DELIVERED');
    });

    // R5: findFirst returns null and the route still answers 200 {success:true}: the update is lost.
    it.failing('a status for an order we have not received yet is not dropped silently (it is answered so the platform retries) (R5)', async () => {
      const res = await send(statusEvent('NOT-YET-1', 'CONFIRMED'));

      expect(res.status === 404 || res.status === 202 || res.status === 409).toBe(true);
    });
  });
});
