import { CASH_METHODS, emptyByMethod, toCashMethod, type ByMethod, type CashMethod } from './payment-methods';

/**
 * Money rules of the cash register (spec §5), pure and in integer cents.
 */

export class CashRuleError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
  }
}

// Plain space after "R$" (toLocaleString uses a non-breaking one)
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

function toCents(value: unknown, field: string, allowZero: boolean): number {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new CashRuleError(`${field}: informe um valor em reais com até 2 casas decimais`);
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw new CashRuleError(`${field}: informe um valor maior que zero`);
  }
  return cents;
}

export const parseAmountCents = (value: unknown, field = 'Valor') => toCents(value, field, false);
export const parseCountedCents = (value: unknown, field = 'Valor contado') => toCents(value, field, true);

export interface PaymentInput { method: unknown; amount: unknown }
export interface SettledPayment { receipts: ByMethod; changeCents: number; paidCents: number; primaryMethod: CashMethod }

/**
 * Payments of one sale (spec rule 3): they must cover the total; only cash may exceed it, and the
 * excess is the change. Receipts keep what was handed over (the change leaves the drawer as its own line).
 */
export function settlePayments(totalCents: number, payments: PaymentInput[]): SettledPayment {
  const receipts = emptyByMethod();
  if (!Array.isArray(payments)) throw new CashRuleError('Informe as formas de pagamento');
  for (const [i, p] of payments.entries()) {
    const method = toCashMethod(p?.method);
    if (!method) throw new CashRuleError(`Pagamento ${i + 1}: forma de pagamento inválida`);
    receipts[method] += parseAmountCents(p?.amount, `Pagamento ${i + 1}`);
  }
  const paidCents = CASH_METHODS.reduce((sum, m) => sum + receipts[m], 0);
  if (totalCents > 0 && paidCents === 0) throw new CashRuleError('Informe as formas de pagamento');
  if (paidCents < totalCents) throw new CashRuleError(`Faltam ${brl(totalCents - paidCents)} para fechar a conta`);
  const nonCash = paidCents - receipts.CASH;
  if (nonCash > totalCents) throw new CashRuleError('Cartão, PIX e outros não podem passar do total: troco só em dinheiro');
  const changeCents = paidCents - totalCents;
  const primaryMethod = CASH_METHODS.reduce((best, m) => (receipts[m] > receipts[best] ? m : best), 'CASH' as CashMethod);
  return { receipts, changeCents, paidCents, primaryMethod };
}

export type EntryType = 'RECEIPT' | 'CHANGE' | 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE' | 'REFUND' | 'ADJUSTMENT';
export interface EntryLike {
  type: EntryType;
  method: CashMethod;
  amountCents: number;
  direction?: 'IN' | 'OUT' | null;
  orderSessionId?: string | null;
}

/** Signed effect of a ledger line on its method's expected amount (spec rule 4). */
export function entryEffect(entry: EntryLike): number {
  switch (entry.type) {
    case 'RECEIPT':
    case 'SUPPLY':
      return entry.amountCents;
    case 'CHANGE':
    case 'WITHDRAWAL':
    case 'EXPENSE':
    case 'REFUND':
      return -entry.amountCents;
    case 'ADJUSTMENT':
      if (entry.direction === 'IN') return entry.amountCents;
      if (entry.direction === 'OUT') return -entry.amountCents;
      throw new CashRuleError('Ajuste sem direção (entrada ou saída)');
  }
}

export function expectedByMethod(openingFloatCents: number, entries: EntryLike[]): ByMethod {
  const out = emptyByMethod();
  out.CASH = openingFloatCents;
  for (const e of entries) out[e.method] += entryEffect(e);
  return out;
}

export function differenceByMethod(counted: ByMethod, expected: ByMethod): ByMethod {
  const out = emptyByMethod();
  for (const m of CASH_METHODS) out[m] = (counted[m] ?? 0) - (expected[m] ?? 0);
  return out;
}

export const ALERT_MIN_CENTS = 2000;
export const ALERT_RATIO = 0.02;
export const FORGOTTEN_SHIFT_HOURS = 16;
export const EXPENSE_CATEGORIES = ['compras', 'entregador', 'outros'] as const;

export function exceedsAlert(expectedCents: number, differenceCents: number): boolean {
  const threshold = Math.max(ALERT_MIN_CENTS, Math.round(Math.abs(expectedCents) * ALERT_RATIO));
  return Math.abs(differenceCents) > threshold;
}

export function methodsOverAlert(expected: ByMethod, difference: ByMethod): CashMethod[] {
  return CASH_METHODS.filter((m) => exceedsAlert(expected[m] ?? 0, difference[m] ?? 0));
}

export const DENOMINATIONS_CENTS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5];

/** Optional note-and-coin calculator of the blind close. Keys are denominations in cents. */
export function countCash(counts: Record<string, number>): number {
  let total = 0;
  for (const [key, qty] of Object.entries(counts ?? {})) {
    const denom = Number(key);
    if (!DENOMINATIONS_CENTS.includes(denom)) throw new CashRuleError(`Cédula ou moeda inválida: ${key}`);
    if (!Number.isInteger(qty) || qty < 0) throw new CashRuleError('Quantidade inválida');
    total += denom * qty;
  }
  return total;
}

export interface SalesSummary { byMethod: ByMethod; salesCount: number; totalCents: number; averageTicketCents: number }

/** What the shift sold: receipts minus change and refunds of sales, per method; a sale is a comanda. */
export function salesSummary(entries: EntryLike[]): SalesSummary {
  const byMethod = emptyByMethod();
  const sales = new Set<string>();
  for (const e of entries) {
    if (!e.orderSessionId) continue;
    if (e.type === 'RECEIPT') {
      byMethod[e.method] += e.amountCents;
      sales.add(e.orderSessionId);
    } else if (e.type === 'CHANGE' || e.type === 'REFUND') {
      byMethod[e.method] -= e.amountCents;
    }
  }
  const totalCents = CASH_METHODS.reduce((s, m) => s + byMethod[m], 0);
  const salesCount = sales.size;
  return { byMethod, salesCount, totalCents, averageTicketCents: salesCount ? Math.round(totalCents / salesCount) : 0 };
}
