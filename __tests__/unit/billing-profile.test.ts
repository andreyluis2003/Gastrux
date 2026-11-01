import { cleanDocument, formatDocument, isValidCnpj, isValidCpf, parseBillingProfile } from '../../lib/billing/billing-profile';

const good = { document: '529.982.247-25', name: 'Maria Dona', zipCode: '78550-000', street: 'Rua A', number: '10', complement: '', neighborhood: 'Centro', city: 'Sinop', state: 'mt' };

describe('invoice details', () => {
  it('checks CPF and CNPJ, also the CNPJ with letters', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('52998224724')).toBe(false);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCnpj('11222333000181')).toBe(true);
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('12ABC34501DE35')).toBe(true);
    expect(isValidCnpj('12ABC34501DE36')).toBe(false);
  });

  it('cleans what was typed and formats it back', () => {
    expect(cleanDocument('12.abc.345/01de-35')).toBe('12ABC34501DE35');
    expect(formatDocument('52998224725')).toBe('529.982.247-25');
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81');
  });

  it('accepts complete details and stores them clean', () => {
    const r = parseBillingProfile(good);
    expect(r).toEqual({ ok: true, value: { ...good, document: '52998224725', zipCode: '78550000', complement: null, state: 'MT' } });
  });

  it.each([
    [{ document: '123' }, 'CPF ou CNPJ'],
    [{ name: 'A' }, 'razão social'],
    [{ zipCode: '123' }, 'CEP'],
    [{ street: ' ' }, 'rua'],
    [{ number: '' }, 'número'],
    [{ neighborhood: '' }, 'bairro'],
    [{ city: '' }, 'cidade'],
    [{ state: 'M1' }, 'UF'],
  ])('refuses %j', (patch, message) => {
    const r = parseBillingProfile({ ...good, ...patch });
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain(message);
  });

  it('refuses an empty body', () => {
    expect(parseBillingProfile(null).ok).toBe(false);
  });
});
