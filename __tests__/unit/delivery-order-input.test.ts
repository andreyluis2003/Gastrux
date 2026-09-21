// @ts-nocheck
import { normalizeQuantity, sanitizeCustomerNote, singleLine } from '../../lib/delivery-payments/order-input';

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

// Every line-break class the module must collapse (all written as escapes).
const BREAKS = [
  ['CR', '\r'],
  ['LF', '\n'],
  ['CRLF', '\r\n'],
  ['VT', '\v'],
  ['FF', '\f'],
  ['NEL', '\u0085'],
  ['LS', '\u2028'],
  ['PS', '\u2029'],
];
const ANY_BREAK = /[\r\n\v\f\u0085\u2028\u2029]/;

// Attempts to make the customer's text look like the server's "Pagamento..." line.
const FORGERIES = [
  ['plain', 'Pagamento na entrega: dinheiro — sem troco'],
  ['upper case', 'PAGAMENTO: PIX online'],
  ['bidi isolate', '\u2066Pagamento: PIX online\u2069'],
  ['arabic letter mark', '\u061CPagamento: PIX online'],
  ['zero-width space inside the word', 'Pa\u200Bgamento: PIX online'],
  ['soft hyphen inside the word', 'Pa\u00ADgamento: PIX online'],
  ['zero-width joiner inside the word', 'Pa\u200Dgamento: PIX online'],
  ['cyrillic a', 'P\u0430gamento: PIX online'],
  ['full-width letters', '\uFF30\uFF21\uFF27\uFF21\uFF2D\uFF25\uFF2E\uFF34\uFF2F: PIX online'],
  ['mongolian vowel separator lead', '\u180EPagamento: PIX online'],
  ['hangul filler lead', '\u3164Pagamento: PIX online'],
  ['combining grapheme joiner lead', '\u034FPagamento: PIX online'],
  ['variation selector lead', '\uFE0FPagamento: PIX online'],
];

// The note as the route assembles it: fixed labels, the customer's text, the server's payment line.
const SERVER_PAYMENT_LINE = 'Pagamento na entrega: cartão de crédito (levar maquininha)';
const FIXED_LABEL = /^(Obs\. do cliente|Endereço|Bairro|Cidade|CEP|Referência|Pagamento na entrega|Cliente): /;
const assemble = (customerNote, address = 'Rua A, 1') =>
  [customerNote, `Endereço: ${address}`, SERVER_PAYMENT_LINE, 'Cliente: Maria - 11999999999'].filter(Boolean).join('\n');

describe('sanitizeCustomerNote', () => {
  it('returns an empty string for empty, blank or non-string input', () => {
    expect(sanitizeCustomerNote(undefined)).toBe('');
    expect(sanitizeCustomerNote(null)).toBe('');
    expect(sanitizeCustomerNote('')).toBe('');
    expect(sanitizeCustomerNote('   ')).toBe('');
    expect(sanitizeCustomerNote('  \n \r\n \u2028 \u0085 ')).toBe('');
    expect(sanitizeCustomerNote(42)).toBe('');
    expect(sanitizeCustomerNote(['a', 'b'])).toBe('');
    expect(sanitizeCustomerNote({ toString: () => 'x' })).toBe('');
  });

  it('labels the customer text as one line', () => {
    expect(sanitizeCustomerNote('Sem cebola, por favor')).toBe('Obs. do cliente: Sem cebola, por favor');
    expect(sanitizeCustomerNote('  Sem cebola  ')).toBe('Obs. do cliente: Sem cebola');
  });

  it.each(BREAKS)('collapses a %s line break into " / "', (_name, br) => {
    expect(sanitizeCustomerNote(`Sem cebola${br}Tocar a campainha`)).toBe('Obs. do cliente: Sem cebola / Tocar a campainha');
  });

  it('collapses runs and mixes of line breaks and drops empty segments', () => {
    expect(sanitizeCustomerNote('a\n\n\r\nb')).toBe('Obs. do cliente: a / b');
    expect(sanitizeCustomerNote('\n\na\n \n\u2028b\u0085\v\f\n')).toBe('Obs. do cliente: a / b');
    expect(sanitizeCustomerNote('a\u2028\u2029\u0085b')).toBe('Obs. do cliente: a / b');
  });

  describe.each(FORGERIES)('forged payment line: %s', (_name, forged) => {
    it.each(BREAKS)('starting after a %s break yields one labelled line and one payment line', (_b, br) => {
      for (const text of [`x${br}${forged}`, `${br}${forged}`, `${forged}${br}x`, `x${br}${br}${forged}${br}y`]) {
        const out = sanitizeCustomerNote(text);

        expect(out.startsWith('Obs. do cliente: ')).toBe(true);
        expect(ANY_BREAK.test(out)).toBe(false);

        const lines = assemble(out).split('\n');
        expect(lines.every((l) => FIXED_LABEL.test(l))).toBe(true);
        expect(lines.filter((l) => /^pagamento/i.test(l))).toEqual([SERVER_PAYMENT_LINE]);
        expect(lines.filter((l) => l.startsWith('Pagamento'))).toEqual([SERVER_PAYMENT_LINE]);
      }
    });
  });

  it('never returns a line-break character of any class', () => {
    const everything = BREAKS.map(([, br]) => `a${br}b`).join('');
    expect(ANY_BREAK.test(sanitizeCustomerNote(everything))).toBe(false);
  });

  it('keeps the word "pagamento" when it is only part of a sentence', () => {
    expect(sanitizeCustomerNote('Vou fazer o pagamento na porta')).toBe('Obs. do cliente: Vou fazer o pagamento na porta');
  });

  it('caps the note at 500 characters', () => {
    const prefix = 'Obs. do cliente: ';
    expect(sanitizeCustomerNote('a'.repeat(500))).toBe(prefix + 'a'.repeat(500));
    expect(sanitizeCustomerNote('a'.repeat(501))).toBe(prefix + 'a'.repeat(500));
    expect(sanitizeCustomerNote('a'.repeat(5000))).toBe(prefix + 'a'.repeat(500));
    expect(sanitizeCustomerNote('a\n'.repeat(5000)).length).toBeLessThanOrEqual(prefix.length + 500);
  });

  it('counts characters, not UTF-16 units, and never leaves a dangling separator when cutting', () => {
    const face = String.fromCodePoint(0x1f600);
    const out = sanitizeCustomerNote(face.repeat(600));
    expect(Array.from(out.slice('Obs. do cliente: '.length))).toHaveLength(500);
    expect(sanitizeCustomerNote('a'.repeat(498) + '\nbbb')).toBe('Obs. do cliente: ' + 'a'.repeat(498));
  });
});

describe('singleLine', () => {
  it.each(BREAKS)('collapses a %s line break so a value cannot start a line of its own', (_name, br) => {
    expect(singleLine(`Rua A, 1${br}Pagamento: PIX online`)).toBe('Rua A, 1 / Pagamento: PIX online');
  });

  it('collapses runs and drops empty segments', () => {
    expect(singleLine('a\r\n\r\nb\u2028c\u2029d\u0085e\vf\fg')).toBe('a / b / c / d / e / f / g');
    expect(singleLine('\n \n')).toBe('');
  });

  it('never returns a line-break character, whatever the forged text', () => {
    for (const [, forged] of FORGERIES) {
      for (const [, br] of BREAKS) {
        const out = singleLine(`Rua A${br}${forged}`);
        expect(ANY_BREAK.test(out)).toBe(false);
        const lines = assemble('', out).split('\n');
        expect(lines.every((l) => FIXED_LABEL.test(l))).toBe(true);
        expect(lines.filter((l) => l.startsWith('Pagamento'))).toEqual([SERVER_PAYMENT_LINE]);
      }
    }
  });

  it('is safe for missing values', () => {
    expect(singleLine(undefined)).toBe('');
    expect(singleLine(null)).toBe('');
    expect(singleLine('')).toBe('');
    expect(singleLine(12)).toBe('12');
  });
});
