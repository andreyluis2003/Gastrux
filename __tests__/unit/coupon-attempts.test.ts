/** Cupons (security review 2026-11-08): tries per address and per restaurant, the trusted client address */
import { clientAddress, takeCouponTry, TRIES_PER_MINUTE, RESTAURANT_TRIES_PER_MINUTE } from '@/lib/coupons/attempts';

const headers = (xff?: string) => ({ get: (n: string) => (n === 'x-forwarded-for' ? xff ?? null : null) });

describe('coupon tries', () => {
  it('reads the address the proxy appended, not the one the client sent', () => {
    expect(clientAddress(headers('6.6.6.6, 200.1.2.3'))).toBe('200.1.2.3');
    expect(clientAddress(headers('not-an-ip'))).toBe('local');
    expect(clientAddress(headers())).toBe('local');
  });

  it('stops one address after the limit, other addresses go on, and a minute later it comes back', () => {
    const now = 1_000_000;
    for (let i = 0; i < TRIES_PER_MINUTE; i++) expect(takeCouponTry('1.1.1.1', 'rA', now)).toBe(true);
    expect(takeCouponTry('1.1.1.1', 'rA', now)).toBe(false);
    expect(takeCouponTry('2.2.2.2', 'rA', now)).toBe(true);
    expect(takeCouponTry('1.1.1.1', 'rA', now + 61_000)).toBe(true);
  });

  it('caps a restaurant tried from many addresses', () => {
    const now = 5_000_000;
    let ok = 0;
    for (let i = 0; i < RESTAURANT_TRIES_PER_MINUTE + 50; i++) if (takeCouponTry(`10.0.${i >> 8}.${i & 255}`, 'rB', now)) ok++;
    expect(ok).toBe(RESTAURANT_TRIES_PER_MINUTE);
  });
});
