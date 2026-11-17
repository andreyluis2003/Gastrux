/**
 * Cupom na comanda (spec 2026-11-16 cupom-whatsapp-balcao): the coupon applies on the comanda items, records the use
 * on the comanda, refuses free delivery and a second coupon, gives the use back on remove, never overflows the total
 * limit with two cashiers at once, and the closed comandas count as a previous order.
 */
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { lockComanda } from '../../../lib/comanda/add-item';
import { evaluateCoupon, NOT_FOR_THIS_PHONE } from '../../../lib/coupons/service';
import { applyCouponToSession, removeSessionCoupon } from '../../../lib/coupons/session';
import { loadBill } from '../../../lib/comanda/bill-service';
import { onBillClosed } from '../../../lib/cashback/bill';
import { toPublicBill } from '../../../lib/comanda/public-bill';
import { buildReceipt } from '../../../lib/print/tickets';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as APPLY, DELETE as REMOVE } from '../../../app/api/comanda/sessions/[id]/coupon/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { PUT as SESSION_PUT, DELETE as SESSION_DELETE } from '../../../app/api/comanda/sessions/[id]/route';
import { PUT as ATTACH } from '../../../app/api/comanda/sessions/[id]/customer/route';
import { POST as USE_CASHBACK } from '../../../app/api/comanda/sessions/[id]/cashback/route';
import { POST as MERGE } from '../../../app/api/comanda/sessions/[id]/merge/route';
import { balanceCents, findCustomerByPhone } from '../../../lib/cashback/service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('cupom na comanda', () => {
  let owner, rid, recipe;
  let phoneSeq = 0;
  const phone = () => `6697${String(1000000 + phoneSeq++).slice(-7)}`;
  const coupon = (data) => prisma.coupon.create({ data: { restaurantId: rid, kind: 'PERCENT', value: 10, maxPerCustomer: null, ...data } });
  // One OPEN comanda with 2 x R$ 20
  const comanda = async (extra = {}) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: owner.id, status: 'OPEN', ...extra } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, quantity: 2, price: 20 } });
    return s;
  };
  const apply = (sessionId, code, more = {}) =>
    prisma.$transaction((tx) => applyCouponToSession(tx, { restaurantId: rid, sessionId, code, phoneDigits: '', ...more }));

  beforeAll(async () => {
    owner = await prisma.user.create({ data: { email: `cpc-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `CPC ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'pro', subscriptionStatus: 'active', isInternal: false } })).id;
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'X-Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  }, 60000);
  afterAll(async () => {
    try { await prisma.orderSession.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.customer.deleteMany({ where: { restaurantId: rid } }); } catch {}
    await prisma.restaurant.delete({ where: { id: rid } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  });

  it('applies 10% on the comanda items and records the use', async () => {
    const c = await coupon({ code: 'DEZ' });
    const s = await comanda();
    // The caller may already hold the comanda lock (the lock is re-entrant in one transaction)
    const r = await prisma.$transaction(async (tx) => {
      await lockComanda(tx, s.id);
      return applyCouponToSession(tx, { restaurantId: rid, sessionId: s.id, code: 'dez', phoneDigits: '' });
    });
    expect(r).toEqual({ ok: true, code: 'DEZ', discountCents: 400, outOfRule: false });
    const after = await prisma.orderSession.findUnique({ where: { id: s.id } });
    expect([after.couponDiscountCents, after.couponCode]).toEqual([400, 'DEZ']);
    const red = await prisma.couponRedemption.findFirst({ where: { couponId: c.id } });
    expect(red).toMatchObject({ orderSessionId: s.id, restaurantId: rid, discountCents: 400, outOfRule: false, externalOrderId: null });
    expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(1);
  });

  it('refuses free delivery on a comanda', async () => {
    await coupon({ code: 'FRETE', kind: 'FREE_DELIVERY', value: 0 });
    const s = await comanda();
    expect(await apply(s.id, 'FRETE')).toEqual({ ok: false, status: 422, error: 'Este cupom é de entrega grátis e esta venda não tem taxa de entrega.' });
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).couponCode).toBeNull();
  });

  it('refuses a second coupon', async () => {
    await coupon({ code: 'UM' });
    await coupon({ code: 'DOIS' });
    const s = await comanda();
    expect((await apply(s.id, 'UM')).ok).toBe(true);
    const r = await apply(s.id, 'DOIS');
    expect(r).toMatchObject({ ok: false, status: 409, error: 'Esta conta já tem cupom.' });
  });

  it('remove gives the use back', async () => {
    const c = await coupon({ code: 'VOLTA' });
    const s = await comanda();
    expect((await apply(s.id, 'VOLTA')).ok).toBe(true);
    await prisma.$transaction((tx) => removeSessionCoupon(tx, rid, s.id));
    expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(0);
    const after = await prisma.orderSession.findUnique({ where: { id: s.id } });
    expect([after.couponDiscountCents, after.couponCode]).toEqual([0, null]);
    expect(await prisma.couponRedemption.count({ where: { orderSessionId: s.id } })).toBe(0);
    // Without a coupon: nothing happens
    await prisma.$transaction((tx) => removeSessionCoupon(tx, rid, s.id));
    expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(0);
  });

  it('two cashiers, last use: only one passes', async () => {
    const c = await coupon({ code: 'ULTIMO', maxUses: 1 });
    const [a, b] = [await comanda(), await comanda()];
    const results = await Promise.all([apply(a.id, 'ULTIMO'), apply(b.id, 'ULTIMO')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ status: 422, error: 'Este cupom já foi usado o número máximo de vezes.' });
    expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(1);
  });

  it('first order counts closed comandas', async () => {
    await coupon({ code: 'PRIMEIRA', firstOrderOnly: true });
    const digits = phone();
    const customer = await prisma.customer.create({ data: { restaurantId: rid, name: 'Bia', phone: digits, phoneDigits: digits } });
    const fresh = await evaluateCoupon(prisma, rid, 'PRIMEIRA', digits, 4000, 0, new Date(), { channel: 'comanda' });
    expect(fresh).toMatchObject({ ok: true, discountCents: 400, phoneRules: true });
    await comanda({ status: 'CLOSED', closedAt: new Date(), customerId: customer.id });
    const r = await evaluateCoupon(prisma, rid, 'PRIMEIRA', digits, 4000, 0, new Date(), { channel: 'comanda' });
    expect(r).toEqual({ ok: false, error: NOT_FOR_THIS_PHONE });
    // The delivery site also sees it
    expect(await evaluateCoupon(prisma, rid, 'PRIMEIRA', digits, 4000, 700, new Date(), { channel: 'site' })).toEqual({ ok: false, error: NOT_FOR_THIS_PHONE });
  });

  it('force keeps the discount past the limit', async () => {
    const c = await coupon({ code: 'ESGOTADO', maxUses: 1, usedCount: 1 });
    const s = await comanda();
    expect(await apply(s.id, 'ESGOTADO')).toMatchObject({ ok: false, status: 422 });
    expect(await apply(s.id, 'ESGOTADO', { force: true })).toEqual({ ok: true, code: 'ESGOTADO', discountCents: 400, outOfRule: true, warning: 'Este cupom já foi usado o número máximo de vezes.' });
    expect(await prisma.couponRedemption.findFirst({ where: { orderSessionId: s.id } })).toMatchObject({ outOfRule: true, discountCents: 400 });
    expect((await prisma.coupon.findUnique({ where: { id: c.id } })).usedCount).toBe(2);
  });

  it('force never applies a code that does not exist; a paused one is out of rule', async () => {
    await coupon({ code: 'PAUSADO', active: false });
    const s = await comanda();
    expect(await apply(s.id, 'NAOEXISTE', { force: true })).toEqual({ ok: false, status: 422, error: 'Cupom inválido ou fora do ar.' });
    expect(await apply(s.id, 'PAUSADO')).toEqual({ ok: false, status: 422, error: 'Cupom inválido ou fora do ar.' });
    expect(await apply(s.id, 'PAUSADO', { force: true })).toMatchObject({ ok: true, outOfRule: true, discountCents: 400 });
  });

  it('force never applies free delivery, paused or not (the paused one stays INVALID)', async () => {
    const paused = await coupon({ code: 'FRETEPAUSADO', kind: 'FREE_DELIVERY', value: 0, active: false });
    const live = await coupon({ code: 'FRETEATIVO', kind: 'FREE_DELIVERY', value: 0 });
    const s = await comanda();
    expect(await apply(s.id, 'FRETEPAUSADO', { force: true })).toEqual({ ok: false, status: 422, error: 'Cupom inválido ou fora do ar.' });
    expect(await apply(s.id, 'FRETEATIVO', { force: true })).toEqual({ ok: false, status: 422, error: 'Este cupom é de entrega grátis e esta venda não tem taxa de entrega.' });
    expect((await prisma.coupon.findUnique({ where: { id: paused.id } })).usedCount).toBe(0);
    expect((await prisma.coupon.findUnique({ where: { id: live.id } })).usedCount).toBe(0);
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).couponCode).toBeNull();
    expect(await prisma.couponRedemption.count({ where: { orderSessionId: s.id } })).toBe(0);
  });

  it('refuses a closed comanda and a comanda of another restaurant', async () => {
    await coupon({ code: 'FECHADA' });
    const closed = await comanda({ status: 'CLOSED', closedAt: new Date() });
    expect(await apply(closed.id, 'FECHADA')).toMatchObject({ ok: false, status: 422 });
    const open = await comanda();
    const r = await prisma.$transaction((tx) => applyCouponToSession(tx, { restaurantId: 'outro', sessionId: open.id, code: 'FECHADA', phoneDigits: '' }));
    expect(r).toMatchObject({ ok: false, status: 404 });
  });

  it('a coupon with a per-phone rule needs the phone', async () => {
    await coupon({ code: 'PORCEL', maxPerCustomer: 1 });
    const s = await comanda();
    expect(await apply(s.id, 'PORCEL')).toMatchObject({ ok: false, status: 422, error: 'Informe o seu celular para usar este cupom.' });
    const digits = phone();
    expect(await apply(s.id, 'PORCEL', { phoneDigits: digits })).toMatchObject({ ok: true });
    const other = await comanda();
    expect(await apply(other.id, 'PORCEL', { phoneDigits: digits })).toEqual({ ok: false, status: 422, error: NOT_FOR_THIS_PHONE });
  });

  describe('the coupon discount in the comanda totals', () => {
    let shiftId;
    beforeAll(async () => {
      const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
      shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: owner.id, openingFloatCents: 0, status: 'OPEN' } })).id;
    });
    afterAll(async () => {
      await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: rid } });
      await prisma.cashSession.deleteMany({ where: { restaurantId: rid } });
      await prisma.cashRegister.deleteMany({ where: { restaurantId: rid } });
    });
    const pay = (sessionId, amountCents) => prisma.cashSessionEntry.create({
      data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'PIX', amountCents, orderSessionId: sessionId, createdById: owner.id },
    });

    it('bill total and remaining take the coupon out', async () => {
      await coupon({ code: 'CONTA4', kind: 'FIXED', value: 400 });
      const s = await comanda();
      expect((await apply(s.id, 'CONTA4')).ok).toBe(true);
      const bill = await loadBill(prisma, rid, s.id);
      expect(bill).toMatchObject({ subtotalCents: 4000, serviceCents: 0, totalCents: 3600, couponDiscountCents: 400, couponCode: 'CONTA4' });
      await pay(s.id, 2000);
      expect((await loadBill(prisma, rid, s.id)).remainingCents).toBe(1600);
      // The table sees it too
      expect(toPublicBill(await loadBill(prisma, rid, s.id))).toMatchObject({ couponCents: 400, couponCode: 'CONTA4', totalCents: 3600, remainingCents: 1600 });
    });

    it('coupon and cashback together', async () => {
      const s = await comanda({ couponDiscountCents: 400, couponCode: 'X', cashbackUsedCents: 600 });
      expect((await loadBill(prisma, rid, s.id)).totalCents).toBe(3000);
    });

    it('the total never goes below zero when items leave after the coupon', async () => {
      const s = await comanda({ couponDiscountCents: 3500, couponCode: 'X' });
      await prisma.orderSessionItem.updateMany({ where: { sessionId: s.id }, data: { quantity: 1 } });
      const bill = await loadBill(prisma, rid, s.id);
      expect([bill.subtotalCents, bill.totalCents, bill.remainingCents]).toEqual([2000, 0, 0]);
    });

    it('the receipt takes the coupon out of what was paid', async () => {
      const s = await comanda({ status: 'CLOSED', closedAt: new Date(), couponDiscountCents: 400, couponCode: 'DEZ', cashbackUsedCents: 100 });
      const r = await buildReceipt(rid, s.id);
      expect(r).toMatchObject({ total: 40, grandTotal: 35, couponDiscount: 4, couponCode: 'DEZ', cashbackUsed: 1 });
    });

    it('cashback earned counts what was paid', async () => {
      // Cashback needs a Business plan: a restaurant of its own
      const biz = (await prisma.restaurant.create({ data: { name: `CPCB ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
      try {
        await prisma.cashbackSettings.create({ data: { restaurantId: biz, enabled: true, percent: 10 } });
        const digits = phone();
        const customer = await prisma.customer.create({ data: { restaurantId: biz, name: 'Caio', phone: digits, phoneDigits: digits } });
        const s = await prisma.orderSession.create({
          data: { restaurantId: biz, userId: owner.id, status: 'CLOSED', closedAt: new Date(), customerId: customer.id, couponDiscountCents: 400, couponCode: 'DEZ' },
        });
        await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, quantity: 2, price: 20 } });
        // 10% of 36,00 (items minus the coupon), not of 40,00
        expect(await prisma.$transaction((tx) => onBillClosed(tx, biz, s.id))).toBe(360);
        const after = await prisma.customer.findUnique({ where: { id: customer.id } });
        expect([Number(after.totalSpent), after.totalOrders]).toEqual([36, 1]);
      } finally {
        await prisma.cashbackCredit.deleteMany({ where: { restaurantId: biz } });
        await prisma.orderSession.deleteMany({ where: { restaurantId: biz } });
        await prisma.customer.deleteMany({ where: { restaurantId: biz } });
        await prisma.cashbackSettings.deleteMany({ where: { restaurantId: biz } });
        await prisma.restaurant.delete({ where: { id: biz } });
      }
    });
  });
});

describe('cupom na Conta (rotas)', () => {
  const rtag = crypto.randomBytes(4).toString('hex');
  const PHONE = '11955557777';
  let rid, ownerId, cookId, shiftId, recipeId;
  const as = (id) => {
    const s = { user: { id, email: id === ownerId ? `cpr-${rtag}@gastrux.test` : `cprc-${rtag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const req = (method, body = {}) => new NextRequest('http://x', { method, body: JSON.stringify(body) });
  const p = (sid) => ({ params: { id: sid } });
  const coupon = (data) => prisma.coupon.create({ data: { restaurantId: rid, kind: 'PERCENT', value: 10, maxPerCustomer: null, ...data } });
  // 2 x R$ 20, no service charge
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN' } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 20, quantity: 2 } });
    return s.id;
  };
  const pay = (sid, amount) => PAY(req('POST', { payments: [{ method: 'pix', amount }], cashSessionId: shiftId }), p(sid));
  const used = async (couponId) => (await prisma.coupon.findUnique({ where: { id: couponId } })).usedCount;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `cpr-${rtag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    // Business: the reopen test uses cashback too
    rid = (await prisma.restaurant.create({ data: { name: `CPR ${rtag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'business', subscriptionStatus: 'active', isInternal: false } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `PR${rtag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 20 } })).id;
    cookId = (await prisma.user.create({ data: { email: `cprc-${rtag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } })).id;
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: cookId, role: 'COOK', permissions: [], acceptedAt: new Date() } });
  }, 90000);

  afterAll(async () => {
    try { await prisma.cashbackUse.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.cashbackCredit.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.cashbackSettings.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.orderSession.deleteMany({ where: { restaurantId: rid } }); } catch {}
    await prisma.user.updateMany({ where: { id: { in: [ownerId, cookId] } }, data: { currentRestaurantId: null } });
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.customer.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: [ownerId, cookId] } } }); } catch {}
  });

  it('cook gets 403', async () => {
    await coupon({ code: 'COZINHA' });
    const sid = await newBill();
    as(cookId);
    const res = await APPLY(req('POST', { code: 'COZINHA' }), p(sid));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Usar cupom exige o caixa');
    expect((await REMOVE(req('DELETE'), p(sid))).status).toBe(403);
  });

  it('cashier applies and removes', async () => {
    as(ownerId);
    const c = await coupon({ code: 'CAIXA10' });
    const sid = await newBill();
    const res = await APPLY(req('POST', { code: 'caixa10' }), p(sid));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ couponCode: 'CAIXA10', couponDiscountCents: 400, totalCents: 3600, remainingCents: 3600 });
    expect(await used(c.id)).toBe(1);
    // A second coupon is refused; an unknown code says nothing about existing
    expect((await APPLY(req('POST', { code: 'OUTRO' }), p(sid))).status).toBe(409);
    const bad = await newBill();
    const unknown = await APPLY(req('POST', { code: 'NAOEXISTE' }), p(bad));
    expect([unknown.status, (await unknown.json()).error]).toEqual([422, 'Cupom inválido ou fora do ar.']);
    const removed = await REMOVE(req('DELETE'), p(sid));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toMatchObject({ couponCode: null, couponDiscountCents: 0, totalCents: 4000 });
    expect(await used(c.id)).toBe(0);
    // A closed comanda keeps its coupon: DELETE refused
    const closed = await newBill();
    expect((await APPLY(req('POST', { code: 'CAIXA10' }), p(closed))).status).toBe(200);
    await prisma.orderSession.update({ where: { id: closed }, data: { status: 'CLOSED', closedAt: new Date() } });
    const refused = await REMOVE(req('DELETE'), p(closed));
    expect([refused.status, (await refused.json()).error]).toEqual([422, 'Esta conta já foi fechada.']);
    expect(await used(c.id)).toBe(1);
  });

  it('coupon with per-phone rule needs the customer', async () => {
    as(ownerId);
    const c = await coupon({ code: 'UMPORCEL', maxPerCustomer: 1 });
    await coupon({ code: 'PAUSADOCEL', maxPerCustomer: 1, active: false });
    const sid = await newBill();
    const res = await APPLY(req('POST', { code: 'UMPORCEL' }), p(sid));
    expect([res.status, (await res.json()).error]).toEqual([422, 'Identifique o cliente pelo celular antes']);
    // A paused one does not tell it has a per-phone rule
    const paused = await APPLY(req('POST', { code: 'PAUSADOCEL' }), p(sid));
    expect([paused.status, (await paused.json()).error]).toEqual([422, 'Cupom inválido ou fora do ar.']);
    expect(await used(c.id)).toBe(0);
    await ATTACH(req('PUT', { phone: '(11) 95555-7777', name: 'Maria' }), p(sid));
    const ok = await APPLY(req('POST', { code: 'UMPORCEL' }), p(sid));
    expect(ok.status).toBe(200);
    expect(await prisma.couponRedemption.findFirst({ where: { orderSessionId: sid } })).toMatchObject({ phoneDigits: PHONE });
    // The same customer on another comanda: used already
    const other = await newBill();
    await ATTACH(req('PUT', { phone: PHONE }), p(other));
    const again = await APPLY(req('POST', { code: 'UMPORCEL' }), p(other));
    expect([again.status, (await again.json()).error]).toEqual([422, NOT_FOR_THIS_PHONE]);
  });

  it('cancel gives the use back and refunds payments', async () => {
    as(ownerId);
    const c = await coupon({ code: 'CANCELA' });
    const sid = await newBill();
    expect((await APPLY(req('POST', { code: 'CANCELA' }), p(sid))).status).toBe(200);
    expect((await pay(sid, '10,00')).status).toBe(200);
    expect(await used(c.id)).toBe(1);
    expect((await SESSION_DELETE(req('DELETE', { reason: 'desistiu', cashSessionId: shiftId }), p(sid))).status).toBe(200);
    expect(await used(c.id)).toBe(0);
    expect(await prisma.couponRedemption.count({ where: { orderSessionId: sid } })).toBe(0);
    expect(await prisma.orderSession.findUnique({ where: { id: sid } })).toMatchObject({ status: 'CANCELLED', couponCode: null, couponDiscountCents: 0 });
    expect(await prisma.cashSessionEntry.findFirst({ where: { orderSessionId: sid, type: 'REFUND' } })).toMatchObject({ amountCents: 1000 });
  });

  it('reopen keeps the coupon, gives the cashback back', async () => {
    as(ownerId);
    await prisma.cashbackSettings.create({ data: { restaurantId: rid, enabled: true, percent: 10, minUseCents: 100 } });
    const c = await coupon({ code: 'REABRE' });
    const sid = await newBill();
    await ATTACH(req('PUT', { phone: '11955556666', name: 'Rui' }), p(sid));
    const customer = await findCustomerByPhone(prisma, rid, '11955556666');
    await prisma.cashbackCredit.create({ data: { restaurantId: rid, customerId: customer.id, amountCents: 500, remainingCents: 500, expiresAt: new Date(Date.now() + 30 * 864e5) } });
    expect((await APPLY(req('POST', { code: 'REABRE' }), p(sid))).status).toBe(200);
    expect((await USE_CASHBACK(req('POST', { cents: 500 }), p(sid))).status).toBe(200);
    // 40 - 4 (coupon) - 5 (cashback) = 31
    expect(await (await pay(sid, '31,00')).json()).toMatchObject({ closed: true });
    expect((await SESSION_PUT(req('PUT', { status: 'OPEN', reason: 'cliente voltou', cashSessionId: shiftId }), p(sid))).status).toBe(200);
    expect(await balanceCents(prisma, rid, customer.id)).toBe(500);
    expect(await prisma.orderSession.findUnique({ where: { id: sid } })).toMatchObject({ couponCode: 'REABRE', couponDiscountCents: 400, cashbackUsedCents: 0 });
    expect(await used(c.id)).toBe(1);
    expect(await prisma.couponRedemption.count({ where: { orderSessionId: sid } })).toBe(1);
  });

  it('merge moves the coupon to the target', async () => {
    as(ownerId);
    const c = await coupon({ code: 'JUNTA' });
    const [target, source] = [await newBill(), await newBill()];
    expect((await APPLY(req('POST', { code: 'JUNTA' }), p(source))).status).toBe(200);
    expect((await MERGE(req('POST', { sourceSessionId: source }), p(target))).status).toBe(200);
    expect(await prisma.orderSession.findUnique({ where: { id: target } })).toMatchObject({ couponCode: 'JUNTA', couponDiscountCents: 400 });
    expect(await prisma.orderSession.findUnique({ where: { id: source } })).toMatchObject({ status: 'CANCELLED', couponCode: null, couponDiscountCents: 0 });
    expect(await prisma.couponRedemption.findFirst({ where: { couponId: c.id } })).toMatchObject({ orderSessionId: target });
    expect(await used(c.id)).toBe(1);
    // Removing it on the target gives the use back
    expect((await REMOVE(req('DELETE'), p(target))).status).toBe(200);
    expect(await used(c.id)).toBe(0);
  });

  it('merge of two comandas with coupon is refused', async () => {
    as(ownerId);
    await coupon({ code: 'JUNTAA' });
    await coupon({ code: 'JUNTAB' });
    const [target, source] = [await newBill(), await newBill()];
    expect((await APPLY(req('POST', { code: 'JUNTAA' }), p(target))).status).toBe(200);
    expect((await APPLY(req('POST', { code: 'JUNTAB' }), p(source))).status).toBe(200);
    const res = await MERGE(req('POST', { sourceSessionId: source }), p(target));
    expect([res.status, (await res.json()).error]).toEqual([409, 'As duas comandas têm cupom: tire um antes de juntar']);
    expect(await prisma.orderSession.findUnique({ where: { id: source } })).toMatchObject({ status: 'OPEN', couponCode: 'JUNTAB' });
  });

  it('a coupon that goes past what is left to pay is refused and rolled back', async () => {
    as(ownerId);
    const c = await coupon({ code: 'PASSA' });
    const sid = await newBill();
    expect((await pay(sid, '38,00')).status).toBe(200);
    const res = await APPLY(req('POST', { code: 'PASSA' }), p(sid));
    expect([res.status, (await res.json()).error]).toEqual([409, 'O cupom passa do que falta pagar: estorne um pagamento antes']);
    expect(await used(c.id)).toBe(0);
    expect(await prisma.couponRedemption.count({ where: { orderSessionId: sid } })).toBe(0);
    expect(await prisma.orderSession.findUnique({ where: { id: sid } })).toMatchObject({ status: 'OPEN', couponCode: null, couponDiscountCents: 0 });
  });

  it('a coupon that makes the bill paid closes it, as a normal close', async () => {
    as(ownerId);
    await prisma.cashbackSettings.upsert({ where: { restaurantId: rid }, create: { restaurantId: rid, enabled: true, percent: 10, minUseCents: 100 }, update: { enabled: true, percent: 10 } });
    const c = await coupon({ code: 'FECHA' });
    const sid = await newBill();
    await ATTACH(req('PUT', { phone: '11955553333', name: 'Lia' }), p(sid));
    const customer = await findCustomerByPhone(prisma, rid, '11955553333');
    expect((await pay(sid, '36,00')).status).toBe(200);
    const res = await APPLY(req('POST', { code: 'FECHA' }), p(sid));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'CLOSED', couponCode: 'FECHA', totalCents: 3600, remainingCents: 0 });
    expect(await used(c.id)).toBe(1);
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).closedAt).not.toBeNull();
    // onBillClosed: 10% of 36,00 credited, the purchase counted
    expect(await balanceCents(prisma, rid, customer.id)).toBe(360);
    expect((await prisma.customer.findUnique({ where: { id: customer.id } })).totalOrders).toBe(1);
  });

  // Last: it spends this user's tries for the minute
  it('too many tries: 429', async () => {
    as(ownerId);
    const sid = await newBill();
    let last;
    for (let i = 0; i < 25; i++) last = await APPLY(req('POST', { code: `CHUTE${i}` }), p(sid));
    expect([last.status, (await last.json()).error]).toEqual([429, 'Muitas tentativas. Tente em um minuto.']);
  });
});
