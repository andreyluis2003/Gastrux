import { reaisToCents } from './money';

/** One payment typed in the payment panel (Portuguese amount, e.g. "12,50"). */
export interface PanelPayment { method: 'dinheiro' | 'pix' | 'cartao de credito' | 'cartao de debito'; amount: string }

/**
 * Live feedback of the payment panel, with the same rules as settlePayments in lib/caixa/rules.ts
 * (the server decides): payments must cover the total and only cash may go over it (the change).
 */
export function panelState(totalCents: number, payments: PanelPayment[]) {
  let paid = 0;
  let cash = 0;
  for (const p of payments) {
    const c = reaisToCents(p.amount);
    if (c === null) return { paidCents: paid, remainingCents: Math.max(0, totalCents - paid), changeCents: 0, valid: false, error: 'Valor inválido' };
    paid += c;
    if (p.method === 'dinheiro') cash += c;
  }
  if (paid - cash > totalCents) {
    return { paidCents: paid, remainingCents: 0, changeCents: 0, valid: false, error: 'Cartão e PIX não podem passar do total' };
  }
  const remaining = Math.max(0, totalCents - paid);
  return {
    paidCents: paid,
    remainingCents: remaining,
    changeCents: Math.max(0, paid - totalCents),
    valid: remaining === 0 && (payments.length > 0 || totalCents === 0),
    error: null,
  };
}

/** "1.234,50" -> "1234.50", the amount format the API reads. */
export const toApiAmount = (amount: string) => (amount.includes(',') ? amount.replace(/\./g, '').replace(',', '.') : amount.trim());
