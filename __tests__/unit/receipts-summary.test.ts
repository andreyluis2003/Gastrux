/**
 * The payments cards showed R$ 3,00 for two refunded R$ 1 PIX and one unpaid QR Code (production,
 * 2026-10-04): they summed every listed row. Only money actually kept counts.
 */
import { summarizeReceipts } from '../../lib/payments/receipts-summary';

describe('summarizeReceipts', () => {
  it('the production case: two refunded and one pending is R$ 0 with no paid payment', () => {
    expect(
      summarizeReceipts([
        { status: 'REFUNDED', count: 2, amount: '2.00', amountRefunded: '1.00' },
        { status: 'PENDING', count: 1, amount: '1.00', amountRefunded: '0' },
      ])
    ).toEqual({ revenue: 0, paidCount: 0, averageTicket: 0 });
  });

  it('approved and settled count in full; declined, cancelled and chargeback do not', () => {
    expect(
      summarizeReceipts([
        { status: 'APPROVED', count: 2, amount: '70.50', amountRefunded: '0' },
        { status: 'SETTLED', count: 1, amount: '29.50', amountRefunded: '0' },
        { status: 'DECLINED', count: 3, amount: '90', amountRefunded: '0' },
        { status: 'CANCELLED', count: 1, amount: '10', amountRefunded: '0' },
        { status: 'CHARGEBACK', count: 1, amount: '40', amountRefunded: '0' },
      ])
    ).toEqual({ revenue: 100, paidCount: 3, averageTicket: 33.33 });
  });

  it('a partial refund keeps only what is left', () => {
    expect(
      summarizeReceipts([{ status: 'PARTIALLY_REFUNDED', count: 1, amount: '100', amountRefunded: '60' }])
    ).toEqual({ revenue: 40, paidCount: 1, averageTicket: 40 });
  });

  it('a restaurant with no payments shows zeros, not NaN', () => {
    expect(summarizeReceipts([])).toEqual({ revenue: 0, paidCount: 0, averageTicket: 0 });
  });
});
