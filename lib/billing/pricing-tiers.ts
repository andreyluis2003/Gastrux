// @ts-nocheck
/**
 * Gateway-neutral SaaS pricing tiers.
 * Gateway-specific config (Stripe price/product IDs) lives in lib/stripe-config.ts,
 * which imports and extends these base tiers.
 */

// Sales per month (owner decision 2026-10-09, competitor research): Business doubles Pro; going over
// warns and never blocks a sale (lib/plans/monthly-sales.ts)
export const BASE_PRICING_TIERS = {
  STARTER: {
    id: 'starter',
    name: 'Starter',
    description: 'Para restaurantes que estão começando',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'brl',
    features: [
      '300 vendas por mês',
      '100 ingredientes',
      '1 usuário',
      'NFC-e (nota do consumidor)',
      'Tela da cozinha (KDS) com 1 estação',
      'Cardápio digital com QR Code',
      'Clientes: lista e histórico',
      'Dashboard básico',
      'Relatórios simples',
    ],
    limits: {
      monthlySales: 300,
      ingredients: 100,
      users: 1,
      recipes: 10,
      deliveryIntegrations: 0,
      kitchenStations: 1,
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
      '1.500 vendas por mês',
      '500 ingredientes',
      '3 usuários',
      'NFC-e (nota do consumidor)',
      'Tela da cozinha (KDS) com até 3 estações',
      'Cardápio digital com QR Code',
      'Clientes com anotações',
      'Analytics em tempo real',
      'Previsão de demanda (ML)',
      'Pedidos externos por webhook (1 conexão)',
      'Suporte por email',
    ],
    limits: {
      monthlySales: 1500,
      ingredients: 500,
      users: 3,
      recipes: 100,
      deliveryIntegrations: 1,
      kitchenStations: 3,
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
      '3.000 vendas por mês',
      'Tela da cozinha (KDS) com estações ilimitadas',
      'Campanhas e programa de fidelidade',
      'Multi-loja (até 2 lojas)',
      '5 usuários',
      'Pedidos externos por webhook (até 3 conexões)',
      'Relatórios avançados',
      'Suporte pelo WhatsApp',
    ],
    limits: {
      monthlySales: 3000,
      ingredients: 1000,
      users: 5,
      recipes: 500,
      locations: 2,
      deliveryIntegrations: 3,
      kitchenStations: 999999,
    },
  },
  ENTERPRISE: {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Solução completa para grandes operações',
    // Owner decision 2026-09-25: price on request ("sob consulta"); no self-serve checkout
    priceMonthly: null,
    priceAnnual: null,
    currency: 'brl',
    features: [
      'Tudo do Business',
      'Vendas ilimitadas',
      'Lojas ilimitadas',
      'Usuários ilimitados',
      // Owner decision 2026-09-25: no 24/7 support, custom implementation or SLA promised
      'Suporte e implementação: sob consulta',
    ],
    limits: {
      monthlySales: 999999,
      ingredients: 999999,
      users: 999999,
      recipes: 999999,
      locations: 999999,
      deliveryIntegrations: 999999,
      kitchenStations: 999999,
    },
  },
};

export function getBaseTierById(tierId: string) {
  const entry = Object.entries(BASE_PRICING_TIERS).find(
    ([, tier]) => tier.id === tierId
  );
  return entry ? entry[1] : null;
}
