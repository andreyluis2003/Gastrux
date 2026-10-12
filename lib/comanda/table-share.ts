/**
 * Pay at the table (spec 2026-10-10 §5.1): how much one person pays. Pure and client-safe: the server
 * decides the charge with it and the customer's screen shows the same number before asking.
 */
export type ShareMode = 'ALL' | 'EQUAL' | 'AMOUNT';
export const MIN_PART_CENTS = 100;
export const MAX_PEOPLE = 20;

export type ShareResult = { ok: true; cents: number; mode: ShareMode; label: string } | { ok: false; status: 422; error: string };

export function reais(cents: number): string {
  const [int, dec] = (Math.abs(cents) / 100).toFixed(2).split('.');
  return `${cents < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

const refuse = (error: string): ShareResult => ({ ok: false, status: 422, error });

export function shareCents(input: { mode: unknown; people?: unknown; amountCents?: unknown }, bill: { totalCents: number; remainingCents: number }): ShareResult {
  const left = bill.remainingCents;
  if (input.mode === 'ALL') return { ok: true, cents: left, mode: 'ALL', label: 'ALL' };
  if (input.mode === 'EQUAL') {
    const n = input.people;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > MAX_PEOPLE) return refuse('Escolha de 2 a 20 pessoas.');
    return { ok: true, cents: Math.min(Math.ceil(bill.totalCents / n), left), mode: 'EQUAL', label: `EQUAL:${n}` };
  }
  if (input.mode === 'AMOUNT') {
    const c = input.amountCents;
    if (typeof c !== 'number' || !Number.isInteger(c)) return refuse('Informe um valor válido.');
    if (c < MIN_PART_CENTS) return refuse('O valor mínimo é R$ 1,00.');
    if (c > left) return refuse(`O valor passa do que falta pagar (${reais(left)}).`);
    return { ok: true, cents: c, mode: 'AMOUNT', label: 'AMOUNT' };
  }
  return refuse('Escolha como vai pagar.');
}

/** CPF typed for the note: optional; when typed, 11 digits with valid check digits */
export function normalizeCpf(raw: unknown): { ok: true; cpf: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return { ok: true, cpf: null };
  if (typeof raw !== 'string') return { ok: false, error: 'CPF inválido.' };
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return { ok: false, error: 'CPF inválido.' };
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (check(9) !== Number(d[9]) || check(10) !== Number(d[10])) return { ok: false, error: 'CPF inválido.' };
  return { ok: true, cpf: d };
}

/**
 * The random key of one phone at the table (kept in its browser): only letters, digits and -. Never _ or %:
 * the key goes into a `contains` (LIKE) filter, where they are wildcards that would match other phones.
 */
export function isValidPayerKey(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(raw);
}

/**
 * An amount typed by the customer, in cents (NaN when it is not one). The comma is the decimal mark
 * ("1.234,56"); without a comma, one dot followed by 1 or 2 digits is the decimal mark too ("25.50"),
 * since many phone keyboards only offer the dot. Any other dot separates thousands ("1.234").
 */
export function parseReaisCents(text: string): number {
  const t = text.trim().replace(/^R\$\s*/, '');
  if (!/^[\d.,]+$/.test(t)) return NaN;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d+\.\d{1,2}$/.test(t) ? t : t.replace(/\./g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
