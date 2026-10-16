import { entryTotals, buildRows, closeRows, parseQuantity, lossReason, DailyCountError } from '../../lib/daily-count/compute';

describe('daily count arithmetic (lib/daily-count/compute.ts)', () => {
  const items = [{ recipeId: 'k', name: 'Espeto de kafta' }, { recipeId: 'f', name: 'Espeto de frango' }];

  it('opening + mounted − sold − loss = expected, per item, sorted by name', () => {
    const totals = entryTotals([
      { recipeId: 'f', kind: 'OPENING', quantity: 8 },
      { recipeId: 'f', kind: 'MOUNTED', quantity: 20 },
      { recipeId: 'f', kind: 'MOUNTED', quantity: 20 },
      { recipeId: 'f', kind: 'LOSS', quantity: 2 },
      { recipeId: 'k', kind: 'MOUNTED', quantity: 10 },
    ]);
    const rows = buildRows(items, totals, { f: 38 });
    expect(rows).toEqual([
      { recipeId: 'f', name: 'Espeto de frango', opening: 8, mounted: 40, sold: 38, loss: 2, expected: 8 },
      { recipeId: 'k', name: 'Espeto de kafta', opening: 0, mounted: 10, sold: 0, loss: 0, expected: 10 },
    ]);
  });

  it('no entries and no sales gives zeros', () => {
    expect(buildRows([items[0]], {}, {})).toEqual([{ recipeId: 'k', name: 'Espeto de kafta', opening: 0, mounted: 0, sold: 0, loss: 0, expected: 0 }]);
  });

  it('expected can be negative (loss or sales beyond what was mounted): shown as is, never clamped', () => {
    const rows = buildRows([items[1]], entryTotals([{ recipeId: 'f', kind: 'MOUNTED', quantity: 5 }, { recipeId: 'f', kind: 'LOSS', quantity: 3 }]), { f: 4 });
    expect(rows[0].expected).toBe(-2);
    expect(closeRows(rows, [{ recipeId: 'f', counted: 0 }])[0]).toMatchObject({ counted: 0, difference: 2 });
  });

  it('close: difference = counted − expected; every row needs a count', () => {
    const rows = buildRows(items, entryTotals([{ recipeId: 'f', kind: 'MOUNTED', quantity: 50 }, { recipeId: 'k', kind: 'MOUNTED', quantity: 10 }]), { f: 38 });
    const closed = closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: '12' }]);
    expect(closed.map((r) => [r.recipeId, r.expected, r.counted, r.difference])).toEqual([['f', 12, 8, -4], ['k', 10, 12, 2]]);
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }])).toThrow(DailyCountError);
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: -1 }])).toThrow('Contagem inválida');
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: 1.5 }])).toThrow('Contagem inválida');
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: 1 }, { recipeId: 'x', counted: 1 }])).toThrow('não está na contagem');
  });

  it('quantities are whole numbers above zero', () => {
    expect(parseQuantity(10)).toBe(10);
    expect(parseQuantity('3')).toBe(3);
    for (const bad of [0, -1, 1.5, 'abc', null, undefined, 100001]) expect(() => parseQuantity(bad)).toThrow(DailyCountError);
  });

  it('a loss needs a known reason; "Outro" needs a note', () => {
    expect(lossReason('Queimou', undefined)).toBe('Queimou');
    expect(lossReason('Outro', ' cliente devolveu ')).toBe('Outro: cliente devolveu');
    expect(() => lossReason('Outro', '  ')).toThrow('Diga o motivo');
    expect(() => lossReason('Sumiu', undefined)).toThrow('Motivo inválido');
  });
});
