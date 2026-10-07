import { periodContaining, shiftPeriod, periodLabel, commissionCents, ruleLabel, brtDay } from '../../lib/staff/commission-rules';

describe('commission rules (lib/staff/commission-rules.ts)', () => {
  it('a week runs Monday to Sunday in Brasília time', () => {
    const w = periodContaining('WEEKLY', '2026-10-08'); // Thursday
    expect([w.firstDay, w.lastDay]).toEqual(['2026-10-05', '2026-10-11']);
    expect(w.start.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-10-12T03:00:00.000Z');
    expect(periodContaining('WEEKLY', '2026-10-11').firstDay).toBe('2026-10-05'); // Sunday
    expect(periodContaining('WEEKLY', '2026-10-12').firstDay).toBe('2026-10-12'); // Monday
  });

  it('a fortnight is 1-15 and 16 to the end of the month', () => {
    expect(periodContaining('BIWEEKLY', '2026-02-10')).toMatchObject({ firstDay: '2026-02-01', lastDay: '2026-02-15' });
    expect(periodContaining('BIWEEKLY', '2026-02-20')).toMatchObject({ firstDay: '2026-02-16', lastDay: '2026-02-28' });
  });

  it('a month is the calendar month', () => {
    expect(periodContaining('MONTHLY', '2026-10-06')).toMatchObject({ firstDay: '2026-10-01', lastDay: '2026-10-31' });
  });

  it('moves to the previous and next period', () => {
    const m = periodContaining('MONTHLY', '2026-01-15');
    expect(shiftPeriod(m, -1).firstDay).toBe('2025-12-01');
    expect(shiftPeriod(m, 1).firstDay).toBe('2026-02-01');
    const w = periodContaining('WEEKLY', '2026-10-06');
    expect(shiftPeriod(w, 1).firstDay).toBe('2026-10-12');
  });

  it('a sale late at night counts on that Brasília day, not the UTC one', () => {
    expect(brtDay(new Date('2026-10-01T02:30:00Z'))).toBe('2026-09-30');
  });

  it('labels read as people say them', () => {
    expect(periodLabel(periodContaining('WEEKLY', '2026-10-06'))).toBe('Semana de 05/10 a 11/10');
    expect(periodLabel(periodContaining('BIWEEKLY', '2026-10-20'))).toBe('2ª quinzena de outubro de 2026');
    expect(periodLabel(periodContaining('MONTHLY', '2026-10-06'))).toBe('Outubro de 2026');
  });

  it('percentage of sales and fixed per bill, in cents', () => {
    expect(commissionCents({ type: 'PERCENTAGE', value: 5 }, 123456, 10)).toBe(6173);
    expect(commissionCents({ type: 'FIXED', value: 2.5 }, 999999, 12)).toBe(3000);
    expect(commissionCents({ type: 'HYBRID', value: 5 }, 100000, 3)).toBe(0);
    expect(commissionCents(null, 100000, 3)).toBe(0);
    expect(commissionCents({ type: 'PERCENTAGE', value: 0 }, 100000, 3)).toBe(0);
  });

  it('rule labels', () => {
    expect(ruleLabel({ type: 'PERCENTAGE', value: 2.5 })).toBe('2,5% das vendas');
    expect(ruleLabel({ type: 'FIXED', value: 3 })).toBe('R$ 3,00 por conta');
    expect(ruleLabel(null)).toBe('Sem comissão');
  });
});
