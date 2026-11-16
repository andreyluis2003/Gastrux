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
    expect(await apply(s.id, 'ESGOTADO', { force: true })).toEqual({ ok: true, code: 'ESGOTADO', discountCents: 400, outOfRule: true });
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
});
