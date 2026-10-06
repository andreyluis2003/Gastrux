import { parseRestaurantAddress } from '../../lib/onboarding/address';

describe('restaurant address in the sign-up (lib/onboarding/address.ts)', () => {
  it('left for later: nothing or empty fields is fine and saves nothing', () => {
    expect(parseRestaurantAddress(undefined)).toEqual({ ok: true, value: null });
    expect(parseRestaurantAddress({ zipCode: '', street: '  ', number: '' })).toEqual({ ok: true, value: null });
  });

  it('a full address is stored in the fields the settings screen edits', () => {
    expect(parseRestaurantAddress({ zipCode: '13201-005', street: 'Rua Barão de Jundiaí', number: '100', complement: 'Loja 2', neighborhood: 'Centro', city: 'Jundiaí', state: 'sp' })).toEqual({
      ok: true,
      value: { address: 'Rua Barão de Jundiaí, 100 - Loja 2 - Centro', city: 'Jundiaí', state: 'SP', zipCode: '13201-005' },
    });
  });

  it('complement and neighbourhood are optional', () => {
    const r = parseRestaurantAddress({ zipCode: '01310100', street: 'Av. Paulista', number: '1000', city: 'São Paulo', state: 'SP' });
    expect(r).toEqual({ ok: true, value: { address: 'Av. Paulista, 1000', city: 'São Paulo', state: 'SP', zipCode: '01310-100' } });
  });

  it('a half-filled address is refused with what is missing', () => {
    expect(parseRestaurantAddress({ zipCode: '123', street: 'Rua A', number: '1', city: 'X', state: 'SP' })).toEqual({ ok: false, error: 'CEP deve ter 8 números' });
    expect(parseRestaurantAddress({ zipCode: '01310100', street: 'Rua A' })).toMatchObject({ ok: false });
    expect(parseRestaurantAddress({ zipCode: '01310100', street: 'Rua A', number: '1', city: 'X', state: 'ZZ' })).toEqual({ ok: false, error: 'Estado (UF) inválido' });
  });

  it('anything that is not an object is refused', () => {
    expect(parseRestaurantAddress('Rua A, 1')).toEqual({ ok: false, error: 'Endereço inválido' });
  });
});
