import { groupByCategory, isUnsent, unsentCount, openFor, sessionLabel, entryRecipeId, type MenuEntry } from '../../lib/vender/rules';

const cat = (id: string, name: string, position: number) => ({ id, name, position, emoji: null });
const entry = (id: string, over: Partial<MenuEntry> = {}): MenuEntry => ({ id, name: id, price: 10, recipeId: 'r-a', available: true, category: cat('c1', 'Pizzas', 0), ...over });

describe('groupByCategory', () => {
  it('keeps the menu order, drops unavailable items and empty groups, puts items without category in "Outros" last', () => {
    const groups = groupByCategory([
      entry('a', { category: cat('c2', 'Bebidas', 1) }),
      entry('b'),
      entry('c', { available: false }),
      entry('d', { category: null }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Bebidas', 'Pizzas', 'Outros']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['b']);
    expect(groups[2].items.map((i) => i.id)).toEqual(['d']);
  });
});

describe('new and sent lines', () => {
  const sent = '2026-10-07T20:00:00.000Z';
  it('a line added after the last send, or with no send yet, or pending offline, is new', () => {
    expect(isUnsent({ addedAt: '2026-10-07T20:05:00.000Z' }, sent)).toBe(true);
    expect(isUnsent({ addedAt: '2026-10-07T19:55:00.000Z' }, sent)).toBe(false);
    expect(isUnsent({ addedAt: '2026-10-07T19:55:00.000Z' }, null)).toBe(true);
    expect(isUnsent({ pending: true }, sent)).toBe(true);
    expect(unsentCount([{ addedAt: '2026-10-07T20:05:00.000Z' }, { addedAt: '2026-10-07T19:00:00.000Z' }, { pending: true }], sent)).toBe(2);
  });
});

describe('entryRecipeId', () => {
  it('uses the recipe of the menu item (recipeId, else recipe.id)', () => {
    expect(entryRecipeId(entry('a', { recipeId: null, recipe: { id: 'r-x' } }))).toBe('r-x');
  });
});

describe('labels', () => {
  const now = new Date('2026-10-07T21:00:00.000Z');
  it('time open', () => {
    expect(openFor('2026-10-07T20:59:30.000Z', now)).toBe('agora');
    expect(openFor('2026-10-07T20:13:00.000Z', now)).toBe('47 min');
    expect(openFor('2026-10-07T19:55:00.000Z', now)).toBe('1 h 05');
  });
  it('a comanda is its table, else its name, else Balcão', () => {
    expect(sessionLabel({ table: { number: 5 } })).toBe('Mesa 5');
    expect(sessionLabel({ tableNumber: 7 })).toBe('Mesa 7');
    expect(sessionLabel({ customerName: 'João' })).toBe('João');
    expect(sessionLabel({})).toBe('Balcão');
  });
});
