import { prisma } from '@/lib/prisma';

/**
 * The four dashboard cards, computed from the restaurant's own data. They used to show fixed
 * "↑ 12%", "↑ 8%", "↑ 5%", "↓ 3%" and hand-drawn sparklines; "Planos Esta Semana" showed the size of
 * a `take: 3` list, and "Estoque Baixo" counted only NEGATIVE stock. A trend or a line is shown only
 * when there is history to compute it from (owner decision 2026-09-28: never an invented number).
 */

/** Days are counted in Brazil time (UTC-3, no daylight saving since 2019). */
const TZ_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StatCard {
  value: number;
  /** Change against 7 days ago (or last week); null when there is no history to compare. */
  delta: number | null;
  /** What the delta is compared with, for the label under the number. */
  deltaLabel: string | null;
  /** One point per day, oldest first; empty when the history is flat or unknown. */
  series: number[];
}

export interface DashboardStats {
  ingredients: StatCard;
  recipes: StatCard;
  plansThisWeek: StatCard;
  lowStock: StatCard;
}

/** Start of the local (Brazil) day containing `date`, as a UTC instant. */
export function localDayStart(date: Date): Date {
  const local = date.getTime() - TZ_OFFSET_MS;
  return new Date(Math.floor(local / DAY_MS) * DAY_MS + TZ_OFFSET_MS);
}

/** Monday 00:00 (Brazil time) of the week containing `date`. */
export function localWeekStart(date: Date): Date {
  const day = localDayStart(date);
  const weekday = new Date(day.getTime() - TZ_OFFSET_MS).getUTCDay(); // 0 = Sunday
  const back = (weekday + 6) % 7;
  return new Date(day.getTime() - back * DAY_MS);
}

/** Running total at the end of each of the last `days` days, from the creation dates of what exists now. */
export function cumulativeSeries(createdAts: Date[], now: Date, days = 7): number[] {
  const today = localDayStart(now);
  const series: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const end = today.getTime() + DAY_MS - i * DAY_MS;
    series.push(createdAts.filter((d) => d.getTime() < end).length);
  }
  return series;
}

/** Count per day over the last `days` days. */
export function dailyCounts(dates: Date[], now: Date, days = 7): number[] {
  const today = localDayStart(now);
  const series: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = today.getTime() - i * DAY_MS;
    series.push(dates.filter((d) => d.getTime() >= start && d.getTime() < start + DAY_MS).length);
  }
  return series;
}

/** A line is only worth drawing when it moves. */
const meaningful = (series: number[]) => (series.some((v) => v !== series[0]) ? series : []);

/** Cards for things that accumulate (ingredients, recipes): value now, change over the last 7 days. */
export function growthCard(createdAts: Date[], now: Date): StatCard {
  const value = createdAts.length;
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const before = createdAts.filter((d) => d.getTime() < weekAgo).length;
  const added = value - before;
  return {
    value,
    // With nothing a week ago there is no base to compare with: show the count, no trend
    delta: before > 0 || added > 0 ? added : null,
    deltaLabel: before > 0 || added > 0 ? 'nos últimos 7 dias' : null,
    series: meaningful(cumulativeSeries(createdAts, now)),
  };
}

/** Production plans dated this week (Monday to Sunday), against last week. */
export function plansCard(planDates: Date[], now: Date): StatCard {
  const thisWeek = localWeekStart(now).getTime();
  const lastWeek = thisWeek - 7 * DAY_MS;
  const nextWeek = thisWeek + 7 * DAY_MS;
  const value = planDates.filter((d) => d.getTime() >= thisWeek && d.getTime() < nextWeek).length;
  const previous = planDates.filter((d) => d.getTime() >= lastWeek && d.getTime() < thisWeek).length;
  const hasHistory = value > 0 || previous > 0;
  return {
    value,
    delta: hasHistory ? value - previous : null,
    deltaLabel: hasHistory ? 'em relação à semana passada' : null,
    series: meaningful(dailyCounts(planDates.filter((d) => d.getTime() < now.getTime() + DAY_MS), now)),
  };
}

export async function getDashboardStats(restaurantId: string, now = new Date()): Promise<DashboardStats> {
  const lastWeekStart = new Date(localWeekStart(now).getTime() - 7 * DAY_MS);
  const [ingredients, recipes, plans, lowStock] = await Promise.all([
    prisma.ingredient.findMany({ where: { restaurantId, active: true }, select: { createdAt: true } }),
    prisma.recipe.findMany({ where: { restaurantId, active: true }, select: { createdAt: true } }),
    prisma.productionPlan.findMany({
      where: { restaurantId, planDate: { gte: new Date(Math.min(lastWeekStart.getTime(), now.getTime() - 7 * DAY_MS)) } },
      select: { planDate: true },
    }),
    // Same rule as the rest of the app (lib/ai/gather-restaurant-data.ts): below the minimum set for it
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM ingredients i
      LEFT JOIN stocks s ON s."ingredientId" = i.id AND s."restaurantId" = i."restaurantId"
      WHERE i."restaurantId" = ${restaurantId}
        AND i.active = true
        AND i."minimumStock" > 0
        AND COALESCE(s."currentQuantity", 0) < i."minimumStock"
    `,
  ]);

  return {
    ingredients: growthCard(ingredients.map((i) => i.createdAt), now),
    recipes: growthCard(recipes.map((r) => r.createdAt), now),
    plansThisWeek: plansCard(plans.map((p) => p.planDate), now),
    // No stock history is kept per day, so no trend or line is invented for it
    lowStock: { value: lowStock[0]?.n ?? 0, delta: null, deltaLabel: null, series: [] },
  };
}
