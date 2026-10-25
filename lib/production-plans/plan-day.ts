import { brtDayStart } from '@/lib/staff/commission-rules';

/**
 * The day of a production plan, in Brasília: the page sends 'YYYY-MM-DD' (older pages sent that day at UTC midnight,
 * which showed as the day before on the screens, 2026-10-25). Anything else is parsed as it comes.
 */
export function planDay(value: string): Date {
  const day = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? brtDayStart(day) : new Date(value);
}
