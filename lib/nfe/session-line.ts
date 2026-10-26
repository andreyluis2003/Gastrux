import { lineTotalCents, toCents } from '@/lib/comanda/line-total';

/**
 * Quantity, unit and values of a comanda line on the NFC-e. A line sold by weight (spec 2026-10-25
 * venda-por-peso) goes in KG: the weighed kg, the price per kg and the value charged on the line (it
 * takes no modifiers). Any other line goes in UN with its modifiers on the unit price.
 */
export function nfceQuantityFields(item: {
  quantity: number;
  price: unknown;
  weightGrams?: number | null;
  pricePerKg?: unknown;
  modifiers: Array<{ priceAdjustment: unknown }>;
}): { quantity: number; unit: string; unitPrice: number; totalPrice: number } {
  if (item.weightGrams) {
    return { quantity: item.weightGrams / 1000, unit: 'KG', unitPrice: Number(item.pricePerKg ?? 0), totalPrice: toCents(item.price) / 100 };
  }
  const adjustments = item.modifiers.map((m) => m.priceAdjustment);
  const unitCents = toCents(item.price) + adjustments.reduce<number>((sum, adj) => sum + toCents(adj), 0);
  return { quantity: item.quantity, unit: 'UN', unitPrice: unitCents / 100, totalPrice: lineTotalCents(item.price, item.quantity, adjustments) / 100 };
}
