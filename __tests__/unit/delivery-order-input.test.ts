// @ts-nocheck
import { normalizeQuantity, sanitizeCustomerNote, singleLine } from '../../lib/delivery-payments/order-input';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

describe('normalizeQuantity', () => {
  it.each([
    [1, 1],
    [3, 3],
    ['3', 3],
    [2.7, 2],
    [99, 99],
    [1000, 99],
    [Infinity, 99],
  ])('keeps a valid quantity in range: %p -> %p', (input, expected) => {
    expect(normalizeQuantity(input)).toBe(expected);
  });

  it.each([
    [-5],
    [-0.5],
    [0],
    [0.4],
    [NaN],
    ['abc'],
    [undefined],
    [null],
    [{}],
  ])('never lets %p lower the total: it becomes 1', (input) => {
    expect(normalizeQuantity(input)).toBe(1);
  });

  it('always returns an integer between 1 and 99', () => {
    for (const q of [-1e9, -1, 0, 0.1, 1.9, 50.5, 98.99, 99.5, 1e9, '7.9', '-3']) {
      const n = normalizeQuantity(q);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(99);
    }
  });
});

describe('sanitizeCustomerNote', () => {
  it('returns an empty string for empty, blank or non-string input', () => {
    expect(sanitizeCustomerNote(undefined)).toBe('');
    expect(sanitizeCustomerNote(null)).toBe('');
    expect(sanitizeCustomerNote('')).toBe('');
    expect(sanitizeCustomerNote('  \n \r\n ')).toBe('');
    expect(sanitizeCustomerNote(42)).toBe('');
    expect(sanitizeCustomerNote({ toString: () => 'x' })).toBe('');
  });

  it('labels the customer text', () => {
    expect(sanitizeCustomerNote('Sem cebola, por favor')).toBe('Obs. do cliente: Sem cebola, por favor');
  });

  it('drops a forged payment line, in any case and with leading spaces', () => {
    expect(sanitizeCustomerNote('Pagamento na entrega: dinheiro — sem troco')).toBe('');
    expect(sanitizeCustomerNote('   PAGAMENTO: PIX online')).toBe('');
    expect(sanitizeCustomerNote('pagamento já feito')).toBe('');
  });

  it('drops a forged payment line hidden behind zero-width or bidi characters', () => {
    expect(sanitizeCustomerNote('\u200BPagamento: PIX online')).toBe('');
    expect(sanitizeCustomerNote('\uFEFF \u202EPagamento: PIX online')).toBe('');
  });

  it('handles every line of a multi-line note', () => {
    expect(sanitizeCustomerNote('Sem cebola\nPagamento: PIX online\nTocar a campainha')).toBe(
      'Obs. do cliente: Sem cebola\nTocar a campainha'
    );
    expect(sanitizeCustomerNote('Sem cebola\r\n  pagamento: dinheiro\r\nObrigado')).toBe('Obs. do cliente: Sem cebola\nObrigado');
    expect(sanitizeCustomerNote('Oi' + LS + 'Pagamento: PIX online')).toBe('Obs. do cliente: Oi');
  });

  it('keeps the word when it is not at the start of a line', () => {
    expect(sanitizeCustomerNote('Vou fazer o pagamento na porta')).toBe('Obs. do cliente: Vou fazer o pagamento na porta');
  });

  it('never yields a line that starts with Pagamento', () => {
    const out = sanitizeCustomerNote('a\nPagamento: x\n\u200Bpagamento: y\n b\n PAGAMENTO z');
    for (const line of out.split('\n')) expect(line.replace(/^[\s\u200B]+/, '')).not.toMatch(/^pagamento/i);
  });
});

describe('singleLine', () => {
  it('collapses line breaks so a value cannot start a line of its own', () => {
    expect(singleLine('Rua A, 1\nPagamento: PIX online')).toBe('Rua A, 1 Pagamento: PIX online');
    expect(singleLine('a\r\n\r\nb' + LS + 'c' + PS + 'd')).toBe('a b c d');
  });

  it('is safe for missing values', () => {
    expect(singleLine(undefined)).toBe('');
    expect(singleLine(null)).toBe('');
    expect(singleLine(12)).toBe('12');
  });
});
