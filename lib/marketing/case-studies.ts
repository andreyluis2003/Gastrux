// @ts-nocheck
/**
 * Case Studies & Testimonials
 * Dados estáticos de clientes e depoimentos (pode ser migrado para DB futuramente)
 */

export type CaseStudy = {
  slug: string;
  company: string;
  segment: string;
  city: string;
  state: string;
  ownerName: string;
  ownerRole: string;
  summary: string;
  challenge: string;
  solution: string;
  results: string[];
  metrics: Array<{ label: string; value: string; highlight?: boolean }>;
  quote: string;
  featured: boolean;
  emoji: string;
  coverGradient: string; // tailwind classes e.g. 'from-blue-500 to-purple-600'
  tags: string[];
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'pizzaria-bella',
    company: 'Pizzaria Bella',
    segment: 'Pizzaria',
    city: 'São Paulo',
    state: 'SP',
    ownerName: 'João Silva',
    ownerRole: 'Proprietário',
    summary:
      'Reduziu em 40% o tempo gasto com gestão de estoque e eliminou perdas de insumos no salão e delivery.',
    challenge:
      'A Pizzaria Bella operava com planilhas dispersas e contagens manuais. A equipe perdia 3 horas por dia somando caixa, e as compras eram feitas no “feeling” do gerente — gerando rupturas em dias de pico e sobras apodrecendo na sexta-feira.',
    solution:
      'Implantamos o controle completo de insumos com alertas automáticos de estoque mínimo, ficha técnica por pizza e dashboard de CMV diário. O dono passou a acompanhar margem por sabor pelo celular.',
    results: [
      'Corte de 40% no tempo diário de gestão operacional',
      'Redução de 22% no desperdício de queijo e molhos',
      'Aumento de 18% na margem de contribuição média',
      'Zero ruptura de mussarela há 6 meses',
    ],
    metrics: [
      { label: 'Redução de desperdício', value: '22%', highlight: true },
      { label: 'Ganho de margem', value: '+18%' },
      { label: 'Horas economizadas/semana', value: '21h' },
      { label: 'ROI em', value: '45 dias', highlight: true },
    ],
    quote:
      'Reduzimos em 40% o tempo gasto em gestão de estoque. A plataforma é intuitiva e nossos funcionários aprenderam em uma tarde.',
    featured: true,
    emoji: '🍕',
    coverGradient: 'from-red-500 via-orange-500 to-amber-500',
    tags: ['Delivery', 'Pizzaria', 'Estoque', 'CMV'],
  },
  {
    slug: 'cozinha-industrial-sabor',
    company: 'Cozinha Industrial Sabor',
    segment: 'Cozinha Industrial',
    city: 'Campinas',
    state: 'SP',
    ownerName: 'Carlos Mendes',
    ownerRole: 'Chef Executivo',
    summary:
      'Produz 2.500 refeições/dia para empresas e cortou 90% dos erros de pedido após integrar KDS à operação.',
    challenge:
      'A Cozinha Sabor atende cardos corporativos e não tinha visibilidade do fluxo de preparação em tempo real. Em dias de chuva, pedidos chegavam atrasados, e correções manuais em comandas causavam déficit de ingredientes.',
    solution:
      'Conectamos o PDV ao Kitchen Display System e implementamos o planejamento de produção com previsão de demanda baseada em histórico diário.',
    results: [
      'Erros de pedido caíram 90% em 60 dias',
      'Tempo médio por refeição reduzido de 14 para 9 minutos',
      'Previsão de demanda com 87% de acerto',
      'Economia mensal equivalente a 1 funcionário',
    ],
    metrics: [
      { label: 'Queda de erros', value: '-90%', highlight: true },
      { label: 'Tempo/refeição', value: '-36%' },
      { label: 'Acerto de previsão', value: '87%' },
      { label: 'Refeições/dia', value: '2.500', highlight: true },
    ],
    quote:
      'A integração com KDS revolucionou nosso fluxo de pedidos. Erros de pedidos caíram 90% e hoje a equipe atua em modo proativo.',
    featured: true,
    emoji: '👨‍🍳',
    coverGradient: 'from-emerald-500 via-teal-500 to-cyan-600',
    tags: ['Cozinha Industrial', 'KDS', 'Produção', 'Previsão'],
  },
  {
    slug: 'bistro-gourmet-rio',
    company: 'Bistrô Gourmet',
    segment: 'Bistrô / Alta Gastronomia',
    city: 'Rio de Janeiro',
    state: 'RJ',
    ownerName: 'Maria Santos',
    ownerRole: 'Gerente Geral',
    summary:
      'CMV estabilizado em 29% após 4 meses de uso com controle de ficha técnica e compras inteligentes.',
    challenge:
      'Com cardápio autoral e ingredientes importados, o CMV oscilava entre 31% e 44% sem explicação clara. A chef precisava de visão por prato e por fornecedor.',
    solution:
      'Criamos fichas técnicas padronizadas e ligamos cada insumo a custos de compra reais. Configuramos alertas automáticos para oscilações maiores que 8% no custo por prato.',
    results: [
      'CMV estabilizado em 29%',
      'Identificação de 3 pratos com margem negativa (retirados do menu)',
      'Renegociação de 12 fornecedores baseada em dados',
      'Aumento de 14% no ticket médio após engenharia de cardápio',
    ],
    metrics: [
      { label: 'CMV estabilizado', value: '29%', highlight: true },
      { label: 'Ticket médio', value: '+14%' },
      { label: 'Pratos revisados', value: '23' },
      { label: 'Fornecedores renegociados', value: '12' },
    ],
    quote:
      'O rastreamento de ingredientes em tempo real nos economizou milhares em desperdício. Hoje sei a margem de cada prato antes de lançar no cardápio.',
    featured: true,
    emoji: '🍽️',
    coverGradient: 'from-violet-500 via-purple-500 to-fuchsia-600',
    tags: ['Bistrô', 'Engenharia de Cardápio', 'CMV', 'Ficha Técnica'],
  },
  {
    slug: 'hamburgueria-central',
    company: 'Hamburgueria Central',
    segment: 'Hamburgueria',
    city: 'Belo Horizonte',
    state: 'MG',
    ownerName: 'Felipe Andrade',
    ownerRole: 'Sócio-fundador',
    summary:
      'Cresceu de 1 para 3 lojas em 9 meses usando o painel multi-loja e padronização de receitas.',
    challenge:
      'Expansão rápida ameaçava qualidade. Cada loja comprava de forma diferente e o Felipe perdia horas consolidando planilhas de 3 gerentes.',
    solution:
      'Multi-tenancy com painel central de ownership. Padronização de receitas e permissões por loja. Relatórios comparativos diários em um único dashboard.',
    results: [
      'Padronização 100% das receitas em 3 lojas',
      'Dashboard único para comparar performance',
      'Tempo de fechamento mensal caiu de 3 dias para 4 horas',
      'NPS entre lojas 9,1/10',
    ],
    metrics: [
      { label: 'Lojas em 9 meses', value: '3×', highlight: true },
      { label: 'Padronização', value: '100%' },
      { label: 'Fechamento mensal', value: '-95%' },
      { label: 'NPS médio', value: '9,1' },
    ],
    quote:
      'Consegui escalar sem perder controle. Abrir a terceira loja foi mais simples que a segunda porque tudo já estava padronizado no sistema.',
    featured: false,
    emoji: '🍔',
    coverGradient: 'from-amber-500 via-orange-500 to-red-500',
    tags: ['Hamburgueria', 'Multi-loja', 'Padronização'],
  },
  {
    slug: 'cafe-saudavel',
    company: 'Saudável Café',
    segment: 'Café / Fast Casual Saudável',
    city: 'Curitiba',
    state: 'PR',
    ownerName: 'Ana Paula Ribeiro',
    ownerRole: 'Proprietária',
    summary:
      'Transformou 40% do seu cardápio em opções saudáveis e aumentou 2,8× o ticket médio do delivery.',
    challenge:
      'Menu enxuto mas operado no grito. Ana Paula não sabia quais itens tinham real margem. Delivery crescia mas o lucro não acompanhava.',
    solution:
      'Dashboard financeiro com DRE automática + integração com iFood para compilar vendas por canal. Aplicamos engenharia de cardápio para reposicionar produtos.',
    results: [
      'Ticket médio delivery 2,8× maior',
      'Identificação das 5 estrelas do cardápio',
      'Lucro líquido +34% em 6 meses',
      'DRE fechada em 1 clique',
    ],
    metrics: [
      { label: 'Ticket delivery', value: '2,8×', highlight: true },
      { label: 'Lucro líquido', value: '+34%' },
      { label: 'Fechamento DRE', value: '1 clique' },
      { label: 'Itens saudáveis', value: '40%' },
    ],
    quote:
      'Finalmente entendi quais pratos pagam o aluguel. O dashboard virou minha reunião semanal com a equipe.',
    featured: false,
    emoji: '🥗',
    coverGradient: 'from-green-500 via-emerald-500 to-lime-500',
    tags: ['Café', 'Fast Casual', 'Delivery', 'DRE'],
  },
];

export function getFeaturedCaseStudies() {
  return CASE_STUDIES.filter((c) => c.featured);
}

export function getCaseStudyBySlug(slug: string) {
  return CASE_STUDIES.find((c) => c.slug === slug) || null;
}

export function getAllCaseStudySlugs() {
  return CASE_STUDIES.map((c) => c.slug);
}
