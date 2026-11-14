/**
 * Owner request 2026-11-14: the delivery fee of the link is the restaurant's (0 = free delivery), not a fixed R$ 5
 * nor what the page sends; a menu category can be renamed, and removed when empty.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as FEE_GET, PUT as FEE_PUT } from '../../../app/api/admin/delivery/fee/route';
import { POST as ORDER } from '../../../app/api/public/delivery/order/route';
import { POST as PREVIEW } from '../../../app/api/public/delivery/coupon/route';
import { GET as MENU } from '../../../app/api/public/delivery/menu/[restaurantId]/route';
import { PATCH as CAT_PATCH, DELETE as CAT_DELETE } from '../../../app/api/cardapio/categorias/[id]/route';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { parseDeliveryFee } from '../../../lib/delivery/fee';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);
const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }), headers: { 'x-forwarded-for': `10.1.${Math.floor(Math.random() * 250)}.1` } });
const putFee = (deliveryFee: unknown) => FEE_PUT(req('http://x/api/admin/delivery/fee', 'PUT', { deliveryFee }));

describe('delivery fee and categories', () => {
  let owner, cook, rid, otherRid, cat, emptyCat, otherCat, item;
  let seq = 0;
  const order = (extra = {}) => ORDER(req('http://x/api/public/delivery/order', 'POST', {
    restaurantId: rid, customerName: 'Bia', customerPhone: `6697${String(1000000 + seq++).slice(-7)}`, deliveryAddress: 'Rua A, 1',
    items: [{ menuItemId: item.id, quantity: 2 }], paymentMethod: 'CASH', ...extra,
  }));

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `df-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `df-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    const base = { ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false };
    rid = (await prisma.restaurant.create({ data: { name: `DF ${tag}`, ...base } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `DF2 ${tag}`, ...base } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Yakisoba', position: 0, active: true } });
    emptyCat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Vazia', position: 1, active: true } });
    otherCat = await prisma.menuCategory.create({ data: { restaurantId: otherRid, name: 'Outra', position: 0, active: true } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `D${tag}`, name: 'Madalena', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    item = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Madalena', price: 20, recipeId: recipe.id, position: 0 } });
    await saveDeliveryPaymentSettings(rid, { acceptCash: true, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.order.deleteMany({ where: { restaurantId: rid } }); } catch {}
    await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('reads the fee typed by the owner', () => {
    expect(parseDeliveryFee('5,50')).toEqual({ ok: true, fee: 5.5 });
    expect(parseDeliveryFee(0)).toEqual({ ok: true, fee: 0 });
    expect(parseDeliveryFee('7.999')).toEqual({ ok: true, fee: 8 });
    expect(parseDeliveryFee('-1').ok).toBe(false);
    expect(parseDeliveryFee('abc').ok).toBe(false);
    expect(parseDeliveryFee('').ok).toBe(false);
    expect(parseDeliveryFee(501).ok).toBe(false);
  });

  it('a new restaurant keeps R$ 5; only the owner or a manager changes it', async () => {
    as(owner);
    expect(await (await FEE_GET()).json()).toEqual({ deliveryFee: 5 });
    as(cook);
    expect((await putFee(0)).status).toBe(403);
    as(owner);
    expect((await putFee('abc')).status).toBe(400);
    const res = await putFee('8,50');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deliveryFee: 8.5 });
  });

  it('the order charges the restaurant fee, whatever the page sends', async () => {
    const menu = await (await MENU(req(`http://x/api/public/delivery/menu/${rid}`, 'GET'), { params: { restaurantId: rid } })).json();
    expect(menu.restaurant.deliveryFee).toBe(8.5);
    const res = await order({ deliveryFee: 0 });
    expect(res.status).toBe(200);
    expect((await res.json()).order).toMatchObject({ deliveryFee: 8.5, total: 48.5 });
    // Pickup still pays no fee
    const pick = await order({ pickup: true, deliveryAddress: undefined, deliveryFee: 99 });
    expect((await pick.json()).order).toMatchObject({ deliveryFee: 0, total: 40 });
  });

  it('fee 0 = free delivery; a free-shipping coupon has nothing to take off', async () => {
    as(owner);
    expect((await putFee(0)).status).toBe(200);
    const menu = await (await MENU(req(`http://x/api/public/delivery/menu/${rid}`, 'GET'), { params: { restaurantId: rid } })).json();
    expect(menu.restaurant.deliveryFee).toBe(0);
    const res = await order({ deliveryFee: 5 });
    expect((await res.json()).order).toMatchObject({ deliveryFee: 0, total: 40 });
    await prisma.coupon.create({ data: { restaurantId: rid, code: `FRETE${tag}`.toUpperCase(), kind: 'FREE_DELIVERY', value: 0, active: true } });
    const p = await PREVIEW(req('http://x/api/public/delivery/coupon', 'POST', { restaurantId: rid, code: `FRETE${tag}`, items: [{ menuItemId: item.id, quantity: 2 }], deliveryFee: 9 }));
    // Either refused (nothing to discount) or a zero discount: never the R$ 9 the page claimed
    if (p.status === 200) expect((await p.json()).discountCents).toBe(0);
  });

  it('renames a category (name and emoji); a cook or another restaurant cannot', async () => {
    const patch = (id: string, body: unknown) => CAT_PATCH(req(`http://x/api/cardapio/categorias/${id}`, 'PATCH', body), { params: { id } });
    as(cook);
    expect((await patch(cat.id, { name: 'Massas' })).status).toBe(403);
    as(owner);
    expect((await patch(cat.id, { name: '  ' })).status).toBe(400);
    expect((await patch(otherCat.id, { name: 'Massas' })).status).toBe(404);
    const res = await patch(cat.id, { name: ' Massas ', emoji: '🍝' });
    expect(res.status).toBe(200);
    expect(await prisma.menuCategory.findUnique({ where: { id: cat.id } })).toMatchObject({ name: 'Massas', emoji: '🍝' });
    // The products stay in it
    expect((await prisma.menuItem.findUnique({ where: { id: item.id } })).categoryId).toBe(cat.id);
  });

  it('removes only an empty category', async () => {
    const del = (id: string) => CAT_DELETE(req(`http://x/api/cardapio/categorias/${id}`, 'DELETE'), { params: { id } });
    as(owner);
    const busy = await del(cat.id);
    expect(busy.status).toBe(409);
    expect((await busy.json()).error).toContain('1 produto');
    expect((await del(otherCat.id)).status).toBe(404);
    expect((await del(emptyCat.id)).status).toBe(200);
    expect((await prisma.menuCategory.findUnique({ where: { id: emptyCat.id } })).active).toBe(false);
    expect((await del(emptyCat.id)).status).toBe(404);
  });
});
