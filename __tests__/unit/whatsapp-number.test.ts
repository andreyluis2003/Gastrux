/**
 * The WhatsApp asked at sign-up (activation agent, 2026-10-28): any common way of typing a Brazilian
 * number is stored as 55 + DDD + number, so the wa.me link always works.
 */
import { parseWhatsapp } from '../../lib/onboarding/whatsapp';

describe('parseWhatsapp', () => {
  it.each(['(66) 9 9999-8888', '+55 66 99999-8888', '66999998888', '5566999998888'])('stores %s as 5566999998888', (raw) => {
    expect(parseWhatsapp(raw)).toEqual({ ok: true, value: '5566999998888' });
  });

  it('accepts a landline (10 digits)', () => {
    expect(parseWhatsapp('6633334444')).toEqual({ ok: true, value: '556633334444' });
  });

  it.each(['', '123', '00999998888', '(01) 99999-8888', undefined, null, 42])('refuses %p', (raw) => {
    expect(parseWhatsapp(raw)).toEqual({ ok: false, error: 'Informe o WhatsApp com DDD' });
  });
});
