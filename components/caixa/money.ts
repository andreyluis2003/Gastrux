export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * "1.234,56" or "10.5" -> cents; null when it is not a positive amount with up to 2 decimals.
 * allowZero: 0 is a valid answer (the opening float of a register with no change).
 */
export function reaisToCents(text: string, opts: { allowZero?: boolean } = {}): number | null {
  let t = String(text ?? '').trim();
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 || (opts.allowZero && cents === 0) ? cents : null;
}
