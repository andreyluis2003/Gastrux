// @ts-nocheck
/**
 * Safely coerce Prisma Decimal / string / number inputs to a finite number.
 * Prisma's Decimal fields serialize to strings over JSON, so client-side
 * consumers must normalize before any numeric operation (e.g. .toFixed).
 */
function toSafeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  // Prisma.Decimal or other objects exposing toNumber / valueOf
  if (typeof value === 'object') {
    const v = value as { toNumber?: () => number; valueOf?: () => unknown };
    if (typeof v.toNumber === 'function') {
      const n = v.toNumber();
      return Number.isFinite(n) ? n : 0;
    }
    if (typeof v.valueOf === 'function') {
      const n = Number(v.valueOf());
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}

export function formatBRL(value: number | string | null | undefined | unknown): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(toSafeNumber(value));
}

export function formatDate(date: Date | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date));
}

export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(date));
}

export function formatQuantity(value: number | string | null | undefined | unknown, unit?: string): string {
  if (value === null || value === undefined) return '0';
  const formatted = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toSafeNumber(value));
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Public helper to normalize Prisma Decimal / string / number inputs to a
 * finite number. Useful when client components receive Decimal fields over
 * the JSON API and need to perform arithmetic.
 */
export function toNumber(value: unknown): number {
  return toSafeNumber(value);
}
