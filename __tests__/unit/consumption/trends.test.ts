import { bucketTrends, singleUnit, trendGrain } from '@/lib/consumption/trends';

const day = (date: string, totalQuantity: number, totalCost: number, movements = 1) => ({ date, totalQuantity, totalCost, movements });

describe('consumption trends', () => {
  it('picks the grain from the period', () => {
    expect(trendGrain(7)).toBe('day');
    expect(trendGrain(30)).toBe('day');
    expect(trendGrain(90)).toBe('week');
    expect(trendGrain(180)).toBe('month');
    expect(trendGrain(365)).toBe('month');
  });

  it('30 days: one point per day, labelled dd/mm', () => {
    const { grain, points } = bucketTrends([day('2026-11-13', 1, 2), day('2026-11-12', 0, 0, 0)], 30);
    expect(grain).toBe('day');
    expect(points.map((p) => p.label)).toEqual(['12/11', '13/11']);
  });

  it('90 days: weeks start on Monday and add up', () => {
    // 2026-11-09 is a Monday; 11-10 and 11-15 (Sunday) fall in the same week, 11-16 in the next
    const { grain, points } = bucketTrends([day('2026-11-10', 1, 2.5), day('2026-11-15', 2, 1.25), day('2026-11-16', 3, 4)], 90);
    expect(grain).toBe('week');
    expect(points).toEqual([
      { label: 'sem. 09/11', totalQuantity: 3, totalCost: 3.75, movements: 2 },
      { label: 'sem. 16/11', totalQuantity: 3, totalCost: 4, movements: 1 },
    ]);
  });

  it('a year: one point per month, so a single busy day is not a thin spike', () => {
    const daily = [day('2025-11-14', 0, 0, 0), day('2026-10-02', 0, 0, 0), day('2026-11-12', 4.95, 16.3, 12), day('2026-11-13', 0, 0, 0)];
    const { grain, points } = bucketTrends(daily, 365);
    expect(grain).toBe('month');
    expect(points.map((p) => p.label)).toEqual(['nov/25', 'out/26', 'nov/26']);
    expect(points[2]).toMatchObject({ totalQuantity: 4.95, totalCost: 16.3, movements: 12 });
  });

  it('a shared unit only when every ingredient has it', () => {
    expect(singleUnit([{ unit: 'kg' }, { unit: 'KG ' }])).toBe('kg');
    expect(singleUnit([{ unit: 'kg' }, { unit: 'l' }, { unit: 'un' }])).toBeNull();
    expect(singleUnit([{ unit: null }, { unit: 'un' }])).toBe('un');
    expect(singleUnit([])).toBeNull();
  });
});
