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

    // R2 (fixed 2026-09-23): a replay hit the (restaurantId, externalOrderId) unique key and the route
    // answered 500, so the platform kept retrying.
    it.each([2, 5])('replayed %i times in a row: every answer is 2xx and there is still ONE kitchen order (R2)', async (times) => {
      const data = payload();
      const statuses = [];
      for (let i = 0; i < times; i++) statuses.push((await send(data)).status);

      expect(statuses.every(ok)).toBe(true);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
    });

    it('five deliveries at the same instant produce ONE kitchen order and no 500 (R2)', async () => {
      const data = payload();
      const statuses = (await Promise.all(Array.from({ length: 5 }, () => send(data)))).map((r) => r.status);

      expect(statuses.filter((s) => s >= 500)).toEqual([]);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
    });

    it('a replay answers 200 with duplicate:true and points at the SAME kitchen order', async () => {
      const data = payload();
      const first = await send(data);
      const again = await send(data);

      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      const a = await first.json();
      const b = await again.json();
      expect(b).toMatchObject({ success: true, duplicate: true, externalOrderId: a.externalOrderId, kdsOrderId: a.kdsOrderId });
      expect(a.kdsOrderId).toBeTruthy();
    });

    it('simultaneous deliveries: exactly one answers 201 and all point at the same kitchen order', async () => {
      const data = payload();
      const responses = await Promise.all(Array.from({ length: 5 }, () => send(data)));
      const bodies = await Promise.all(responses.map((r) => r.json()));

      expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 200)).toHaveLength(4);
      expect(new Set(bodies.map((b) => b.kdsOrderId)).size).toBe(1);
      expect(bodies[0].kdsOrderId).toBeTruthy();
    });

    it('an order without an id is rejected with 400, not a 500', async () => {
      const res = await send(payload({ orderId: undefined, id: undefined }));
      expect(res.status).toBe(400);
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
    // R8 (fixed 2026-09-23): an external order saved without its kitchen order (first attempt failed)
    // could never be healed: every retry was a 500 on the unique key.
    it('a retry creates the missing kitchen order for an external order that has none (R8)', async () => {
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

  describe('several retries hit a half-saved order at once', () => {
    it('heals it once: one kitchen order, linked back to the external order', async () => {
      const data = payload();
      const integration = await prisma.deliveryIntegration.findFirst({ where: { restaurantId: A.restaurantId, storeId: STORE } });
      const ext = await prisma.externalOrder.create({
        data: {
          restaurantId: A.restaurantId, integrationId: integration.id, externalOrderId: data.orderId, status: 'PENDING',
          totalAmount: 60, customerName: 'Ana', customerPhone: '1', deliveryAddress: 'Rua 1', items: JSON.stringify(data.items),
        },
      });

      const responses = await Promise.all(Array.from({ length: 5 }, () => send(data)));

      expect(responses.filter((r) => r.status >= 500)).toHaveLength(0);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 1 });
      const order = await prisma.order.findFirst({ where: { externalOrderId: ext.id } });
      expect((await prisma.externalOrder.findUnique({ where: { id: ext.id } })).internalOrderId).toBe(order.id);
    });
  });

  describe('items the kitchen cannot match', () => {
    // R6 (fixed 2026-09-23): an order with no matching recipe used to vanish (201, no kitchen order,
    // nobody told). Now the operator gets a CRITICAL alert, once per order even if the platform replays.
    it('an order with NO matching recipe raises ONE critical alert, also when replayed (R6)', async () => {
      const data = payload({ items: [{ externalItemId: 'zz', name: `Prato inexistente ${tag}`, quantity: 1 }] });

      const res = await send(data);
      await send(data);

      expect(ok(res.status)).toBe(true);
      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 0 });
      const alerts = await prisma.notification.findMany({ where: { restaurantId: A.restaurantId } });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('CRITICAL');
      expect(alerts[0].message).toContain(data.orderId);
      expect(alerts[0].message).toContain('Prato inexistente');
    });

    it('a partly matched order goes to the kitchen WITH the missing items written on the ticket, and alerts once', async () => {
      const data = payload({
        items: [
          { externalItemId: 'x1', name: dishA.name, quantity: 2 },
          { externalItemId: 'zz', name: `Sobremesa sem cadastro ${tag}`, quantity: 3 },
        ],
      });

      await send(data);
      await send(data);

      const order = await prisma.order.findFirst({ where: { externalOrder: { externalOrderId: data.orderId } }, include: { items: true } });
      expect(order.items.map((i) => [i.recipeId, i.quantity])).toEqual([[dishA.id, 2]]);
      expect(order.specialInstructions).toContain('NÃO MAPEADOS');
      expect(order.specialInstructions).toContain('3x Sobremesa sem cadastro');
      const alerts = await prisma.notification.findMany({ where: { restaurantId: A.restaurantId } });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('HIGH');
    });

    it('an item with no name and no id matches NOTHING (it must not become an empty filter that matches any recipe)', async () => {
      const data = payload({ items: [{ quantity: 1 }] });

      await send(data);

      expect(await counts(data.orderId)).toEqual({ external: 1, orders: 0 });
      expect(await prisma.orderItem.count({ where: { order: { restaurantId: A.restaurantId } } })).toBe(0);
    });

    it('items that cannot be read raise a critical alert instead of vanishing', async () => {
      const data = payload();
      const integration = await prisma.deliveryIntegration.findFirst({ where: { restaurantId: A.restaurantId, storeId: STORE } });
      await prisma.externalOrder.create({
        data: {
          restaurantId: A.restaurantId, integrationId: integration.id, externalOrderId: data.orderId, status: 'PENDING',
          totalAmount: 60, customerName: 'Ana', customerPhone: '1', deliveryAddress: 'Rua 1', items: '{not json',
        },
      });

      await send(data);

      const alerts = await prisma.notification.findMany({ where: { restaurantId: A.restaurantId } });
      expect(alerts).toHaveLength(1);
      expect(alerts[0].severity).toBe('CRITICAL');
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

    const statusOf = async (orderId: string) =>
      (await prisma.externalOrder.findFirst({ where: { restaurantId: A.restaurantId, externalOrderId: orderId } })).status;

    // R4 (fixed 2026-09-23): any status used to be written as received (no state machine).
    it('a finished order (DELIVERED) is not moved back by a late older status, and the platform gets a 2xx (R4)', async () => {
      const data = payload();
      await send(data);
      await send(statusEvent(data.orderId, 'DELIVERED'));

      const late = await send(statusEvent(data.orderId, 'PREPARING'));

      expect(late.status).toBe(200);
      expect(await late.json()).toMatchObject({ ignored: true, status: 'DELIVERED' });
      expect(await statusOf(data.orderId)).toBe('DELIVERED');
    });

    it('statuses move forward (skipping steps is fine) and a repeat changes nothing', async () => {
      const data = payload();
      await send(data);

      await send(statusEvent(data.orderId, 'CONFIRMED'));
      expect(await statusOf(data.orderId)).toBe('CONFIRMED');
      await send(statusEvent(data.orderId, 'READY'));
      expect(await statusOf(data.orderId)).toBe('READY');
      await send(statusEvent(data.orderId, 'CONFIRMED'));
      expect(await statusOf(data.orderId)).toBe('READY');
      const repeat = await send(statusEvent(data.orderId, 'READY'));
      expect(repeat.status).toBe(200);
      expect(await statusOf(data.orderId)).toBe('READY');
    });

    it('a cancellation is final: a later PREPARING or DELIVERED does not resurrect the order', async () => {
      const data = payload();
      await send(data);
      await send(statusEvent(data.orderId, 'CANCELLED'));

      await send(statusEvent(data.orderId, 'PREPARING'));
      await send(statusEvent(data.orderId, 'DELIVERED'));

      expect(await statusOf(data.orderId)).toBe('CANCELLED');
    });

    it('an unknown status name is rejected with 400 (not a 500)', async () => {
      const data = payload();
      await send(data);
      const res = await send(statusEvent(data.orderId, 'TELEPORTED'));
      expect(res.status).toBe(400);
      expect(await statusOf(data.orderId)).toBe('PENDING');
    });

    // R5 (fixed 2026-09-23): a status for an order not received yet answered 200 and was lost.
    it('a status that overtakes its order gets a retryable 503, and the retry is applied once the order arrives (R5)', async () => {
      const data = payload();

      const early = await send(statusEvent(data.orderId, 'CONFIRMED'));
      expect(early.status).toBe(503);
      expect(early.headers.get('retry-after')).toBe('30');

      await send(data);
      const retry = await send(statusEvent(data.orderId, 'CONFIRMED'));

      expect(retry.status).toBe(200);
      expect(await statusOf(data.orderId)).toBe('CONFIRMED');
    });
  });
});
