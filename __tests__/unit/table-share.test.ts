import { shareCents, normalizeCpf, isValidPayerKey, reais, MAX_PEOPLE, parseReaisCents } from '@/lib/comanda/table-share';

const bill = (totalCents: number, remainingCents = totalCents) => ({ totalCents, remainingCents });

describe('the part a person pays (spec 2026-10-10 §5.1)', () => {
  it('Tudo is what is left', () => {
    expect(shareCents({ mode: 'ALL' }, bill(10000, 4000))).toEqual({ ok: true, cents: 4000, mode: 'ALL', label: 'ALL' });
  });
  it('equal parts round up, and the last person pays only what is left (never 3 x 33,33 for 100,00)', () => {
    expect(shareCents({ mode: 'EQUAL', people: 3 }, bill(10000))).toMatchObject({ ok: true, cents: 3334, label: 'EQUAL:3' });
    expect(shareCents({ mode: 'EQUAL', people: 3 }, bill(10000, 3332))).toMatchObject({ ok: true, cents: 3332 });
  });
  it('equal parts follow the new total when an item was added after someone paid', () => {
    expect(shareCents({ mode: 'EQUAL', people: 2 }, bill(8000, 5000))).toMatchObject({ ok: true, cents: 4000 });
  });
  it.each([[1], [MAX_PEOPLE + 1], [2.5], ['x'], [undefined]])('equal parts refuse %p people', (people) => {
    expect(shareCents({ mode: 'EQUAL', people }, bill(10000))).toEqual({ ok: false, status: 422, error: 'Escolha de 2 a 20 pessoas.' });
  });
  it('another amount: from R$ 1,00 up to what is left', () => {
    expect(shareCents({ mode: 'AMOUNT', amountCents: 100 }, bill(10000))).toMatchObject({ ok: true, cents: 100, label: 'AMOUNT' });
    expect(shareCents({ mode: 'AMOUNT', amountCents: 99 }, bill(10000))).toEqual({ ok: false, status: 422, error: 'O valor mínimo é R$ 1,00.' });
    expect(shareCents({ mode: 'AMOUNT', amountCents: 4001 }, bill(10000, 4000))).toEqual({ ok: false, status: 422, error: 'O valor passa do que falta pagar (R$ 40,00).' });
    expect(shareCents({ mode: 'AMOUNT', amountCents: 12.5 }, bill(10000))).toMatchObject({ ok: false, status: 422 });
  });
  it('an unknown mode is refused', () => {
    expect(shareCents({ mode: 'ITEMS' }, bill(10000))).toEqual({ ok: false, status: 422, error: 'Escolha como vai pagar.' });
  });
});

describe('CPF on the note', () => {
  it('empty is no CPF', () => expect(normalizeCpf('  ')).toEqual({ ok: true, cpf: null }));
  it('keeps only the digits of a valid CPF', () => expect(normalizeCpf('529.982.247-25')).toEqual({ ok: true, cpf: '52998224725' }));
  it.each(['529.982.247-24', '111.111.111-11', '1234', 123])('refuses %p', (raw) => {
    expect(normalizeCpf(raw)).toEqual({ ok: false, error: 'CPF inválido.' });
  });
});

describe('phone key and money', () => {
  it('accepts a random key and refuses anything else', () => {
    expect(isValidPayerKey('a1B2c3D4e5F6g7H8')).toBe(true);
    expect(isValidPayerKey('short')).toBe(false);
    expect(isValidPayerKey('"payerKey":"x"-----------')).toBe(false);
    expect(isValidPayerKey(undefined)).toBe(false);
  });
  it('formats reais', () => {
    expect(reais(123456)).toBe('R$ 1.234,56');
    expect(reais(5)).toBe('R$ 0,05');
  });
});

describe('final review fixes (2026-10-12)', () => {
  it('a phone key cannot carry LIKE wildcards (_ or %), so it never matches other phones', () => {
    expect(isValidPayerKey('_'.repeat(32))).toBe(false);
    expect(isValidPayerKey('abc%def0123456789')).toBe(false);
    expect(isValidPayerKey('0123456789abcdef0123456789abcdef')).toBe(true);
  });
  it('reads the amount typed with a comma or with a dot as the decimal mark', () => {
    expect(parseReaisCents('25,50')).toBe(2550);
    expect(parseReaisCents('25.50')).toBe(2550);
    expect(parseReaisCents('25.5')).toBe(2550);
    expect(parseReaisCents('1.234,56')).toBe(123456);
    expect(parseReaisCents('1.234')).toBe(123400);
    expect(parseReaisCents('30')).toBe(3000);
    expect(parseReaisCents('')).toBeNaN();
    expect(parseReaisCents('abc')).toBeNaN();
  });
});
