/**
 * Pure rules for how a delivery customer may pay. No I/O: importable from the
 * server (order route) and from client components (the payment selector).
 * The server is authoritative; the screen only reflects `DeliveryPaymentOptions`.
 */

export const DELIVERY_PAYMENT_METHODS = [
  'ONLINE_PIX',
  'ONLINE_CARD',
  'CASH',
  'CREDIT_ON_DELIVERY',
  'DEBIT_ON_DELIVERY',
  'VOUCHER_ON_DELIVERY',
] as const;

export type DeliveryPaymentMethod = (typeof DELIVERY_PAYMENT_METHODS)[number];

/** id -> label shown to the customer and on the kitchen note. */
export const VOUCHER_BRANDS: Record<string, string> = {
  VR: 'VR',
  ALELO: 'Alelo',
  SODEXO: 'Sodexo',
  TICKET: 'Ticket',
};
export const VOUCHER_BRAND_IDS: string[] = Object.keys(VOUCHER_BRANDS);

export interface DeliveryPaymentSettingsData {
  acceptCash: boolean;
  acceptCreditOnDelivery: boolean;
  acceptDebitOnDelivery: boolean;
  acceptVoucherOnDelivery: boolean;
  voucherBrands: string[];
}

/** What a restaurant that never configured anything accepts on delivery. */
export const DEFAULT_DELIVERY_PAYMENT_SETTINGS: DeliveryPaymentSettingsData = {
  acceptCash: true,
  acceptCreditOnDelivery: true,
  acceptDebitOnDelivery: true,
  acceptVoucherOnDelivery: false,
  voucherBrands: [],
};

export interface DeliveryPaymentOptions {
  online: { pix: boolean; card: boolean };
  onDelivery: {
    cash: boolean;
    credit: boolean;
    debit: boolean;
    voucher: { enabled: boolean; brands: string[] };
  };
}

export function buildPaymentOptions(
  settings: DeliveryPaymentSettingsData | null,
  hasOnlineConnection: boolean
): DeliveryPaymentOptions {
  const s = settings ?? DEFAULT_DELIVERY_PAYMENT_SETTINGS;
  const brands = s.voucherBrands.filter((id) => VOUCHER_BRAND_IDS.includes(id));
  return {
    online: { pix: hasOnlineConnection, card: hasOnlineConnection },
    onDelivery: {
      cash: s.acceptCash,
      credit: s.acceptCreditOnDelivery,
      debit: s.acceptDebitOnDelivery,
      voucher: { enabled: s.acceptVoucherOnDelivery && brands.length > 0, brands },
    },
  };
}

export function hasAnyPaymentOption(options: DeliveryPaymentOptions): boolean {
  const d = options.onDelivery;
  return options.online.pix || options.online.card || d.cash || d.credit || d.debit || d.voucher.enabled;
}

export interface ValidatedChoice {
  paymentMethod: DeliveryPaymentMethod;
  changeFor: number | null;
  voucherBrand: string | null;
}

export type ValidationResult = { ok: true; choice: ValidatedChoice } | { ok: false; error: string };

/** Largest "troco para" accepted, in R$. Far above any real note, far below the column limit. */
const MAX_CHANGE_FOR = 100_000;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

const UNAVAILABLE = 'Esta forma de pagamento não está disponível neste restaurante';

function accept(paymentMethod: DeliveryPaymentMethod, extra: Partial<ValidatedChoice> = {}): ValidationResult {
  return { ok: true, choice: { paymentMethod, changeFor: null, voucherBrand: null, ...extra } };
}

/**
 * Validates what the customer picked against what the restaurant offers.
 * `total` must be the server-computed order total (subtotal + delivery fee).
 */
export function validatePaymentChoice(
  options: DeliveryPaymentOptions,
  input: { paymentMethod?: unknown; changeFor?: unknown; voucherBrand?: unknown },
  total: number
): ValidationResult {
  const raw = input.paymentMethod;
  if (typeof raw !== 'string' || !DELIVERY_PAYMENT_METHODS.includes(raw as DeliveryPaymentMethod)) {
    return { ok: false, error: 'Escolha a forma de pagamento' };
  }
  const method = raw as DeliveryPaymentMethod;

  switch (method) {
    case 'ONLINE_PIX':
      return options.online.pix ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'ONLINE_CARD':
      return options.online.card ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'CREDIT_ON_DELIVERY':
      return options.onDelivery.credit ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'DEBIT_ON_DELIVERY':
      return options.onDelivery.debit ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'CASH': {
      if (!options.onDelivery.cash) return { ok: false, error: UNAVAILABLE };
      const change = input.changeFor;
      if (change === undefined || change === null || change === '') return accept(method);
      // Only a number or a numeric string: Number(true) === 1 and Number([100]) === 100 must not pass.
      if (typeof change !== 'number' && typeof change !== 'string') return { ok: false, error: 'Valor do troco inválido' };
      const value = round2(Number(change));
      // The cap keeps a hostile value out of the Decimal(12,2) column (a 500 instead of a 400) and the note readable.
      if (!Number.isFinite(value) || value <= 0 || value > MAX_CHANGE_FOR) return { ok: false, error: 'Valor do troco inválido' };
      if (value < round2(total)) {
        return { ok: false, error: 'O valor para troco deve ser maior ou igual ao total do pedido' };
      }
      return accept(method, { changeFor: value });
    }
    case 'VOUCHER_ON_DELIVERY': {
      const voucher = options.onDelivery.voucher;
      if (!voucher.enabled) return { ok: false, error: UNAVAILABLE };
      const brand = typeof input.voucherBrand === 'string' ? input.voucherBrand.trim().toUpperCase() : '';
      if (!voucher.brands.includes(brand)) return { ok: false, error: 'Escolha a bandeira do vale-refeição' };
      return accept(method, { voucherBrand: brand });
    }
  }
}

/** One line for the order notes: the KDS card already shows `Order.specialInstructions`. */
export function describePaymentForKitchen(choice: ValidatedChoice, total: number): string {
  switch (choice.paymentMethod) {
    case 'ONLINE_PIX':
      return 'Pagamento: PIX online';
    case 'ONLINE_CARD':
      return 'Pagamento: cartão online (Mercado Pago)';
    case 'CASH': {
      const change = choice.changeFor === null ? 0 : round2(choice.changeFor - total);
      if (choice.changeFor === null || change <= 0) return 'Pagamento na entrega: dinheiro — sem troco';
      return `Pagamento na entrega: dinheiro — troco para ${brl(choice.changeFor)} (levar ${brl(change)} de troco)`;
    }
    case 'CREDIT_ON_DELIVERY':
      return 'Pagamento na entrega: cartão de crédito (levar maquininha)';
    case 'DEBIT_ON_DELIVERY':
      return 'Pagamento na entrega: cartão de débito (levar maquininha)';
    case 'VOUCHER_ON_DELIVERY': {
      const label = choice.voucherBrand ? VOUCHER_BRANDS[choice.voucherBrand] ?? choice.voucherBrand : '';
      return `Pagamento na entrega: vale-refeição/alimentação ${label} (levar maquininha)`.replace(/\s+\(/, ' (');
    }
  }
}

export function isPayOnDelivery(method: string | null | undefined): boolean {
  return (
    method === 'CASH' ||
    method === 'CREDIT_ON_DELIVERY' ||
    method === 'DEBIT_ON_DELIVERY' ||
    method === 'VOUCHER_ON_DELIVERY'
  );
}

/** Validates the settings a restaurant sends from the admin screen. */
export function parseSettingsInput(
  input: unknown
): { ok: true; data: DeliveryPaymentSettingsData } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Corpo da requisição inválido' };
  const body = input as Record<string, unknown>;

  const flags = ['acceptCash', 'acceptCreditOnDelivery', 'acceptDebitOnDelivery', 'acceptVoucherOnDelivery'] as const;
  for (const key of flags) {
    if (typeof body[key] !== 'boolean') return { ok: false, error: `Campo inválido: ${key}` };
  }
  if (!Array.isArray(body.voucherBrands) || body.voucherBrands.some((b) => typeof b !== 'string')) {
    return { ok: false, error: 'Campo inválido: voucherBrands' };
  }

  const brands: string[] = [];
  for (const raw of body.voucherBrands as string[]) {
    const id = raw.trim().toUpperCase();
    if (!VOUCHER_BRAND_IDS.includes(id)) return { ok: false, error: `Bandeira inválida: ${raw}` };
    if (!brands.includes(id)) brands.push(id);
  }
  if (body.acceptVoucherOnDelivery === true && brands.length === 0) {
    return { ok: false, error: 'Escolha ao menos uma bandeira de vale-refeição' };
  }

  return {
    ok: true,
    data: {
      acceptCash: body.acceptCash as boolean,
      acceptCreditOnDelivery: body.acceptCreditOnDelivery as boolean,
      acceptDebitOnDelivery: body.acceptDebitOnDelivery as boolean,
      acceptVoucherOnDelivery: body.acceptVoucherOnDelivery as boolean,
      voucherBrands: brands,
    },
  };
}
