// @ts-nocheck
/**
 * Gateway-neutral SaaS pricing tiers.
 * Gateway-specific config (Stripe price/product IDs) lives in lib/stripe-config.ts,
 * which imports and extends these base tiers.
 */

// Plans of 2026-10-18 (spec planos-teste-business): no free plan; a new restaurant tries Business for 30 days.
// Sales per month warn and never block a sale (lib/plans/monthly-sales.ts)
export const BASE_PRICING_TIERS = {
  PRO: {
    id: 'pro',
    name: 'Pro',
    description: 'Para operar: vender, cozinha e estoque',
    priceMonthly: 149,
    priceAnnual: 1639,
    currency: 'brl',
    features: [
      '1.000 vendas por mês',
      '500 ingredientes',
      '2 usuários',
      'NFC-e (nota do consumidor)',
      'Tela da cozinha (KDS) com 2 estações',
      'Cardápio digital com QR Code',
      'Estoque, fichas técnicas e CMV',
      'Contas a pagar',
      'Clientes com anotações',
      'Etiquetas de manipulação',
      'Assistente com IA: 50 perguntas por mês',
      'Suporte por e-mail',
    ],
    limits: {
      monthlySales: 1000,
      ingredients: 500,
      users: 2,
      recipes: 100,
      deliveryIntegrations: 1,
      kitchenStations: 2,
    },
  },
  BUSINESS: {
    id: 'business',
    name: 'Business',
    description: 'O mais escolhido: vende mais e perde menos',
    priceMonthly: 199,
    priceAnnual: 2189,
    currency: 'brl',
    features: [
      'Tudo do Pro',
      '3.500 vendas por mês',
      '5 usuários',
      'Tela da cozinha (KDS) com 5 estações',
      'Pagamento na mesa pelo celular (Pix e cartão)',
      'Controle de validades com aviso',
      'Indicadores das contas de consumo e aviso de diferença na contagem',
      'Contas a pagar com avisos, repetição automática e boletos da nota de compra',
      'Cashback para seus clientes e campanhas',
      'Relatórios avançados',
      'Até 2 lojas',
      'Assistente com IA: 350 perguntas por mês',
      'Suporte pelo WhatsApp',
    ],
    limits: {
      monthlySales: 3500,
      ingredients: 1000,
      users: 5,
      recipes: 500,
      locations: 2,
      deliveryIntegrations: 3,
      kitchenStations: 5,
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
      'Estações de cozinha ilimitadas',
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
