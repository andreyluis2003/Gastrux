/** Abrir e fechar pelo horário (spec 2026-11-08): the pure rules */
import { hoursState, nextOpening, openByHours, parseHours, sanitizeHours } from '@/lib/orders/hours';
import { stateOf } from '@/lib/orders/store-open';

const H = (days: Record<string, any>, auto = true) => parseHours({ ...days, auto });
// Days: 0 dom, 1 seg, ... 5 sex, 6 sab
const m = (hh: number, mm = 0) => hh * 60 + mm;

describe('business hours', () => {
  it('keeps only known days with HH:MM times', () => {
    expect(sanitizeHours({ seg: { open: '11:00', close: '23:00' }, ter: { open: '25:00', close: '23:00' }, xyz: { open: '01:00', close: '02:00' }, auto: true, hack: 1 }))
      .toEqual({ seg: { open: '11:00', close: '23:00', closed: false }, auto: true });
    expect(parseHours(null)).toEqual({ days: {}, auto: false });
  });

  it('a plain day: open from opening, closed at closing', () => {
    const h = H({ seg: { open: '11:00', close: '23:00' } });
    expect(openByHours(h, 1, m(10, 59))).toBe(false);
    expect(openByHours(h, 1, m(11))).toBe(true);
    expect(openByHours(h, 1, m(22, 59))).toBe(true);
    expect(openByHours(h, 1, m(23))).toBe(false);
  });

  it('closing after midnight runs into the next day; 00:00 is midnight', () => {
    const h = H({ sex: { open: '18:00', close: '02:00' }, sab: { open: '11:00', close: '00:00' } });
    expect(openByHours(h, 5, m(23))).toBe(true);
    expect(openByHours(h, 6, m(1, 30))).toBe(true);
    expect(openByHours(h, 6, m(2))).toBe(false);
    expect(openByHours(h, 6, m(23, 59))).toBe(true);
    expect(openByHours(h, 0, m(0, 1))).toBe(false);
  });

  it('a closed day, or open equal to close, is closed all day', () => {
    const h = H({ dom: { open: '11:00', close: '22:00', closed: true }, seg: { open: '10:00', close: '10:00' } });
    expect(openByHours(h, 0, m(12))).toBe(false);
    expect(openByHours(h, 1, m(10))).toBe(false);
  });

  it('says when it opens next', () => {
    const h = H({ seg: { open: '11:00', close: '23:00' }, qua: { open: '18:00', close: '23:00' } });
    expect(nextOpening(h, 1, m(9))).toBe('hoje às 11:00');
    expect(nextOpening(h, 1, m(23, 30))).toBe('quarta às 18:00');
    expect(nextOpening(h, 2, m(9))).toBe('amanhã às 18:00');
    expect(nextOpening(H({}), 1, m(9))).toBeNull();
  });

  it('only counts when the owner turned it on, in the restaurant time zone', () => {
    // 2026-11-09 (Monday) 01:30 UTC = Sunday 22:30 in São Paulo
    const at = new Date('2026-11-09T01:30:00Z');
    const days = { dom: { open: '11:00', close: '22:00' }, seg: { open: '11:00', close: '23:00' } };
    expect(hoursState({ ...days, auto: false }, 'America/Sao_Paulo', at)).toEqual({ closedByHours: false, opens: null });
    expect(hoursState({ ...days, auto: true }, 'America/Sao_Paulo', at)).toEqual({ closedByHours: true, opens: 'amanhã às 11:00' });
    expect(hoursState({ ...days, auto: true }, 'UTC', at)).toEqual({ closedByHours: true, opens: 'hoje às 11:00' });
  });

  it('closed by hand wins over the hours', () => {
    const at = new Date('2026-11-09T15:00:00Z'); // Monday 12:00 in São Paulo
    const businessHours = { seg: { open: '11:00', close: '23:00' }, auto: true };
    expect(stateOf({ ordersClosedAt: null, businessHours, timezone: 'America/Sao_Paulo' }, at)).toMatchObject({ closed: false, reason: null, auto: true });
    expect(stateOf({ ordersClosedAt: at, businessHours, timezone: 'America/Sao_Paulo' }, at)).toMatchObject({ closed: true, reason: 'manual' });
    expect(stateOf({ ordersClosedAt: null, businessHours: { ...businessHours, seg: { open: '18:00', close: '23:00' } }, timezone: 'America/Sao_Paulo' }, at))
      .toMatchObject({ closed: true, reason: 'horario', opens: 'hoje às 18:00' });
  });
});
