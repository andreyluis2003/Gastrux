/**
 * Owner decision 2026-10-09: the NFC-e works on every plan. A restaurant on the free plan used to
 * close the bill with no note at all ("não disponível no plano starter").
 */
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { BASE_PRICING_TIERS } from '@/lib/billing/pricing-tiers';

describe('NFC-e on every plan', () => {
  it.each(['starter', 'pro', 'business', 'enterprise'])('%s can issue the NFC-e', (tier) => {
    expect(isTierFeatureEnabled(tier, 'nfe')).toBe(true);
  });

  it('the plans that list their own features say so (Business and Enterprise inherit it)', () => {
    expect(BASE_PRICING_TIERS.STARTER.features).toContain('NFC-e (nota do consumidor)');
    expect(BASE_PRICING_TIERS.PRO.features).toContain('NFC-e (nota do consumidor)');
  });
});
