// @ts-nocheck
/** Cashback on the counter sale and on delivery-site orders (spec 2026-10-23 §7.2, §7.3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/api/tier-middleware', () => ({
  ...jest.requireActual('../../../lib/api/tier-middleware'),
  enforceResourceLimit: jest.fn().mockResolvedValue(null),
}));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as QUICK_SALE } from '../../../app/api/comanda/quick-sale/route';
import { POST as DELIVERY_ORDER } from '../../../app/api/public/delivery/order/route';
import { changeOrderStatus } from '../../../lib/kds/order-status';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { balanceCents, findCustomerByPhone } from '../../../lib/cashback/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('cashback on counter sales and delivery orders', () => {
  let rid, ownerId, shiftId, recipeId, menuItemId;
  const email = `cbq-${tag}@gastrux.test`;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Q ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `Q${tag}`, name: 'Espeto', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 20 } })).id;
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: `Cat ${tag}` } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Espeto', price: 20, recipeId, active: true, available: true } })).id;
    await saveDeliveryPaymentSettings(rid, { acceptCash: true, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] });
    const s = { user: { id: ownerId, email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);

  afterAll(async () => {
    await prisma.cashbackCredit.deleteMany({ where: { restaurantId: rid } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.customer.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  const sale = (clientId, extra = {}) =>
    QUICK_SALE(new NextRequest('http://x/api/comanda/quick-sale', {
      method: 'POST',
      headers: { 'Idempotency-Key': `k-${clientId}` },
      body: JSON.stringify({ clientId, items: [{ recipeId, quantity: 2 }], cashSessionId: shiftId, payments: [{ method: 'pix', amount: '40,00' }], ...extra }),
    }));

  it('a counter sale with a phone credits 5% once, even when it is sent again', async () => {
    const clientId = `qs-${tag}-1`;
    expect((await sale(clientId, { customerPhone: '(11) 93333-2222', customerName: 'Joana' })).status).toBe(201);
    const c = await findCustomerByPhone(prisma, rid, '11933332222');
    expect(c).toMatchObject({ name: 'Joana', totalOrders: 1 });
    expect(await balanceCents(prisma, rid, c.id)).toBe(200);
    await QUICK_SALE(new NextRequest('http://x/api/comanda/quick-sale', {
      method: 'POST',
      body: JSON.stringify({ clientId, items: [{ recipeId, quantity: 2 }], cashSessionId: shiftId, payments: [{ method: 'pix', amount: '40,00' }], customerPhone: '11933332222' }),
    }));
    expect(await balanceCents(prisma, rid, c.id)).toBe(200);
    expect((await prisma.customer.findUnique({ where: { id: c.id } })).totalOrders).toBe(1);
  });

  it('a new phone without a name does not block the sale', async () => {
    expect((await sale(`qs-${tag}-2`, { customerPhone: '11922221111' })).status).toBe(201);
    expect(await findCustomerByPhone(prisma, rid, '11922221111')).toBeNull();
  });

  const order = async (phone) => {
    const res = await DELIVERY_ORDER(new Request('https://x/api/public/delivery/order', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: rid, customerName: 'Joana', customerPhone: phone, deliveryAddress: 'Rua A, 1', items: [{ menuItemId, quantity: 1 }], deliveryFee: 5, paymentMethod: 'CASH' }),
    }) as any);
    expect(res.status).toBeLessThan(300);
    return (await prisma.order.findFirst({ where: { restaurantId: rid }, orderBy: { createdAt: 'desc' } }));
  };

  it('a delivery order finds the customer by phone and credits 5% of the items (no fee) when completed, once', async () => {
    const o = await order('11 93333-2222');
    const c = await findCustomerByPhone(prisma, rid, '11933332222');
    expect(o.customerId).toBe(c.id);
    expect(await balanceCents(prisma, rid, c.id)).toBe(200);
    await changeOrderStatus(rid, o.id, 'COMPLETED');
    await changeOrderStatus(rid, o.id, 'COMPLETED');
    expect(await balanceCents(prisma, rid, c.id)).toBe(300); // + 5% of 20,00
    expect((await prisma.customer.findUnique({ where: { id: c.id } })).totalOrders).toBe(2);
  });

  it('a cancelled delivery order earns nothing', async () => {
    const o = await order('11933332222');
    const c = await findCustomerByPhone(prisma, rid, '11933332222');
    await prisma.order.update({ where: { id: o.id }, data: { status: 'CANCELLED' } });
    expect((await changeOrderStatus(rid, o.id, 'COMPLETED')).kind).not.toBe('changed');
    expect(await balanceCents(prisma, rid, c.id)).toBe(300);
  });
});
