import type { Bill } from './bill-service';

/** What of a bill may be shown to the people at the table (spec 2026-10-10 §5.4): no ids, no staff data */
export interface PublicOpenBill {
  status: 'OPEN';
  sessionId: string;
  label: string;
  items: Array<{ name: string; quantity: number; totalCents: number }>;
  subtotalCents: number;
  serviceCents: number;
  servicePercent: number;
  serviceApplies: boolean;
  /** Cashback the cashier applied (spec 2026-10-23): already out of totalCents */
  cashbackCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}
export type PublicTableBill = PublicOpenBill | { status: 'CLOSED'; sessionId: string; nfceUrl: string | null } | { status: 'NONE' };

/** `names`: the menu name of each line (by line id), when the line's recipe is on the menu under another name */
export function toPublicBill(bill: Bill, names: Map<string, string> = new Map()): PublicOpenBill {
  return {
    status: 'OPEN',
    sessionId: bill.sessionId,
    label: bill.label,
    items: bill.items.map((i) => ({ name: names.get(i.id) ?? i.name, quantity: i.quantity, totalCents: i.totalCents })),
    subtotalCents: bill.subtotalCents,
    serviceCents: bill.serviceCents,
    servicePercent: bill.percent,
    serviceApplies: bill.applies && !bill.waived,
    cashbackCents: bill.cashbackUsedCents ?? 0,
    totalCents: bill.totalCents,
    paidCents: bill.paidCents,
    remainingCents: bill.remainingCents,
  };
}
