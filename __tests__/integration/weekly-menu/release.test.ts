/** Pre-orders become real orders on the service day (spec 2026-11-10 cardapio-da-semana). */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as releaseModule from '../../../lib/weekly-menu/release';
const { releaseDue } = releaseModule;
import { startWeeklyMenuWorker } from '../../../lib/weekly-menu/worker';
import { loadBoard } from '../../../lib/orders/board';
import { writeSiteOrder } from '../../../lib/delivery-site/write-order';
import { prisma as libPrisma } from '../../../lib/prisma';
import { dayLabel, todayIn } from '../../../lib/weekly-menu/rules';
import * as monthlySales from '../../../lib/plans/monthly-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const TZ = 'America/Sao_Paulo';
const SERVICE = '2026-11-14';
// 23:30 of the day before in Sao Paulo (UTC-3), then 00:01 of the service day
const FRIDAY_2330 = new Date('2026-11-14T02:30:00Z');
const SATURDAY_0001 = new Date('2026-11-14T03:01:00Z');
const MIN = 60_000;

describe('release of the pre-orders on the service day', () => {
  let owner, rid, other, item, recipe, menu, n = 0;

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `wmr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    const plan = { status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false };
    rid = (await prisma.restaurant.create({ data: { name: `WMR ${tag}`, ownerId: owner.id, ...plan } })).id;
    other = (await prisma.restaurant.create({ data: { name: `WMRO ${tag}`, ownerId: owner.id, ...plan } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `Pratos ${tag}`, position: 0, active: true } });
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `F${tag}`, name: 'Feijoada', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 40 } });
    item = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Feijoada', price: 40, position: 0, recipeId: recipe.id } });
  }, 60000);

  const cleanup = async () => {
    for (const id of [rid, other]) {
      await prisma.weeklyMenuOrder.deleteMany({ where: { restaurantId: id } });
      await prisma.weeklyMenu.deleteMany({ where: { restaurantId: id } });
      await prisma.couponRedemption.deleteMany({ where: { restaurantId: id } });
      await prisma.coupon.deleteMany({ where: { restaurantId: id } });
      await prisma.orderItem.deleteMany({ where: { order: { restaurantId: id } } });
      await prisma.order.deleteMany({ where: { restaurantId: id } });
      await prisma.externalOrder.deleteMany({ where: { restaurantId: id } });
    }
  };

  afterAll(async () => {
    try { await cleanup(); } catch {}
    for (const id of [rid, other]) {
      try { await prisma.deliveryIntegration.deleteMany({ where: { restaurantId: id } }); } catch {}
      // No swallowing: the restaurant delete must succeed (cascades through weekly menus, FK NoAction)
      await prisma.restaurant.delete({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: owner.id } });
  });

  beforeEach(async () => {
    await cleanup();
    menu = await prisma.weeklyMenu.create({ data: { restaurantId: rid, serviceDate: SERVICE, items: { create: [{ menuItemId: item.id }] } } });
  });

  const place = async (extra = {}, menuId = menu.id, restaurantId = rid) =>
    prisma.weeklyMenuOrder.create({
      data: {
        restaurantId, weeklyMenuId: menuId, customerName: 'Bia', customerPhone: '66999990000', isPickup: false,
        deliveryAddress: 'Rua A, 1', deliveryCity: 'Sinop', kitchenNote: 'Pagamento: Dinheiro (troco para R$ 100,00)',
        paymentMethod: 'CASH', cashChangeFor: 100, paymentNote: 'Dinheiro', subtotal: 80, deliveryFee: 5, discount: 8, total: 77,
        orderNumber: `WMR-${tag}-${++n}`,
        items: { create: [{ menuItemId: item.id, recipeId: recipe.id, name: 'Feijoada', unitPrice: 40, quantity: 2, specialInstructions: 'sem couve' }] },
        ...extra,
      },
    });

  it('the day before at 23:30 nothing is released; at 00:01 it becomes Order + ExternalOrder with totals and the note', async () => {
    const p = await place();
    expect(await releaseDue(rid, FRIDAY_2330)).toBe(0);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).status).toBe('PLACED');
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(0);

    expect(await releaseDue(rid, SATURDAY_0001)).toBe(1);
    const done = await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } });
    expect(done.status).toBe('RELEASED');
    const order = await prisma.order.findUnique({ where: { id: done.orderId }, include: { items: true, externalOrder: true } });
    const note = `ENCOMENDA do cardápio de ${dayLabel(SERVICE)}\nPagamento: Dinheiro (troco para R$ 100,00)`;
    expect(order).toMatchObject({ orderNumber: p.orderNumber, status: 'PENDING', orderType: 'DELIVERY', paymentMethod: 'CASH', specialInstructions: note, totalItems: 2 });
    expect(Number(order.subtotal)).toBe(80);
    expect(Number(order.fees)).toBe(5);
    expect(Number(order.discount)).toBe(8);
    expect(Number(order.total)).toBe(77);
    expect(Number(order.cashChangeFor)).toBe(100);
    expect(order.items).toEqual([expect.objectContaining({ recipeId: recipe.id, quantity: 2, specialInstructions: 'sem couve' })]);
    expect(order.externalOrder).toMatchObject({ externalOrderId: p.orderNumber, status: 'CONFIRMED', customerName: 'Bia', deliveryAddress: 'Rua A, 1', specialInstructions: note, internalOrderId: order.id });
    expect(Number(order.externalOrder.totalAmount)).toBe(77);

    // Released once: a later call does nothing
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(0);
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(1);

    // On the board (read with the real clock: the order was just created)
    const cards = await loadBoard(rid);
    expect(cards.map((c) => c.id)).toContain(order.id);
  });

  it('two simultaneous calls make one order', async () => {
    const p = await place();
    const counts = await Promise.all([releaseDue(rid, SATURDAY_0001), releaseDue(rid, SATURDAY_0001)]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(1);
    expect(await prisma.externalOrder.count({ where: { restaurantId: rid } })).toBe(1);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).status).toBe('RELEASED');
  });

  it('a cancelled pre-order is not released', async () => {
    const p = await place({ status: 'CANCELLED', cancelledAt: new Date() });
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(0);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).status).toBe('CANCELLED');
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(0);
  });

  it('a failed write leaves it PLACED, without a stray ExternalOrder, and the next call retries', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const p = await place({ items: { create: [{ menuItemId: item.id, recipeId: `missing-${tag}`, name: 'Feijoada', unitPrice: 40, quantity: 1 }] } });
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(0);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).status).toBe('PLACED');
    expect(await prisma.externalOrder.count({ where: { restaurantId: rid } })).toBe(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    await prisma.weeklyMenuOrderItem.updateMany({ where: { weeklyMenuOrderId: p.id }, data: { recipeId: recipe.id } });
    // Backoff: not retried within 5 minutes of the failed attempt, retried after
    expect(await releaseDue(rid, new Date(SATURDAY_0001.getTime() + 4 * MIN))).toBe(0);
    expect(await releaseDue(rid, new Date(SATURDAY_0001.getTime() + 5 * MIN + 1000))).toBe(1);
  });

  it('a failing row does not block a later due row in the same run, and is retried only after 5 minutes', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bad = await place({ items: { create: [{ menuItemId: item.id, recipeId: `missing-${tag}`, name: 'Feijoada', unitPrice: 40, quantity: 1 }] } });
      const good = await place();
      expect(await releaseDue(rid, SATURDAY_0001)).toBe(1);
      expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: good.id } })).status).toBe('RELEASED');
      const after = await prisma.weeklyMenuOrder.findUnique({ where: { id: bad.id } });
      expect(after).toMatchObject({ status: 'PLACED', releasingAt: SATURDAY_0001 });
      expect(err.mock.calls.some((c) => String(c[0]).includes(bad.id))).toBe(true);

      err.mockClear();
      expect(await releaseDue(rid, new Date(SATURDAY_0001.getTime() + MIN))).toBe(0);
      expect(err).not.toHaveBeenCalled();
      expect(await releaseDue(rid, new Date(SATURDAY_0001.getTime() + 5 * MIN + 1000))).toBe(0);
      expect(err.mock.calls.some((c) => String(c[0]).includes(bad.id))).toBe(true);
    } finally {
      err.mockRestore();
    }
  });

  it('a stale RELEASING with its Order already written becomes RELEASED with orderId and the coupon linked', async () => {
    const coupon = await prisma.coupon.create({ data: { restaurantId: rid, code: `S${tag}`.toUpperCase(), kind: 'FIXED', value: 800, usedCount: 1 } });
    const redemption = await prisma.couponRedemption.create({ data: { couponId: coupon.id, restaurantId: rid, phoneDigits: '66999990000', discountCents: 800 } });
    const p = await place({ status: 'RELEASING', releasingAt: new Date(SATURDAY_0001.getTime() - 6 * MIN), couponRedemptionId: redemption.id });
    const written = await writeSiteOrder({
      restaurantId: rid, orderNumber: p.orderNumber, customerId: null, customerName: 'Bia', customerPhone: '66999990000', customerEmail: null,
      isPickup: true, deliveryAddress: null, deliveryCity: null, deliveryZipCode: null, kitchenNote: '',
      items: [{ recipeId: recipe.id, name: 'Feijoada', quantity: 2 }], subtotal: 80, deliveryFee: 5, discount: 8, total: 77,
      paymentMethod: 'CASH', cashChangeFor: null, voucherBrand: null,
    });
    await releaseDue(rid, SATURDAY_0001);
    expect(await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).toMatchObject({ status: 'RELEASED', orderId: written.orderId });
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(1);
    expect((await prisma.couponRedemption.findUnique({ where: { id: redemption.id } })).externalOrderId).toBe(written.externalOrderId);
  });

  it('a stale RELEASING without an Order goes back to PLACED and is released', async () => {
    const p = await place({ status: 'RELEASING', releasingAt: new Date(SATURDAY_0001.getTime() - 6 * MIN) });
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(1);
    const done = await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } });
    expect(done.status).toBe('RELEASED');
    // The stale claim that never wrote its order counted as one failed attempt
    expect(done.releaseAttempts).toBe(1);
    expect(await prisma.order.findUnique({ where: { id: done.orderId } })).toMatchObject({ orderNumber: p.orderNumber });
  });

  it('each failed attempt is counted; the row keeps being retried', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const bad = await place({ items: { create: [{ menuItemId: item.id, recipeId: `missing-${tag}`, name: 'Feijoada', unitPrice: 40, quantity: 1 }] } });
      const good = await place();
      const at = (k: number) => new Date(SATURDAY_0001.getTime() + k * 6 * MIN);
      for (let k = 0; k < 4; k++) await releaseDue(rid, at(k));
      expect(await prisma.weeklyMenuOrder.findUnique({ where: { id: bad.id } })).toMatchObject({ status: 'PLACED', releaseAttempts: 4 });
      expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: good.id } })).releaseAttempts).toBe(0);
      // Fixed: the next retry still releases it
      await prisma.weeklyMenuOrderItem.updateMany({ where: { weeklyMenuOrderId: bad.id }, data: { recipeId: recipe.id } });
      expect(await releaseDue(rid, at(5))).toBe(1);
    } finally {
      err.mockRestore();
    }
  });

  it('the plan sales thresholds are noted once per restaurant after a run that released; a failure is only logged', async () => {
    const note = jest.spyOn(monthlySales, 'noteSalesThresholds').mockResolvedValue(undefined);
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await releaseDue(rid, FRIDAY_2330)).toBe(0);
      expect(note).not.toHaveBeenCalled();
      await place();
      await place();
      expect(await releaseDue(rid, SATURDAY_0001)).toBe(2);
      expect(note).toHaveBeenCalledTimes(1);
      expect(note).toHaveBeenCalledWith(rid);

      note.mockReset();
      note.mockRejectedValue(new Error('boom'));
      await place();
      expect(await releaseDue(rid, SATURDAY_0001)).toBe(1);
      expect(err.mock.calls.some((c) => String(c[0]).includes('sales thresholds'))).toBe(true);
    } finally {
      note.mockRestore();
      err.mockRestore();
    }
  });

  it('a fresh RELEASING (under 5 minutes) is left alone', async () => {
    const p = await place({ status: 'RELEASING', releasingAt: new Date(SATURDAY_0001.getTime() - 4 * MIN) });
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(0);
    expect(await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).toMatchObject({ status: 'RELEASING', orderId: null });
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(0);
  });

  it('the earliest service day goes first', async () => {
    const earlier = await prisma.weeklyMenu.create({ data: { restaurantId: rid, serviceDate: '2026-11-13' } });
    const late = await place();
    const early = await place({}, earlier.id);
    const findMany = jest.spyOn(libPrisma.weeklyMenuOrder, 'findMany');
    try {
      await releaseDue(rid, SATURDAY_0001);
      const due = findMany.mock.calls.map((c) => c[0]).find((a) => a?.where?.status === 'PLACED');
      expect(due.orderBy).toEqual([{ weeklyMenu: { serviceDate: 'asc' } }, { createdAt: 'asc' }]);
    } finally {
      findMany.mockRestore();
    }
    const a = await prisma.order.findFirst({ where: { orderNumber: early.orderNumber } });
    const b = await prisma.order.findFirst({ where: { orderNumber: late.orderNumber } });
    expect(a.createdAt.getTime()).toBeLessThanOrEqual(b.createdAt.getTime());
  });

  it('the coupon use is linked to the ExternalOrder', async () => {
    const coupon = await prisma.coupon.create({ data: { restaurantId: rid, code: `C${tag}`.toUpperCase(), kind: 'FIXED', value: 800, usedCount: 1 } });
    const redemption = await prisma.couponRedemption.create({ data: { couponId: coupon.id, restaurantId: rid, phoneDigits: '66999990000', discountCents: 800 } });
    const p = await place({ couponRedemptionId: redemption.id, couponCode: coupon.code });
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(1);
    const done = await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } });
    const ext = await prisma.externalOrder.findFirst({ where: { internalOrderId: done.orderId } });
    expect((await prisma.couponRedemption.findUnique({ where: { id: redemption.id } })).externalOrderId).toBe(ext.id);
  });

  it('a pre-order placed on the service day itself is released on the next call', async () => {
    expect(await releaseDue(rid, SATURDAY_0001)).toBe(0);
    const p = await place();
    expect(await releaseDue(rid, new Date(SATURDAY_0001.getTime() + 60_000))).toBe(1);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).status).toBe('RELEASED');
  });

  it('a past service day (server was down) is released too', async () => {
    const p = await place();
    expect(await releaseDue(rid, new Date('2026-11-17T15:00:00Z'))).toBe(1);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } })).status).toBe('RELEASED');
  });

  it('follows the restaurant timezone and the restaurant filter', async () => {
    // Tokyo is already on the service day at 23:30 of the day before in Sao Paulo
    await prisma.restaurant.update({ where: { id: other }, data: { timezone: 'Asia/Tokyo' } });
    const oc = await prisma.menuCategory.create({ data: { restaurantId: other, name: `O ${tag}`, position: 0, active: true } });
    const or = await prisma.recipe.create({ data: { restaurantId: other, code: `O${tag}`, name: 'Outro', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 9 } });
    const oi = await prisma.menuItem.create({ data: { restaurantId: other, categoryId: oc.id, name: 'Outro', price: 9, position: 0, recipeId: or.id } });
    const om = await prisma.weeklyMenu.create({ data: { restaurantId: other, serviceDate: SERVICE } });
    const op = await place({ items: { create: [{ menuItemId: oi.id, recipeId: or.id, name: 'Outro', unitPrice: 9, quantity: 1 }] } }, om.id, other);
    const mine = await place();

    expect(await releaseDue(rid, FRIDAY_2330)).toBe(0);
    expect(await releaseDue(undefined, FRIDAY_2330)).toBe(1);
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: op.id } })).status).toBe('RELEASED');
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: mine.id } })).status).toBe('PLACED');
  });

  it('loading the board releases the due pre-orders of the restaurant', async () => {
    const today = todayIn(TZ, new Date());
    const m = await prisma.weeklyMenu.create({ data: { restaurantId: rid, serviceDate: today } });
    const p = await place({}, m.id);
    const cards = await loadBoard(rid);
    const done = await prisma.weeklyMenuOrder.findUnique({ where: { id: p.id } });
    expect(done.status).toBe('RELEASED');
    expect(cards.map((c) => c.id)).toContain(done.orderId);
  });

  it('a failing release never breaks the board', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const spy = jest.spyOn(releaseModule, 'releaseDue').mockRejectedValue(new Error('boom'));
    try {
      await expect(loadBoard(rid)).resolves.toEqual(expect.any(Array));
      expect(spy).toHaveBeenCalledWith(rid, expect.any(Date));
      expect(err).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      err.mockRestore();
    }
  });

  it('the worker runs releaseDue without overlapping runs', async () => {
    let calls = 0;
    const w = startWeeklyMenuWorker(10, async () => { calls++; });
    await new Promise((r) => setTimeout(r, 60));
    w.stop();
    expect(calls).toBeGreaterThan(1);
    // A second start while running is a no-op: its run never happens
    const a = startWeeklyMenuWorker(10, async () => {});
    const bRun = jest.fn(async () => {});
    const b = startWeeklyMenuWorker(10, bRun);
    await new Promise((r) => setTimeout(r, 50));
    b.stop();
    a.stop();
    expect(bRun).not.toHaveBeenCalled();
  });

  it('the worker never runs two at a time, even when a run is slower than the interval', async () => {
    let active = 0, maxActive = 0, calls = 0;
    const w = startWeeklyMenuWorker(1, async () => {
      calls++; active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 30));
      active--;
    });
    await new Promise((r) => setTimeout(r, 150));
    w.stop();
    expect(calls).toBeGreaterThan(1);
    expect(maxActive).toBe(1);
  });
});
