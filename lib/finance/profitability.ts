import { itemSalesInRange } from '@/lib/finance/item-sales';
import { recipeCostMap } from '@/lib/recipes/cost-map';

export interface DishProfitability {
  id: string;
  name: string;
  /** Cost of one unit sold, from the ficha técnica today */
  costPrice: number;
  /** Average price charged per unit in the period */
  sellingPrice: number;
  margin: number;
  marginPercentage: number;
  quantitySold: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  /** The ficha has no cost (no insumos or insumos without cost): its margin is not known */
  noCost: boolean;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Relatórios › Lucratividade (2026-10-20): what was sold in [from, to) as on Relatórios › Vendas (price
 * charged, cancelled comandas and orders out) and the cost of each item from its ficha técnica, as on the
 * DRE. It read every kitchen order (cancelled and open comandas included) at the ficha's price, and the
 * last day of the period was cut at midnight UTC.
 */
export async function profitabilityInRange(restaurantId: string, from: Date, to: Date) {
  const items = await itemSalesInRange(restaurantId, from, to);
  const costs = await recipeCostMap(restaurantId, items.map((i) => i.recipeId));
  const dishes: DishProfitability[] = items.map((i) => {
    const unitCost = costs.get(i.recipeId) ?? 0;
    const totalCost = round2(unitCost * i.quantity);
    const sellingPrice = i.quantity > 0 ? i.revenue / i.quantity : 0;
    return {
      id: i.recipeId,
      name: i.name,
      costPrice: round2(unitCost),
      sellingPrice: round2(sellingPrice),
      margin: round2(sellingPrice - unitCost),
      marginPercentage: i.revenue > 0 ? ((i.revenue - totalCost) / i.revenue) * 100 : 0,
      quantitySold: i.quantity,
      totalRevenue: i.revenue,
      totalCost,
      profit: round2(i.revenue - totalCost),
      noCost: unitCost <= 0,
    };
  });
  const known = dishes.filter((d) => !d.noCost);
  const knownRevenue = known.reduce((s, d) => s + d.totalRevenue, 0);
  const knownProfit = known.reduce((s, d) => s + d.profit, 0);
  return {
    totalProfit: round2(knownProfit),
    // Weighted by revenue, items without cost left out (a 100% margin there is only a missing ficha)
    averageMargin: knownRevenue > 0 ? (knownProfit / knownRevenue) * 100 : 0,
    dishes,
    topProfitable: [...known].sort((a, b) => b.profit - a.profit),
    lowMargin: known.filter((d) => d.marginPercentage < 20).sort((a, b) => a.marginPercentage - b.marginPercentage),
    withoutCost: dishes.filter((d) => d.noCost).length,
  };
}
