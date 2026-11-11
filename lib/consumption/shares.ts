/**
 * Slices of the "Distribuição por Ingrediente" chart (fix 2026-11-11): by cost, because quantities in kg, litres
 * and units cannot be added up; by quantity only when nothing has a cost. The smallest go into "Outros" so the
 * chart stays readable.
 */
export interface IngredientRow {
  ingredientName: string;
  totalQuantity: number;
  totalCost: number;
  unit?: string;
}

/** "Top Ingredientes" bars: by cost (biggest first), or by quantity with its unit when nothing has a cost */
export function ingredientRanking(rows: IngredientRow[], max = 8): { basis: 'cost' | 'quantity'; items: { name: string; value: number; unit: string }[] } {
  const basis = rows.some((r) => Number(r.totalCost) > 0) ? 'cost' : 'quantity';
  const items = rows
    .map((r) => ({
      name: r.ingredientName || 'Sem nome',
      value: Math.max(0, Number(basis === 'cost' ? r.totalCost : r.totalQuantity) || 0),
      unit: r.unit ?? '',
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
  return { basis, items };
}

export interface Share {
  name: string;
  value: number;
  percent: number;
  label: string;
}

const MAX_SLICES = 6;

export function ingredientShares(rows: IngredientRow[]): { basis: 'cost' | 'quantity'; items: Share[] } {
  const basis = rows.some((r) => Number(r.totalCost) > 0) ? 'cost' : 'quantity';
  const values = rows
    .map((r) => ({ name: r.ingredientName || 'Sem nome', value: Math.max(0, Number(basis === 'cost' ? r.totalCost : r.totalQuantity) || 0) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = values.reduce((s, r) => s + r.value, 0);
  if (!total) return { basis, items: [] };
  const top = values.length > MAX_SLICES + 1 ? values.slice(0, MAX_SLICES) : values;
  const rest = values.slice(top.length).reduce((s, r) => s + r.value, 0);
  const sliced = rest > 0 ? [...top, { name: 'Outros', value: rest }] : top;
  return {
    basis,
    items: sliced.map((r) => {
      const percent = Math.round((r.value / total) * 100);
      return { ...r, percent, label: percent < 1 ? '<1%' : `${percent}%` };
    }),
  };
}
