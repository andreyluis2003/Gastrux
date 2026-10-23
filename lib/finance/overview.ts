import { computeDre } from '@/lib/finance/dre';
import { salesInRange } from '@/lib/finance/month-sales';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';

/**
 * Relatórios > Financeiro (2026-10-23). The screen read online payments only, manual "Fluxo de Caixa" entries
 * that nothing else used, and showed fixed changes (+5,2%, +2,1%). Now the numbers of the DRE and the Caixa:
 * the last 30 Brasília days against the 30 before, today, and a projection of the month.
 */
const DAY_MS = 864e5;
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T00:00:00.000Z`) + n * DAY_MS).toISOString().slice(0, 10);
const change = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

export interface FinanceOverview {
  last30: { first: string; last: string; revenue: number; result: number; netMargin: number; sales: number; avgTicket: number; byMethod: Record<string, number> };
  /** % against the 30 days before; null when there were no sales then */
  changes: { revenue: number | null; avgTicket: number | null; sales: number | null };
  today: { revenue: number; sales: number };
  month: {
    ym: string;
    revenueSoFar: number;
    daysElapsed: number;
    daysInMonth: number;
    /** Revenue so far / days elapsed × days in the month; null in the first 2 days (too little to tell) */
    projection: number | null;
    lastMonthRevenue: number;
  };
}

export async function financeOverview(restaurantId: string, now = new Date()): Promise<FinanceOverview> {
  const today = brtDay(now);
  const first = addDays(today, -29);
  const prevLast = addDays(first, -1);
  const prevFirst = addDays(prevLast, -29);
  const monthStart = `${today.slice(0, 8)}01`;
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const prevMonthStart = addDays(monthStart, -1).slice(0, 8) + '01';

  const [cur, prev, todaySales, mtd, lastMonth] = await Promise.all([
    computeDre(restaurantId, first, today),
    computeDre(restaurantId, prevFirst, prevLast),
    salesInRange(restaurantId, brtDayStart(today), brtDayStart(addDays(today, 1))),
    salesInRange(restaurantId, brtDayStart(monthStart), brtDayStart(addDays(today, 1))),
    salesInRange(restaurantId, brtDayStart(prevMonthStart), brtDayStart(monthStart)),
  ]);

  const sales = cur.detalhamento.totalPedidos;
  const prevSales = prev.detalhamento.totalPedidos;
  const avgTicket = sales > 0 ? cur.dre.receitaBruta / sales : 0;
  const prevTicket = prevSales > 0 ? prev.dre.receitaBruta / prevSales : 0;
  const daysElapsed = Number(today.slice(8, 10));
  const revenueSoFar = mtd.totalCents / 100;

  return {
    last30: {
      first,
      last: today,
      revenue: cur.dre.receitaBruta,
      result: cur.dre.resultadoLiquido,
      netMargin: cur.dre.margemLiquida,
      sales,
      avgTicket,
      byMethod: cur.detalhamento.receitaPorMetodo,
    },
    changes: {
      revenue: change(cur.dre.receitaBruta, prev.dre.receitaBruta),
      avgTicket: change(avgTicket, prevTicket),
      sales: change(sales, prevSales),
    },
    today: { revenue: todaySales.totalCents / 100, sales: todaySales.salesCount },
    month: {
      ym: today.slice(0, 7),
      revenueSoFar,
      daysElapsed,
      daysInMonth,
      projection: daysElapsed >= 3 ? (revenueSoFar / daysElapsed) * daysInMonth : null,
      lastMonthRevenue: lastMonth.totalCents / 100,
    },
  };
}
