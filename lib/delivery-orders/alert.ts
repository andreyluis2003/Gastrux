/**
 * The new order alert of Pedidos de delivery (2026-11-03, after the owner compared with Anota AI): a bell for each
 * order that arrives, repeated while one waits for "Aceitar", the time left to accept an iFood order, and the count
 * in the tab title. Pure, safe to import from the browser.
 */

/** iFood cancels an order nobody confirmed in 8 minutes (same window as the alert of ingest.ts) */
export const IFOOD_ACCEPT_WINDOW_MS = 8 * 60_000;
const URGENT_MS = 2 * 60_000;

interface AlertOrder {
  id: string;
  status: string;
  orderReceivedAt: string;
  integration: { platform: string };
}

/** When iFood gives up on this order; null when nothing expires */
export function acceptDeadline(o: AlertOrder): Date | null {
  if (o.status !== 'PENDING' || o.integration.platform !== 'ifood') return null;
  return new Date(new Date(o.orderReceivedAt).getTime() + IFOOD_ACCEPT_WINDOW_MS);
}

export function countdown(deadline: Date, now: Date): { label: string; urgent: boolean; over: boolean } {
  const left = Math.max(0, deadline.getTime() - now.getTime());
  const secs = Math.ceil(left / 1000);
  const label = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return { label, urgent: left <= URGENT_MS, over: left === 0 };
}

/** The orders this screen had not seen; none on the first load (what was already there is not news) */
export function newArrivals<T extends { id: string }>(seen: Set<string> | null, orders: T[]): T[] {
  if (!seen) return [];
  return orders.filter((o) => !seen.has(o.id));
}

export function pendingTitle(base: string, pending: number): string {
  if (pending <= 0) return base;
  return `(${pending}) ${pending === 1 ? 'Pedido novo' : 'Pedidos novos'} · ${base}`;
}
