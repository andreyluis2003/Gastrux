import { onlinePaidCents } from '../../lib/comanda/bill';

describe('onlinePaidCents', () => {
  it('counts an approved payment in full, a partial refund as the rest, a refund as nothing', () => {
    expect(onlinePaidCents({ amount: '50.00', amountRefunded: 0, status: 'APPROVED' })).toBe(5_000);
    expect(onlinePaidCents({ amount: 50, amountRefunded: '12.50', status: 'PARTIALLY_REFUNDED' })).toBe(3_750);
    expect(onlinePaidCents({ amount: 50, amountRefunded: 50, status: 'REFUNDED' })).toBe(0);
    expect(onlinePaidCents({ amount: 50, amountRefunded: 0, status: 'PENDING' })).toBe(0);
  });
});
