/**
 * Payment methods of the cash register (spec §4.2). The API and the NFC-e use the Portuguese strings
 * ("dinheiro", "cartao de credito"...); the database uses the CashMethod enum; counted / expected
 * amounts are stored as JSON keyed by "dinheiro", "pix", "credito", "debito", "outros".
 */
export type CashMethod = 'CASH' | 'PIX' | 'CREDIT' | 'DEBIT' | 'OTHER';
export type MethodKey = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros';
export type ByMethod = Record<CashMethod, number>;
export type Keyed = Record<MethodKey, number>;

export const CASH_METHODS: CashMethod[] = ['CASH', 'PIX', 'CREDIT', 'DEBIT', 'OTHER'];

export const METHOD_KEY: Record<CashMethod, MethodKey> = {
  CASH: 'dinheiro', PIX: 'pix', CREDIT: 'credito', DEBIT: 'debito', OTHER: 'outros',
};

export const METHOD_LABEL: Record<CashMethod, string> = {
  CASH: 'Dinheiro', PIX: 'PIX', CREDIT: 'Cartão de crédito', DEBIT: 'Cartão de débito', OTHER: 'Outros',
};

const NFCE: Record<CashMethod, string> = {
  CASH: 'dinheiro', PIX: 'pix', CREDIT: 'cartao de credito', DEBIT: 'cartao de debito', OTHER: 'outros',
};

const ALIASES: Record<string, CashMethod> = {
  dinheiro: 'CASH', cash: 'CASH',
  pix: 'PIX',
  'cartao de credito': 'CREDIT', credito: 'CREDIT', credit: 'CREDIT',
  'cartao de debito': 'DEBIT', debito: 'DEBIT', debit: 'DEBIT',
  outros: 'OTHER', other: 'OTHER',
};

export function toCashMethod(input: unknown): CashMethod | null {
  const key = String(input ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ALIASES[key] ?? null;
}

export function toNfcePaymentMethod(method: CashMethod): string {
  return NFCE[method];
}

export function emptyByMethod(): ByMethod {
  return { CASH: 0, PIX: 0, CREDIT: 0, DEBIT: 0, OTHER: 0 };
}

export function toKeyed(values: ByMethod): Keyed {
  return Object.fromEntries(CASH_METHODS.map((m) => [METHOD_KEY[m], values[m] ?? 0])) as Keyed;
}

export function fromKeyed(values: Partial<Record<MethodKey, unknown>>, parse: (v: unknown) => number): ByMethod {
  const out = emptyByMethod();
  for (const m of CASH_METHODS) out[m] = parse(values?.[METHOD_KEY[m]] ?? 0);
  return out;
}
