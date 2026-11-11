/** Weekly menu admin: create/copy/edit, detail, cancel (spec 2026-11-10 cardapio-da-semana). */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as LIST, POST as CREATE } from '../../../app/api/cardapio/semana/route';
import { GET as DETAIL, PUT as UPDATE, DELETE as REMOVE } from '../../../app/api/cardapio/semana/[id]/route';
import { POST as CANCEL } from '../../../app/api/cardapio/semana/[id]/encomendas/[orderId]/cancelar/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u: any) => (getServerSession as jest.Mock).mockResolvedValue(u ? { user: { id: u.id, email: u.email } } : null);
const json = (m: string, body?: any) =>
  new NextRequest('http://localhost/x', { method: m, body: body ? JSON.stringify(body) : undefined, headers: { 'content-type': 'application/json' } });
const iso = (days: number) => new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);

describe('weekly menu admin', () => {
  let owner, cook, cashier, rid, other, a, b, foreign, inactive, n = 0;
  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `wm-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `wm-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    cashier = await prisma.user.create({ data: { email: `wm-k-${tag}@gastrux.test`, name: 'Lu', password: 'x', role: 'CASHIER' } });
    rid = (await prisma.restaurant.create({ data: { name: `WM ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    other = (await prisma.restaurant.create({ data: { name: `WMO ${tag}`, ownerId: owner.id, status: 'ACTIVE' } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cashier.id, role: 'CASHIER', permissions: [], acceptedAt: new Date() } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `C ${tag}`, position: 0, active: true } });
    const oc = await prisma.menuCategory.create({ data: { restaurantId: other, name: `O ${tag}`, position: 0, active: true } });
    a = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Feijoada', price: 40, position: 0 } });
    b = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Strogonoff', price: 30, position: 1 } });
    inactive = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Velho', price: 5, position: 2, active: false } });
    foreign = await prisma.menuItem.create({ data: { restaurantId: other, categoryId: oc.id, name: 'Y', price: 9, position: 0 } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  }, 60000);
  afterAll(async () => {
    try { await prisma.weeklyMenuOrder.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: { in: [rid, other] } } }); } catch {}
    for (const id of [rid, other]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id, cashier.id] } } });
  });
  beforeEach(async () => {
    jest.clearAllMocks();
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
    await prisma.weeklyMenuOrder.deleteMany({ where: { restaurantId: rid } });
    await prisma.weeklyMenu.deleteMany({ where: { restaurantId: rid } });
    as(owner);
  });

  const create = (body: any) => CREATE(json('POST', body));
  const mkMenu = async (date = iso(5), items = [{ menuItemId: a.id, portionLimit: 10 }, { menuItemId: b.id }]) =>
    (await (await create({ serviceDate: date, items })).json()).id;
  const mkOrder = async (menuId: string, lines: [any, number, string?][], extra: any = {}) =>
    prisma.weeklyMenuOrder.create({
      data: {
        restaurantId: rid, weeklyMenuId: menuId, customerName: 'Cli', customerPhone: '34999990000', isPickup: true,
        kitchenNote: '', paymentMethod: 'CASH', paymentNote: '', subtotal: 0, deliveryFee: 0, discount: 0, total: 0,
        orderNumber: `WM-${tag}-${++n}`, ...extra,
        items: { create: lines.map(([mi, q, note]) => ({ menuItemId: mi.id, recipeId: 'r', name: mi.name, unitPrice: mi.price, quantity: q, specialInstructions: note ?? null })) },
      },
    });
  const detail = async (id: string) => (await DETAIL(json('GET'), { params: { id } })).json();

  it('owner creates with and without deadline', async () => {
    const r1 = await create({ serviceDate: iso(5), items: [{ menuItemId: a.id, portionLimit: 8 }] });
    expect(r1.status).toBe(201);
    const m1 = await prisma.weeklyMenu.findFirst({ where: { restaurantId: rid }, include: { items: true } });
    expect(m1.orderDeadline).toBeNull();
    expect(m1.items).toHaveLength(1);
    expect(m1.items[0].portionLimit).toBe(8);
    const dl = new Date(Date.now() + 3 * 86400_000).toISOString();
    const r2 = await create({ serviceDate: iso(6), orderDeadline: dl, items: [{ menuItemId: b.id }] });
    expect(r2.status).toBe(201);
    const m2 = await prisma.weeklyMenu.findFirst({ where: { restaurantId: rid, serviceDate: iso(6) } });
    expect(m2.orderDeadline.toISOString()).toBe(dl);
    const list = await (await LIST()).json();
    expect(list.menus).toHaveLength(2);
  });

  it('copies items and limits from another menu', async () => {
    const src = await mkMenu(iso(5));
    const res = await create({ serviceDate: iso(12), copyFromId: src, items: [] });
    expect(res.status).toBe(201);
    const copy = await prisma.weeklyMenu.findFirst({ where: { restaurantId: rid, serviceDate: iso(12) }, include: { items: true } });
    expect(copy.items.map((i) => [i.menuItemId, i.portionLimit]).sort()).toEqual([[a.id, 10], [b.id, null]].sort());
  });

  it('rejects duplicate date (409), past date (400), foreign/inactive product (400), bad date (400)', async () => {
    await mkMenu(iso(5));
    const dup = await create({ serviceDate: iso(5), items: [] });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toBe('Já existe um cardápio para esta data');
    expect((await create({ serviceDate: iso(-3), items: [] })).status).toBe(400);
    expect((await create({ serviceDate: iso(7), items: [{ menuItemId: foreign.id }] })).status).toBe(400);
    expect((await create({ serviceDate: iso(7), items: [{ menuItemId: inactive.id }] })).status).toBe(400);
    expect((await create({ serviceDate: '2026-13-45', items: [] })).status).toBe(400);
    expect((await create({ serviceDate: 'amanha', items: [] })).status).toBe(400);
  });

  it('cook and cashier get 403 on everything, no session 401', async () => {
    const id = await mkMenu();
    for (const u of [cook, cashier]) {
      as(u);
      expect((await create({ serviceDate: iso(9), items: [] })).status).toBe(403);
      expect((await LIST()).status).toBe(403);
      const res = await DETAIL(json('GET'), { params: { id } });
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('Alterar o cardápio exige um gerente');
    }
    as(null);
    expect((await LIST()).status).toBe(401);
  });

  it('detail of another restaurant menu is 404', async () => {
    const id = await mkMenu();
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(other);
    const res = await DETAIL(json('GET'), { params: { id } });
    expect(res.status).toBe(404);
  });

  it('removing a product with a PLACED order is 409; without one it works; limit/deadline update', async () => {
    const id = await mkMenu();
    await mkOrder(id, [[a, 2], [b, 1]]);
    await mkOrder(id, [[a, 1]]);
    const refuse = await UPDATE(json('PUT', { items: [{ menuItemId: b.id }] }), { params: { id } });
    expect(refuse.status).toBe(409);
    expect((await refuse.json()).error).toBe('Já tem 2 encomendas com este produto');
    const dl = new Date(Date.now() + 86400_000).toISOString();
    const ok = await UPDATE(json('PUT', { orderDeadline: dl, items: [{ menuItemId: a.id, portionLimit: 20 }, { menuItemId: b.id }] }), { params: { id } });
    expect(ok.status).toBe(200);
    const items = await prisma.weeklyMenuItem.findMany({ where: { weeklyMenuId: id } });
    expect(items.find((i) => i.menuItemId === a.id).portionLimit).toBe(20);
    expect((await prisma.weeklyMenu.findUnique({ where: { id } })).orderDeadline.toISOString()).toBe(dl);
    // product with no live orders can go
    const id2 = await mkMenu(iso(8));
    const gone = await UPDATE(json('PUT', { items: [{ menuItemId: a.id }] }), { params: { id: id2 } });
    expect(gone.status).toBe(200);
    expect(await prisma.weeklyMenuItem.count({ where: { weeklyMenuId: id2 } })).toBe(1);
  });

  it('detail brings ordered/remaining/summary, ignoring cancelled', async () => {
    const id = await mkMenu();
    await mkOrder(id, [[a, 3, 'sem pimenta'], [b, 1]]);
    await mkOrder(id, [[a, 2, 'sem pimenta']], { status: 'RELEASED' });
    await mkOrder(id, [[a, 5]], { status: 'CANCELLED' });
    const d = await detail(id);
    const ia = d.items.find((i) => i.menuItemId === a.id);
    const ib = d.items.find((i) => i.menuItemId === b.id);
    expect(ia).toMatchObject({ name: 'Feijoada', price: 40, portionLimit: 10, ordered: 5, remaining: 5 });
    expect(ib).toMatchObject({ ordered: 1, portionLimit: null, remaining: null });
    const sa = d.summary.find((s) => s.menuItemId === a.id);
    expect(sa.quantity).toBe(5);
    expect(sa.notes).toEqual([{ text: 'sem pimenta', quantity: 5 }]);
    expect(d.orders).toHaveLength(3);
  });

  it('cancel frees portions and the coupon; stores reason and cancelledAt', async () => {
    const id = await mkMenu();
    const coupon = await prisma.coupon.create({ data: { restaurantId: rid, code: `WM${tag}`.toUpperCase(), kind: 'FIXED', value: 500, usedCount: 1 } });
    const red = await prisma.couponRedemption.create({ data: { couponId: coupon.id, restaurantId: rid, phoneDigits: '34999990000', discountCents: 500 } });
    const o = await mkOrder(id, [[a, 4]], { couponRedemptionId: red.id, couponCode: coupon.code });
    expect((await detail(id)).items.find((i) => i.menuItemId === a.id).remaining).toBe(6);
    const res = await CANCEL(json('POST', { reason: 'cliente desistiu' }), { params: { id, orderId: o.id } });
    expect(res.status).toBe(200);
    const row = await prisma.weeklyMenuOrder.findUnique({ where: { id: o.id } });
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelReason).toBe('cliente desistiu');
    expect(row.cancelledAt).not.toBeNull();
    expect((await detail(id)).items.find((i) => i.menuItemId === a.id).remaining).toBe(10);
    expect(await prisma.couponRedemption.count({ where: { id: red.id } })).toBe(0);
    expect((await prisma.coupon.findUnique({ where: { id: coupon.id } })).usedCount).toBe(0);
    // cancelling twice is refused
    expect((await CANCEL(json('POST', { reason: 'x' }), { params: { id, orderId: o.id } })).status).toBe(409);
    await prisma.coupon.delete({ where: { id: coupon.id } });
  });

  it('cancel is scoped to the menu in the URL: order of another menu is 404', async () => {
    const id1 = await mkMenu(iso(5));
    const id2 = await mkMenu(iso(6));
    const o = await mkOrder(id1, [[a, 1]]);
    const res = await CANCEL(json('POST', { reason: 'x' }), { params: { id: id2, orderId: o.id } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Encomenda não encontrada');
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: o.id } })).status).toBe('PLACED');
  });

  it('cancelling a RELEASED order is 409 with the exact message', async () => {
    const id = await mkMenu();
    const o = await mkOrder(id, [[a, 1]], { status: 'RELEASED' });
    const res = await CANCEL(json('POST', { reason: 'x' }), { params: { id, orderId: o.id } });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Esta encomenda já virou pedido; cancele pelo pedido');
    expect((await prisma.weeklyMenuOrder.findUnique({ where: { id: o.id } })).status).toBe('RELEASED');
  });

  it('delete: refused with live orders, allowed when only cancelled orders remain', async () => {
    const id = await mkMenu();
    const o = await mkOrder(id, [[a, 1]]);
    expect((await REMOVE(json('DELETE'), { params: { id } })).status).toBe(409);
    await CANCEL(json('POST', { reason: 'x' }), { params: { id, orderId: o.id } });
    expect((await REMOVE(json('DELETE'), { params: { id } })).status).toBe(200);
    expect(await prisma.weeklyMenu.count({ where: { id } })).toBe(0);
    expect(await prisma.weeklyMenuOrder.count({ where: { id: o.id } })).toBe(0);
  });
});
