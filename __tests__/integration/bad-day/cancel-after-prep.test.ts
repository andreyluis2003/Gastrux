// @ts-nocheck
/**
 * "Bad day" scenario 4 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * an order is cancelled after the kitchen started it (and possibly after the customer paid online).
 * Each case states the DESIRED behaviour: the cancellation is authorised for THIS restaurant only,
 * leaves a record (who / when), does not keep or lose the customer's money silently, does not
 * corrupt stock, and can neither repeat side effects nor be undone by a stray status update.
 * A case that documents a known gap is written with `it.failing` (the suite stays green and a case
 * flips to a failure the day its gap is fixed). Gaps, by priority:
 *   (C1 C2 C3 fixed 2026-09-23: the kitchen order routes never checked the restaurant, so any signed-in
 *   user of ANY restaurant could read, change or cancel any order and the list showed every restaurant's
 *   orders; now scoped to getCurrentRestaurantId() and another restaurant's order is a 404)
 *   C4 C5 C6 C7 fixed with the loss recording (audit, items closed, idempotent, COMPLETED refused)
 *   P0 money     C8 C9      cancelling a paid online order keeps the money with no refund and no alert; a
 *                           pending payment of a cancelled order stays live
 *   P1 stock     C10 C11    completing twice deducts stock (and cashback) twice; a cancelled order can be completed
 *   P1 records   C4 C6 C7   no audit record, no idempotency, a COMPLETED order can be cancelled
 *   P2           C5 C12     items are not closed; READY notifies staff of other restaurants
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as readOrder, PUT as updateOrder, DELETE as cancelOrder } from '../../../app/api/kds/orders/[id]/route';
import { GET as listKds } from '../../../app/api/kds/orders/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 4: cancellation after the kitchen started', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let recipe: any;
  let ingredient: any;
  const tag = crypto.randomBytes(3).toString('hex');
  const STOCK_START = 100;
  const QTY_PER_DISH = 2;

  const asUser = (userId: string, restaurantId: string, role = 'OWNER') => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test`, role } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const asOwnerA = () => asUser(A.ownerId, A.restaurantId);
  const asOwnerB = () => asUser(B.ownerId, B.restaurantId);

  const put = (id: string, body: any) =>
    updateOrder(new Request(`http://localhost/api/kds/orders/${id}`, { method: 'PUT', body: JSON.stringify(body) }) as any, { params: { id } });
  const del = (id: string) =>
    cancelOrder(new Request(`http://localhost/api/kds/orders/${id}`, { method: 'DELETE' }) as any, { params: { id } });

  const wipe = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.stockMovement.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { OR: [{ restaurantId: { in: ids } }, { userId: { in: [A.ownerId, B.ownerId] } }] } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.stock.update({ where: { ingredientId: ingredient.id }, data: { currentQuantity: STOCK_START } });
    await prisma.wasteLog.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    const category = await prisma.ingredientCategory.create({ data: { restaurantId: A.restaurantId, name: `Cat ${tag}` } });
    ingredient = await prisma.ingredient.create({
      data: { restaurantId: A.restaurantId, code: `I-${tag}`, name: `Farinha ${tag}`, categoryId: category.id, standardUnit: 'kg', purchaseUnit: 'kg' },
    });
    await prisma.stock.create({ data: { restaurantId: A.restaurantId, ingredientId: ingredient.id, currentQuantity: STOCK_START } });
    recipe = await prisma.recipe.create({
      data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Pizza ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' },
    });
    await prisma.recipeIngredient.create({ data: { recipeId: recipe.id, ingredientId: ingredient.id, quantity: QTY_PER_DISH, unit: 'kg' } });
  });

  afterAll(async () => {
    await wipe();
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await wipe();
    asOwnerA();
  });

  /** A kitchen order of restaurant A with 3 pizzas, in the given status. */
  async function makeOrder(over: any = {}) {
    return prisma.order.create({
      data: {
        restaurantId: A.restaurantId,
        orderNumber: `C4-${crypto.randomBytes(4).toString('hex')}`,
        orderType: 'DELIVERY',
        status: 'PREPARING',
        total: 90,
        totalItems: 1,
        items: { create: [{ recipeId: recipe.id, quantity: 3, status: 'PREPARING' }] },
        ...over,
      },
      include: { items: true },
    });
  }
  const makePayment = (order: any, status: string, extra: any = {}) =>
    prisma.payment.create({
      data: {
        restaurantId: A.restaurantId, orderId: order.id, amount: 90, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT',
        status, gatewayPaymentId: `40${Math.floor(Math.random() * 1e6)}`, ...extra,
      },
    });
  const stockNow = async () => (await prisma.stock.findUnique({ where: { ingredientId: ingredient.id } })).currentQuantity;
  const statusOf = async (id: string) => (await prisma.order.findUnique({ where: { id } })).status;

  describe('who may cancel', () => {
    it('the owner of ANOTHER restaurant cannot cancel this restaurant\'s order (C1)', async () => {
      const order = await makeOrder();
      asOwnerB();

      const res = await del(order.id);

      expect([403, 404]).toContain(res.status);
      expect(await statusOf(order.id)).toBe('PREPARING');
    });

    it('a user of ANOTHER restaurant cannot change the status of this restaurant\'s order (C2)', async () => {
      const order = await makeOrder();
      asUser(B.ownerId, B.restaurantId, 'CASHIER');

      const res = await put(order.id, { status: 'READY' });

      expect([403, 404]).toContain(res.status);
      expect(await statusOf(order.id)).toBe('PREPARING');
    });

    it('the kitchen list of one restaurant never shows another restaurant\'s orders (C3)', async () => {
      const orderA = await makeOrder();
      const orderB = await prisma.order.create({
        data: { restaurantId: B.restaurantId, orderNumber: `C4B-${crypto.randomBytes(4).toString('hex')}`, orderType: 'DELIVERY', status: 'PREPARING', total: 10 },
      });
      asOwnerA();

      const res = await listKds(new Request('http://localhost/api/kds/orders?limit=200') as any);
      const { orders } = await res.json();

      expect(orders.map((o) => o.id)).toContain(orderA.id);
      expect(orders.map((o) => o.id)).not.toContain(orderB.id);
    });
  });

  describe('who may read the order (C1-C3 follow-ups)', () => {
    const get = (id: string) => readOrder(new Request(`http://localhost/api/kds/orders/${id}`) as any, { params: { id } });

    it('the restaurant reads its own order; another restaurant gets 404 (existence is not leaked)', async () => {
      const order = await makeOrder();

      asOwnerA();
      expect((await get(order.id)).status).toBe(200);
      asOwnerB();
      expect((await get(order.id)).status).toBe(404);
    });

    it('nothing is read, changed or cancelled when no restaurant can be resolved for the session (400)', async () => {
      const order = await makeOrder();
      (getCurrentRestaurantId as jest.Mock).mockResolvedValue(null);

      expect((await get(order.id)).status).toBe(400);
      expect((await put(order.id, { status: 'READY' })).status).toBe(400);
      expect((await del(order.id)).status).toBe(400);
      expect(await statusOf(order.id)).toBe('PREPARING');
    });

    it('the kitchen list total also counts only this restaurant', async () => {
      await makeOrder();
      await makeOrder();
      await prisma.order.create({
        data: { restaurantId: B.restaurantId, orderNumber: `C4B-${crypto.randomBytes(4).toString('hex')}`, orderType: 'DELIVERY', status: 'PREPARING', total: 10 },
      });
      asOwnerA();

      const body = await (await listKds(new Request('http://localhost/api/kds/orders') as any)).json();

      expect(body.total).toBe(2);
      expect(body.orders).toHaveLength(2);
    });
  });

  describe('cancelling an order the kitchen already started', () => {
    it('cancels it and leaves a record of who did it (C4)', async () => {
      const order = await makeOrder();

      const res = await del(order.id);

      expect(res.status).toBe(200);
      expect(await statusOf(order.id)).toBe('CANCELLED');
      const logs = await prisma.auditLog.findMany({ where: { restaurantId: A.restaurantId, entityId: order.id } });
      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe(A.ownerId);
    });

    it('closes the order items so the stations stop showing them (C5)', async () => {
      const order = await makeOrder();

      await del(order.id);

      const items = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(items.every((i) => i.status === 'CANCELLED')).toBe(true);
    });

    it('a second cancel is harmless: 2xx, still one record (C6)', async () => {
      const order = await makeOrder();
      await del(order.id);

      const again = await del(order.id);

      expect(again.status).toBeGreaterThanOrEqual(200);
      expect(again.status).toBeLessThan(300);
      expect(await prisma.auditLog.count({ where: { restaurantId: A.restaurantId, entityId: order.id } })).toBe(1);
    });

    it('a finished (COMPLETED) order cannot be cancelled (its stock was already used) (C7)', async () => {
      const order = await makeOrder({ status: 'COMPLETED' });

      const res = await del(order.id);

      expect(res.status).toBe(409);
      expect(await statusOf(order.id)).toBe('COMPLETED');
    });
  });

  describe('the customer already paid online', () => {
    it.failing('is not left silently charged: a refund happened or the operator is told to refund (C8)', async () => {
      const order = await makeOrder({ paymentMethod: 'ONLINE_PIX', paymentStatus: 'APPROVED' });
      const payment = await makePayment(order, 'APPROVED');

      await del(order.id);

      const p = await prisma.payment.findUnique({ where: { id: payment.id } });
      const alerts = await prisma.notification.count({ where: { restaurantId: A.restaurantId } });
      expect(p.status === 'REFUNDED' || alerts > 0).toBe(true);
    });

    it.failing('a still-PENDING payment of the cancelled order is cancelled too (a late PIX must not be accepted for a dead order) (C9)', async () => {
      const order = await makeOrder({ paymentMethod: 'ONLINE_PIX', paymentStatus: 'PENDING', status: 'PENDING' });
      const payment = await makePayment(order, 'PENDING');

      await del(order.id);

      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('CANCELLED');
    });
  });

  describe('stock', () => {
    const complete = (id: string) => put(id, { status: 'COMPLETED' });

    it.failing('completing the same order twice deducts the ingredients ONCE (C10)', async () => {
      const order = await makeOrder({ status: 'READY' });

      await complete(order.id);
      await complete(order.id);

      expect(await stockNow()).toBe(STOCK_START - 3 * QTY_PER_DISH);
      expect(await prisma.stockMovement.count({ where: { restaurantId: A.restaurantId, referenceId: order.id } })).toBe(1);
    });

    it.failing('a cancelled order cannot be completed afterwards (no deduction, no resurrection) (C11)', async () => {
      const order = await makeOrder();
      await del(order.id);
      const stockAfterCancel = await stockNow();

      const res = await complete(order.id);

      expect(res.status).toBe(409);
      expect(await statusOf(order.id)).toBe('CANCELLED');
      expect(await stockNow()).toBe(stockAfterCancel);
    });
  });

  // Product decision (2026-09-23): cancelling AFTER the kitchen started consumes ingredients, so they
  // are recorded as a LOSS (waste log + LOSS stock movement + stock decrement), like a manual waste entry.
  describe('ingredients used by an order cancelled after preparation started', () => {
    const lossOf = (orderId: string) => prisma.stockMovement.findMany({ where: { restaurantId: A.restaurantId, referenceId: orderId } });

    it('records them as a loss: waste log with cost, LOSS movement and the stock decrement', async () => {
      await prisma.ingredient.update({ where: { id: ingredient.id }, data: { referenceCost: 5 } });
      const order = await makeOrder();

      const res = await del(order.id);
      const body = await res.json();

      const used = 3 * QTY_PER_DISH;
      expect(body.loss).toEqual({ recorded: true, ingredients: 1, estimatedCost: used * 5 });
      expect(await stockNow()).toBe(STOCK_START - used);
      const movements = await lossOf(order.id);
      expect(movements).toHaveLength(1);
      expect(movements[0]).toMatchObject({ movementType: 'LOSS', quantity: -used, referenceType: 'ORDER_CANCELLED' });
      const waste = await prisma.wasteLog.findMany({ where: { restaurantId: A.restaurantId, ingredientId: ingredient.id } });
      expect(waste).toHaveLength(1);
      expect(waste[0]).toMatchObject({ reason: 'PREPARATION', quantity: used, estimatedCost: used * 5 });
      expect(waste[0].notes).toContain('cancelado');
      const log = await prisma.auditLog.findFirst({ where: { restaurantId: A.restaurantId, entityId: order.id } });
      expect(JSON.parse(log.changes)).toMatchObject({ from: 'PREPARING', to: 'CANCELLED', lossRecorded: true });
    });

    it('also for an order already READY, with the reason typed by the operator', async () => {
      const order = await makeOrder({ status: 'READY' });

      const res = await cancelOrder(
        new Request('http://localhost/x', { method: 'DELETE', body: JSON.stringify({ reason: 'cliente desistiu' }) }) as any,
        { params: { id: order.id } }
      );

      expect((await res.json()).loss.recorded).toBe(true);
      const waste = await prisma.wasteLog.findFirst({ where: { restaurantId: A.restaurantId, ingredientId: ingredient.id } });
      expect(waste.notes).toContain('cliente desistiu');
    });

    it('records nothing when the kitchen had NOT started (order still PENDING)', async () => {
      const order = await makeOrder({ status: 'PENDING' });

      const res = await del(order.id);

      expect((await res.json()).loss.recorded).toBe(false);
      expect(await stockNow()).toBe(STOCK_START);
      expect(await lossOf(order.id)).toHaveLength(0);
      expect(await prisma.wasteLog.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });

    it('records the loss ONCE: a second or five simultaneous cancels change nothing more', async () => {
      const order = await makeOrder();

      const results = await Promise.all(Array.from({ length: 5 }, () => del(order.id)));
      await del(order.id);

      expect(results.every((r) => r.status === 200)).toBe(true);
      expect(await stockNow()).toBe(STOCK_START - 3 * QTY_PER_DISH);
      expect(await lossOf(order.id)).toHaveLength(1);
      expect(await prisma.wasteLog.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { restaurantId: A.restaurantId, entityId: order.id } })).toBe(1);
    });

    it('a COMPLETED order (stock already deducted) is refused and records no loss', async () => {
      const order = await makeOrder({ status: 'COMPLETED' });

      const res = await del(order.id);

      expect(res.status).toBe(409);
      expect(await stockNow()).toBe(STOCK_START);
      expect(await lossOf(order.id)).toHaveLength(0);
    });

    it('an order that does not exist answers 404 (not a 500)', async () => {
      expect((await del('does-not-exist')).status).toBe(404);
    });
  });

  describe('notifications', () => {
    it.failing('marking an order READY does not notify the staff of OTHER restaurants (C12)', async () => {
      const order = await makeOrder();

      await put(order.id, { status: 'READY' });

      expect(await prisma.notification.count({ where: { userId: B.ownerId } })).toBe(0);
    });
  });
});
