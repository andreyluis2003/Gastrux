/**
 * "Consumo de insumos" over time (fix 2026-11-13). Long periods are grouped by week or month: a point per day over a
 * year drew a flat line with a thin spike. Quantities only add up when every ingredient is in the same unit.
 */
export interface DailyTrend {
  date: string; // YYYY-MM-DD
  totalQuantity: number;
  totalCost: number;
  movements: number;
}

export interface TrendPoint {
  label: string;
  totalQuantity: number;
  totalCost: number;
  movements: number;
}

export type TrendGrain = 'day' | 'week' | 'month';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const round2 = (v: number) => Math.round(v * 100) / 100;
const ddmm = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Up to 30 days: per day; up to 90: per week (starting Monday); longer: per month */
export function trendGrain(periodDays: number): TrendGrain {
  if (periodDays <= 31) return 'day';
  if (periodDays <= 92) return 'week';
  return 'month';
}

export function bucketTrends(daily: DailyTrend[], periodDays: number): { grain: TrendGrain; points: TrendPoint[] } {
  const grain = trendGrain(periodDays);
  const buckets = new Map<string, TrendPoint>();
  for (const d of [...daily].sort((a, b) => a.date.localeCompare(b.date))) {
    const day = new Date(`${d.date}T00:00:00Z`);
    if (Number.isNaN(day.getTime())) continue;
    let key: string;
    let label: string;
    if (grain === 'day') {
      key = d.date;
      label = ddmm(day);
    } else if (grain === 'week') {
      const monday = new Date(day);
      monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
      label = `sem. ${ddmm(monday)}`;
    } else {
      key = d.date.slice(0, 7);
      label = `${MONTHS[day.getUTCMonth()]}/${String(day.getUTCFullYear()).slice(2)}`;
    }
    const b = buckets.get(key) ?? { label, totalQuantity: 0, totalCost: 0, movements: 0 };
    b.totalQuantity += Number(d.totalQuantity) || 0;
    b.totalCost += Number(d.totalCost) || 0;
    b.movements += Number(d.movements) || 0;
    buckets.set(key, b);
  }
  const points = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, p]) => ({ ...p, totalQuantity: round2(p.totalQuantity), totalCost: round2(p.totalCost) }));
  return { grain, points };
}

/** The unit shared by every ingredient in the result, or null when they differ (kg + l + un cannot be added) */
export function singleUnit(rows: Array<{ unit?: string | null }>): string | null {
  const units = new Set(rows.map((r) => (r.unit || 'un').trim().toLowerCase()));
  return units.size === 1 ? [...units][0] : null;
}
