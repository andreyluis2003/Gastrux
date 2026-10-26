import { BOARD_COLUMNS, boardColumns, paymentHint } from '../../lib/delivery-orders/board';

const o = (id: string, status: string, minutesAgo: number, extra: Record<string, unknown> = {}) =>
  ({ id, status, orderReceivedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(), ...extra });

describe('delivery board (quadro de pedidos por etapa)', () => {
  it('four columns: new, in preparation (confirmed + preparing), ready, out for delivery', () => {
    expect(BOARD_COLUMNS.map((c) => c.label)).toEqual(['Novos', 'Em preparo', 'Prontos', 'Em entrega']);
    const cols = boardColumns([
      o('a', 'PENDING', 1), o('b', 'CONFIRMED', 5), o('c', 'PREPARING', 9), o('d', 'READY', 3),
      o('e', 'PICKED_UP', 20), o('f', 'DELIVERED', 30), o('g', 'CANCELLED', 2), o('h', 'REJECTED', 2),
    ] as any);
    expect(cols.map((c) => c.orders.map((x) => x.id))).toEqual([['a'], ['c', 'b'], ['d'], ['e']]);
  });

  it('oldest first in each column: the one waiting longest is on top', () => {
    const cols = boardColumns([o('new', 'READY', 1), o('old', 'READY', 15), o('mid', 'READY', 7)] as any);
    expect(cols[2].orders.map((x) => x.id)).toEqual(['old', 'mid', 'new']);
  });

  it('says how the order is paid: online, or what the driver collects at the door', () => {
    expect(paymentHint({ paidOnline: true, paymentMethod: 'ONLINE_PIX' } as any)).toBe('Pago online');
    expect(paymentHint({ paidOnline: false, paymentMethod: 'CASH' } as any)).toBe('Na entrega: dinheiro');
    expect(paymentHint({ paidOnline: false, paymentMethod: 'CREDIT_ON_DELIVERY' } as any)).toBe('Na entrega: crédito');
    expect(paymentHint({ paidOnline: false, paymentMethod: 'DEBIT_ON_DELIVERY' } as any)).toBe('Na entrega: débito');
    expect(paymentHint({ paidOnline: false, paymentMethod: 'VOUCHER_ON_DELIVERY' } as any)).toBe('Na entrega: vale');
    expect(paymentHint({ paidOnline: false, paymentMethod: null } as any)).toBeNull();
  });
});
