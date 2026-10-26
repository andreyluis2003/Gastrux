/**
 * Venda por peso (spec docs/superpowers/specs/2026-10-25-venda-por-peso-design.md). A line sold by
 * weight keeps quantity 1 and its price is the price of the whole line, so every total that already
 * exists stays right; the weight drives stock, the NFC-e, the screens and the reports.
 * Pure (no I/O), safe to import from the browser.
 */

export const MAX_WEIGHT_GRAMS = 50_000;

/**
 * The weight the cashier typed, in grams: "0,350" or "0.35" (kg), "350 g", or a whole number above 50
 * read as grams (nobody sells 350 kg at the counter). null when it is not a weight from 1 g to 50 kg.
 */
export function parseWeightGrams(input: unknown): number | null {
  const text = String(input ?? '').trim().toLowerCase().replace(/\s+/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(g|kg)?$/.exec(text);
  if (!m) return null;
  const value = Number(m[1].replace(',', '.'));
  const grams = m[2] === 'g' || (!m[2] && /^\d+$/.test(m[1]) && value > 50) ? value : value * 1000;
  const rounded = Math.round(grams);
  return rounded >= 1 && rounded <= MAX_WEIGHT_GRAMS ? rounded : null;
}

/** What a line by weight costs: price per kg in cents × grams / 1000, rounded to the cent */
export function weightLineCents(pricePerKg: unknown, grams: number): number {
  return Math.round((Math.round(Number(pricePerKg ?? 0) * 100) * grams) / 1000);
}

/** Units of a line for stock and reports: kg for a line by weight (its ficha describes 1 kg) */
export function lineUnits(line: { quantity: number; weightGrams?: number | null }): number {
  return line.weightGrams ? line.weightGrams / 1000 : line.quantity;
}

export function kgLabel(grams: number): string {
  return `${(grams / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;
}

/** "0,350 kg" for a line by weight, "2x" otherwise */
export function quantityLabel(line: { quantity: number; weightGrams?: number | null }): string {
  return line.weightGrams ? kgLabel(line.weightGrams) : `${line.quantity}x`;
}
