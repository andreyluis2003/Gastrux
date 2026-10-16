import {
  addMonths, alertText, currentMonth, indicators, monthDate, monthLabel, monthOf, parseAmountCents, parseConsumption,
  parseMonth, shouldAlert, UtilityError,
} from '../../lib/utility-bills/rules';

const now = new Date('2026-10-16T15:00:00Z');

describe('utility bills rules (lib/utility-bills/rules.ts)', () => {
  it('months: Brasília current month, arithmetic across years, storage date, label', () => {
    expect(currentMonth(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10'); // 23:00 of Oct 31 in Brasília
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 13)).toBe('2027-01');
    expect(monthDate('2026-09').toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(monthOf(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09');
    expect(monthLabel('2026-09')).toBe('setembro de 2026');
  });

  it('a reference month is YYYY-MM and never in the future', () => {
    expect(parseMonth('2026-09', now)).toBe('2026-09');
    expect(parseMonth('2026-10', now)).toBe('2026-10');
    expect(() => parseMonth('2026-11', now)).toThrow('futuro');
    for (const bad of ['2026-13', '26-09', '', null, 202609]) expect(() => parseMonth(bad, now)).toThrow(UtilityError);
  });

  it('amounts in reais become cents; zero and negatives are refused', () => {
    expect(parseAmountCents(1240)).toBe(124000);
    expect(parseAmountCents('1240.5')).toBe(124050);
    expect(parseAmountCents('1.240,50')).toBe(124050);
    expect(parseAmountCents('0,99')).toBe(99);
    for (const bad of [0, -1, '', 'abc', null]) expect(() => parseAmountCents(bad)).toThrow(UtilityError);
  });

  it('consumption: required with a unit, refused without one', () => {
    expect(parseConsumption('1.380', 'ENERGY')).toBe(1380);
    expect(parseConsumption('12,5', 'WATER')).toBe(12.5);
    expect(parseConsumption(2, 'BOTTLED_GAS')).toBe(2);
    expect(() => parseConsumption(undefined, 'ENERGY')).toThrow('consumo');
    expect(() => parseConsumption(0, 'WATER')).toThrow(UtilityError);
    expect(parseConsumption(undefined, 'PHONE_INTERNET')).toBeNull();
    expect(parseConsumption('', 'OTHER')).toBeNull();
    expect(() => parseConsumption(10, 'PHONE_INTERNET')).toThrow('não tem consumo');
  });

  const e = (amount: number, kwh: number) => ({ amountCents: amount * 100, consumption: kwh });

  it('indicators: previous month, 3-month average, a year ago, price per unit, share of revenue', () => {
    const bills = { '2025-09': e(1000, 1320), '2026-06': e(1000, 1100), '2026-07': e(1050, 1100), '2026-08': e(1100, 1135), '2026-09': e(1240, 1380) };
    const ind = indicators('ENERGY', '2026-09', bills, 5904800);
    expect(ind.measure).toBe(1380);
    expect(Math.round(ind.prev!.measurePct)).toBe(22); // 1380 vs 1135
    expect(Math.round(ind.prev!.amountPct)).toBe(13);  // 1240 vs 1100
    expect(ind.avg3).toMatchObject({ months: 3 });
    expect(Math.round(ind.avg3!.average)).toBe(1112);
    expect(Math.round(ind.avg3!.pct)).toBe(24);
    expect(Math.round(ind.yearAgo!.measurePct)).toBe(5);
    expect(ind.unitPrice!.now).toBeCloseTo(0.8986, 3);
    expect(ind.unitPrice!.prev).toBeCloseTo(0.9692, 3);
    expect(ind.revenuePct).toBeCloseTo(2.1, 1);
    expect(ind.missing).toEqual([]);
    expect(shouldAlert(ind)).toBe(true);
  });

  it('missing months are skipped in the average; with fewer than 2 there is no base and no alert', () => {
    const two = indicators('ENERGY', '2026-09', { '2026-07': e(1000, 1000), '2026-08': e(1000, 1000), '2026-09': e(1300, 1300) }, null);
    expect(two.avg3).toMatchObject({ average: 1000, months: 2 });
    expect(two.missing).toEqual(['2026-06']);
    expect(two.revenuePct).toBeNull();
    expect(shouldAlert(two)).toBe(true);
    const one = indicators('ENERGY', '2026-09', { '2026-08': e(1000, 1000), '2026-09': e(5000, 5000) }, null);
    expect(one.avg3).toBeNull();
    expect(one.missing).toEqual(['2026-07', '2026-06']);
    expect(shouldAlert(one)).toBe(false);
    expect(indicators('ENERGY', '2026-09', { '2026-09': e(1, 1) }, null).prev).toBeNull();
  });

  it('exactly 20% above the average does not alert; just above does', () => {
    const base = { '2026-06': e(100, 100), '2026-07': e(100, 100), '2026-08': e(100, 100) };
    expect(shouldAlert(indicators('ENERGY', '2026-09', { ...base, '2026-09': e(120, 120) }, null))).toBe(false);
    expect(shouldAlert(indicators('ENERGY', '2026-09', { ...base, '2026-09': e(121, 120.1) }, null))).toBe(true);
  });

  it('accounts without consumption compare the value', () => {
    const p = (amount: number) => ({ amountCents: amount * 100, consumption: null });
    const ind = indicators('PHONE_INTERNET', '2026-09', { '2026-06': p(200), '2026-07': p(200), '2026-08': p(250), '2026-09': p(300) }, null);
    expect(ind.measure).toBe(30000);
    expect(ind.unitPrice).toBeNull();
    expect(Math.round(ind.avg3!.pct)).toBe(38);
    expect(alertText('Telefone/Internet', 'PHONE_INTERNET', '2026-09', ind)).toEqual({
      title: 'Telefone/Internet de setembro acima da média',
      message: 'Telefone/Internet de setembro: valor 38% acima da média (R$ 300,00).',
    });
  });

  it('alert text for consumption', () => {
    const ind = indicators('ENERGY', '2026-09', { '2026-06': e(1000, 1100), '2026-07': e(1050, 1100), '2026-08': e(1100, 1135), '2026-09': e(1240, 1380) }, null);
    expect(alertText('Energia', 'ENERGY', '2026-09', ind).message).toBe(
      'Energia de setembro: consumo 24% acima da média (1.380 kWh). Confira vazamento ou equipamento ligado.',
    );
  });
});
