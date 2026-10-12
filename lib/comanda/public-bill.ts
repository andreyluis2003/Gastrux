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
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}
export type PublicTableBill = PublicOpenBill | { status: 'CLOSED'; sessionId: string; nfceUrl: string | null } | { status: 'NONE' };

export function toPublicBill(bill: Bill): PublicOpenBill {
  return {
    status: 'OPEN',
    sessionId: bill.sessionId,
    label: bill.label,
    items: bill.items.map((i) => ({ name: i.name, quantity: i.quantity, totalCents: i.totalCents })),
    subtotalCents: bill.subtotalCents,
    serviceCents: bill.serviceCents,
    servicePercent: bill.percent,
    serviceApplies: bill.applies && !bill.waived,
    totalCents: bill.totalCents,
    paidCents: bill.paidCents,
    remainingCents: bill.remainingCents,
  };
}
