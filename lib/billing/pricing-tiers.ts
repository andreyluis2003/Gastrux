// @ts-nocheck
/**
 * Gateway-neutral SaaS pricing tiers.
 * Gateway-specific config (Stripe price/product IDs) lives in lib/stripe-config.ts,
 * which imports and extends these base tiers.
 */

export const BASE_PRICING_TIERS = {
  STARTER: {
    id: 'starter',
    name: 'Starter',
    description: 'Para restaurantes que estão começando',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'brl',
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

export function getBaseTierById(tierId: string) {
  const entry = Object.entries(BASE_PRICING_TIERS).find(
    ([, tier]) => tier.id === tierId
  );
  return entry ? entry[1] : null;
}
