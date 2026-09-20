/**
 * Pure, client-safe helpers that turn what the customer typed/picked on the
 * delivery screen into the payment fields of the order body. The server
 * (`validatePaymentChoice` in ./choice) stays authoritative; the change rule
 * here mirrors it so the customer gets the message before submitting.
 */
import type { DeliveryPaymentMethod } from './choice';

export interface PaymentChoice {
  method: DeliveryPaymentMethod | null;
  /** Text typed by the customer, "100" or "100,50"; converted with toPaymentPayload before sending. */
  changeFor: string;
  voucherBrand: string;
}

export const EMPTY_PAYMENT_CHOICE: PaymentChoice = { method: null, changeFor: '', voucherBrand: '' };

/** Same cap as the server. */
const MAX_CHANGE_FOR = 100_000;

/** Digits with an optional decimal part of 1-2 digits: rejects "1e3", "0x64", "1.000,00", "-5". */
const CHANGE_FORMAT = /^\d+([.,]\d{1,2})?$/;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export const CHANGE_ERRORS = {
  format: 'Digite o valor do troco só com números, por exemplo 100 ou 100,50',
  positive: 'O valor para troco deve ser maior que zero',
  tooHigh: 'O valor para troco é alto demais',
  belowTotal: 'O valor para troco deve ser maior ou igual ao total do pedido',
} as const;

/**
 * Empty is valid (no change needed). Otherwise strict numeric text, above zero, at most R$ 100.000,
 * and, when `total` is given, not below the order total (rounded to cents), like the server.
 */
export function parseChangeInput(text: string, total?: number): { valid: boolean; value?: number; error?: string } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: true };
  if (!CHANGE_FORMAT.test(trimmed)) return { valid: false, error: CHANGE_ERRORS.format };
  const value = round2(Number(trimmed.replace(',', '.')));
  if (!Number.isFinite(value) || value <= 0) return { valid: false, error: CHANGE_ERRORS.positive };
  if (value > MAX_CHANGE_FOR) return { valid: false, error: CHANGE_ERRORS.tooHigh };
  if (total !== undefined && Number.isFinite(total) && value < round2(total)) {
    return { valid: false, error: CHANGE_ERRORS.belowTotal };
  }
  return { valid: true, value };
}

export interface PaymentPayload {
  paymentMethod: DeliveryPaymentMethod;
  /** CASH only, and only when the customer asked for change. */
  changeFor?: number;
  /** VOUCHER_ON_DELIVERY only. */
  voucherBrand?: string;
}

export type PaymentPayloadResult = { ok: true; payload: PaymentPayload } | { ok: false; error: string };

/**
 * The fields to spread into the order body. `changeFor` and `voucherBrand` are omitted for every
 * method they do not belong to, so a stale value typed under another method never reaches the
 * server nor blocks the order.
 */
export function toPaymentPayload(choice: PaymentChoice, total: number): PaymentPayloadResult {
  const method = choice.method;
  if (!method) return { ok: false, error: 'Escolha a forma de pagamento' };

  if (method === 'CASH') {
    const change = parseChangeInput(choice.changeFor, total);
    if (!change.valid) return { ok: false, error: change.error ?? CHANGE_ERRORS.format };
    return {
      ok: true,
      payload: change.value === undefined ? { paymentMethod: method } : { paymentMethod: method, changeFor: change.value },
    };
  }

  if (method === 'VOUCHER_ON_DELIVERY') {
    const brand = choice.voucherBrand.trim();
    if (!brand) return { ok: false, error: 'Escolha a bandeira do vale-refeição' };
    return { ok: true, payload: { paymentMethod: method, voucherBrand: brand } };
  }

  return { ok: true, payload: { paymentMethod: method } };
}
