import { computeDre } from '@/lib/finance/dre';
import { salesInRange } from '@/lib/finance/month-sales';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';
import { stockPositions } from '@/lib/stock/positions';

/**
 * The numbers of one store on the Várias lojas screen (2026-10-20). They summed every kitchen order, open
 * comandas included, and read the CMV from snapshots only the CMV screen writes: now the sales are the
 * Caixa/DRE criterion and the CMV is the DRE's, over the last `days` Brasília days (today included).
 */
export interface StoreMetrics {
  revenue: number;
  sales: number;
  salesToday: number;
  avgTicket: number;
  /** CMV over net revenue, as on the DRE (100 - margem bruta) */
  cmvPercent: number;
  /** Insumos with a minimum set and the stock below it */
  lowStock: number;
}

const DAY_MS = 864e5;

export async function storeMetrics(restaurantId: string, days: number, now = new Date()): Promise<StoreMetrics> {
  const today = brtDay(now);
  const first = brtDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  const tomorrow = brtDay(new Date(brtDayStart(today).getTime() + DAY_MS + 3_600_000));
  const [period, todaySales, positions] = await Promise.all([
    computeDre(restaurantId, first, today),
    salesInRange(restaurantId, brtDayStart(today), brtDayStart(tomorrow)),
    stockPositions(restaurantId),
  ]);
  const { receitaBruta, receitaLiquida, cmv } = period.dre;
  const sales = period.detalhamento.totalPedidos;
  return {
    revenue: receitaBruta,
    sales,
    salesToday: todaySales.salesCount,
    avgTicket: sales > 0 ? receitaBruta / sales : 0,
    cmvPercent: receitaLiquida > 0 ? (cmv / receitaLiquida) * 100 : 0,
    lowStock: positions.filter((p) => p.minimum > 0 && p.status !== 'OK').length,
  };
}
