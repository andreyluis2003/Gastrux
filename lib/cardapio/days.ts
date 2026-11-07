/**
 * Weekdays an item is offered to customers (spec 2026-11-06 cardapio-rapido §4): MenuItem.availableDays holds
 * 0 (Sunday) to 6 (Saturday); empty means every day. The day is the restaurant's, in its time zone.
 */
export const DAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;
const EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekdayIn(timeZone: string, now = new Date()): number {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'America/Sao_Paulo';
  }
  return EN.indexOf(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now));
}

/** Days kept unique, sorted, 0..6; every day (or none) is stored as empty */
export function normalizeDays(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  if (!raw.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  const days = [...new Set(raw as number[])].sort((a, b) => a - b);
  return days.length === 7 ? [] : days;
}

export const sellsOn = (days: number[] | null | undefined, weekday: number) => !days?.length || days.includes(weekday);

/** "Só sáb e dom" for the list; null when every day */
export function daysLabel(days: number[] | null | undefined): string | null {
  if (!days?.length) return null;
  const names = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAY_SHORT[d]);
  return `Só ${names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : names[0]}`;
}

/** Prisma filter: offered on this weekday */
export const offeredOn = (weekday: number) => ({ OR: [{ availableDays: { isEmpty: true } }, { availableDays: { has: weekday } }] });
