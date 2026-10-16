/**
 * The daily count arithmetic (spec 2026-10-16 contagem de espetos, 4.3 to 4.5), no database:
 * opening + mounted − sold − loss = expected; at the close, difference = counted − expected.
 */

export class DailyCountError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type EntryKind = 'OPENING' | 'MOUNTED' | 'LOSS';
export type Totals = Record<string, { opening: number; mounted: number; loss: number }>;

export interface CountRow {
  recipeId: string;
  name: string;
  opening: number;
  mounted: number;
  sold: number;
  loss: number;
  expected: number;
}

export interface ClosedRow extends CountRow {
  counted: number;
  difference: number;
}

const FIELD: Record<EntryKind, 'opening' | 'mounted' | 'loss'> = { OPENING: 'opening', MOUNTED: 'mounted', LOSS: 'loss' };

export function entryTotals(entries: { recipeId: string; kind: EntryKind; quantity: number }[]): Totals {
  const out: Totals = {};
  for (const e of entries) {
    const t = (out[e.recipeId] ??= { opening: 0, mounted: 0, loss: 0 });
    t[FIELD[e.kind]] += e.quantity;
  }
  return out;
}

export function buildRows(items: { recipeId: string; name: string }[], totals: Totals, sold: Record<string, number>): CountRow[] {
  return items
    .map(({ recipeId, name }) => {
      const t = totals[recipeId] ?? { opening: 0, mounted: 0, loss: 0 };
      const s = sold[recipeId] ?? 0;
      return { recipeId, name, opening: t.opening, mounted: t.mounted, sold: s, loss: t.loss, expected: t.opening + t.mounted - s - t.loss };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

const MAX = 100000;

/** Whole number above zero (a tap or a typed quantity) */
export function parseQuantity(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > MAX) throw new DailyCountError('Quantidade inválida');
  return n;
}

export function closeRows(rows: CountRow[], counts: { recipeId: string; counted: unknown }[]): ClosedRow[] {
  const byId = new Map<string, number>();
  for (const c of counts) {
    if (!rows.some((r) => r.recipeId === c.recipeId)) throw new DailyCountError('Um item enviado não está na contagem desta noite');
    const n = typeof c.counted === 'string' && c.counted.trim() !== '' ? Number(c.counted) : c.counted;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX) throw new DailyCountError('Contagem inválida');
    byId.set(c.recipeId, n);
  }
  const missing = rows.filter((r) => !byId.has(r.recipeId));
  if (missing.length) throw new DailyCountError(`Conte todos os itens: falta ${missing.map((r) => r.name).join(', ')}`);
  return rows.map((r) => {
    const counted = byId.get(r.recipeId)!;
    return { ...r, counted, difference: counted - r.expected };
  });
}

export const LOSS_REASONS = ['Caiu', 'Queimou', 'Venceu', 'Outro'] as const;

export function lossReason(reason: unknown, note: unknown): string {
  if (typeof reason !== 'string' || !(LOSS_REASONS as readonly string[]).includes(reason)) throw new DailyCountError('Motivo inválido');
  if (reason !== 'Outro') return reason;
  const text = typeof note === 'string' ? note.trim() : '';
  if (!text) throw new DailyCountError('Diga o motivo da perda');
  return `Outro: ${text.slice(0, 200)}`;
}
