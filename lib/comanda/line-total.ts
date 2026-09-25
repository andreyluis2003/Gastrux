/**
 * What one comanda (table tab) line costs. A modifier's surcharge applies to EACH unit of the line:
 * 2 burgers with extra cheese (+3.00) cost 2 x (30.00 + 3.00) = 66.00 (owner's rule, 2026-09-24; the
 * surcharge used to be added once per line). One shared function so the PIX amount, the comanda
 * screen and the revenue reports can never disagree.
 *
 * Works in INTEGER CENTS: every Decimal is rounded to cents once and the integers are combined,
 * instead of accumulating floats. Pure (no I/O), safe to import from the browser.
 */
export function toCents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

export function lineTotalCents(price: unknown, quantity: number, adjustments: unknown[] = []): number {
  const perUnit = toCents(price) + adjustments.reduce<number>((sum, adj) => sum + toCents(adj), 0);
  return perUnit * quantity;
}

/** The same total in reais, for screens and reports. */
export function lineTotal(price: unknown, quantity: number, adjustments: unknown[] = []): number {
  return lineTotalCents(price, quantity, adjustments) / 100;
}
