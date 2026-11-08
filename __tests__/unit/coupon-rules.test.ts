/** Cupons (spec 2026-11-08): the pure rules */
import { couponLabel, discountFor, normalizeCode, parseCouponInput, refusal } from '@/lib/coupons/rules';

const base = { code: 'X10', kind: 'PERCENT' as const, value: 10, minOrderCents: 0, validFrom: null, validUntil: null, maxUses: null, maxPerCustomer: 1, firstOrderOnly: false, active: true, usedCount: 0 };
const order = { subtotalCents: 5000, deliveryFeeCents: 700, now: new Date('2026-11-08T12:00:00Z'), usesByCustomer: 0, customerOrdered: false };

describe('coupon rules', () => {
  it('normalizes and validates the code', () => {
    expect(normalizeCode(' primeira-10 ')).toBe('PRIMEIRA10');
    expect(normalizeCode('promoção')).toBe('PROMOCAO');
    expect(parseCouponInput({ code: 'ab', kind: 'PERCENT', value: 10 })).toMatchObject({ ok: false });
    expect(parseCouponInput({ code: 'frete', kind: 'FREE_DELIVERY' })).toMatchObject({ ok: true, value: { code: 'FRETE', value: 0, maxPerCustomer: 1 } });
    expect(parseCouponInput({ code: 'x10', kind: 'PERCENT', value: 120 })).toMatchObject({ ok: false });
    expect(parseCouponInput({ code: 'x10', kind: 'FIXED', value: 0 })).toMatchObject({ ok: false });
    expect(parseCouponInput({ code: 'x10', kind: 'PERCENT', value: 10, validFrom: '2026-11-10', validUntil: '2026-11-09' })).toMatchObject({ ok: false });
    expect(parseCouponInput({ code: 'x10', kind: 'PERCENT', value: 10, maxPerCustomer: null })).toMatchObject({ ok: true, value: { maxPerCustomer: null } });
  });

  it('computes the discount, never more than the subtotal or the fee', () => {
    expect(discountFor({ kind: 'PERCENT', value: 10 }, 5000, 700)).toBe(500);
    expect(discountFor({ kind: 'FIXED', value: 8000 }, 5000, 700)).toBe(5000);
    expect(discountFor({ kind: 'FREE_DELIVERY', value: 0 }, 5000, 700)).toBe(700);
    expect(discountFor({ kind: 'PERCENT', value: 33 }, 1001, 0)).toBe(330);
  });

  it('says why a coupon cannot be used', () => {
    expect(refusal(base, order)).toBeNull();
    expect(refusal({ ...base, active: false }, order)).toMatch(/ativo/);
    expect(refusal({ ...base, validUntil: new Date('2026-11-01') }, order)).toMatch(/venceu/);
    expect(refusal({ ...base, validFrom: new Date('2026-12-01') }, order)).toMatch(/começou/);
    expect(refusal({ ...base, maxUses: 3, usedCount: 3 }, order)).toMatch(/máximo/);
    expect(refusal(base, { ...order, usesByCustomer: 1 })).toMatch(/já usou/);
    expect(refusal({ ...base, maxPerCustomer: null }, { ...order, usesByCustomer: 5 })).toBeNull();
    expect(refusal({ ...base, firstOrderOnly: true }, { ...order, customerOrdered: true })).toMatch(/primeiro/);
    expect(refusal({ ...base, minOrderCents: 6000 }, order)).toMatch(/R\$\s?60,00/);
    expect(refusal({ ...base, kind: 'FREE_DELIVERY' }, { ...order, deliveryFeeCents: 0 })).toMatch(/entrega/);
  });

  it('labels the coupon', () => {
    expect(couponLabel({ kind: 'PERCENT', value: 10 })).toBe('10% de desconto');
    expect(couponLabel({ kind: 'FIXED', value: 500 })).toMatch(/R\$\s?5,00 de desconto/);
    expect(couponLabel({ kind: 'FREE_DELIVERY', value: 0 })).toBe('Entrega grátis');
  });
});
