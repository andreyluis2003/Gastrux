/**
 * The delivery orders board (quadro de pedidos por etapa, 2026-10-26): the active orders in four columns, the one
 * waiting longest on top. Pure, safe to import from the browser.
 */

export interface BoardOrder {
  id: string;
  status: string;
  orderReceivedAt: string;
  paidOnline?: boolean;
  paymentMethod?: string | null;
}

export const BOARD_COLUMNS = [
  { key: 'novos', label: 'Novos', statuses: ['PENDING'] },
  { key: 'preparo', label: 'Em preparo', statuses: ['CONFIRMED', 'PREPARING'] },
  { key: 'prontos', label: 'Prontos', statuses: ['READY'] },
  { key: 'entrega', label: 'Em entrega', statuses: ['PICKED_UP'] },
] as const;

export function boardColumns<T extends BoardOrder>(orders: T[]) {
  return BOARD_COLUMNS.map((c) => ({
    ...c,
    orders: orders
      .filter((o) => (c.statuses as readonly string[]).includes(o.status))
      .sort((a, b) => new Date(a.orderReceivedAt).getTime() - new Date(b.orderReceivedAt).getTime()),
  }));
}

const AT_DOOR: Record<string, string> = { CASH: 'dinheiro', CREDIT_ON_DELIVERY: 'crédito', DEBIT_ON_DELIVERY: 'débito', VOUCHER_ON_DELIVERY: 'vale' };

/** "Pago online", "Na entrega: dinheiro"; null when the origin did not say */
export function paymentHint(o: Pick<BoardOrder, 'paidOnline' | 'paymentMethod'>): string | null {
  if (o.paidOnline) return 'Pago online';
  const m = o.paymentMethod ? AT_DOOR[o.paymentMethod] : undefined;
  return m ? `Na entrega: ${m}` : null;
}
