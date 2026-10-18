/** Plans of 2026-10-18 (spec planos-teste-business §4) */
import { BASE_PRICING_TIERS } from '@/lib/billing/pricing-tiers';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { monthlyLimit } from '@/lib/ai/config';

describe('plans of 2026-10-18', () => {
  it('prices and limits', () => {
    const { PRO, BUSINESS, ENTERPRISE } = BASE_PRICING_TIERS as any;
    expect([PRO.priceMonthly, PRO.priceAnnual, BUSINESS.priceMonthly, BUSINESS.priceAnnual]).toEqual([149, 1639, 199, 2189]);
    expect([PRO.limits.monthlySales, BUSINESS.limits.monthlySales]).toEqual([1000, 3500]);
    expect([PRO.limits.users, BUSINESS.limits.users]).toEqual([2, 5]);
    expect([PRO.limits.kitchenStations, BUSINESS.limits.kitchenStations, ENTERPRISE.limits.kitchenStations]).toEqual([2, 5, 999999]);
    expect((BASE_PRICING_TIERS as any).STARTER).toBeUndefined();
  });
  it.each(['tablePayment', 'labelExpiry', 'utilityInsights', 'dailyCountAlert'])('%s is Business and up', (f) => {
    expect(isTierFeatureEnabled('pro', f as any)).toBe(false);
    expect(isTierFeatureEnabled('business', f as any)).toBe(true);
    expect(isTierFeatureEnabled('enterprise', f as any)).toBe(true);
  });
  it('AI questions per month', () => {
    expect([monthlyLimit('pro'), monthlyLimit('business'), monthlyLimit('enterprise')]).toEqual([50, 350, null]);
  });
});
