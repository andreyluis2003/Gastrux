// @ts-nocheck
/**
 * "Bad day" scenario 2 (docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md):
 * the kitchen printer or the kitchen screen (KDS) is down.
 * Gastrux has NO printing code at all (confirmed 2026-09-24: no ESC/POS, print agent or
 * window.print for kitchen tickets), so this suite covers the KDS path and the order flow that
 * any printer would also depend on. Each case states the DESIRED behaviour (market practice): the
 * kitchen screen lists the active orders oldest first and recovers them after being down; sending
 * a comanda to the kitchen always works and sends only what is new, with its modifiers; and an order
 * nobody started for too long alerts the floor (the screen or printer may be down).
 * A case that documents a known gap is written with `it.failing` (the suite stays green and a case
 * flips to a failure the day its gap is fixed). Gaps, by priority:
 *   P0 kitchen   K1   the KDS screen asks ?status=PENDING,PREPARING,READY and the route passes the
 *                     whole string as ONE status: the kitchen screen never lists anything
 *   P0 kitchen   K2   send-to-kitchen numbers orders KDS-000001.. per restaurant but the number is
 *                     globally unique: the second restaurant's first send fails
 *   P1 kitchen   K3   re-sending a comanda sends ALL its items again (the kitchen makes them twice)
 *   P1 kitchen   K4   the modifiers never reach the kitchen order (S5-5)
 *   P1 alert     K5   an order nobody started for 10 minutes alerts nobody
 */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as listKitchen } from '../../../app/api/kds/orders/route';
import { POST as sendToKitchen } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('bad day 2: the kitchen screen or printer is down', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let burgerA: any;
  let burgerB: any;
  let cheese: any;
  const tag = crypto.randomBytes(3).toString('hex');

  const asOwner = (ctx: { ownerId: string; restaurantId: string }) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ctx.ownerId, email: `${ctx.ownerId}@x.test`, role: 'OWNER' } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(ctx.restaurantId);
  };

  const list = (query: string) => listKitchen(new Request(`http://localhost/api/kds/orders${query}`) as any);
  const send = (sessionId: string) =>
    sendToKitchen(new Request(`http://localhost/api/comanda/sessions/${sessionId}/send-to-kitchen`, { method: 'POST' }) as any, { params: { id: sessionId } });

  const mkOrder = (restaurantId: string, minutesAgo: number, status = 'PENDING') =>
    prisma.order.create({
      data: {
        restaurantId, orderNumber: `K2-${crypto.randomBytes(5).toString('hex')}`, orderType: 'DINE_IN', status, total: 10,
        createdAt: new Date(Date.now() - minutesAgo * 60_000),
      },
    });

  const mkComanda = async (restaurantId: string, userId: string) =>
    prisma.orderSession.create({ data: { restaurantId, userId, status: 'OPEN', tableNumber: 5 } });

  const wipe = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    const mk = (restaurantId: string) =>
      prisma.recipe.create({ data: { restaurantId, code: `R-${crypto.randomBytes(3).toString('hex')}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', prepTimeMinutes: 12 } });
    burgerA = await mk(A.restaurantId);
    burgerB = await mk(B.restaurantId);
    cheese = await prisma.itemModifier.create({ data: { restaurantId: A.restaurantId, name: `Sem cebola ${tag}`, priceAdjustment: 0 } });
  });

  afterAll(async () => {
    await wipe();
    await prisma.itemModifier.deleteMany({ where: { id: cheese.id } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await wipe();
    asOwner(A);
  });

  describe('what already works', () => {
    it('orders made while the screen was down are kept and listed oldest first', async () => {
      const older = await mkOrder(A.restaurantId, 20);
      const newer = await mkOrder(A.restaurantId, 5);

      const body = await (await list('?status=PENDING')).json();

      const ids = body.orders.map((o) => o.id);
      expect(ids.indexOf(older.id)).toBeLessThan(ids.indexOf(newer.id));
    });
  });

  describe('K1: the kitchen screen itself', () => {
    it.failing('the query the KDS screen sends lists the active orders', async () => {
      const pending = await mkOrder(A.restaurantId, 3, 'PENDING');
      const preparing = await mkOrder(A.restaurantId, 2, 'PREPARING');
      await mkOrder(A.restaurantId, 1, 'COMPLETED');

      const res = await list('?status=PENDING,PREPARING,READY');

      expect(res.status).toBe(200);
      const ids = (await res.json()).orders.map((o) => o.id);
      expect(ids).toEqual(expect.arrayContaining([pending.id, preparing.id]));
      expect(ids).toHaveLength(2);
    });
  });

  describe('K2-K4: sending to the kitchen', () => {
    it.failing("the second restaurant's first comanda reaches the kitchen", async () => {
      const sA = await mkComanda(A.restaurantId, A.ownerId);
      await prisma.orderSessionItem.create({ data: { sessionId: sA.id, recipeId: burgerA.id, price: 30, quantity: 1 } });
      expect((await send(sA.id)).status).toBe(200);

      asOwner(B);
      const sB = await mkComanda(B.restaurantId, B.ownerId);
      await prisma.orderSessionItem.create({ data: { sessionId: sB.id, recipeId: burgerB.id, price: 30, quantity: 1 } });

      expect((await send(sB.id)).status).toBe(200);
    });

    it.failing('re-sending a comanda sends only the items added since the last send', async () => {
      const s = await mkComanda(A.restaurantId, A.ownerId);
      await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burgerA.id, price: 30, quantity: 2 } });
      await send(s.id);
      await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burgerA.id, price: 30, quantity: 1, addedAt: new Date(Date.now() + 1000) } });

      const res = await send(s.id);

      expect(res.status).toBe(200);
      const orders = await prisma.order.findMany({ where: { restaurantId: A.restaurantId }, include: { items: true }, orderBy: { createdAt: 'asc' } });
      expect(orders.map((o) => o.items.map((i) => i.quantity))).toEqual([[2], [1]]);
    });

    it.failing('the modifiers reach the kitchen order', async () => {
      const s = await mkComanda(A.restaurantId, A.ownerId);
      const line = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burgerA.id, price: 30, quantity: 1 } });
      await prisma.orderSessionItemModifier.create({ data: { sessionItemId: line.id, modifierId: cheese.id, priceAdjustment: 0 } });

      await send(s.id);

      const item = await prisma.orderItem.findFirst({ where: { order: { restaurantId: A.restaurantId } }, include: { modifiers: true } });
      expect(item.modifiers.map((m) => m.modifierId)).toEqual([cheese.id]);
    });

    it('sending a comanda with nothing new is refused, not an empty ticket', async () => {
      const s = await mkComanda(A.restaurantId, A.ownerId);
      expect((await send(s.id)).status).toBe(400);
    });
  });

  describe('K5: an order nobody started alerts the floor', () => {
    it.failing('an order PENDING for more than 10 minutes raises one alert', async () => {
      await mkOrder(A.restaurantId, 15, 'PENDING');
      await mkOrder(A.restaurantId, 2, 'PENDING');
      const { alertStaleKitchenOrders } = await import('../../../lib/kds/stale-orders');

      await alertStaleKitchenOrders();
      await alertStaleKitchenOrders();

      expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });
  });

  it.todo('kitchen tickets are printed (no printing code exists: owner to say how the printer gets orders today)');
  it.todo('the KDS screen shows an "offline / outdated" banner when polling fails');
});
