// @ts-nocheck
/**
 * Stripe Billing Configuration
 * Extends the gateway-neutral base tiers (lib/billing/pricing-tiers.ts) with
 * Stripe-specific product/price IDs.
 */

import { BASE_PRICING_TIERS } from './billing/pricing-tiers';

export const STRIPE_PRICING_TIERS = {
  PRO: {
    ...BASE_PRICING_TIERS.PRO,
    stripeProductId: process.env.STRIPE_PRODUCT_ID_PRO || 'prod_UMH4qOvOKXJHbC',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_1URxFCE1RR9k01ogajeLEj1e',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL || 'price_1URxHrE1RR9k01ogG365j74U',
  },
  BUSINESS: {
    ...BASE_PRICING_TIERS.BUSINESS,
    stripeProductId: process.env.STRIPE_PRODUCT_ID_BUSINESS || 'prod_UMHS8jl85sfuIT',
    stripePriceId: process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY || 'price_1URxKdE1RR9k01ogpQlzt7tI',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL || 'price_1URxLZE1RR9k01ogedc7IvZQ',
  },
  ENTERPRISE: {
    ...BASE_PRICING_TIERS.ENTERPRISE,
    stripeProductId: process.env.STRIPE_PRODUCT_ID_ENTERPRISE || 'prod_UMHZsdPZ7Sdx6D',
    stripePriceId: process.env.STRIPE_PRICE_ID_ENTERPRISE_MONTHLY || 'price_1TNZ0fE1RR9k01ogdxJDUhT4',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL || 'price_1TNybtE1RR9k01ogpwgbTxod',
  },
};

export const VALID_TIERS = Object.keys(STRIPE_PRICING_TIERS) as Array<
  keyof typeof STRIPE_PRICING_TIERS
>;

export function getTierById(tierId: string) {
  const tier = Object.entries(STRIPE_PRICING_TIERS).find(
    ([, tier]) => tier.id === tierId
  );
  return tier ? tier[1] : null;
}

export function getTierLimits(tierId: string) {
  const tier = getTierById(tierId);
  // 'starter' = no plan (spec 2026-10-18): the lock stops writes, reads use the Pro limits
  return tier?.limits || STRIPE_PRICING_TIERS.PRO.limits;
}
