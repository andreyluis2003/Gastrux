/**
 * Cupons (spec 2026-11-08): the owner creates and pauses coupons; the delivery site previews and applies them; the
 * server recalculates, records the use, respects the limits (also with two orders at once) and the first order.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
jest.mock('../../../lib/api/tier-middleware', () => ({
  ...jest.requireActual('../../../lib/api/tier-middleware'),
  enforceResourceLimit: jest.fn().mockResolvedValue(null),
}));

import { getServerSession } from 'next-auth';
import { NextRequest } from 'next/server';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as LIST, POST as CREATE } from '../../../app/api/admin/coupons/route';
import { PATCH } from '../../../app/api/admin/coupons/[id]/route';
import { POST as PREVIEW } from '../../../app/api/public/delivery/coupon/route';
import { POST as ORDER } from '../../../app/api/public/delivery/order/route';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (user: any) => (getServerSession as jest.Mock).mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);
const json = (url: string, body: unknown) => new NextRequest(url, { method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': `10.0.${Math.floor(Math.random() * 250)}.1` } });
const create = (body) => CREATE(json('http://x/api/admin/coupons', body));

describe('cupons', () => {
  let owner, cook, rid, item;
  let phoneSeq = 0;
  const phone = () => `6699${String(1000000 + phoneSeq++).slice(-7)}`;
  // item 20 x 2 = 40 subtotal + delivery fee 7
  const order = (extra = {}) => ORDER(json('http://x/api/public/delivery/order', {
    restaurantId: rid, customerName: 'Bia', customerPhone: phone(), deliveryAddress: 'Rua A, 1',
    items: [{ menuItemId: item.id, quantity: 2 }], deliveryFee: 7, paymentMethod: 'CASH', ...extra,
  }));

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `cp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    cook = await prisma.user.create({ data: { email: `cp-c-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK' } });
    rid = (await prisma.restaurant.create({ data: { name: `CP ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cook.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Lanches', position: 0, active: true } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'X-Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    item = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'X-Burger', price: 20, recipeId: recipe.id, position: 0 } });
    await saveDeliveryPaymentSettings(rid, { acceptCash: true, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(rid);
  }, 60000);
  afterAll(async () => {
    try { await prisma.auditLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.order.deleteMany({ where: { restaurantId: rid } }); } catch {}
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, cook.id] } } });
  });

  it('only the owner or the manager creates coupons; codes are unique', async () => {
    as(cook);
    expect((await create({ code: 'COOK10', kind: 'PERCENT', value: 10 })).status).toBe(403);
    as(owner);
    expect((await create({ code: 'dez por cento', kind: 'PERCENT', value: 10 })).status).toBe(201);
    expect((await create({ code: 'DEZPORCENTO', kind: 'FIXED', value: 100 })).status).toBe(409);
    expect((await create({ code: 'X', kind: 'PERCENT', value: 10 })).status).toBe(400);
  });

  it('previews and applies 10% on the subtotal; the use is recorded with the order', async () => {
    const p = await PREVIEW(json('http://x/api/public/delivery/coupon', { restaurantId: rid, code: 'dezporcento', customerPhone: '66 98888-0000', items: [{ menuItemId: item.id, quantity: 2 }], deliveryFee: 7 }));
    expect(await p.json()).toMatchObject({ code: 'DEZPORCENTO', discountCents: 400 });
    const res = await order({ couponCode: 'dezporcento' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order).toMatchObject({ total: 43, discount: 4, coupon: 'DEZPORCENTO' });
    const ext = await prisma.externalOrder.findFirst({ where: { restaurantId: rid }, orderBy: { createdAt: 'desc' } });
    expect([ext.discount, ext.totalAmount]).toEqual([4, 43]);
    expect(ext.specialInstructions).toMatch(/Cupom DEZPORCENTO: -R\$\s?4,00/);
    const red = await prisma.couponRedemption.findFirst({ where: { restaurantId: rid } });
    expect(red).toMatchObject({ externalOrderId: ext.id, discountCents: 400 });
  });

  it('one use per customer phone by default', async () => {
    as(owner);
    await create({ code: 'UMAVEZ', kind: 'FIXED', value: 500 });
    const fixed = '66977776666';
    expect((await order({ couponCode: 'UMAVEZ', customerPhone: fixed })).status).toBe(200);
    const again = await order({ couponCode: 'UMAVEZ', customerPhone: fixed });
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ code: 'COUPON_REFUSED', error: 'Este cupom não vale para este celular.' });
  });

  it('free delivery, first order only, minimum order', async () => {
    as(owner);
    await create({ code: 'FRETE', kind: 'FREE_DELIVERY', firstOrderOnly: true, minOrderCents: 3000 });
    expect((await order({ couponCode: 'FRETE', items: [{ menuItemId: item.id, quantity: 1 }] })).status).toBe(400);
    const ok = await order({ couponCode: 'FRETE', customerPhone: '66911112222' });
    expect((await ok.json()).order).toMatchObject({ total: 40, discount: 7 });
    // The same phone already ordered: not the first order any more
    const second = await order({ couponCode: 'FRETE', customerPhone: '66911112222' });
    expect(second.status).toBe(400);
    expect(await second.json()).toMatchObject({ error: 'Este cupom não vale para este celular.' });
    // The preview never tells that this phone already ordered
    const p = await PREVIEW(json('http://x/api/public/delivery/coupon', { restaurantId: rid, code: 'FRETE', customerPhone: '66911112222', items: [{ menuItemId: item.id, quantity: 2 }], deliveryFee: 7 }));
    expect(p.status).toBe(200);
  });

  it('the last use goes to one order only, even with two at once', async () => {
    as(owner);
    await create({ code: 'ULTIMO', kind: 'PERCENT', value: 50, maxUses: 1, maxPerCustomer: null });
    const [a, b] = await Promise.all([order({ couponCode: 'ULTIMO' }), order({ couponCode: 'ULTIMO' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await prisma.coupon.findFirst({ where: { restaurantId: rid, code: 'ULTIMO' } })).usedCount).toBe(1);
  });

  it('a paused coupon is refused; the list shows uses and discount given', async () => {
    as(owner);
    const list = await (await LIST()).json();
    const dez = list.find((c) => c.code === 'DEZPORCENTO');
    expect(dez).toMatchObject({ usedCount: 1, discountGivenCents: 400 });
    expect((await PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify({ active: false }) }), { params: { id: dez.id } })).status).toBe(200);
    const res = await order({ couponCode: 'DEZPORCENTO' });
    expect(await res.json()).toMatchObject({ error: 'Cupom inválido ou fora do ar.' });
  });
});
