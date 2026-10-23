/**
 * Cashback rules (spec docs/superpowers/specs/2026-10-23-cashback-design.md). Pure: no I/O, unit-tested in
 * __tests__/unit/cashback-rules.test.ts. Money in integer cents.
 */

export const CASHBACK_DEFAULTS = { enabled: true, percent: 5, validityMonths: 6, minUseCents: 1000 } as const;

/** DDD + number (10 or 11 digits); a leading country code 55 is dropped. Anything else: null */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  let d = String(raw).replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** "(11) 99999-8888" for showing and for Customer.phone */
export function formatPhone(digits: string): string {
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  return rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/** The credit of a sale: percent of the base, rounded down to the cent */
export function creditCents(baseCents: number, percent: number): number {
  if (!(baseCents > 0) || !(percent > 0)) return 0;
  return Math.floor((baseCents * percent) / 100);
}

export interface OpenCredit { id: string; remainingCents: number; expiresAt: Date; createdAt: Date }

/** Which credits a use spends: the oldest first, expired ones skipped */
export function allocateUse(credits: OpenCredit[], cents: number, now: Date): Array<{ creditId: string; cents: number }> {
  const usable = credits
    .filter((c) => c.remainingCents > 0 && c.expiresAt.getTime() > now.getTime())
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: Array<{ creditId: string; cents: number }> = [];
  let left = cents;
  for (const c of usable) {
    if (left <= 0) break;
    const take = Math.min(c.remainingCents, left);
    out.push({ creditId: c.id, cents: take });
    left -= take;
  }
  if (left > 0) throw new Error('Saldo insuficiente');
  return out;
}

/**
 * A bill discount spread over its items (the NFC-e takes it per item): proportional to each item, rounded
 * down, the rest of the rounding on the items with room left, last first. The sum is the discount.
 */
export function apportionDiscount(itemCents: number[], discountCents: number): number[] {
  const total = itemCents.reduce((s, v) => s + Math.max(0, v), 0);
  const discount = Math.min(Math.max(0, discountCents), total);
  if (discount === 0 || total === 0) return itemCents.map(() => 0);
  const out = itemCents.map((v) => Math.floor((Math.max(0, v) * discount) / total));
  let rest = discount - out.reduce((s, v) => s + v, 0);
  for (let i = itemCents.length - 1; i >= 0 && rest > 0; i--) {
    const room = Math.max(0, itemCents[i]) - out[i];
    const add = Math.min(room, rest);
    out[i] += add;
    rest -= add;
  }
  return out;
}

export type Segment = 'VIP' | 'REGULAR' | 'OCCASIONAL' | 'INACTIVE';

/** CRM segment from the purchases of the last 90 days (spec §4.c) */
export function segmentOf(purchases90d: number): Segment {
  if (purchases90d >= 10) return 'VIP';
  if (purchases90d >= 3) return 'REGULAR';
  if (purchases90d >= 1) return 'OCCASIONAL';
  return 'INACTIVE';
}

export const SEGMENT_LABEL: Record<Segment, string> = { VIP: 'VIP', REGULAR: 'Regular', OCCASIONAL: 'Ocasional', INACTIVE: 'Inativo' };

export interface CashbackSettingsData { enabled: boolean; percent: number; validityMonths: number; minUseCents: number }

const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN);

/** The owner's rule from the Cashback screen: every field, within the limits of the plan's Global Constraints */
export function parseSettings(body: any): { ok: true; data: CashbackSettingsData } | { ok: false; error: string } {
  const percent = num(body?.percent);
  const validityMonths = num(body?.validityMonths);
  const minUseCents = num(body?.minUseCents);
  if (!Number.isFinite(percent) || percent < 0.5 || percent > 30) return { ok: false, error: 'O percentual vai de 0,5% a 30%' };
  if (!Number.isInteger(validityMonths) || validityMonths < 1 || validityMonths > 24) return { ok: false, error: 'A validade vai de 1 a 24 meses' };
  if (!Number.isInteger(minUseCents) || minUseCents < 0 || minUseCents > 100000) return { ok: false, error: 'O mínimo para usar vai de R$ 0 a R$ 1.000' };
  if (typeof body?.enabled !== 'boolean') return { ok: false, error: 'Informe se o cashback está ligado' };
  return { ok: true, data: { enabled: body.enabled, percent: Math.round(percent * 100) / 100, validityMonths, minUseCents } };
}
