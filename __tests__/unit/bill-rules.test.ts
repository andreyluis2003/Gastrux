import { billTotals, paidNetCents, serviceApplies, settlePartial, shareForItems, splitEqually } from '../../lib/comanda/bill';

describe('service charge', () => {
  it('tables and named comandas only', () => {
    expect(serviceApplies({ tableId: 't1' })).toBe(true);
    expect(serviceApplies({ tableNumber: 4 })).toBe(true);
    expect(serviceApplies({ customerName: 'João' })).toBe(true);
    expect(serviceApplies({})).toBe(false);
  });
  it('10% rounded to the cent; waived, off (0%) or not applicable = no charge', () => {
    expect(billTotals(23_995, 10, { applies: true, waived: false })).toEqual({ subtotalCents: 23_995, serviceCents: 2_400, totalCents: 26_395 });
    expect(billTotals(23_995, 10, { applies: true, waived: true }).serviceCents).toBe(0);
    expect(billTotals(23_995, 0, { applies: true, waived: false }).serviceCents).toBe(0);
    expect(billTotals(23_995, 10, { applies: false, waived: false }).serviceCents).toBe(0);
  });
});

describe('paid so far', () => {
  it('receipts minus change minus refunds', () => {
    expect(paidNetCents([
      { type: 'RECEIPT', method: 'CASH', amountCents: 5_000 },
      { type: 'CHANGE', method: 'CASH', amountCents: 380 },
      { type: 'RECEIPT', method: 'PIX', amountCents: 2_000 },
      { type: 'REFUND', method: 'PIX', amountCents: 2_000 },
    ])).toBe(4_620);
  });
});

describe('split', () => {
  it('equally: the last one takes the leftover cent', () => {
    expect(splitEqually(10_000, 3)).toEqual([3_333, 3_333, 3_334]);
    expect(splitEqually(10_000, 3).reduce((a, b) => a + b, 0)).toBe(10_000);
  });
  it('2 to 20 people only', () => {
    expect(() => splitEqually(10_000, 1)).toThrow();
    expect(() => splitEqually(10_000, 21)).toThrow();
  });
  it('by item: the items plus their share of the service charge', () => {
    expect(shareForItems(5_800, 23_000, 2_300)).toBe(6_380);
    expect(shareForItems(5_800, 23_000, 0)).toBe(5_800);
  });
});

describe('settlePartial: one payment towards what is left', () => {
  it('a part of what is left is fine', () => {
    const s = settlePartial(10_000, [{ method: 'pix', amount: '40,00' }]);
    expect(s.paidCents).toBe(4_000);
    expect(s.changeCents).toBe(0);
  });
  it('cash over what is left gives change; card or PIX over it is refused', () => {
    expect(settlePartial(4_620, [{ method: 'dinheiro', amount: '50,00' }]).changeCents).toBe(380);
    expect(() => settlePartial(4_620, [{ method: 'pix', amount: '50,00' }])).toThrow('não podem passar do que falta');
  });
  it('nothing left to pay, or no amount, is refused', () => {
    expect(() => settlePartial(0, [{ method: 'pix', amount: '1,00' }])).toThrow('já está paga');
    expect(() => settlePartial(1_000, [])).toThrow('Informe as formas de pagamento');
  });
});
