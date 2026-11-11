import { ingredientShares, ingredientRanking } from '../../../lib/consumption/shares';

const row = (ingredientName: string, totalCost: number, totalQuantity = 1) => ({ ingredientName, totalCost, totalQuantity, unit: 'kg' });

describe('ingredientShares', () => {
  it('splits by cost, biggest first, percentages summing to 100', () => {
    const s = ingredientShares([row('Tomate', 30), row('Alface Crespa', 60), row('Cebola', 10)]);
    expect(s.basis).toBe('cost');
    expect(s.items.map((i) => [i.name, i.percent])).toEqual([['Alface Crespa', 60], ['Tomate', 30], ['Cebola', 10]]);
  });
  it('groups everything after the 6th into "Outros"', () => {
    const s = ingredientShares(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n, i) => row(n, 80 - i * 10)));
    expect(s.items).toHaveLength(7);
    expect(s.items[6]).toMatchObject({ name: 'Outros', value: 20 + 10 });
  });
  it('falls back to quantity when nothing has a cost', () => {
    const s = ingredientShares([row('Sal', 0, 3), row('Óleo', 0, 1)]);
    expect(s.basis).toBe('quantity');
    expect(s.items[0]).toMatchObject({ name: 'Sal', percent: 75 });
  });
  it('shows "<1%" instead of 0% for tiny slices', () => {
    const s = ingredientShares([row('A', 999), row('B', 1)]);
    expect(s.items[1].label).toBe('<1%');
  });
  it('empty when no values', () => {
    expect(ingredientShares([]).items).toEqual([]);
  });
});

describe('ingredientRanking', () => {
  it('ranks by cost, biggest first, at most 8', () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`I${i}`, i + 1));
    const r = ingredientRanking(rows);
    expect(r.basis).toBe('cost');
    expect(r.items).toHaveLength(8);
    expect(r.items[0]).toMatchObject({ name: 'I9', value: 10 });
  });
  it('falls back to quantity with the unit when nothing has a cost', () => {
    const r = ingredientRanking([row('Sal', 0, 3), row('Óleo', 0, 5)]);
    expect(r.basis).toBe('quantity');
    expect(r.items[0]).toMatchObject({ name: 'Óleo', value: 5, unit: 'kg' });
  });
});
