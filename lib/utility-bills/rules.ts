/**
 * Contas de consumo rules (spec 2026-10-16, 4.1 to 4.4), no database: months, parsing, indicators,
 * the 20% alert and its text.
 */

export type UtilityKind = 'ENERGY' | 'WATER' | 'PIPED_GAS' | 'BOTTLED_GAS' | 'PHONE_INTERNET' | 'OTHER';

export const KIND_INFO: Record<UtilityKind, { label: string; unit: string | null }> = {
  ENERGY: { label: 'Energia', unit: 'kWh' },
  WATER: { label: 'Água', unit: 'm³' },
  PIPED_GAS: { label: 'Gás encanado', unit: 'm³' },
  BOTTLED_GAS: { label: 'Gás de botijão', unit: 'botijões' },
  PHONE_INTERNET: { label: 'Telefone/Internet', unit: null },
  OTHER: { label: 'Outra conta', unit: null },
};

export class UtilityError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const YM = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const currentMonth = (now = new Date()) => new Date(now.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 7);

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export const monthDate = (ym: string) => new Date(`${ym}-01T00:00:00.000Z`);
export const monthOf = (d: Date) => d.toISOString().slice(0, 7);
export const monthLabel = (ym: string) =>
  monthDate(ym).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const monthName = (ym: string) => monthDate(ym).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long' });

export function parseMonth(v: unknown, now = new Date()): string {
  if (typeof v !== 'string' || !YM.test(v)) throw new UtilityError('Mês de referência inválido');
  if (v > currentMonth(now)) throw new UtilityError('O mês de referência não pode ser futuro');
  return v;
}

/** A Brazilian or plain decimal: "1.240,50", "1240.5", 1240 */
function parseDecimal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || v.trim() === '') return NaN;
  const s = v.trim();
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

export function parseAmountCents(v: unknown): number {
  const n = parseDecimal(v);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) throw new UtilityError('Valor inválido');
  return Math.round(n * 100);
}

export function parseConsumption(v: unknown, kind: UtilityKind): number | null {
  const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  if (!KIND_INFO[kind].unit) {
    if (!empty) throw new UtilityError('Esta conta não tem consumo');
    return null;
  }
  if (empty) throw new UtilityError(`Informe o consumo em ${KIND_INFO[kind].unit}`);
  // "1.380" means one thousand three hundred eighty on a Brazilian bill
  const n = typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(v.trim()) ? Number(v.trim().replace(/\./g, '')) : parseDecimal(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) throw new UtilityError('Consumo inválido');
  return Math.round(n * 1000) / 1000;
}

export type BillPoint = { amountCents: number; consumption: number | null };

export interface Indicators {
  measure: number;
  prev: { measurePct: number; amountPct: number } | null;
  avg3: { average: number; pct: number; months: number } | null;
  yearAgo: { measurePct: number } | null;
  unitPrice: { now: number; prev: number | null } | null;
  revenuePct: number | null;
  missing: string[];
}

export const measure = (kind: UtilityKind, b: BillPoint) => (KIND_INFO[kind].unit ? Number(b.consumption ?? 0) : b.amountCents);
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const unitPriceOf = (kind: UtilityKind, b: BillPoint | undefined) =>
  b && KIND_INFO[kind].unit && b.consumption ? b.amountCents / 100 / b.consumption : null;

export function indicators(kind: UtilityKind, ym: string, bills: Record<string, BillPoint>, salesCents: number | null): Indicators {
  const cur = bills[ym];
  const m = measure(kind, cur);
  const prevBill = bills[addMonths(ym, -1)];
  const window = [1, 2, 3].map((i) => addMonths(ym, -i));
  const present = window.filter((k) => bills[k]);
  const average = present.length ? present.reduce((s, k) => s + measure(kind, bills[k]), 0) / present.length : 0;
  const yearAgoBill = bills[addMonths(ym, -12)];
  const now = unitPriceOf(kind, cur);
  return {
    measure: m,
    prev: prevBill && measure(kind, prevBill) > 0
      ? { measurePct: pct(m, measure(kind, prevBill)), amountPct: pct(cur.amountCents, prevBill.amountCents) }
      : null,
    avg3: present.length >= 2 && average > 0 ? { average, pct: pct(m, average), months: present.length } : null,
    yearAgo: yearAgoBill && measure(kind, yearAgoBill) > 0 ? { measurePct: pct(m, measure(kind, yearAgoBill)) } : null,
    unitPrice: now === null ? null : { now, prev: unitPriceOf(kind, prevBill) },
    revenuePct: salesCents && salesCents > 0 ? (cur.amountCents / salesCents) * 100 : null,
    missing: window.filter((k) => !bills[k]),
  };
}

export const shouldAlert = (ind: Indicators) => ind.avg3 !== null && ind.measure > ind.avg3.average * 1.2;

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

export function alertText(name: string, kind: UtilityKind, ym: string, ind: Indicators) {
  const month = monthName(ym);
  const p = Math.round(ind.avg3?.pct ?? 0);
  const unit = KIND_INFO[kind].unit;
  const message = unit
    ? `${name} de ${month}: consumo ${p}% acima da média (${ind.measure.toLocaleString('pt-BR')} ${unit}). Confira vazamento ou equipamento ligado.`
    : `${name} de ${month}: valor ${p}% acima da média (${brl(ind.measure)}).`;
  return { title: `${name} de ${month} acima da média`, message };
}
