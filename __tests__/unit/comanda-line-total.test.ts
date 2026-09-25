// @ts-nocheck
import { lineTotal, lineTotalCents, toCents } from '../../lib/comanda/line-total';

describe('comanda/line-total', () => {
  it('a modifier surcharge applies to EACH unit: 2 burgers with extra cheese pay the cheese twice', () => {
    expect(lineTotal(30, 2, [3])).toBe(66); // 2 x (30 + 3)
    expect(lineTotal(30, 1, [3])).toBe(33);
    expect(lineTotal(30, 3, [3])).toBe(99);
  });

  it('adds several modifiers per unit, negative adjustments (a discount) included', () => {
    expect(lineTotal(10.5, 2, [2, 0.5])).toBe(26); // 2 x 13.00
    expect(lineTotal(20, 2, [-1.5])).toBe(37);
  });

  it('is exactly the price x quantity when there is no modifier', () => {
    expect(lineTotal(8.5, 3)).toBe(25.5);
    expect(lineTotal(8.5, 3, [])).toBe(25.5);
    expect(lineTotal(0, 4, [0, 0])).toBe(0);
  });

  it('works in integer cents: no float drift (3 x 0.10, 0.1 + 0.2)', () => {
    expect(lineTotalCents(0.1, 3)).toBe(30);
    expect(lineTotal(0.1, 3)).toBe(0.3);
    expect(lineTotalCents(0.1, 1, [0.2])).toBe(30);
    expect(lineTotal(19.99, 3, [0.01])).toBe(60);
  });

  it('accepts Prisma Decimal-like values and strings, and treats null or undefined as zero', () => {
    const decimal = { toString: () => '12.34', valueOf: () => 12.34 };
    expect(lineTotal(decimal, 2, ['1.10'])).toBe(26.88); // 2 x 13.44
    expect(lineTotal('30.00', 2, [null, undefined])).toBe(60);
    expect(toCents(null)).toBe(0);
  });
});
