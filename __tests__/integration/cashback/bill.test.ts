// @ts-nocheck
/** Cashback on the bill (spec 2026-10-23 §7.1, §7.4): attach by phone, use as a discount, earn on close, reverse */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { PUT as SESSION_PUT, DELETE as SESSION_DELETE } from '../../../app/api/comanda/sessions/[id]/route';
import { PUT as ATTACH, DELETE as DETACH } from '../../../app/api/comanda/sessions/[id]/customer/route';
import { POST as USE, DELETE as UNUSE } from '../../../app/api/comanda/sessions/[id]/cashback/route';
import { balanceCents, findCustomerByPhone } from '../../../lib/cashback/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const PHONE = '11955554444';

describe('cashback on the bill', () => {
  let rid, proRid, ownerId, cookId, shiftId, proShiftId, recipeId, proRecipeId;
  const as = (id) => {
    const s = { user: { id, email: id === ownerId ? `cbb-${tag}@gastrux.test` : `cbc-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const req = (method, body = {}) => new NextRequest('http://x', { method, body: JSON.stringify(body) });
  const p = (sid) => ({ params: { id: sid } });
  const pay = (sid, amount, shift = shiftId) => PAY(req('POST', { payments: [{ method: 'pix', amount }], cashSessionId: shift }), p(sid));
  // 1 x 50,00 on a table with 10% service charge = 55,00
  const newBill = async (restaurantId = rid, recipe = recipeId) => {
    const s = await prisma.orderSession.create({ data: { restaurantId, userId: ownerId, status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe, price: 50, quantity: 1 } });
    return s.id;
  };
  const customer = () => findCustomerByPhone(prisma, rid, PHONE);
  const give = async (cents) => {
    const c = await customer();
    await prisma.cashbackCredit.create({ data: { restaurantId: rid, customerId: c.id, amountCents: cents, remainingCents: cents, expiresAt: new Date(Date.now() + 30 * 864e5) } });
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `cbb-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    const mk = async (name, tier) => {
      const id = (await prisma.restaurant.create({ data: { name: `${name} ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: tier, subscriptionStatus: 'active', isInternal: false, serviceChargePercent: 10 } })).id;
      await prisma.restaurantUser.create({ data: { restaurantId: id, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
      const reg = await prisma.cashRegister.create({ data: { restaurantId: id, name: 'Caixa', isDefault: true } });
      const shift = (await prisma.cashSession.create({ data: { restaurantId: id, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
      const recipe = (await prisma.recipe.create({ data: { restaurantId: id, code: `P${name}${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
      return { id, shift, recipe };
    };
    const a = await mk('Biz', 'business');
    rid = a.id; shiftId = a.shift; recipeId = a.recipe;
    const b = await mk('Pro', 'pro');
    proRid = b.id; proShiftId = b.shift; proRecipeId = b.recipe;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    cookId = (await prisma.user.create({ data: { email: `cbc-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cookId, role: 'COOK', permissions: [], acceptedAt: new Date() } });
  }, 90000);

  afterAll(async () => {
    const ids = [rid, proRid];
    await prisma.cashbackUse.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashbackCredit.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.user.updateMany({ where: { id: { in: [ownerId, cookId] } }, data: { currentRestaurantId: null } });
    for (const id of ids) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.customer.deleteMany({ where: { restaurantId: { in: ids } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [ownerId, cookId] } } }); } catch {}
  });

  it('attach a new phone with its name; earn 5% of the items (not the service charge) on close', async () => {
    as(ownerId);
    const sid = await newBill();
    expect((await ATTACH(req('PUT', { phone: '(11) 95555-4444' }), p(sid))).status).toBe(400); // new phone, no name
    const attached = await (await ATTACH(req('PUT', { phone: '(11) 95555-4444', name: 'Maria' }), p(sid))).json();
    expect(attached.customer).toMatchObject({ name: 'Maria', phone: '(11) 95555-4444', balanceCents: 0 });
    const closed = await (await pay(sid, '55,00')).json();
    expect(closed).toMatchObject({ closed: true, cashbackEarnedCents: 250 });
    const c = await customer();
    expect(await balanceCents(prisma, rid, c.id)).toBe(250);
    expect([Number(c.totalSpent), c.totalOrders]).toEqual([55, 1]);
  });

  it('use cashback: the bill total drops, the base of the new credit leaves it out', async () => {
    as(ownerId);
    await give(1750); // balance 20,00
    const sid = await newBill();
    await ATTACH(req('PUT', { phone: PHONE }), p(sid));
    const used = await (await USE(req('POST', {}), p(sid))).json();
    expect(used).toMatchObject({ cashbackUsedCents: 2000, totalCents: 3500, remainingCents: 3500 });
    const closed = await (await pay(sid, '35,00')).json();
    expect(closed).toMatchObject({ closed: true, cashbackEarnedCents: 150 }); // 5% of 50 - 20
    expect(await balanceCents(prisma, rid, (await customer()).id)).toBe(150);
  });

  it('the use is capped at what is left to pay and needs the minimum balance', async () => {
    as(ownerId);
    await give(5000); // 51,50
    const sid = await newBill();
    await ATTACH(req('PUT', { phone: PHONE }), p(sid));
    await pay(sid, '40,00');
    const used = await (await USE(req('POST', {}), p(sid))).json();
    expect(used).toMatchObject({ cashbackUsedCents: 1500, remainingCents: 0 });
    // Removed before paying again: back to the balance
    expect((await UNUSE(req('DELETE'), p(sid))).status).toBe(200);
    expect(await balanceCents(prisma, rid, (await customer()).id)).toBe(5150);
    await pay(sid, '15,00');
    const poor = await newBill();
    await ATTACH(req('PUT', { phone: '11944443333', name: 'Pobre' }), p(poor));
    expect((await USE(req('POST', {}), p(poor))).status).toBe(422);
  });

  it('two bills of the same customer using at once never spend more than the balance', async () => {
    as(ownerId);
    const c = await customer();
    const before = await balanceCents(prisma, rid, c.id);
    const a = await newBill();
    const b = await newBill();
    await ATTACH(req('PUT', { phone: PHONE }), p(a));
    await ATTACH(req('PUT', { phone: PHONE }), p(b));
    await Promise.all([USE(req('POST', { cents: before }), p(a)), USE(req('POST', { cents: before }), p(b))]);
    const used = await prisma.cashbackUse.aggregate({ where: { orderSessionId: { in: [a, b] } }, _sum: { amountCents: true } });
    expect(used._sum.amountCents).toBeLessThanOrEqual(before);
    expect(await balanceCents(prisma, rid, c.id)).toBeGreaterThanOrEqual(0);
    await UNUSE(req('DELETE'), p(a));
    await UNUSE(req('DELETE'), p(b));
  });

  it('reopening a closed bill takes its credit back and returns what it used; cancelling an open one returns its use', async () => {
    as(ownerId);
    const c = await customer();
    const start = await balanceCents(prisma, rid, c.id);
    const sid = await newBill();
    await ATTACH(req('PUT', { phone: PHONE }), p(sid));
    await USE(req('POST', { cents: 1000 }), p(sid));
    const closed = await (await pay(sid, '45,00')).json();
    expect(await balanceCents(prisma, rid, c.id)).toBe(start - 1000 + closed.cashbackEarnedCents);
    const totals = await prisma.customer.findUnique({ where: { id: c.id } });
    expect((await SESSION_PUT(req('PUT', { status: 'OPEN', reason: 'cliente voltou', cashSessionId: shiftId }), p(sid))).status).toBe(200);
    expect(await balanceCents(prisma, rid, c.id)).toBe(start);
    const after = await prisma.customer.findUnique({ where: { id: c.id } });
    expect(after.totalOrders).toBe(totals.totalOrders - 1);
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).cashbackUsedCents).toBe(0);

    const open = await newBill();
    await ATTACH(req('PUT', { phone: PHONE }), p(open));
    await USE(req('POST', { cents: 1000 }), p(open));
    expect((await SESSION_DELETE(req('DELETE', { reason: 'desistiu', cashSessionId: shiftId }), p(open))).status).toBe(200);
    expect(await balanceCents(prisma, rid, c.id)).toBe(start);
  });

  it('Pro: the phone is attached and the purchase counts, but cashback is not used or earned', async () => {
    as(ownerId);
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: proRid } });
    const sid = await newBill(proRid, proRecipeId);
    expect((await ATTACH(req('PUT', { phone: PHONE, name: 'Maria' }), p(sid))).status).toBe(200);
    expect((await USE(req('POST', {}), p(sid))).status).toBe(403);
    const closed = await (await pay(sid, '55,00', proShiftId)).json();
    expect(closed).toMatchObject({ closed: true, cashbackEarnedCents: 0 });
    const c = await findCustomerByPhone(prisma, proRid, PHONE);
    expect(c.totalOrders).toBe(1);
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
  });

  it('the cook cannot attach or use; detaching removes the use', async () => {
    const sid = await newBill();
    as(cookId);
    expect((await ATTACH(req('PUT', { phone: PHONE }), p(sid))).status).toBe(403);
    as(ownerId);
    await ATTACH(req('PUT', { phone: PHONE }), p(sid));
    await USE(req('POST', { cents: 1000 }), p(sid));
    expect((await DETACH(req('DELETE'), p(sid))).status).toBe(200);
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    expect(s).toMatchObject({ customerId: null, cashbackUsedCents: 0 });
  });
});
