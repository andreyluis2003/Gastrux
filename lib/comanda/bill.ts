import { CASH_METHODS, emptyByMethod, toCashMethod, type CashMethod } from '@/lib/caixa/payment-methods';
import { CashRuleError, entryEffect, parseAmountCents, type PaymentInput, type SettledPayment } from '@/lib/caixa/rules';

/**
 * Money rules of the bill (spec 2026-10-07, 4.3), pure and in integer cents.
 */

// Plain space after "R$" (toLocaleString uses a non-breaking one)
const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

/**
 * Service charge only for comandas opened as a table or a named comanda (Vender, QR): never WhatsApp,
 * delivery or the counter, which may also carry a customer name (review of stage 2, 2026-10-08)
 */
export function serviceApplies(s: { serviceChargeEligible?: boolean | null }): boolean {
  return !!s.serviceChargeEligible;
}

export function billTotals(subtotalCents: number, percent: number, opts: { applies: boolean; waived: boolean }) {
  const serviceCents = opts.applies && !opts.waived && percent > 0 ? Math.round((subtotalCents * percent) / 100) : 0;
  return { subtotalCents, serviceCents, totalCents: subtotalCents + serviceCents };
}

/** What the cash register holds for this bill: receipts, minus change given back, minus refunds */
export function paidNetCents(entries: Array<{ type: string; method: string; amountCents: number; direction?: 'IN' | 'OUT' | null }>): number {
  return entries.reduce((sum, e) => sum + entryEffect(e as Parameters<typeof entryEffect>[0]), 0);
}

export function splitEqually(totalCents: number, people: number): number[] {
  if (!Number.isInteger(people) || people < 2 || people > 20) throw new CashRuleError('Divida entre 2 e 20 pessoas');
  const base = Math.floor(totalCents / people);
  return Array.from({ length: people }, (_, i) => (i === people - 1 ? totalCents - base * (people - 1) : base));
}

/**
 * The next equal share to receive: one share, or what is left when it is the last one (it carries the
 * leftover cent), so a split never leaves R$ 0,01 open (review of stage 2)
 */
export function nextEqualShare(totalCents: number, remainingCents: number, people: number): number {
  const shares = splitEqually(totalCents, people);
  if (remainingCents <= shares[shares.length - 1]) return remainingCents;
  return Math.min(remainingCents, shares[0]);
}

/** One person's part when splitting by item: their items plus the same share of the service charge */
export function shareForItems(selectedCents: number, subtotalCents: number, serviceCents: number): number {
  if (subtotalCents <= 0) return selectedCents;
  return selectedCents + Math.round((serviceCents * selectedCents) / subtotalCents);
}

/**
 * One payment towards what is left (spec 4.3): it may be a part; only cash may go over what is left,
 * and the excess is the change. Card, PIX and others never go over (nothing to give back).
 */
export function settlePartial(remainingCents: number, payments: PaymentInput[]): SettledPayment {
  if (remainingCents <= 0) throw new CashRuleError('Esta conta já está paga', 422, 'ALREADY_PAID');
  if (!Array.isArray(payments) || payments.length === 0) throw new CashRuleError('Informe as formas de pagamento');
  const receipts = emptyByMethod();
  for (const [i, p] of payments.entries()) {
    const method = toCashMethod(p?.method);
    if (!method) throw new CashRuleError(`Pagamento ${i + 1}: forma de pagamento inválida`);
    receipts[method] += parseAmountCents(p?.amount, `Pagamento ${i + 1}`);
  }
  const paidCents = CASH_METHODS.reduce((sum, m) => sum + receipts[m], 0);
  const nonCash = paidCents - receipts.CASH;
  if (nonCash > remainingCents) {
    throw new CashRuleError(`Cartão, PIX e outros não podem passar do que falta (${brl(remainingCents)}): troco só em dinheiro`);
  }
  const changeCents = Math.max(0, paidCents - remainingCents);
  const primaryMethod = CASH_METHODS.reduce((best, m) => (receipts[m] > receipts[best] ? m : best), 'CASH' as CashMethod);
  return { receipts, changeCents, paidCents, primaryMethod };
}
