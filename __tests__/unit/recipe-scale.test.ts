/** Escalonar receita: the insumos of N portions of a ficha técnica and whether the stock has them (2026-10-19) */
import { scaleRecipe } from '@/lib/recipes/scale';

const ing = (id: string, name: string, quantity: number, unit: string, cost: number, standardUnit = unit, conversionFactor = 1) =>
  ({ ingredientId: id, quantity, unit, ingredient: { name, referenceCost: cost, standardUnit, conversionFactor } });

it('N portions of a one-portion ficha: each insumo times N, cost in the insumo\'s unit', () => {
  const s = scaleRecipe({ baseYield: 1, ingredients: [ing('p', 'Picanha', 0.2, 'kg', 80), ing('s', 'Sal', 5, 'g', 2, 'kg')] }, 30, new Map());
  expect(s.factor).toBe(30);
  expect(s.lines.map((l) => [l.name, l.quantity, l.unit])).toEqual([['Picanha', 6, 'kg'], ['Sal', 150, 'g']]);
  expect(s.totalCost).toBeCloseTo(480 + 0.3, 6);
});

it('a batch ficha (yield 10) asked for 25 portions is 2.5 batches', () => {
  const s = scaleRecipe({ baseYield: 10, ingredients: [ing('a', 'Arroz', 1, 'kg', 6.5)] }, 25, new Map());
  expect(s.factor).toBeCloseTo(2.5, 9);
  expect(s.lines[0].quantity).toBeCloseTo(2.5, 9);
  expect(s.totalCost).toBeCloseTo(16.25, 6);
});

it('stock: enough, missing (how much), and no stock control', () => {
  const stock = new Map([['p', 5], ['s', 1]]);
  const s = scaleRecipe({ baseYield: 1, ingredients: [ing('p', 'Picanha', 0.2, 'kg', 80), ing('s', 'Sal', 5, 'g', 2, 'kg'), ing('b', 'Pão', 1, 'un', 0.9)] }, 30, stock);
  const [picanha, sal, pao] = s.lines;
  expect(picanha).toMatchObject({ inStock: 5, stockUnit: 'kg', enough: false });
  expect(picanha.missing).toBeCloseTo(1, 9);
  expect(sal).toMatchObject({ inStock: 1, stockUnit: 'kg', enough: true, missing: 0 });
  expect(pao).toMatchObject({ inStock: null, enough: null, missing: null });
  expect(s.missingCost).toEqual([]);
});

it('an insumo without cost is named; the total is too low until it has one', () => {
  const s = scaleRecipe({ baseYield: 1, ingredients: [ing('a', 'Alho', 0.01, 'kg', 0)] }, 10, new Map());
  expect(s.missingCost).toEqual(['Alho']);
  expect(s.totalCost).toBe(0);
});
