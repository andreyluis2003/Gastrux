import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';

/**
 * Food label rules (spec 2026-10-09 etiquetas, RDC 216). Pure: no I/O, unit-tested in
 * __tests__/unit/label-rules.test.ts.
 */

export type Storage = 'AMBIENT' | 'CHILLED' | 'FROZEN';
export const STORAGES: Storage[] = ['AMBIENT', 'CHILLED', 'FROZEN'];
export const STORAGE_LABEL: Record<Storage, string> = { AMBIENT: 'Ambiente', CHILLED: 'Refrigerado', FROZEN: 'Congelado' };
export const LABEL_SIZES = ['60x40', '40x25'] as const;
export type LabelSize = (typeof LABEL_SIZES)[number];

export interface ShelfLife {
  shelfLifeAmbientDays: number | null;
  shelfLifeChilledDays: number | null;
  shelfLifeFrozenDays: number | null;
}

const FIELD: Record<Storage, keyof ShelfLife> = {
  AMBIENT: 'shelfLifeAmbientDays',
  CHILLED: 'shelfLifeChilledDays',
  FROZEN: 'shelfLifeFrozenDays',
};

export function daysFor(item: ShelfLife, storage: Storage): number | null {
  const v = item[FIELD[storage]];
  return v === null || v === undefined ? null : v;
}

export function storagesOf(item: ShelfLife): Storage[] {
  return STORAGES.filter((s) => daysFor(item, s) !== null);
}

export const shelfLifeField = (storage: Storage) => FIELD[storage];

/**
 * 0 days = "consumir no dia": valid until 23:59 of the preparation day in Brasília (a label printed
 * at 23:30 must not get the next day, as a UTC day would). N days = N x 24 h after the preparation.
 */
export function computeExpiry(preparedAt: Date, days: number): Date {
  if (days === 0) {
    const day = brtDay(preparedAt);
    const next = new Date(Date.parse(`${day}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);
    return new Date(brtDayStart(next).getTime() - 60_000);
  }
  return new Date(preparedAt.getTime() + days * 864e5);
}

/** Shelf life typed on a recipe or ingredient: empty = not applicable; integer 0 to 365 */
export function parseShelfLifeDays(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error('Validade em dias: número inteiro de 0 a 365');
  return n;
}

/** The shelf life fields sent by a recipe or ingredient form; only the ones present (throws on invalid) */
export function shelfLifeFromBody(body: Record<string, unknown>): Partial<ShelfLife> {
  const out: Partial<ShelfLife> = {};
  for (const f of ['shelfLifeAmbientDays', 'shelfLifeChilledDays', 'shelfLifeFrozenDays'] as const) {
    if (body[f] !== undefined) out[f] = parseShelfLifeDays(body[f]);
  }
  return out;
}
