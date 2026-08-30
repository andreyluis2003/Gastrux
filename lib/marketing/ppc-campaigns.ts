// @ts-nocheck
/**
 * PPC / Google Ads Campaign Configurations
 * Cada campanha tem uma landing page própria em /lp/[slug]
 * Capture UTMs e rastreia via GA4 (lib/ga-utils)
 */

export type PPCCampaign = {
  slug: string;
  segment: string;
  // Meta & SEO
  metaTitle: string;
  metaDescription: string;
  // Hero
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    ctaPrimary: string;
    ctaSecondary: string;
    trustLine: string;
  };
  // Pain points especificos
  painPoints: string[];
  // Benefícios (feature cards)
  benefits: Array<{
    icon: string; // lucide icon name
    title: string;
    description: string;
  }>;
  // Social proof
  stats: Array<{ value: string; label: string }>;
  testimonialSlug?: string; // link to case-studies
  // CTA final
  finalCta: {
    headline: string;
    button: string;
  };
  // Tema / cor
  theme: {
    accentFrom: string;
    accentTo: string;
    emoji: string;
  };
};

export const PPC_CAMPAIGNS: Record<string, PPCCampaign> = {
  pizzaria: {
    slug: 'pizzaria',
    segment: 'Pizzaria',
    metaTitle:
      'Sistema para Pizzaria: controle estoque, margem e delivery em 1 app',
    metaDescription:
      'Plataforma completa para pizzarias. Controle de mussarela, ficha técnica por sabor, integração com iFood. Teste grátis 30 dias.',
    hero: {
      eyebrow: '🍕 Específico para PIZZARIAS',
      headline: 'Pare de perder mussarela. Comece a ganhar margem.',
      subheadline:
        'O sistema que pizzarias usam para controlar estoque em tempo real, saber a margem por sabor e integrar com iFood. Configure em 15 minutos.',
      ctaPrimary: 'Testar Grátis 30 Dias',
      ctaSecondary: 'Ver Demonstração',
      trustLine: '✅ Sem cartão de crédito • ⚡ Configure em 15 min • 🍕 500+ pizzarias',
    },
    painPoints: [
      'Mussarela sumindo sem explicação no fim do mês',
      'Dias de pico com ruptura de massa e queijo',
      'Margem diferente em cada sabor sem saber qual puxa o lucro',
      'iFood e salão em planilhas separadas',
    ],
    benefits: [
      {
        icon: 'Flame',
        title: 'Ficha técnica por pizza',
        description:
          'Saiba exatamente quanto de cada ingrediente entra em cada sabor. Margem calculada automaticamente.',
      },
      {
        icon: 'AlertCircle',
        title: 'Alertas de estoque mínimo',
        description:
          'Nunca mais fique sem mussarela no sábado à noite. O sistema avisa antes.',
      },
      {
        icon: 'Truck',
        title: 'Integração com iFood',
        description:
          'Pedidos do iFood entram direto no KDS. Sem digitação, sem erro.',
      },
      {
        icon: 'PieChart',
        title: 'Margem por sabor',
        description:
          'Descubra quais 3 sabores pagam o aluguel e quais dão prejuízo.',
      },
    ],
    stats: [
      { value: '22%', label: 'Menos desperdício médio' },
      { value: '+18%', label: 'Ganho de margem' },
      { value: '45 dias', label: 'ROI médio' },
      { value: '500+', label: 'Pizzarias ativas' },
    ],
    testimonialSlug: 'pizzaria-bella',
    finalCta: {
      headline: 'Sua próxima pizza pode ter +R$ 3 de margem',
      button: 'Começar Grátis',
    },
    theme: {
      accentFrom: 'from-red-500',
      accentTo: 'to-orange-500',
      emoji: '🍕',
    },
  },
  hamburgueria: {
    slug: 'hamburgueria',
    segment: 'Hamburgueria',
    metaTitle:
      'Sistema para Hamburgueria: padronize receitas, escale lojas',
    metaDescription:
      'Hamburguerias que crescem usam o Gastrux. Ficha técnica, multi-loja, KDS e integração iFood. Teste grátis 30 dias.',
    hero: {
      eyebrow: '🍔 Específico para HAMBURGUERIAS',
      headline: 'Escale sua hamburgueria sem perder o sabor.',
      subheadline:
        'Padronize receitas, controle CMV e abra a próxima loja com confiança. O sistema usado por hamburguerias que já abriram 3+ unidades.',
      ctaPrimary: 'Começar Grátis',
      ctaSecondary: 'Como funciona',
      trustLine: '✅ 30 dias grátis • 🍔 Multi-loja incluso • ⚡ Setup em 20 min',
    },
    painPoints: [
      'Sabor inconsistente entre turnos',
      'Cada gerente faz a compra de um jeito',
      'Não dá pra comparar performance entre lojas',
      'Fechamento mensal leva dias',
    ],
    benefits: [
      {
        icon: 'Utensils',
        title: 'Receitas padronizadas',
        description:
          'Mesmo sabor em toda loja. Ficha técnica por hamburguer com gramatura precisa.',
      },
      {
        icon: 'Building2',
        title: 'Multi-loja',
        description:
          'Até 3 lojas no plano Business. Dashboard central para o dono.',
      },
      {
        icon: 'Monitor',
        title: 'Kitchen Display System',
        description:
          'Pedidos na tela da cozinha. Tempos de preparo sob controle.',
      },
      {
        icon: 'TrendingUp',
        title: 'Comparação entre unidades',
        description:
          'Qual loja vende mais? Qual tem maior margem? 1 clique e você vê tudo.',
      },
    ],
    stats: [
      { value: '3×', label: 'Lojas em 9 meses' },
      { value: '100%', label: 'Padronização' },
      { value: '-95%', label: 'Tempo de fechamento' },
      { value: '9,1', label: 'NPS médio' },
    ],
    testimonialSlug: 'hamburgueria-central',
    finalCta: {
      headline: 'A próxima unidade começa com o sistema certo',
      button: 'Testar Grátis Agora',
    },
    theme: {
      accentFrom: 'from-amber-500',
      accentTo: 'to-red-500',
      emoji: '🍔',
    },
  },
  'controle-estoque': {
    slug: 'controle-estoque',
    segment: 'Controle de Estoque',
    metaTitle:
      'Controle de Estoque para Restaurantes: simples, rápido, em tempo real',
    metaDescription:
      'Controle de estoque para restaurantes sem planilhas. Alertas automáticos, ficha técnica, integração com fornecedores. Gratuito por 30 dias.',
    hero: {
      eyebrow: '📦 CONTROLE DE ESTOQUE PARA RESTAURANTES',
      headline: 'Estoque sob controle em menos de 30 dias.',
      subheadline:
        'Chega de planilha. Tenha visão em tempo real do seu estoque, alertas de mínimo e histórico de movimentações direto no celular.',
      ctaPrimary: 'Começar Agora',
      ctaSecondary: 'Ver na Prática',
      trustLine: '✅ Sem cartão • ⚡ Importa sua planilha • 📱 Mobile-first',
    },
    painPoints: [
      'Planilhas desatualizadas que ninguém confia',
      'Contagens mensais que levam 2 dias inteiros',
      'Não perceber a ruptura até o cliente reclamar',
      'Custos de compra sem rastreabilidade',
    ],
    benefits: [
      {
        icon: 'Package',
        title: 'Estoque em tempo real',
        description:
          'Toda saída de insumo (por receita ou manual) baixa instantaneamente o estoque.',
      },
      {
        icon: 'Bell',
        title: 'Alertas automáticos',
        description:
          'Defina estoque mínimo. O sistema avisa antes de faltar.',
      },
      {
        icon: 'BarChart3',
        title: 'Histórico completo',
        description:
          'Toda movimentação fica gravada. Descubra desvios em segundos.',
      },
      {
        icon: 'Smartphone',
        title: 'Conte pelo celular',
        description:
          'Contagem rápida pelo mobile. Compare com o sistema e ajuste.',
      },
    ],
    stats: [
      { value: '22%', label: 'Menos desperdício' },
      { value: '21h', label: 'Economia/semana' },
      { value: '30 dias', label: 'Para controle total' },
      { value: '4,8/5', label: 'Avaliação média' },
    ],
    testimonialSlug: 'pizzaria-bella',
    finalCta: {
      headline: 'Comece com estoque real ainda hoje',
      button: 'Criar Conta Grátis',
    },
    theme: {
      accentFrom: 'from-blue-500',
      accentTo: 'to-cyan-500',
      emoji: '📦',
    },
  },
  'controle-cmv': {
    slug: 'controle-cmv',
    segment: 'CMV e Margem',
    metaTitle:
      'CMV de Restaurante: controle a margem de cada prato em tempo real',
    metaDescription:
      'Descubra qual prato paga o aluguel e qual dá prejuízo. Ficha técnica, CMV diário e engenharia de cardápio em uma única plataforma.',
    hero: {
      eyebrow: '📊 CMV SOB CONTROLE',
      headline: 'Você sabe qual prato paga seu aluguel?',
      subheadline:
        'Calcule CMV por prato, acompanhe variações diárias e descubra quais itens do cardápio realmente dão lucro. Tudo automatizado.',
      ctaPrimary: 'Quero Saber Meu CMV',
      ctaSecondary: 'Como funciona',
      trustLine: '✅ Grátis 30 dias • 📊 DRE automática • ⚡ Configure rápido',
    },
    painPoints: [
      'CMV oscilando sem explicação todo mês',
      'Não saber se o especial da semana é lucrativo',
      'Preço de insumos subindo sem você perceber',
      'Relatórios contábeis chegando tarde demais',
    ],
    benefits: [
      {
        icon: 'Calculator',
        title: 'CMV automático por prato',
        description:
          'Toda ficha técnica calcula CMV em tempo real com os últimos preços de compra.',
      },
      {
        icon: 'Activity',
        title: 'Alertas de oscilação',
        description:
          'Ingrediente subiu 10%? Você recebe alerta e pode reajustar cardápio.',
      },
      {
        icon: 'LineChart',
        title: 'Engenharia de cardápio',
        description:
          'Matriz BCG dos pratos: estrelas, vacas leiteiras, abacaxis e pontos de interrogação.',
      },
      {
        icon: 'FileBarChart',
        title: 'DRE em 1 clique',
        description:
          'Demonstrativo financeiro fechado automaticamente com categorias de receita e custo.',
      },
    ],
    stats: [
      { value: '29%', label: 'CMV médio estabilizado' },
      { value: '+34%', label: 'Lucro líquido' },
      { value: '+14%', label: 'Ticket médio' },
      { value: '1 clique', label: 'Para fechar DRE' },
    ],
    testimonialSlug: 'bistro-gourmet-rio',
    finalCta: {
      headline: 'CMV sob controle = restaurante lucrativo',
      button: 'Testar 30 dias Grátis',
    },
    theme: {
      accentFrom: 'from-violet-500',
      accentTo: 'to-fuchsia-500',
      emoji: '📊',
    },
  },
};

export function getCampaign(slug: string) {
  return PPC_CAMPAIGNS[slug] || null;
}

export function getAllCampaignSlugs() {
  return Object.keys(PPC_CAMPAIGNS);
}
