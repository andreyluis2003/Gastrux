import { convertUnits } from '@/lib/utils';

/**
 * Cost of one item sold from its ficha técnica (2026-10-18 UX research, proposal 4; the ficha shown inside the
 * product, as Consumer does). Each line is what one sale takes from the stock, in the insumo's unit, times the
 * insumo's cost; a batch ficha divides by its yield (same as the Contagem do dia, lib/daily-count/close.ts).
 */
export interface CostInput {
  baseYield: number;
  ingredients: Array<{ quantity: number; unit: string; ingredient: { name: string; referenceCost: number; standardUnit: string; conversionFactor: number } }>;
}

export interface RecipeCost {
  cost: number;
  lines: Array<{ name: string; quantity: number; unit: string; unitCost: number; cost: number }>;
  /** Insumos with no cost yet: the total is too low until they get one */
  missingCost: string[];
}

export function recipeCost(r: CostInput): RecipeCost {
  const portions = r.baseYield > 0 ? r.baseYield : 1;
  const lines = r.ingredients.map((ri) => {
    const inStockUnit = convertUnits(Number(ri.quantity), String(ri.unit), String(ri.ingredient.standardUnit), Number(ri.ingredient.conversionFactor || 1));
    const unitCost = Number(ri.ingredient.referenceCost || 0);
    return { name: ri.ingredient.name, quantity: Number(ri.quantity) / portions, unit: String(ri.unit), unitCost, cost: (inStockUnit * unitCost) / portions };
  });
  return {
    cost: lines.reduce((s, l) => s + l.cost, 0),
    lines,
    missingCost: r.ingredients.filter((ri) => !(Number(ri.ingredient.referenceCost) > 0)).map((ri) => ri.ingredient.name),
  };
}

/** What is left of the price after the ficha's cost; null without a price or a cost */
export function productMargin(price: number, cost: number): { marginCents: number; marginPct: number; cmvPct: number } | null {
  if (!(price > 0) || !(cost > 0)) return null;
  const marginCents = Math.round((price - cost) * 100);
  return { marginCents, marginPct: Math.round(((price - cost) / price) * 100), cmvPct: Math.round((cost / price) * 100) };
}
