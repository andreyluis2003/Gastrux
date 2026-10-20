import { convertUnits } from '@/lib/utils';

/**
 * Escalonar receita (2026-10-19, owner decision on the hidden screens): the insumos of N portions of a ficha técnica,
 * in the ficha's units, and whether the stock has them. A batch ficha (yield 10) asked for 25 portions is 2.5
 * batches. Cost per line = quantity in the insumo's unit x its cost, as in lib/recipes/cost.ts.
 */
export interface ScaleInput {
  baseYield: number;
  ingredients: Array<{
    ingredientId: string;
    quantity: number;
    unit: string;
    ingredient: { name: string; referenceCost: number; standardUnit: string; conversionFactor: number };
  }>;
}

export interface ScaledLine {
  ingredientId: string;
  name: string;
  /** What to separate, in the ficha's unit */
  quantity: number;
  unit: string;
  /** Stock now, in the insumo's unit; null when the insumo has no stock control (no Stock row) */
  inStock: number | null;
  stockUnit: string;
  enough: boolean | null;
  /** How much is missing, in the insumo's unit; null without stock control */
  missing: number | null;
  cost: number;
}

export interface ScaledRecipe {
  portions: number;
  factor: number;
  lines: ScaledLine[];
  totalCost: number;
  /** Insumos with no cost yet: the total is too low until they get one */
  missingCost: string[];
}

const EPS = 1e-9;

export function scaleRecipe(r: ScaleInput, portions: number, stock: Map<string, number>): ScaledRecipe {
  const factor = portions / (r.baseYield > 0 ? r.baseYield : 1);
  const lines = r.ingredients.map((ri) => {
    const stockUnit = String(ri.ingredient.standardUnit);
    const need = convertUnits(Number(ri.quantity), String(ri.unit), stockUnit, Number(ri.ingredient.conversionFactor || 1)) * factor;
    const has = stock.get(ri.ingredientId);
    const inStock = has === undefined ? null : has;
    const missing = inStock === null ? null : Math.max(0, need - inStock);
    return {
      ingredientId: ri.ingredientId,
      name: ri.ingredient.name,
      quantity: Number(ri.quantity) * factor,
      unit: String(ri.unit),
      inStock,
      stockUnit,
      enough: missing === null ? null : missing <= EPS,
      missing: missing === null ? null : missing <= EPS ? 0 : missing,
      cost: need * Number(ri.ingredient.referenceCost || 0),
    };
  });
  return {
    portions,
    factor,
    lines,
    totalCost: lines.reduce((s, l) => s + l.cost, 0),
    missingCost: r.ingredients.filter((ri) => !(Number(ri.ingredient.referenceCost) > 0)).map((ri) => ri.ingredient.name),
  };
}
