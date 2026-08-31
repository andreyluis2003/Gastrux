// @ts-nocheck
/**
 * Stripe Billing Configuration
 * Extends the gateway-neutral base tiers (lib/billing/pricing-tiers.ts) with
 * Stripe-specific product/price IDs.
 */

import { BASE_PRICING_TIERS } from './billing/pricing-tiers';

export const STRIPE_PRICING_TIERS = {
  STARTER: {
    ...BASE_PRICING_TIERS.STARTER,
    stripeProductId: process.env.STRIPE_PRODUCT_ID_STARTER || 'prod_UMhvXBiW8fIux4',
    stripePriceId: undefined, // Plano grátis
  },
  PRO: {
    ...BASE_PRICING_TIERS.PRO,
    stripeProductId: process.env.STRIPE_PRODUCT_ID_PRO || 'prod_UMH4qOvOKXJHbC',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_1TNYWUE1RR9k01ogUdFmvMXk',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL || 'price_1TNyYOE1RR9k01ogaaxcnF9R',
  },
  BUSINESS: {
    ...BASE_PRICING_TIERS.BUSINESS,
    stripeProductId: process.env.STRIPE_PRODUCT_ID_BUSINESS || 'prod_UMHS8jl85sfuIT',
    stripePriceId: process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY || 'price_1TNYtIE1RR9k01ogmZ15d9fc',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL || 'price_1TNyZuE1RR9k01ogWkhuPLYR',
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
  return tier?.limits || STRIPE_PRICING_TIERS.STARTER.limits;
}
