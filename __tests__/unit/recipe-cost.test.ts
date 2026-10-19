/** Cost and margin of a product from its ficha técnica (2026-10-18 UX research, proposal 4) */
import { recipeCost, productMargin } from '@/lib/recipes/cost';

const ing = (name: string, quantity: number, unit: string, cost: number, standardUnit = unit, conversionFactor = 1) =>
  ({ quantity, unit, ingredient: { name, referenceCost: cost, standardUnit, conversionFactor } });

it('one item sold: quantity x cost of each insumo, in the insumo\'s unit', () => {
  const c = recipeCost({ baseYield: 1, ingredients: [ing('Picanha', 0.2, 'kg', 80), ing('Sal', 5, 'g', 2, 'kg'), ing('Pão', 1, 'un', 0.9)] });
  expect(c.cost).toBeCloseTo(16 + 0.01 + 0.9, 6);
  expect(c.lines.map((l) => [l.name, Math.round(l.cost * 100)])).toEqual([['Picanha', 1600], ['Sal', 1], ['Pão', 90]]);
  expect(c.missingCost).toEqual([]);
});

it('a batch ficha (yield 10) is divided by its yield; an insumo without cost is named', () => {
  const c = recipeCost({ baseYield: 10, ingredients: [ing('Arroz', 1, 'kg', 6.5), ing('Alho', 0.05, 'kg', 0)] });
  expect(c.cost).toBeCloseTo(0.65, 6);
  expect(c.missingCost).toEqual(['Alho']);
});

it('margin and CMV % from the price; no price or no cost gives no number', () => {
  expect(productMargin(35, 12.25)).toEqual({ marginCents: 2275, marginPct: 65, cmvPct: 35 });
  expect(productMargin(0, 5)).toBeNull();
  expect(productMargin(30, 0)).toBeNull();
  expect(productMargin(10, 12)).toEqual({ marginCents: -200, marginPct: -20, cmvPct: 120 });
});
