import { acceptDeadline, countdown, newArrivals, pendingTitle, IFOOD_ACCEPT_WINDOW_MS } from '../../lib/delivery-orders/alert';

const at = (iso: string) => new Date(iso);
const order = (over: Partial<{ id: string; status: string; orderReceivedAt: string; platform: string }> = {}) => ({
  id: over.id ?? 'a',
  status: over.status ?? 'PENDING',
  orderReceivedAt: over.orderReceivedAt ?? '2026-11-03T12:00:00.000Z',
  integration: { platform: over.platform ?? 'ifood' },
});

describe('new order alert (pedido novo que grita, 2026-11-03)', () => {
  it('an iFood order waiting for "Aceitar" must be answered in 8 minutes', () => {
    expect(IFOOD_ACCEPT_WINDOW_MS).toBe(8 * 60_000);
    expect(acceptDeadline(order())?.toISOString()).toBe('2026-11-03T12:08:00.000Z');
  });

  it('a 99Food order must be answered in 5 minutes (plan 2026-11-09 99food)', () => {
    expect(acceptDeadline(order({ platform: 'ninety_nine_food' }))?.toISOString()).toBe('2026-11-03T12:05:00.000Z');
  });

  it('no deadline once accepted, nor for the other channels', () => {
    expect(acceptDeadline(order({ status: 'CONFIRMED' }))).toBeNull();
    expect(acceptDeadline(order({ platform: 'gastrux_api' }))).toBeNull();
    expect(acceptDeadline(order({ platform: 'delivery_site' }))).toBeNull();
  });

  it('the countdown reads mm:ss, turns urgent in the last 2 minutes and ends at zero', () => {
    const deadline = at('2026-11-03T12:08:00.000Z');
    expect(countdown(deadline, at('2026-11-03T12:00:18.000Z'))).toEqual({ label: '07:42', urgent: false, over: false });
    expect(countdown(deadline, at('2026-11-03T12:06:30.000Z'))).toEqual({ label: '01:30', urgent: true, over: false });
    expect(countdown(deadline, at('2026-11-03T12:08:05.000Z'))).toEqual({ label: '00:00', urgent: true, over: true });
  });

  it('rings only for orders not seen before, and never on the first load of the page', () => {
    const first = [order({ id: 'a' }), order({ id: 'b', status: 'CONFIRMED' })];
    expect(newArrivals(null, first)).toEqual([]);
    const seen = new Set(['a', 'b']);
    const next = [...first, order({ id: 'c', status: 'CONFIRMED' }), order({ id: 'd' })];
    expect(newArrivals(seen, next).map((o) => o.id)).toEqual(['c', 'd']);
    expect(newArrivals(seen, first)).toEqual([]);
  });

  it('the tab title counts the orders waiting', () => {
    expect(pendingTitle('Gastrux', 0)).toBe('Gastrux');
    expect(pendingTitle('Gastrux', 1)).toBe('(1) Pedido novo · Gastrux');
    expect(pendingTitle('Gastrux', 3)).toBe('(3) Pedidos novos · Gastrux');
  });
});
