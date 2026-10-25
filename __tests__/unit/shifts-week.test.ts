/** Turnos (2026-10-25, found while recording the tutorial video): on a Sunday the screen opened the NEXT week */
import { weekRange } from '@/lib/staff/week-range';

const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('weekRange', () => {
  it('is the Monday-to-Sunday week that holds the day, Sundays included', () => {
    for (const [now, monday, sunday] of [
      [new Date(2026, 9, 25, 15), '2026-10-19', '2026-10-25'], // Sunday
      [new Date(2026, 9, 26, 9), '2026-10-26', '2026-11-01'], // Monday
      [new Date(2026, 9, 28, 23), '2026-10-26', '2026-11-01'], // Wednesday
    ] as const) {
      const { start, end } = weekRange(now, 0);
      expect([day(now), day(start), day(end)]).toEqual([day(now), monday, sunday]);
    }
  });

  it('moves by whole weeks', () => {
    expect(day(weekRange(new Date(2026, 9, 25, 15), 1).start)).toBe('2026-10-26');
    expect(day(weekRange(new Date(2026, 9, 25, 15), -1).start)).toBe('2026-10-12');
  });
});
