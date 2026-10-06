/**
 * The restaurant address asked in the sign-up questions (2026-10-06). It may be left for later
 * (the dashboard reminds until it is filled: the NFC-e and the delivery fee need it), but what is
 * sent must make sense. Stored in the fields the settings screen already edits:
 * address ("Rua, número - complemento - bairro"), city, state, zipCode.
 */

export const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export interface AddressInput {
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface RestaurantAddress {
  address: string;
  city: string;
  state: string;
  zipCode: string;
}

type Result = { ok: true; value: RestaurantAddress | null } | { ok: false; error: string };

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function parseRestaurantAddress(input: unknown): Result {
  if (input == null) return { ok: true, value: null };
  if (typeof input !== 'object') return { ok: false, error: 'Endereço inválido' };
  const a = input as AddressInput;
  const zipCode = clean(a.zipCode, 12).replace(/\D/g, '');
  const street = clean(a.street, 120);
  const number = clean(a.number, 12);
  const complement = clean(a.complement, 60);
  const neighborhood = clean(a.neighborhood, 80);
  const city = clean(a.city, 80);
  const state = clean(a.state, 2).toUpperCase();

  // "Preencher depois": nothing typed
  if (!zipCode && !street && !number && !complement && !neighborhood && !city && !state) return { ok: true, value: null };

  if (zipCode.length !== 8) return { ok: false, error: 'CEP deve ter 8 números' };
  if (!street || !number || !city) return { ok: false, error: 'Preencha rua, número e cidade, ou deixe o endereço para depois' };
  if (!UFS.includes(state)) return { ok: false, error: 'Estado (UF) inválido' };

  const address = [`${street}, ${number}`, complement, neighborhood].filter(Boolean).join(' - ');
  return { ok: true, value: { address, city, state, zipCode: `${zipCode.slice(0, 5)}-${zipCode.slice(5)}` } };
}
