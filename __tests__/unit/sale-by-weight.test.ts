/**
 * Venda por peso (spec 2026-10-25 venda-por-peso): the typed weight, the line price and how a line
 * shows and counts.
 */
import { kgLabel, lineUnits, parseWeightGrams, quantityLabel, weightLineCents } from '@/lib/comanda/weight';

describe('the weight the cashier types', () => {
  it('reads kg with comma or dot, grams with "g", and a whole number above 50 as grams', () => {
    expect(parseWeightGrams('0,350')).toBe(350);
    expect(parseWeightGrams('0.35')).toBe(350);
    expect(parseWeightGrams('1,2')).toBe(1200);
    expect(parseWeightGrams('2')).toBe(2000);
    expect(parseWeightGrams('350 g')).toBe(350);
    expect(parseWeightGrams('350g')).toBe(350);
    expect(parseWeightGrams('350')).toBe(350);
    expect(parseWeightGrams(' 0,0125 ')).toBe(13);
  });

  it('refuses nothing, zero, letters and more than 50 kg', () => {
    for (const bad of ['', '0', '0,000', 'abc', '-1', '50001', '50001 g', '50,5', '1,2,3']) expect([bad, parseWeightGrams(bad)]).toEqual([bad, null]);
    expect(parseWeightGrams('50')).toBe(50000);
    expect(parseWeightGrams('51')).toBe(51);
  });
});

describe('a line sold by weight', () => {
  it('costs the price per kg times the weight, rounded to the cent', () => {
    expect(weightLineCents(18.9, 350)).toBe(662); // 6.615
    expect(weightLineCents('59.90', 1000)).toBe(5990);
    expect(weightLineCents(42, 125)).toBe(525);
  });

  it('counts kg for stock and reports, units otherwise', () => {
    expect(lineUnits({ quantity: 1, weightGrams: 350 })).toBeCloseTo(0.35);
    expect(lineUnits({ quantity: 3, weightGrams: null })).toBe(3);
    expect(lineUnits({ quantity: 2 })).toBe(2);
  });

  it('shows "0,350 kg" instead of "1x"', () => {
    expect(kgLabel(350)).toBe('0,350 kg');
    expect(kgLabel(1200)).toBe('1,200 kg');
    expect(quantityLabel({ quantity: 1, weightGrams: 350 })).toBe('0,350 kg');
    expect(quantityLabel({ quantity: 2, weightGrams: null })).toBe('2x');
  });
});

describe('the NFC-e line of a comanda line', () => {
  const { nfceQuantityFields } = require('@/lib/nfe/session-line');

  it('a unit line goes in UN with the unit price and modifiers', () => {
    expect(nfceQuantityFields({ quantity: 2, price: '30', modifiers: [{ priceAdjustment: '3' }] })).toEqual({ quantity: 2, unit: 'UN', unitPrice: 33, totalPrice: 66 });
  });

  it('a line by weight goes in KG: the kg, the price per kg and the line value', () => {
    expect(nfceQuantityFields({ quantity: 1, price: '6.62', weightGrams: 350, pricePerKg: '18.9', modifiers: [] })).toEqual({ quantity: 0.35, unit: 'KG', unitPrice: 18.9, totalPrice: 6.62 });
  });
});
