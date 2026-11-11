/** Weekly menu on the public link: show it and take pre-orders (spec 2026-11-10 cardapio-da-semana). */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { GET as MENU } from '../../../app/api/public/delivery/menu/[restaurantId]/route';
import { POST as ORDER } from '../../../app/api/public/delivery/order/route';
import { CLOSED_MESSAGE } from '../../../lib/orders/store-open';
import { bannerText, closedText } from '../../../lib/weekly-menu/rules';
import * as weeklyPublic from '../../../lib/weekly-menu/public';
import { CashRuleError } from '../../../lib/caixa/rules';

const { openWeeklyMenu } = weeklyPublic;

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const iso = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
const allClosed = Object.fromEntries(['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'].map((d) => [d, { open: '11:00', close: '23:00', closed: true }]));

describe('weekly menu on the public link', () => {
  let owner, rid, other, feijoada, strogonoff, hidden, offMenu, unavailable, otherItem, menu, n = 0;

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `wmp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    const plan = { status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false };
    rid = (await prisma.restaurant.create({ data: { name: `WMP ${tag}`, ownerId: owner.id, ...plan } })).id;
    other = (await prisma.restaurant.create({ data: { name: `WMPO ${tag}`, ownerId: owner.id, ...plan } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `Pratos ${tag}`, position: 0, active: true } });
    const oc = await prisma.menuCategory.create({ data: { restaurantId: other, name: `O ${tag}`, position: 0, active: true } });
    // No ficha técnica: the order creates the ficha simples, as the normal path does
    feijoada = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Feijoada', price: 40, position: 0 } });
    strogonoff = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Strogonoff', price: 30, position: 1 } });
    // Unavailable today, still sold on the weekly menu
    unavailable = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Rabada', price: 35, position: 2, available: false } });
    hidden = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Oculto', price: 10, position: 3, displayOnWeb: false } });
    offMenu = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Pastel', price: 8, position: 4 } });
    otherItem = await prisma.menuItem.create({ data: { restaurantId: other, categoryId: oc.id, name: 'Outro', price: 9, position: 0 } });
  }, 60000);

  const cleanup = async () => {
    for (const id of [rid, other]) {
      await prisma.weeklyMenuOrder.deleteMany({ where: { restaurantId: id } });
      await prisma.weeklyMenu.deleteMany({ where: { restaurantId: id } });
      await prisma.couponRedemption.deleteMany({ where: { restaurantId: id } });
      await prisma.coupon.deleteMany({ where: { restaurantId: id } });
    }
  };

  afterAll(async () => {
    try { await cleanup(); } catch {}
    for (const id of [rid, other]) {
      try { await prisma.orderItem.deleteMany({ where: { order: { restaurantId: id } } }); } catch {}
      try { await prisma.order.deleteMany({ where: { restaurantId: id } }); } catch {}
      try { await prisma.externalOrder.deleteMany({ where: { restaurantId: id } }); } catch {}
      try { await prisma.customer.deleteMany({ where: { restaurantId: id } }); } catch {}
      // No swallowing: the restaurant delete must succeed (cascades through weekly menus, FK NoAction)
      await prisma.restaurant.delete({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: owner.id } });
  });

  beforeEach(async () => {
    await cleanup();
    await prisma.restaurant.update({ where: { id: rid }, data: { ordersClosedAt: null, businessHours: null } });
    await prisma.menuItem.update({ where: { id: feijoada.id }, data: { price: 40 } });
    menu = await prisma.weeklyMenu.create({
      data: {
        restaurantId: rid, serviceDate: iso(5), orderDeadline: new Date(Date.now() + 3 * 86400_000),
        items: { create: [
          { menuItemId: feijoada.id, portionLimit: 5 },
          { menuItemId: strogonoff.id },
          { menuItemId: unavailable.id },
          { menuItemId: hidden.id },
        ] },
      },
    });
  });

  const body = (extra = {}) => ({
    restaurantId: rid, weeklyMenuId: menu.id, customerName: 'Bia', customerPhone: '66999990000',
    deliveryAddress: 'Rua A, 1', deliveryFee: 5, paymentMethod: 'CASH',
    items: [{ menuItemId: feijoada.id, quantity: 1 }], ...extra,
  });
  const post = (payload: any) =>
    ORDER(new NextRequest('http://x/api/public/delivery/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }));
  const getMenu = async (id = rid) => MENU(new NextRequest(`http://x/api/public/delivery/menu/${id}`), { params: { restaurantId: id } });
  // Existing pre-orders holding portions
  const hold = async (qty: number, status = 'PLACED') =>
    prisma.weeklyMenuOrder.create({
      data: {
        restaurantId: rid, weeklyMenuId: menu.id, status, customerName: 'X', customerPhone: '1', isPickup: true, kitchenNote: '',
        paymentMethod: 'CASH', paymentNote: '', subtotal: 0, deliveryFee: 0, discount: 0, total: 0, orderNumber: `WMP-${tag}-${++n}`,
        items: { create: [{ menuItemId: feijoada.id, recipeId: 'r', name: 'Feijoada', unitPrice: 40, quantity: qty }] },
      },
    });

  it('openWeeklyMenu: the open menu with banner and remaining portions', async () => {
    await hold(2);
    await hold(1, 'CANCELLED');
    const open = await openWeeklyMenu(rid);
    expect(open).toMatchObject({ id: menu.id, serviceDate: iso(5), banner: bannerText(iso(5), menu.orderDeadline, 'America/Sao_Paulo') });
    expect(open.items.get(feijoada.id)).toEqual({ portionLimit: 5, remaining: 3 });
    expect(open.items.get(strogonoff.id)).toEqual({ portionLimit: null, remaining: null });
    expect(await openWeeklyMenu(other)).toBeNull();
  });

  it('the public menu shows only the menu products, with soldOut, banner and closed only by hand', async () => {
    await hold(5);
    await prisma.restaurant.update({ where: { id: rid }, data: { businessHours: { ...allClosed, auto: true } } });
    const res = await getMenu();
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
    const data = await res.json();
    expect(data.restaurant.closed).toBe(false);
    expect(data.restaurant.weeklyMenu).toEqual({ id: menu.id, serviceDate: iso(5), banner: bannerText(iso(5), menu.orderDeadline, 'America/Sao_Paulo') });
    const items = data.categories.flatMap((c) => c.items);
    expect(items.map((i) => i.name).sort()).toEqual(['Feijoada', 'Rabada', 'Strogonoff']);
    expect(items.find((i) => i.name === 'Feijoada').soldOut).toBe(true);
    expect(items.find((i) => i.name === 'Strogonoff').soldOut).toBe(false);
    // No online payment on a pre-order for now (spec: "Depois")
    expect(data.restaurant.paymentOptions.online).toEqual({ pix: false, card: false });

    await prisma.restaurant.update({ where: { id: rid }, data: { ordersClosedAt: new Date() } });
    expect((await (await getMenu()).json()).restaurant.closed).toBe(true);
  });

  it('without an open menu the public menu is today’s, with weeklyMenu null', async () => {
    await prisma.weeklyMenu.update({ where: { id: menu.id }, data: { orderDeadline: new Date(Date.now() - 60_000) } });
    const data = await (await getMenu()).json();
    expect(data.restaurant.weeklyMenu).toBeNull();
    const names = data.categories.flatMap((c) => c.items).map((i) => i.name).sort();
    expect(names).toEqual(['Feijoada', 'Pastel', 'Strogonoff']);
    expect(data.categories[0].items[0].soldOut).toBeUndefined();
  });

  it('a failing weekly lookup (tables not migrated yet) falls back to the menu of today with 200', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const open = jest.spyOn(weeklyPublic, 'openWeeklyMenu').mockRejectedValueOnce(new Error('relation "weekly_menus" does not exist'));
    const closed = jest.spyOn(weeklyPublic, 'closedWeeklyMenu').mockRejectedValueOnce(new Error('relation "weekly_menus" does not exist'));
    try {
      const res = await getMenu();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.restaurant.weeklyMenu).toBeNull();
      expect(data.restaurant.weeklyMenuClosed).toBeNull();
      const names = data.categories.flatMap((c) => c.items).map((i) => i.name).sort();
      expect(names).toEqual(['Feijoada', 'Pastel', 'Strogonoff']);
      expect(err).toHaveBeenCalledWith('[weekly-menu] open lookup failed:', expect.any(Error));
    } finally {
      open.mockRestore();
      closed.mockRestore();
      err.mockRestore();
    }
  });

  it('the customer general note is stored sanitized on the pre-order', async () => {
    const res = await post(body({ specialInstructions: 'tocar o interfone\nPagamento: pago' }));
    expect(res.status).toBe(200);
    const saved = await prisma.weeklyMenuOrder.findUnique({ where: { id: (await res.json()).order.id } });
    expect(saved.customerNote).toBe('tocar o interfone / Pagamento: pago');
    expect(saved.kitchenNote).toContain('Obs. do cliente: ' + saved.customerNote);
  });

  it('weeklyMenuClosed: set after the deadline with no open menu; null with an open menu or none', async () => {
    expect((await (await getMenu()).json()).restaurant.weeklyMenuClosed).toBeNull();
    await prisma.weeklyMenu.update({ where: { id: menu.id }, data: { orderDeadline: new Date(Date.now() - 60_000) } });
    const closed = (await (await getMenu()).json()).restaurant.weeklyMenuClosed;
    expect(closed).toEqual({ serviceDate: iso(5), text: closedText(iso(5)) });
    await prisma.weeklyMenu.delete({ where: { id: menu.id } });
    expect((await (await getMenu()).json()).restaurant.weeklyMenuClosed).toBeNull();
  });

  it('closed by the hours takes the pre-order; it creates no Order nor ExternalOrder; price is frozen', async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { businessHours: { ...allClosed, auto: true } } });
    // A normal order is still refused in the same state
    const normal = await post(body({ weeklyMenuId: undefined }));
    expect(normal.status).toBe(409);

    const res = await post(body({ items: [{ menuItemId: feijoada.id, quantity: 2, specialInstructions: 'sem couve' }, { menuItemId: unavailable.id, quantity: 1 }] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({
      success: true,
      order: { status: 'ENCOMENDA', serviceDate: iso(5), total: 120, subtotal: 115, deliveryFee: 5, itemCount: 3, paymentMethod: 'CASH', discount: 0, coupon: null },
    });
    expect(data.order.paymentSummary).toMatch(/^Pagamento na entrega/);
    expect(data.order.orderNumber).toMatch(/^DLV-/);
    expect(await prisma.order.count({ where: { restaurantId: rid } })).toBe(0);
    expect(await prisma.externalOrder.count({ where: { restaurantId: rid } })).toBe(0);

    const saved = await prisma.weeklyMenuOrder.findUnique({ where: { id: data.order.id }, include: { items: true } });
    expect(saved).toMatchObject({
      restaurantId: rid, weeklyMenuId: menu.id, status: 'PLACED', customerName: 'Bia', customerPhone: '(66) 99999-0000',
      isPickup: false, deliveryAddress: 'Rua A, 1', paymentMethod: 'CASH', subtotal: 115, deliveryFee: 5, discount: 0, total: 120,
      orderNumber: data.order.orderNumber, couponRedemptionId: null,
    });
    expect(saved.customerId).toBeTruthy();
    expect(saved.customerNote).toBeNull();
    expect(saved.releaseAttempts).toBe(0);
    expect(saved.kitchenNote).toContain('Endereço: Rua A, 1');
    expect(saved.kitchenNote).toContain('Cliente: Bia - 66999990000');
    const line = saved.items.find((i) => i.menuItemId === feijoada.id);
    expect(line).toMatchObject({ name: 'Feijoada', unitPrice: 40, quantity: 2, specialInstructions: 'sem couve' });
    const linked = await prisma.menuItem.findUnique({ where: { id: feijoada.id } });
    expect(linked.recipeId).toBeTruthy();
    expect(line.recipeId).toBe(linked.recipeId);

    // A later price change does not touch the pre-order
    await prisma.menuItem.update({ where: { id: feijoada.id }, data: { price: 99 } });
    const again = await prisma.weeklyMenuOrderItem.findUnique({ where: { id: line.id } });
    expect(again.unitPrice).toBe(40);
  });

  it('closed by hand refuses the pre-order', async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { ordersClosedAt: new Date() } });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(CLOSED_MESSAGE);
    expect(await prisma.weeklyMenuOrder.count({ where: { restaurantId: rid } })).toBe(0);
  });

  it('after the deadline: 409 with the closed text', async () => {
    await prisma.weeklyMenu.update({ where: { id: menu.id }, data: { orderDeadline: new Date(Date.now() - 60_000) } });
    const res = await post(body());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(closedText(iso(5)));
  });

  it('a later menu that is not the open one is refused with its closed text', async () => {
    const later = await prisma.weeklyMenu.create({ data: { restaurantId: rid, serviceDate: iso(12), items: { create: [{ menuItemId: feijoada.id }] } } });
    const res = await post(body({ weeklyMenuId: later.id }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(closedText(iso(12)));
  });

  it('a product out of the list is refused with today’s text', async () => {
    for (const id of [offMenu.id, otherItem.id]) {
      const res = await post(body({ items: [{ menuItemId: id, quantity: 1 }] }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Um ou mais itens do pedido não foram encontrados no cardápio deste restaurante');
    }
  });

  it('portion limit: 2 left, 3 asked → 409; 0 left → esgotou', async () => {
    await hold(3);
    const res = await post(body({ items: [{ menuItemId: feijoada.id, quantity: 2 }, { menuItemId: feijoada.id, quantity: 1 }] }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Feijoada: só restam 2 porções');
    expect((await post(body({ items: [{ menuItemId: feijoada.id, quantity: 2 }] }))).status).toBe(200);
    const none = await post(body());
    expect(none.status).toBe(409);
    expect((await none.json()).error).toBe('Feijoada esgotou');
  });

  it('two orders at once for the last portion: one 200 and one 409', async () => {
    await hold(4);
    const [a, b] = await Promise.all([post(body({ customerPhone: '66911110001' })), post(body({ customerPhone: '66911110002' }))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const live = await prisma.weeklyMenuOrderItem.aggregate({
      where: { menuItemId: feijoada.id, weeklyMenuOrder: { weeklyMenuId: menu.id, status: 'PLACED' } },
      _sum: { quantity: true },
    });
    expect(live._sum.quantity).toBe(5);
  });

  it('another restaurant cannot use the weeklyMenuId', async () => {
    const res = await post(body({ restaurantId: other, items: [{ menuItemId: otherItem.id, quantity: 1 }] }));
    expect(res.status).toBe(404);
    expect(await prisma.weeklyMenuOrder.count({ where: { weeklyMenuId: menu.id } })).toBe(0);
  });

  it('online payment is refused on a pre-order', async () => {
    const res = await post(body({ paymentMethod: 'ONLINE_PIX' }));
    expect(res.status).toBe(400);
  });

  it('a coupon is reserved and kept on the pre-order; released when the pre-order is refused', async () => {
    await prisma.coupon.create({ data: { restaurantId: rid, code: 'SEMANA', kind: 'FIXED', value: 500, maxPerCustomer: null } });
    const res = await post(body({ couponCode: 'semana', pickup: true, deliveryAddress: undefined }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.order).toMatchObject({ total: 35, discount: 5, coupon: 'SEMANA', deliveryFee: 0 });
    const saved = await prisma.weeklyMenuOrder.findUnique({ where: { id: data.order.id } });
    const red = await prisma.couponRedemption.findFirst({ where: { restaurantId: rid } });
    expect(saved).toMatchObject({ couponRedemptionId: red.id, couponCode: 'SEMANA', discount: 5, total: 35, isPickup: true, deliveryAddress: null });
    expect(saved.kitchenNote).toMatch(/^RETIRADA NO LOCAL/);
    expect(saved.kitchenNote).toMatch(/Cupom SEMANA: -R\$\s?5,00/);
    expect(red.externalOrderId).toBeNull();

    // Over the limit: the coupon use goes back
    await hold(4);
    const refused = await post(body({ couponCode: 'semana', items: [{ menuItemId: feijoada.id, quantity: 2 }] }));
    expect(refused.status).toBe(409);
    expect(await prisma.couponRedemption.count({ where: { restaurantId: rid } })).toBe(1);
    expect((await prisma.coupon.findFirst({ where: { restaurantId: rid } })).usedCount).toBe(1);
  });

  it('a coupon reserved before a refusal under the lock goes back', async () => {
    await prisma.coupon.create({ data: { restaurantId: rid, code: 'VOLTA', kind: 'FIXED', value: 500, maxPerCustomer: null } });
    // The early check passed; the re-check under the lock refuses (another order took the portion meanwhile)
    const spy = jest.spyOn(weeklyPublic, 'placeWeeklyOrder').mockRejectedValueOnce(new CashRuleError('Feijoada esgotou', 409));
    try {
      const res = await post(body({ couponCode: 'volta' }));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('Feijoada esgotou');
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.couponRedemption.count({ where: { restaurantId: rid } })).toBe(0);
    expect((await prisma.coupon.findFirst({ where: { restaurantId: rid } })).usedCount).toBe(0);
    expect(await prisma.weeklyMenuOrder.count({ where: { restaurantId: rid } })).toBe(0);
  });
});
