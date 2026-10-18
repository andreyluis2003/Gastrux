/**
 * The Stripe prices of the plans of 2026-10-18 (Pro R$ 149 / R$ 1.639, Business R$ 199 / R$ 2.189). The webhook
 * knows the plan only by the price id: an unknown id means "no plan", which now locks the restaurant.
 */
const KEYS = ['STRIPE_PRICE_ID_PRO_MONTHLY', 'STRIPE_PRICE_ID_PRO_ANNUAL', 'STRIPE_PRICE_ID_BUSINESS_MONTHLY', 'STRIPE_PRICE_ID_BUSINESS_ANNUAL'];

it('defaults are the prices created on 2026-10-18 when the variables are empty', () => {
  const saved = KEYS.map((k) => process.env[k]);
  KEYS.forEach((k) => delete process.env[k]);
  jest.isolateModules(() => {
    const { STRIPE_PRICING_TIERS } = require('@/lib/stripe-config');
    expect(STRIPE_PRICING_TIERS.PRO.stripePriceId).toBe('price_1URxFCE1RR9k01ogajeLEj1e');
    expect(STRIPE_PRICING_TIERS.PRO.stripePriceIdAnnual).toBe('price_1URxHrE1RR9k01ogG365j74U');
    expect(STRIPE_PRICING_TIERS.BUSINESS.stripePriceId).toBe('price_1URxKdE1RR9k01ogpQlzt7tI');
    expect(STRIPE_PRICING_TIERS.BUSINESS.stripePriceIdAnnual).toBe('price_1URxLZE1RR9k01ogedc7IvZQ');
  });
  KEYS.forEach((k, i) => { if (saved[i] !== undefined) process.env[k] = saved[i]; });
});
