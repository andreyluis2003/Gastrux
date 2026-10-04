/**
 * The payments screen cards (Receita, Pagamentos recebidos, Ticket médio). Only money actually kept counts:
 * pending, declined, cancelled, refunded and charged-back payments are 0; a partial refund counts what is
 * left. Fed by a groupBy on status over ALL the restaurant's payments, never by the listed page.
 */

export interface StatusGroup {
  status: string;
  count: number;
  amount: number | string | null;
  amountRefunded: number | string | null;
}

export interface ReceiptsSummary {
  revenue: number;
  paidCount: number;
  averageTicket: number;
}

const KEPT_IN_FULL = ['APPROVED', 'SETTLED'];

const cents = (v: number | string | null) => Math.round(Number(v || 0) * 100);

export function summarizeReceipts(groups: StatusGroup[]): ReceiptsSummary {
  let revenueCents = 0;
  let paidCount = 0;
  for (const g of groups) {
    if (KEPT_IN_FULL.includes(g.status)) {
      revenueCents += cents(g.amount);
      paidCount += g.count;
    } else if (g.status === 'PARTIALLY_REFUNDED') {
      revenueCents += Math.max(0, cents(g.amount) - cents(g.amountRefunded));
      paidCount += g.count;
    }
  }
  return {
    revenue: revenueCents / 100,
    paidCount,
    averageTicket: paidCount > 0 ? Math.round(revenueCents / paidCount) / 100 : 0,
  };
}
