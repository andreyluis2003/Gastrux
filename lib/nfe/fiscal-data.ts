/**
 * Fiscal data of each NFC-e item (owner decision 2026-09-25, launch plan item 3).
 *
 * Every item used to go out as NCM 21069090 / CFOP 5102 / CSOSN 102, whatever the product (a soft
 * drink, a beer, a dish...), which is how a restaurant gets fined. Now each product (recipe) carries
 * its own data, set by the accountant, with restaurant-wide defaults for what is not filled in, and
 * nothing is ever guessed: when an item has no valid data the note is NOT issued (no number is
 * used) and the manager is told which products to fix.
 *
 * Scope: Simples Nacional (CRT 1 and 2) with the CSOSN codes an NFC-e can carry without extra tax
 * values. Regime Normal (CRT 3) needs ICMS rates and bases per product, not modelled yet: refused
 * with a clear message instead of a wrong note.
 */

export interface ProductFiscalFields {
  fiscalNcm?: string | null;
  fiscalCest?: string | null;
  fiscalCfop?: string | null;
  fiscalOrigin?: string | null;
  fiscalCsosn?: string | null;
}

export interface RestaurantFiscalDefaults {
  crt?: string | null;
  defaultNcm?: string | null;
  defaultCfop?: string | null;
  defaultOrigin?: string | null;
  defaultCsosn?: string | null;
}

export interface ItemFiscalData {
  ncm: string;
  cest?: string;
  cfop: string;
  origin: string;
  csosn: string;
}

/** CSOSN codes accepted on an NFC-e item here (101/201/900 need credit or tax values not modelled). */
export const SUPPORTED_CSOSN = ['102', '103', '300', '400', '500'] as const;
/** CSOSN codes of items under ICMS substitution (ST): they need a CEST. */
export const ST_CSOSN = ['201', '202', '203', '500'];

export const ORIGIN_LABELS: Record<string, string> = {
  '0': '0 - Nacional',
  '1': '1 - Estrangeira (importação direta)',
  '2': '2 - Estrangeira (mercado interno)',
  '3': '3 - Nacional, conteúdo importado > 40%',
  '4': '4 - Nacional, processos básicos',
  '5': '5 - Nacional, conteúdo importado ≤ 40%',
  '6': '6 - Estrangeira sem similar (importação direta)',
  '7': '7 - Estrangeira sem similar (mercado interno)',
  '8': '8 - Nacional, conteúdo importado > 70%',
};

const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');

/** Checks the fields a manager saves on a product. Returns the problems (empty when valid). */
export function validateProductFiscalFields(input: ProductFiscalFields): string[] {
  const problems: string[] = [];
  const ncm = digits(input.fiscalNcm);
  const cest = digits(input.fiscalCest);
  const cfop = digits(input.fiscalCfop);
  if (input.fiscalNcm && ncm.length !== 8) problems.push('NCM deve ter 8 dígitos');
  if (input.fiscalCest && cest.length !== 7) problems.push('CEST deve ter 7 dígitos');
  if (input.fiscalCfop && !/^5\d{3}$/.test(cfop)) problems.push('CFOP de NFC-e deve ter 4 dígitos e começar com 5 (venda dentro do estado)');
  if (input.fiscalOrigin && !/^[0-8]$/.test(String(input.fiscalOrigin))) problems.push('Origem deve ser de 0 a 8');
  if (input.fiscalCsosn && !(SUPPORTED_CSOSN as readonly string[]).includes(String(input.fiscalCsosn))) {
    problems.push(`CSOSN ${input.fiscalCsosn} não suportado na NFC-e (use ${SUPPORTED_CSOSN.join(', ')})`);
  }
  return problems;
}

/** The fields to store (digits only, empty as null). */
export function normalizeProductFiscalFields(input: ProductFiscalFields) {
  const clean = (v: unknown, onlyDigits = true) => {
    const s = onlyDigits ? digits(v) : String(v ?? '').trim();
    return s ? s : null;
  };
  return {
    fiscalNcm: clean(input.fiscalNcm),
    fiscalCest: clean(input.fiscalCest),
    fiscalCfop: clean(input.fiscalCfop),
    fiscalOrigin: clean(input.fiscalOrigin),
    fiscalCsosn: clean(input.fiscalCsosn),
  };
}

export type FiscalResolution =
  | { ok: true; items: ItemFiscalData[] }
  | { ok: false; reason: string; products: string[] };

/**
 * The fiscal data of each item of a note: the product's own data, else the restaurant default.
 * Refuses (with the list of products to fix) instead of inventing any value.
 */
export function resolveItemsFiscalData(
  config: RestaurantFiscalDefaults,
  products: Array<{ name: string } & ProductFiscalFields>
): FiscalResolution {
  const crt = String(config.crt ?? '1');
  if (crt === '3') {
    return {
      ok: false,
      reason: 'Regime Normal (CRT 3) ainda não é suportado na emissão automática: fale com o suporte antes de emitir.',
      products: [],
    };
  }

  const bad: string[] = [];
  const items: ItemFiscalData[] = [];
  for (const product of products) {
    const ncm = digits(product.fiscalNcm || config.defaultNcm);
    const cfop = digits(product.fiscalCfop || config.defaultCfop);
    const origin = String(product.fiscalOrigin || config.defaultOrigin || '');
    const csosn = String(product.fiscalCsosn || config.defaultCsosn || '');
    const cest = digits(product.fiscalCest);
    const valid =
      ncm.length === 8 &&
      /^5\d{3}$/.test(cfop) &&
      /^[0-8]$/.test(origin) &&
      (SUPPORTED_CSOSN as readonly string[]).includes(csosn) &&
      (!ST_CSOSN.includes(csosn) || cest.length === 7);
    if (!valid) {
      if (!bad.includes(product.name)) bad.push(product.name);
      continue;
    }
    items.push({ ncm, cfop, origin, csosn, ...(cest ? { cest } : {}) });
  }

  if (bad.length > 0) {
    return {
      ok: false,
      reason: `Dados fiscais incompletos ou inválidos (NCM, CFOP, origem, CSOSN e, com substituição tributária, CEST): ${bad.join(', ')}. Peça ao contador para completar o cadastro do produto ou os padrões do restaurante.`,
      products: bad,
    };
  }
  return { ok: true, items };
}
