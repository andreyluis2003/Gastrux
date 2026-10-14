// Cookie consent (lib/analytics/consent.ts): where the banner asks, and the stored choice.
import { asksConsentOn, gaIdFrom, readConsent, writeConsent, CONSENT_EVENT } from '../../lib/analytics/consent';

// A browser window is enough as an event target with a localStorage (no jsdom in this suite)
const store = new Map<string, string>();
(global as any).window = Object.assign(new EventTarget(), {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

describe('cookie consent', () => {
  beforeEach(() => store.clear());

  it('asks on the public site, never on working screens nor the customer menu', () => {
    for (const p of ['/', '/pricing', '/para/pizzaria', '/calculadora', '/auth/signin', '/termos', '/privacidade']) {
      expect(asksConsentOn(p)).toBe(true);
    }
    for (const p of ['/vender', '/caixa', '/cozinha', '/dashboard', '/cardapio/abc', '/delivery/abc', '/mesa/1', '/paraiso', null]) {
      expect(asksConsentOn(p as any)).toBe(false);
    }
  });

  it('stores the choice, tells the page, and forgets it on request', () => {
    const seen: unknown[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent).detail);
    window.addEventListener(CONSENT_EVENT, on);
    expect(readConsent()).toBeNull();
    writeConsent('granted');
    expect(readConsent()).toBe('granted');
    writeConsent(null);
    expect(readConsent()).toBeNull();
    window.removeEventListener(CONSENT_EVENT, on);
    expect(seen).toEqual(['granted', null]);
  });

  it('ignores a value it did not write', () => {
    store.set('gx-cookie-consent', 'maybe');
    expect(readConsent()).toBeNull();
  });

  it('accepts only a real GA4 id', () => {
    expect(gaIdFrom(' G-KJNWCGWTQE ')).toBe('G-KJNWCGWTQE');
    for (const v of [undefined, null, '', 'G-PLACEHOLDER', 'UA-123', "G-ABC');alert(1)//"]) {
      expect(gaIdFrom(v as any)).toBeNull();
    }
  });
});
