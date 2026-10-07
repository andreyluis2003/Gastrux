/**
 * Commission rules (2026-10-06, owner: "o que o mercado mais faz e funciona"). Pure: no I/O,
 * unit-tested in __tests__/unit/commission-rules.test.ts.
 *
 * - Base: the value of the ITEMS on the bills the person opened that were closed (and therefore
 *   paid: since the cash register, a bill only closes with its payments). Cancelled bills do not
 *   count. A service charge (the 10% "taxa de serviço") is a tip under Lei 13.419/2017, shared by
 *   its own rules: never part of a sales commission (Gastrux bills carry none today).
 * - Rule per staff member: PERCENTAGE of those sales, or FIXED amount per closed bill. HYBRID has
 *   no defined meaning yet and pays nothing until it does.
 * - Periods in Brasília time: week Monday to Sunday, fortnight 1-15 and 16-end, calendar month.
 */

export type CommissionPeriodType = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
export type CommissionRuleType = 'PERCENTAGE' | 'FIXED' | 'HYBRID';

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Calendar day (YYYY-MM-DD) in Brasília of an instant */
export function brtDay(instant: Date): string {
  return new Date(instant.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a Brasília calendar day starts */
export function brtDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + BRT_OFFSET_MS);
}

function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + n * 864e5).toISOString().slice(0, 10);
}

export interface PeriodBounds {
  type: CommissionPeriodType;
  /** First day, YYYY-MM-DD (Brasília) */
  firstDay: string;
  /** Last day, YYYY-MM-DD (Brasília), inclusive */
  lastDay: string;
  /** Instants for a query: closedAt >= start AND closedAt < end */
  start: Date;
  end: Date;
}

/** The period of the given type that contains the given Brasília day */
export function periodContaining(type: CommissionPeriodType, day: string): PeriodBounds {
  const [y, m, d] = day.split('-').map(Number);
  let firstDay: string;
  let lastDay: string;
  if (type === 'WEEKLY') {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    firstDay = addDays(day, -((weekday + 6) % 7));
    lastDay = addDays(firstDay, 6);
  } else {
    const monthLast = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, '0');
    if (type === 'BIWEEKLY') {
      const firstHalf = d <= 15;
      firstDay = `${y}-${mm}-${firstHalf ? '01' : '16'}`;
      lastDay = `${y}-${mm}-${firstHalf ? '15' : String(monthLast).padStart(2, '0')}`;
    } else {
      firstDay = `${y}-${mm}-01`;
      lastDay = `${y}-${mm}-${String(monthLast).padStart(2, '0')}`;
    }
  }
  return { type, firstDay, lastDay, start: brtDayStart(firstDay), end: brtDayStart(addDays(lastDay, 1)) };
}

/** The period right before or after (step = -1 or 1) */
export function shiftPeriod(p: PeriodBounds, step: -1 | 1): PeriodBounds {
  return periodContaining(p.type, step === 1 ? addDays(p.lastDay, 1) : addDays(p.firstDay, -1));
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Semana de 06/10 a 12/10", "1ª quinzena de outubro de 2026", "Outubro de 2026" */
export function periodLabel(p: PeriodBounds): string {
  const [y, m, d] = p.firstDay.split('-').map(Number);
  const short = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  if (p.type === 'WEEKLY') return `Semana de ${short(p.firstDay)} a ${short(p.lastDay)}`;
  if (p.type === 'BIWEEKLY') return `${d === 1 ? '1ª' : '2ª'} quinzena de ${MONTHS.at(m - 1)} de ${y}`;
  const month = MONTHS.at(m - 1) || '';
  return `${month.charAt(0).toUpperCase()}${month.slice(1)} de ${y}`;
}

export interface CommissionRule {
  type: CommissionRuleType;
  /** Percent (5 = 5%) for PERCENTAGE, reais per bill for FIXED */
  value: number;
}

/** Commission in cents for a person's sales in a period */
export function commissionCents(rule: CommissionRule | null, salesCents: number, bills: number): number {
  if (!rule || !(rule.value > 0)) return 0;
  if (rule.type === 'PERCENTAGE') return Math.round((salesCents * rule.value) / 100);
  if (rule.type === 'FIXED') return Math.round(rule.value * 100) * bills;
  return 0;
}

/** How the rule reads on screen */
export function ruleLabel(rule: CommissionRule | null): string {
  if (!rule || !(rule.value > 0)) return 'Sem comissão';
  if (rule.type === 'PERCENTAGE') return `${String(rule.value).replace('.', ',')}% das vendas`;
  if (rule.type === 'FIXED') return `R$ ${rule.value.toFixed(2).replace('.', ',')} por conta`;
  return 'Regra a definir';
}
