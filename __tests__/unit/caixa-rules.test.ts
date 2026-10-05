// __tests__/unit/caixa-rules.test.ts
import {
  settlePayments, expectedByMethod, differenceByMethod, methodsOverAlert, exceedsAlert,
  parseAmountCents, parseCountedCents, countCash, salesSummary, entryEffect, CashRuleError,
} from '../../lib/caixa/rules';
import { toCashMethod, toNfcePaymentMethod, toKeyed, fromKeyed, emptyByMethod } from '../../lib/caixa/payment-methods';

describe('payment methods', () => {
  it.each([
    ['dinheiro', 'CASH'], ['pix', 'PIX'], ['cartao de credito', 'CREDIT'], ['cartao de debito', 'DEBIT'],
    ['outros', 'OTHER'], ['CREDIT', 'CREDIT'], [' Dinheiro ', 'CASH'],
  ])('%s -> %s', (input, expected) => expect(toCashMethod(input)).toBe(expected));
  it('unknown method is null', () => expect(toCashMethod('cheque')).toBeNull());
  it('maps back to the NFC-e strings', () => expect(toNfcePaymentMethod('DEBIT')).toBe('cartao de debito'));
  it('round-trips keyed JSON', () => {
    const v = { ...emptyByMethod(), CASH: 100, PIX: 5 };
    expect(fromKeyed(toKeyed(v), Number)).toEqual(v);
  });
});

describe('amounts', () => {
  it.each([[10, 1000], ['10,5', 1050], ['0.01', 1], [12.34, 1234]])('%p -> %p cents', (v, c) => expect(parseAmountCents(v)).toBe(c));
  it.each([[0], [-1], ['abc'], [1.234], [''], [null]])('refuses %p', (v) => expect(() => parseAmountCents(v)).toThrow(CashRuleError));
  it('counted may be zero but not negative', () => {
    expect(parseCountedCents(0)).toBe(0);
    expect(() => parseCountedCents(-0.01)).toThrow(CashRuleError);
  });
});

describe('settlePayments', () => {
  it('two methods covering the total, no change', () => {
    const s = settlePayments(8000, [{ method: 'dinheiro', amount: 50 }, { method: 'cartao de credito', amount: 30 }]);
    expect(s.receipts).toMatchObject({ CASH: 5000, CREDIT: 3000 });
    expect(s.changeCents).toBe(0);
    expect(s.primaryMethod).toBe('CASH');
  });
  it('cash over the total becomes change; receipts keep what was handed over', () => {
    const s = settlePayments(3750, [{ method: 'dinheiro', amount: 50 }]);
    expect(s.receipts.CASH).toBe(5000);
    expect(s.changeCents).toBe(1250);
  });
  it('same method twice is summed', () => {
    expect(settlePayments(2000, [{ method: 'pix', amount: 10 }, { method: 'pix', amount: 10 }]).receipts.PIX).toBe(2000);
  });
  it('refuses when payments do not cover the total', () => {
    expect(() => settlePayments(8000, [{ method: 'pix', amount: 79.99 }])).toThrow(/Faltam R\$ 0,01/);
  });
  it('refuses card/PIX over the total (change only from cash)', () => {
    expect(() => settlePayments(1000, [{ method: 'cartao de debito', amount: 11 }])).toThrow(CashRuleError);
  });
  it('change larger than the cash handed over is impossible', () => {
    // 10 cash + 20 card for a 15 bill: card alone exceeds, refused
    expect(() => settlePayments(1500, [{ method: 'dinheiro', amount: 10 }, { method: 'cartao de credito', amount: 20 }])).toThrow(CashRuleError);
  });
  it('refuses an empty list, unknown method and zero amount', () => {
    expect(() => settlePayments(1000, [])).toThrow(CashRuleError);
    expect(() => settlePayments(1000, [{ method: 'cheque', amount: 10 }])).toThrow(CashRuleError);
    expect(() => settlePayments(1000, [{ method: 'pix', amount: 0 }])).toThrow(CashRuleError);
  });
  it('a zero total needs no payment', () => {
    expect(settlePayments(0, []).paidCents).toBe(0);
  });
});

describe('expected and difference', () => {
  const entries = [
    { type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
    { type: 'CHANGE', method: 'CASH', amountCents: 1250, orderSessionId: 's1' },
    { type: 'RECEIPT', method: 'CREDIT', amountCents: 3000, orderSessionId: 's2' },
    { type: 'SUPPLY', method: 'CASH', amountCents: 2000 },
    { type: 'WITHDRAWAL', method: 'CASH', amountCents: 500 },
    { type: 'EXPENSE', method: 'CASH', amountCents: 300 },
    { type: 'REFUND', method: 'CREDIT', amountCents: 1000, orderSessionId: 's2' },
    { type: 'ADJUSTMENT', method: 'CASH', amountCents: 100, direction: 'OUT' },
  ] as const;
  it('computes expected per method from the opening float', () => {
    const e = expectedByMethod(10000, entries as any);
    expect(e.CASH).toBe(10000 + 5000 - 1250 + 2000 - 500 - 300 - 100);
    expect(e.CREDIT).toBe(2000);
    expect(e.PIX).toBe(0);
  });
  it('adjustment requires a direction', () => {
    expect(() => entryEffect({ type: 'ADJUSTMENT', method: 'CASH', amountCents: 1 })).toThrow(CashRuleError);
  });
  it('difference = counted - expected', () => {
    const d = differenceByMethod({ ...emptyByMethod(), CASH: 900 }, { ...emptyByMethod(), CASH: 1000 });
    expect(d.CASH).toBe(-100);
  });
  it('alert threshold is max(R$20, 2%)', () => {
    expect(exceedsAlert(50000, 2000)).toBe(false);   // 2% of 500 = 10 -> threshold 20
    expect(exceedsAlert(50000, -2001)).toBe(true);
    expect(exceedsAlert(200000, 3999)).toBe(false);  // 2% of 2000 = 40
    expect(exceedsAlert(200000, 4001)).toBe(true);
    expect(methodsOverAlert({ ...emptyByMethod(), CASH: 10000, PIX: 0 }, { ...emptyByMethod(), CASH: -2500, PIX: 0 })).toEqual(['CASH']);
  });
});

describe('cash count and sales summary', () => {
  it('counts notes and coins', () => {
    expect(countCash({ '10000': 2, '500': 3, '25': 4 })).toBe(20000 + 1500 + 100);
    expect(() => countCash({ '300': 1 })).toThrow(CashRuleError);
    expect(() => countCash({ '100': -1 })).toThrow(CashRuleError);
  });
  it('sales summary counts sales by comanda and nets refunds', () => {
    const s = salesSummary([
      { type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
      { type: 'CHANGE', method: 'CASH', amountCents: 1250, orderSessionId: 's1' },
      { type: 'RECEIPT', method: 'PIX', amountCents: 2000, orderSessionId: 's2' },
      { type: 'RECEIPT', method: 'CREDIT', amountCents: 1000, orderSessionId: 's2' },
    ]);
    expect(s.byMethod).toMatchObject({ CASH: 3750, PIX: 2000, CREDIT: 1000 });
    expect(s.salesCount).toBe(2);
    expect(s.totalCents).toBe(6750);
    expect(s.averageTicketCents).toBe(3375);
  });
});

describe('sales summary after a reopen (final review 2026-10-05)', () => {
  it('a sale reopened and closed again with the same change counts once, for its value', () => {
    const s = salesSummary([
      { type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
      { type: 'CHANGE', method: 'CASH', amountCents: 2000, orderSessionId: 's1' },
      // reopen: the receipt is refunded and the change comes back
      { type: 'REFUND', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
      { type: 'ADJUSTMENT', method: 'CASH', amountCents: 2000, direction: 'IN', orderSessionId: 's1' },
      // closed again
      { type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
      { type: 'CHANGE', method: 'CASH', amountCents: 2000, orderSessionId: 's1' },
    ] as any);
    expect(s.totalCents).toBe(3000);
    expect(s.salesCount).toBe(1);
  });

  it('a reopened bill not closed again is no sale', () => {
    const s = salesSummary([
      { type: 'RECEIPT', method: 'PIX', amountCents: 3000, orderSessionId: 's2' },
      { type: 'REFUND', method: 'PIX', amountCents: 3000, orderSessionId: 's2' },
    ] as any);
    expect(s.totalCents).toBe(0);
    expect(s.salesCount).toBe(0);
  });
});
