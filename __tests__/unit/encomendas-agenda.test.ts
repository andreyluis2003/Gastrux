/**
 * The encomendas agenda (spec 2026-10-26 encomendas): late, today, tomorrow and the next days, by the
 * Brasília calendar day; the pickup time as the counter reads it.
 */
import { agenda, pickupLabel } from '@/lib/encomendas/agenda';

// 2026-10-26 10:00 in Brasília (13:00 UTC)
const now = new Date('2026-10-26T13:00:00Z');
const at = (iso: string) => ({ id: iso, pickupAt: iso });

describe('the encomendas agenda', () => {
  it('puts each pickup in late, today, tomorrow or the next days, in order', () => {
    const groups = agenda([
      at('2026-10-28T15:00:00Z'), // Wed 12:00
      at('2026-10-26T12:00:00Z'), // today 09:00: an hour ago, late
      at('2026-10-27T02:30:00Z'), // today 23:30 in Brasília (UTC is already the 27th)
      at('2026-10-27T18:00:00Z'), // tomorrow 15:00
      at('2026-10-26T18:00:00Z'), // today 15:00
    ], now);
    expect(groups.map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([
      ['atrasadas', ['2026-10-26T12:00:00Z']],
      ['hoje', ['2026-10-26T18:00:00Z', '2026-10-27T02:30:00Z']],
      ['amanha', ['2026-10-27T18:00:00Z']],
      ['proximos', ['2026-10-28T15:00:00Z']],
    ]);
  });

  it('leaves out the empty groups', () => {
    expect(agenda([at('2026-10-27T18:00:00Z')], now).map((g) => g.key)).toEqual(['amanha']);
    expect(agenda([], now)).toEqual([]);
  });

  it('shows the time for today and tomorrow, the day for the others', () => {
    expect(pickupLabel('2026-10-26T18:00:00Z', now)).toBe('hoje às 15:00');
    expect(pickupLabel('2026-10-27T18:00:00Z', now)).toBe('amanhã às 15:00');
    expect(pickupLabel('2026-10-28T15:00:00Z', now)).toBe('qua., 28/10 às 12:00');
  });
});
