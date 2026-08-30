// @ts-nocheck
/**
 * Stripe Billing Configuration
 * Defines pricing tiers for the restaurant management platform
 */

export const STRIPE_PRICING_TIERS = {
  STARTER: {
    id: 'starter',
    name: 'Starter',
    description: 'Para restaurantes que estão começando',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'brl',
    stripeProductId: process.env.STRIPE_PRODUCT_ID_STARTER || 'prod_UMhvXBiW8fIux4',
    stripePriceId: undefined, // Plano grátis
    features: [
      '50 transações/dia',
      '100 ingredientes',
      '1 usuário',
      'Dashboard básico',
      'Relatórios simples',
    ],
    limits: {
      dailyTransactions: 50,
      ingredients: 100,
      users: 1,
      recipes: 10,
      deliveryIntegrations: 0,
    },
  },
  PRO: {
    id: 'pro',
    name: 'Pro',
    description: 'Melhor custo-benefício para pequenos restaurantes',
    priceMonthly: 99,
    priceAnnual: 1090,
    currency: 'brl',
    stripeProductId: process.env.STRIPE_PRODUCT_ID_PRO || 'prod_UMH4qOvOKXJHbC',
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO_MONTHLY || 'price_1TNYWUE1RR9k01ogUdFmvMXk',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL || 'price_1TNyYOE1RR9k01ogaaxcnF9R',
    features: [
      'Transações ilimitadas',
      '500 ingredientes',
      '3 usuários',
      'Analytics em tempo real',
      'Previsão de demanda (ML)',
      '1 integração com delivery',
      'Suporte por email',
    ],
    limits: {
      dailyTransactions: 999999,
      ingredients: 500,
      users: 3,
      recipes: 100,
      deliveryIntegrations: 1,
    },
  },
  BUSINESS: {
    id: 'business',
    name: 'Business',
    description: 'Para restaurantes em crescimento',
    priceMonthly: 249,
    priceAnnual: 2741,
    currency: 'brl',
    stripeProductId: process.env.STRIPE_PRODUCT_ID_BUSINESS || 'prod_UMHS8jl85sfuIT',
    stripePriceId: process.env.STRIPE_PRICE_ID_BUSINESS_MONTHLY || 'price_1TNYtIE1RR9k01ogmZ15d9fc',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_BUSINESS_ANNUAL || 'price_1TNyZuE1RR9k01ogWkhuPLYR',
    features: [
      'Tudo do Pro',
      'Kitchen Display System (KDS)',
      'Menu Digital + QR Code',
      'CRM e Programa de Fidelidade',
      'Multi-loja (até 3 lojas)',
      '10 usuários',
      'Integração com iFood',
      'Relatórios avançados',
      'Suporte prioritário',
    ],
    limits: {
      dailyTransactions: 999999,
      ingredients: 1000,
      users: 10,
      recipes: 500,
      locations: 3,
      deliveryIntegrations: 3,
    },
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Solução completa para grandes operações',
    priceMonthly: 499,
    priceAnnual: 5489,
    currency: 'brl',
    stripeProductId: process.env.STRIPE_PRODUCT_ID_ENTERPRISE || 'prod_UMHZsdPZ7Sdx6D',
    stripePriceId: process.env.STRIPE_PRICE_ID_ENTERPRISE_MONTHLY || 'price_1TNZ0fE1RR9k01ogdxJDUhT4',
    stripePriceIdAnnual: process.env.STRIPE_PRICE_ID_ENTERPRISE_ANNUAL || 'price_1TNybtE1RR9k01ogpwgbTxod',
    features: [
      'Tudo do Business',
      'Unlimited lojas',
      'Nota Fiscal Eletrônica (NF-e)',
      'Integração com sistemas contábeis',
      'API customizada',
      'Usuários ilimitados',
      'Suporte 24/7 dedicado',
      'Implementação customizada',
      'SLA garantido',
    ],
    limits: {
      dailyTransactions: 999999,
      ingredients: 999999,
      users: 999999,
      recipes: 999999,
      locations: 999999,
      deliveryIntegrations: 999999,
    },
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
