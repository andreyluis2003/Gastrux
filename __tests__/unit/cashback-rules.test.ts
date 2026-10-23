import { allocateUse, apportionDiscount, creditCents, normalizePhone, parseSettings, segmentOf } from '@/lib/cashback/rules';

const NOW = new Date('2026-10-23T15:00:00Z');
const DAY = 864e5;

describe('cashback rules (spec 2026-10-23)', () => {
  it('normalizes a Brazilian phone to DDD + number', () => {
    expect(normalizePhone('(11) 99999-8888')).toBe('11999998888');
    expect(normalizePhone('+55 11 99999-8888')).toBe('11999998888');
    expect(normalizePhone('11 3333-4444')).toBe('1133334444');
    expect(normalizePhone('9999')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('credit is the percent of the base, rounded down to the cent', () => {
    expect(creditCents(3000, 5)).toBe(150);
    expect(creditCents(1999, 5)).toBe(99);
    expect(creditCents(1000, 7.5)).toBe(75);
    expect(creditCents(0, 5)).toBe(0);
    expect(creditCents(-100, 5)).toBe(0);
  });

  it('uses the oldest credits first and skips expired ones', () => {
    const credits = [
      { id: 'B', remainingCents: 500, createdAt: new Date(NOW.getTime() - 5 * DAY), expiresAt: new Date(NOW.getTime() + 30 * DAY) },
      { id: 'A', remainingCents: 300, createdAt: new Date(NOW.getTime() - 10 * DAY), expiresAt: new Date(NOW.getTime() + 30 * DAY) },
      { id: 'X', remainingCents: 900, createdAt: new Date(NOW.getTime() - 99 * DAY), expiresAt: new Date(NOW.getTime() - DAY) },
    ];
    expect(allocateUse(credits, 400, NOW)).toEqual([{ creditId: 'A', cents: 300 }, { creditId: 'B', cents: 100 }]);
    expect(() => allocateUse(credits, 900, NOW)).toThrow('Saldo insuficiente');
  });

  it('apportions a discount over the items, the sum exact, never above an item', () => {
    expect(apportionDiscount([1000, 3000], 400)).toEqual([100, 300]);
    const split = apportionDiscount([333, 333, 334], 100);
    expect(split.reduce((s, v) => s + v, 0)).toBe(100);
    expect(apportionDiscount([100, 0, 50], 150)).toEqual([100, 0, 50]);
    expect(apportionDiscount([500], 0)).toEqual([0]);
  });

  it('segment by purchases in the last 90 days', () => {
    expect(segmentOf(10)).toBe('VIP');
    expect(segmentOf(9)).toBe('REGULAR');
    expect(segmentOf(3)).toBe('REGULAR');
    expect(segmentOf(2)).toBe('OCCASIONAL');
    expect(segmentOf(1)).toBe('OCCASIONAL');
    expect(segmentOf(0)).toBe('INACTIVE');
  });

  it('settings within the limits, comma decimals accepted', () => {
    expect(parseSettings({ percent: '31' })).toMatchObject({ ok: false });
    expect(parseSettings({ percent: '0,4' })).toMatchObject({ ok: false });
    expect(parseSettings({ validityMonths: 25 })).toMatchObject({ ok: false });
    expect(parseSettings({ minUseCents: -1 })).toMatchObject({ ok: false });
    expect(parseSettings({ percent: '5,5', validityMonths: 6, minUseCents: 1000, enabled: true }))
      .toEqual({ ok: true, data: { percent: 5.5, validityMonths: 6, minUseCents: 1000, enabled: true } });
    expect(parseSettings({})).toMatchObject({ ok: false });
  });
});
