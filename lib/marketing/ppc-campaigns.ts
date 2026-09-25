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
  // Product facts (no customer results: Gastrux has none it can prove yet, site claims review 2026-09-25)
  stats: Array<{ value: string; label: string }>;
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
      'Plataforma completa para pizzarias. Controle de mussarela, ficha técnica e margem por sabor. Plano Starter grátis, sem cartão.',
    hero: {
      eyebrow: '🍕 Específico para PIZZARIAS',
      headline: 'Pare de perder mussarela. Comece a ganhar margem.',
      subheadline:
        'Controle o estoque em tempo real e saiba o custo e a margem de cada sabor pela ficha técnica.',
      ctaPrimary: 'Começar Grátis',
      ctaSecondary: 'Ver Demonstração',
      trustLine: '✅ Sem cartão de crédito • 📱 Funciona no celular • 🍕 Ficha técnica por sabor',
    },
    painPoints: [
      'Mussarela sumindo sem explicação no fim do mês',
      'Dias de pico com ruptura de massa e queijo',
      'Margem diferente em cada sabor sem saber qual puxa o lucro',
      'Preço do queijo sobe e ninguém reajusta o cardápio',
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
        title: 'Comanda e balcão sem internet',
        description:
          'Se a internet cair, comanda e venda de balcão continuam no aparelho e sincronizam quando ela volta.',
      },
      {
        icon: 'PieChart',
        title: 'Margem por sabor',
        description:
          'Descubra quais 3 sabores pagam o aluguel e quais dão prejuízo.',
      },
    ],
    stats: [
      { value: 'R$ 0', label: 'Plano Starter' },
      { value: 'Por sabor', label: 'Custo e margem' },
      { value: 'Offline', label: 'Comanda e balcão' },
      { value: 'NFC-e', label: 'No plano Business' },
    ],
    finalCta: {
      headline: 'Descubra quanto cada sabor deixa de margem',
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
      'Ficha técnica, multi-loja e KDS para hamburguerias. Plano Starter grátis, sem cartão.',
    hero: {
      eyebrow: '🍔 Específico para HAMBURGUERIAS',
      headline: 'Escale sua hamburgueria sem perder o sabor.',
      subheadline:
        'Padronize receitas, controle CMV e abra a próxima loja com confiança.',
      ctaPrimary: 'Começar Grátis',
      ctaSecondary: 'Como funciona',
      trustLine: '✅ Starter grátis • 🍔 Multi-loja no Business • 📱 Funciona no celular',
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
          'Até 2 lojas no plano Business, ilimitadas no Enterprise. Visão central para o dono.',
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
      { value: 'R$ 0', label: 'Plano Starter' },
      { value: 'Por receita', label: 'Gramatura e custo' },
      { value: 'KDS', label: 'No plano Business' },
      { value: '2 lojas', label: 'No plano Business' },
    ],
    finalCta: {
      headline: 'A próxima unidade começa com o sistema certo',
      button: 'Começar Grátis',
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
      'Controle de estoque para restaurantes sem planilhas. Alertas automáticos, ficha técnica, cadastro de fornecedores. Plano Starter grátis, sem cartão.',
    hero: {
      eyebrow: '📦 CONTROLE DE ESTOQUE PARA RESTAURANTES',
      headline: 'Estoque sob controle, sem planilha.',
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
      { value: 'R$ 0', label: 'Plano Starter' },
      { value: 'Automática', label: 'Baixa por receita' },
      { value: 'Celular', label: 'Contagem de estoque' },
      { value: 'CSV', label: 'Importa ingredientes' },
    ],
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
        'Calcule CMV por prato, acompanhe variações diárias e descubra quais itens do cardápio têm a melhor margem de contribuição.',
      ctaPrimary: 'Quero Saber Meu CMV',
      ctaSecondary: 'Como funciona',
      trustLine: '✅ Starter grátis • 📊 DRE com seus lançamentos • 📱 Funciona no celular',
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
          'Demonstrativo montado com as vendas, o CMV e as despesas que você lançar, por categoria.',
      },
    ],
    stats: [
      { value: 'R$ 0', label: 'Plano Starter' },
      { value: 'Por prato', label: 'CMV e margem' },
      { value: 'Matriz', label: 'Engenharia de cardápio' },
      { value: 'DRE', label: 'Com seus lançamentos' },
    ],
    finalCta: {
      headline: 'Saiba o CMV de cada prato antes de mudar o preço',
      button: 'Começar Grátis',
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
