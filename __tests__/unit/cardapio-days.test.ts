/** Cardápio rápido (spec 2026-11-06): weekdays and the bulk request, without the database */
import { daysLabel, normalizeDays, sellsOn, weekdayIn } from '@/lib/cardapio/days';
import { parseBulk } from '@/lib/cardapio/bulk';

describe('weekdays of a menu item', () => {
  it('reads the weekday in the restaurant time zone', () => {
    // 2026-11-08 02:00 UTC is still Saturday (23:00) in São Paulo and already Sunday in UTC
    const at = new Date('2026-11-08T02:00:00Z');
    expect(weekdayIn('America/Sao_Paulo', at)).toBe(6);
    expect(weekdayIn('UTC', at)).toBe(0);
    expect(weekdayIn('Not/AZone', at)).toBe(6);
  });

  it('stores every day as empty and refuses junk', () => {
    expect(normalizeDays([6, 0, 6])).toEqual([0, 6]);
    expect(normalizeDays([0, 1, 2, 3, 4, 5, 6])).toEqual([]);
    expect(normalizeDays([7])).toBeNull();
    expect(normalizeDays('seg')).toBeNull();
  });

  it('says when it sells and how the list shows it', () => {
    expect(sellsOn([], 3)).toBe(true);
    expect(sellsOn([0, 6], 3)).toBe(false);
    expect(daysLabel([])).toBeNull();
    expect(daysLabel([0, 6])).toBe('Só sáb e dom');
    expect(daysLabel([5])).toBe('Só sex');
    expect(daysLabel([1, 3, 5])).toBe('Só seg, qua e sex');
  });
});

describe('bulk request', () => {
  it('validates each action', () => {
    expect(parseBulk({ ids: ['a'], acao: 'esgotar' })).toMatchObject({ ok: true });
    expect(parseBulk({ ids: [], acao: 'esgotar' })).toMatchObject({ ok: false });
    expect(parseBulk({ ids: ['a'], acao: 'preco', preco: '12,9' })).toMatchObject({ ok: true, action: { preco: 12.9 } });
    expect(parseBulk({ ids: ['a'], acao: 'preco', preco: 0 })).toMatchObject({ ok: false });
    expect(parseBulk({ ids: ['a'], acao: 'ajuste', pct: 0 })).toMatchObject({ ok: false });
    expect(parseBulk({ ids: ['a'], acao: 'ajuste', pct: -50 })).toMatchObject({ ok: true });
    expect(parseBulk({ ids: ['a'], acao: 'canais', mostrar: 'sim' })).toMatchObject({ ok: false });
    expect(parseBulk({ ids: ['a'], acao: 'dias', dias: [5, 6] })).toMatchObject({ ok: true, action: { dias: [5, 6] } });
    expect(parseBulk({ ids: ['a'], acao: 'hack' })).toMatchObject({ ok: false });
  });
});
