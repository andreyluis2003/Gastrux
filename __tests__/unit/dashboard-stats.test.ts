/**
 * Dashboard cards (lib/dashboard/stats.ts): every number comes from the data, and no trend or line is
 * shown without history (they used to be fixed "↑ 12%" etc.).
 */
import { growthCard, plansCard, localDayStart, localWeekStart, cumulativeSeries } from '../../lib/dashboard/stats';

// Wednesday 2026-09-30 15:00 in Brazil (18:00 UTC)
const NOW = new Date('2026-09-30T18:00:00Z');
const br = (iso: string) => new Date(`${iso}-03:00`); // a Brazil local time

describe('dashboard stats', () => {
  it('days and weeks are counted in Brazil time', () => {
    expect(localDayStart(NOW).toISOString()).toBe('2026-09-30T03:00:00.000Z');
    // 23:30 in Brazil is still the same day, although it is already the next day in UTC
    expect(localDayStart(br('2026-09-30T23:30:00')).toISOString()).toBe('2026-09-30T03:00:00.000Z');
    expect(localWeekStart(NOW).toISOString()).toBe('2026-09-28T03:00:00.000Z'); // Monday
    expect(localWeekStart(br('2026-10-04T22:00:00')).toISOString()).toBe('2026-09-28T03:00:00.000Z'); // Sunday night
  });

  it('a new restaurant shows its count and no trend or line', () => {
    expect(growthCard([], NOW)).toEqual({ value: 0, delta: null, deltaLabel: null, series: [] });
    expect(plansCard([], NOW)).toEqual({ value: 0, delta: null, deltaLabel: null, series: [] });
  });

  it('ingredients: the real change over the last 7 days and a line that follows it', () => {
    const created = [br('2026-09-01T10:00:00'), br('2026-09-02T10:00:00'), br('2026-09-29T10:00:00'), br('2026-09-30T09:00:00')];
    const card = growthCard(created, NOW);
    expect(card.value).toBe(4);
    expect(card.delta).toBe(2);
    expect(card.deltaLabel).toBe('nos últimos 7 dias');
    expect(card.series).toEqual([2, 2, 2, 2, 2, 3, 4]);
  });

  it('no line when nothing changed during the week (a flat line says nothing)', () => {
    const card = growthCard([br('2026-08-01T10:00:00'), br('2026-08-02T10:00:00')], NOW);
    expect(card.value).toBe(2);
    expect(card.delta).toBe(0);
    expect(card.series).toEqual([]);
  });

  it('plans: this week (Monday to Sunday) against last week', () => {
    const plans = [
      br('2026-09-22T08:00:00'), br('2026-09-24T08:00:00'), br('2026-09-26T08:00:00'), // last week: 3
      br('2026-09-28T08:00:00'), // this week
      br('2026-10-02T08:00:00'), // later this week (Friday) still counts in "this week"
      br('2026-10-06T08:00:00'), // next week: not counted
    ];
    const card = plansCard(plans, NOW);
    expect(card.value).toBe(2);
    expect(card.delta).toBe(-1);
    expect(card.deltaLabel).toBe('em relação à semana passada');
  });

  it('cumulative series never counts what was created after the day', () => {
    expect(cumulativeSeries([br('2026-09-30T14:00:00')], NOW)).toEqual([0, 0, 0, 0, 0, 0, 1]);
  });
});
