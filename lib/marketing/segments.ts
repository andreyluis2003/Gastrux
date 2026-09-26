// @ts-nocheck
/**
 * Segmentos de mercado — cada nicho tem landing page própria em /para/[slug]
 */

export type Segment = {
  slug: string;
  name: string;
  shortName: string;
  emoji: string;
  metaTitle: string;
  metaDescription: string;
  heroHeadline: string;
  heroDescription: string;
  painPoints: string[];
  benefits: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  cta: {
    headline: string;
    description: string;
  };
  color: string; // tailwind gradient from
};

export const SEGMENTS: Segment[] = [
  {
    slug: 'restaurantes',
    name: 'Sistema para Restaurantes',
    shortName: 'Restaurantes',
    emoji: '🍽️',
    metaTitle: 'Sistema para Restaurantes | Gastrux',
    metaDescription: 'Gestão de restaurantes: estoque, CMV por prato, comandas por mesa, caixa e financeiro em um único lugar.',
    heroHeadline: 'O sistema completo para o seu restaurante',
    heroDescription: 'Gerencie estoque, cardápio, mesas, pedidos e financeiro em uma única plataforma. Veja onde está o desperdício e qual a margem de cada prato.',
    painPoints: [
      'Falta de controle sobre o que sai da cozinha',
      'CMV calculado na mão, sempre atrasado',
      'Desperdício de alimentos sem visibilidade',
      'Dificuldade de gerenciar múltiplas frentes ao mesmo tempo',
    ],
    benefits: [
      { icon: 'BarChart3', title: 'CMV Automático', description: 'Saiba exatamente o custo de cada prato em tempo real, sem planilhas.' },
      { icon: 'Package', title: 'Estoque com Alertas', description: 'Baixa automática pelas vendas e alerta de estoque baixo; lotes com validade registrados.' },
      { icon: 'Utensils', title: 'Cardápio Digital + QR', description: 'Cardápio digital com QR Code nas mesas e pedidos pelo celular (plano Business).' },
      { icon: 'TrendingUp', title: 'DRE e Fluxo de Caixa', description: 'DRE e fluxo de caixa montados com as vendas e as despesas que você lançar.' },
      { icon: 'Users', title: 'Gestão de Equipe', description: 'Escalas, comissões e permissões por função (garçom, caixa, cozinha, gerente).' },
      { icon: 'Brain', title: 'Resumos com IA', description: 'Resumo diário e sugestões a partir das suas vendas e do seu estoque.' },
    ],
    cta: {
      headline: 'Pronto para transformar a gestão do seu restaurante?',
      description: 'Comece grátis, sem cartão, com os seus próprios pratos.',
    },
    color: 'from-blue-600 to-blue-800',
  },
  {
    slug: 'delivery',
    name: 'Sistema para Delivery',
    shortName: 'Delivery',
    emoji: '🛵',
    metaTitle: 'Sistema para Delivery | Gastrux',
    metaDescription: 'Gerencie pedidos de delivery, estoque e margem por prato. KDS para a cozinha e pedidos pelo WhatsApp.',
    heroHeadline: 'Seu delivery organizado e lucrativo',
    heroDescription: 'Organize os pedidos do delivery, a cozinha e o estoque, e saiba a margem de cada prato. Ainda não há conexão pronta com iFood, Rappi ou Uber Eats.',
    painPoints: [
      'Pedidos chegando de vários apps sem controle',
      'Sem saber qual plataforma dá mais lucro',
      'Estoque não acompanha o volume de pedidos',
      'Pedidos anotados em papel que se perdem no pico',
    ],
    benefits: [
      { icon: 'Smartphone', title: 'Pedidos externos por API', description: 'Outros sistemas podem enviar pedidos à Gastrux por webhook (exige configuração técnica).' },
      { icon: 'BarChart3', title: 'Margem por prato', description: 'CMV e margem de contribuição de cada item do cardápio.' },
      { icon: 'Package', title: 'Estoque Integrado', description: 'Pedidos feitos na Gastrux baixam o estoque pela ficha técnica.' },
      { icon: 'Clock', title: 'Tela da Cozinha', description: 'KDS mostra os pedidos na ordem e há quanto tempo cada um espera (plano Business).' },
      { icon: 'MapPin', title: 'Status dos Pedidos', description: 'Acompanhe cada pedido do recebimento à saída para entrega.' },
      { icon: 'MessageSquare', title: 'Bot WhatsApp', description: 'Receba pedidos direto pelo WhatsApp com cardápio interativo.' },
    ],
    cta: {
      headline: 'Pronto para escalar seu delivery?',
      description: 'Integre todos os seus canais em uma única plataforma.',
    },
    color: 'from-orange-500 to-red-600',
  },
  {
    slug: 'franquias',
    name: 'Sistema para Franquias',
    shortName: 'Franquias',
    emoji: '🏢',
    metaTitle: 'Sistema para Franquias | Gastrux',
    metaDescription: 'Gerencie várias unidades com fichas técnicas padronizadas e um painel com as vendas de todas as lojas.',
    heroHeadline: 'Controle total das suas franquias',
    heroDescription: 'Padronize receitas, acompanhe o estoque de cada loja e veja as vendas de todas as unidades num só painel.',
    painPoints: [
      'Cada unidade opera de um jeito diferente',
      'Sem visibilidade consolidada de vendas e custos',
      'Dificuldade de padronizar receitas e porções',
      'Comunicação fragmentada entre unidades',
    ],
    benefits: [
      { icon: 'Building2', title: 'Multi-Unidade', description: 'Painel com faturamento, pedidos, ticket médio e estoque baixo de cada unidade (Business: 2 lojas; Enterprise: ilimitadas).' },
      { icon: 'BookOpen', title: 'Ficha Técnica Padrão', description: 'Copie as fichas técnicas de uma loja para as outras.' },
      { icon: 'BarChart3', title: 'Comparação entre Lojas', description: 'Compare faturamento, pedidos e ticket médio entre unidades.' },
      { icon: 'Package', title: 'Lista de Compras', description: 'Lista de compras de cada loja a partir do estoque e dos fornecedores cadastrados.' },
      { icon: 'Shield', title: 'Controle de Acesso', description: 'Permissões por unidade: o gerente vê só a loja dele, o dono vê todas.' },
      { icon: 'TrendingUp', title: 'Relatórios por Unidade', description: 'DRE, CMV e fluxo de caixa de cada loja.' },
    ],
    cta: {
      headline: 'Pronto para escalar suas franquias?',
      description: 'Padronize, monitore e cresça com controle total.',
    },
    color: 'from-indigo-600 to-purple-700',
  },
  {
    slug: 'pizzaria',
    name: 'Sistema para Pizzaria',
    shortName: 'Pizzaria',
    emoji: '🍕',
    metaTitle: 'Sistema para Pizzaria | Gastrux',
    metaDescription: 'Sistema para pizzarias. Ficha técnica por sabor, adicionais, delivery e estoque de insumos.',
    heroHeadline: 'O sistema feito para pizzarias',
    heroDescription: 'Gerencie sabores, adicionais, delivery e estoque de massa e insumos. Tudo no mesmo sistema.',
    painPoints: [
      'Custo de cada sabor calculado no chute',
      'Cálculo de custo por fatia é complicado',
      'Volume alto de delivery nos fins de semana',
      'Controle de massa fresca e insumos perecíveis',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Adicionais', description: 'Cadastre adicionais com preço, como borda recheada ou queijo extra. Pizza meio a meio ainda não é suportada.' },
      { icon: 'Calculator', title: 'CMV por Sabor', description: 'Custo de cada sabor pela ficha técnica; para cada tamanho, uma ficha própria.' },
      { icon: 'Truck', title: 'Delivery Integrado', description: 'Pedidos do WhatsApp e do balcão em uma tela só.' },
      { icon: 'Timer', title: 'KDS para o Forno', description: 'Pedidos na tela da cozinha na ordem de chegada, com o tempo de espera de cada um (plano Business).' },
      { icon: 'Package', title: 'Controle de Insumos', description: 'Estoque de massa, molho e queijo com alerta de estoque baixo e lotes com validade.' },
      { icon: 'Star', title: 'Programa de Fidelidade', description: 'Pontos por compra e prêmio por número de pedidos, como uma pizza grátis no 10º (plano Business).' },
    ],
    cta: {
      headline: 'Pronto para modernizar sua pizzaria?',
      description: 'Teste grátis e veja a diferença no primeiro fim de semana.',
    },
    color: 'from-red-500 to-orange-600',
  },
  {
    slug: 'hamburgueria',
    name: 'Sistema para Hamburgueria',
    shortName: 'Hamburgueria',
    emoji: '🍔',
    metaTitle: 'Sistema para Hamburgueria | Gastrux',
    metaDescription: 'Sistema para hamburguerias artesanais. Ficha técnica por blend, adicionais, delivery e estoque de carnes.',
    heroHeadline: 'O sistema para hamburguerias artesanais',
    heroDescription: 'Gerencie blends, adicionais, acompanhamentos e delivery. Controle de carne moída e insumos.',
    painPoints: [
      'Custo do blend artesanal difícil de calcular',
      'Combos com muitas variações de acompanhamento',
      'Alto volume de delivery com montagem personalizada',
      'Controle de carne moída fresca e validade',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Ficha Técnica por Blend', description: 'Custo de cada blend e de cada lanche pela ficha técnica.' },
      { icon: 'Layers', title: 'Sugestão de Combos', description: 'A IA sugere combos a partir dos itens que mais saem juntos.' },
      { icon: 'Truck', title: 'Pedidos pelo WhatsApp', description: 'Pedidos pelo WhatsApp com cardápio; ainda sem conexão pronta com apps de delivery.' },
      { icon: 'Thermometer', title: 'Controle de Carnes', description: 'Estoque de carnes com lotes, validade e fornecedor registrados.' },
      { icon: 'Timer', title: 'Tela da Cozinha', description: 'Pedidos na tela da chapa na ordem de chegada, com o tempo de espera de cada um (plano Business).' },
      { icon: 'TrendingUp', title: 'Menu Engineering', description: 'Descubra quais burgers são estrelas e quais precisam sair do cardápio.' },
    ],
    cta: {
      headline: 'Pronto para turbinar sua hamburgueria?',
      description: 'Controle cada grama de carne e o custo de cada lanche.',
    },
    color: 'from-amber-600 to-orange-700',
  },
  {
    slug: 'japones',
    name: 'Sistema para Restaurante Japonês',
    shortName: 'Japonês',
    emoji: '🍣',
    metaTitle: 'Sistema para Restaurante Japonês | Gastrux',
    metaDescription: 'Sistema para restaurantes japoneses. Ficha técnica de sushi, sashimi e temaki, e estoque de peixes com lotes e validade.',
    heroHeadline: 'O sistema ideal para restaurantes japoneses',
    heroDescription: 'Custo de cada peça de sushi, sashimi e temaki. Controle peixes frescos, alga nori e arroz com precisão.',
    painPoints: [
      'Rodízio dificulta controle de custo por cliente',
      'Peixes frescos com prazo curtíssimo de validade',
      'Muitos itens no cardápio com variações complexas',
      'Custo de insumos importados volátil',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Comanda por Mesa', description: 'Comanda digital por mesa, funcionando mesmo se a internet cair.' },
      { icon: 'Package', title: 'Estoque de Peixes', description: 'Lotes de peixe com validade e fornecedor registrados.' },
      { icon: 'Calculator', title: 'CMV por Peça', description: 'Saiba o custo de cada peça de sushi, sashimi e temaki.' },
      { icon: 'BookOpen', title: 'Fichas Técnicas', description: 'Padronize a montagem de cada prato com gramagem exata.' },
      { icon: 'QrCode', title: 'Pedido por QR Code', description: 'O cliente faz o pedido pelo celular na mesa (plano Business).' },
      { icon: 'BarChart3', title: 'Análise de Popularidade', description: 'Descubra quais peças são mais pedidas e ajuste o preparo.' },
    ],
    cta: {
      headline: 'Pronto para otimizar seu japonês?',
      description: 'Controle cada peça de sushi e cada lote de peixe.',
    },
    color: 'from-rose-600 to-pink-700',
  },
  {
    slug: 'lanchonete',
    name: 'Sistema para Lanchonete',
    shortName: 'Lanchonete',
    emoji: '🥪',
    metaTitle: 'Sistema para Lanchonete | Gastrux',
    metaDescription: 'Sistema para lanchonetes. Controle salgados, sucos, sanduíches, caixa e delivery de forma simples.',
    heroHeadline: 'Gestão simples e rápida para lanchonetes',
    heroDescription: 'Controle salgados, sucos, sanduíches naturais e caixa em um sistema leve, feito para o dia a dia corrido da lanchonete.',
    painPoints: [
      'Alto volume de itens baratos dificulta o controle',
      'Margem apertada em salgados e sucos',
      'Fila grande no horário de pico',
      'Controle de caixa manual gera furos',
    ],
    benefits: [
      { icon: 'Zap', title: 'PDV Rápido', description: 'Tela de vendas otimizada para alto volume e agilidade no caixa.' },
      { icon: 'Calculator', title: 'Custo por Item', description: 'Saiba a margem de cada salgado, suco e sanduíche.' },
      { icon: 'Package', title: 'Estoque Simplificado', description: 'Controle de insumos sem complicação — só o essencial.' },
      { icon: 'Wallet', title: 'Controle de Caixa', description: 'Abertura, sangria, fechamento e conferência de caixa.' },
      { icon: 'Smartphone', title: 'Pedidos WhatsApp', description: 'Receba pedidos pelo WhatsApp e integre com a produção.' },
      { icon: 'Receipt', title: 'NFC-e Automática', description: 'A nota do consumidor sai ao fechar a conta (plano Business, com certificado e dados do contador).' },
    ],
    cta: {
      headline: 'Pronto para modernizar sua lanchonete?',
      description: 'Sistema leve e rápido, sem complicação.',
    },
    color: 'from-emerald-500 to-teal-600',
  },
  {
    slug: 'doceria',
    name: 'Sistema para Doceria',
    shortName: 'Doceria',
    emoji: '🧁',
    metaTitle: 'Sistema para Doceria | Gastrux',
    metaDescription: 'Sistema para docerias e confeitarias. Fichas técnicas de doces, custo de cada receita e estoque de ingredientes.',
    heroHeadline: 'O sistema perfeito para docerias',
    heroDescription: 'Gerencie fichas técnicas de doces e bolos, estoque de ingredientes e custos com precisão de confeiteira.',
    painPoints: [
      'Custo de cada bolo calculado no papel',
      'Cálculo de custo de bolos personalizados é complexo',
      'Ingredientes caros com validade curta',
      'Ingrediente acabando no meio da produção',
    ],
    benefits: [
      { icon: 'Calendar', title: 'Planejamento de Produção', description: 'Planeje o que produzir e quanto de cada doce.' },
      { icon: 'Calculator', title: 'Precificação Exata', description: 'Calcule o custo de cada bolo, brigadeiro e sobremesa automaticamente.' },
      { icon: 'BookOpen', title: 'Fichas Técnicas', description: 'Receitas padronizadas com gramagem exata para cada doce.' },
      { icon: 'Package', title: 'Estoque de Insumos', description: 'Controle chocolate, farinha, manteiga e receba alertas de reposição.' },
      { icon: 'Camera', title: 'Cardápio Visual', description: 'Cardápio digital com fotos dos doces para encantar clientes.' },
      { icon: 'Heart', title: 'Fidelidade', description: 'Pontos por compra e desconto por número de pedidos (plano Business).' },
    ],
    cta: {
      headline: 'Pronto para profissionalizar sua doceria?',
      description: 'Controle custos, fichas técnicas e estoque como profissional.',
    },
    color: 'from-pink-500 to-rose-600',
  },
  {
    slug: 'marmitaria',
    name: 'Sistema para Marmitaria',
    shortName: 'Marmitaria',
    emoji: '🍱',
    metaTitle: 'Sistema para Marmitaria | Gastrux',
    metaDescription: 'Sistema para marmitarias. Custo por marmita, planejamento de produção, embalagens e previsão de demanda.',
    heroHeadline: 'Gestão inteligente para marmitarias',
    heroDescription: 'Planeje a produção, controle o estoque de insumos e embalagens e saiba o custo de cada marmita.',
    painPoints: [
      'Produção em grande volume sem controle de custo',
      'Produção do dia planejada no chute',
      'Desperdício alto em dias de baixa demanda',
      'Entrega de marmitas sem rastreamento',
    ],
    benefits: [
      { icon: 'Calendar', title: 'Planejamento de Produção', description: 'Planeje receitas e quantidades a produzir.' },
      { icon: 'Calculator', title: 'Custo por Marmita', description: 'Saiba exatamente o custo de cada tipo de marmita.' },
      { icon: 'Package', title: 'Estoque + Embalagens', description: 'Controle insumos e embalagens descartáveis juntos.' },
      { icon: 'Truck', title: 'Pedidos pelo WhatsApp', description: 'Receba pedidos pelo WhatsApp com cardápio.' },
      { icon: 'BarChart3', title: 'Previsão de Demanda', description: 'Previsão de vendas a partir do seu histórico (plano Pro).' },
      { icon: 'Wallet', title: 'Fidelidade', description: 'Pontos por compra e prêmio por número de pedidos (plano Business).' },
    ],
    cta: {
      headline: 'Pronto para escalar sua marmitaria?',
      description: 'Produza mais, desperdice menos, lucre melhor.',
    },
    color: 'from-green-700 to-emerald-800',
  },
  {
    slug: 'acai',
    name: 'Sistema para Loja de Açaí',
    shortName: 'Açaí',
    emoji: '🫐',
    metaTitle: 'Sistema para Loja de Açaí | Gastrux',
    metaDescription: 'Sistema para lojas de açaí e smoothies. Adicionais, custo por copo, estoque de polpa e delivery.',
    heroHeadline: 'O sistema para lojas de açaí',
    heroDescription: 'Gerencie tamanhos, adicionais e delivery. Controle estoque de polpa e frutas com alerta de estoque baixo.',
    painPoints: [
      'Muitas combinações de tamanho + toppings',
      'Controle de polpa congelada e validade',
      'Alto volume de delivery em dias quentes',
      'Margem apertada nos tamanhos menores',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Adicionais', description: 'Cadastre toppings e adicionais com preço; o custo sai da ficha técnica de cada copo.' },
      { icon: 'Snowflake', title: 'Estoque de Polpa', description: 'Lotes de polpa congelada com validade e fornecedor registrados.' },
      { icon: 'Calculator', title: 'CMV por Tamanho', description: 'Uma ficha técnica por tamanho mostra a margem de cada copo, do P ao GG.' },
      { icon: 'Truck', title: 'Delivery Integrado', description: 'WhatsApp + balcão em uma tela só.' },
      { icon: 'Star', title: 'Fidelidade', description: 'Prêmio por número de pedidos, como um copo grátis no 10º. Sem cartãozinho de papel (plano Business).' },
      { icon: 'Sun', title: 'Previsão de Demanda', description: 'Previsão de vendas a partir do seu histórico (plano Pro).' },
    ],
    cta: {
      headline: 'Pronto para crescer sua loja de açaí?',
      description: 'Controle cada litro de polpa e cada topping.',
    },
    color: 'from-purple-600 to-violet-700',
  },
  {
    slug: 'bar',
    name: 'Sistema para Bar, Pub e Cervejaria',
    shortName: 'Bar & Pub',
    emoji: '🍺',
    metaTitle: 'Sistema para Bar, Pub e Cervejaria | Gastrux',
    metaDescription: 'Sistema para bares, pubs e cervejarias. Comanda digital, estoque de bebidas, caixa e custo por dose.',
    heroHeadline: 'O sistema para bares e cervejarias',
    heroDescription: 'Gerencie comandas, estoque de bebidas, custo por copo e dose, e o caixa. Tudo digital.',
    painPoints: [
      'Comandas perdidas e furos no fechamento',
      'Custo de cada dose e copo desconhecido',
      'Comanda de papel que some no fim da noite',
      'Estoque de bebidas alcoólicas sem organização',
    ],
    benefits: [
      { icon: 'CreditCard', title: 'Comanda Digital', description: 'Comanda eletrônica por mesa, sem papel, sem perda.' },
      { icon: 'Beer', title: 'Custo por Copo', description: 'A ficha técnica mostra o custo de cada copo de chopp e de cada dose.' },
      { icon: 'Clock', title: 'Funciona sem Internet', description: 'Comanda e venda de balcão continuam se a internet cair.' },
      { icon: 'Package', title: 'Estoque de Bebidas', description: 'Controle garrafas, latas e barris, com baixa pelas vendas e alerta de estoque baixo.' },
      { icon: 'Wallet', title: 'Controle de Caixa', description: 'Abertura, sangria, fechamento e conferência de caixa.' },
      { icon: 'Users', title: 'Equipe e Permissões', description: 'Garçom, caixa e gerente, cada um com o acesso que precisa.' },
    ],
    cta: {
      headline: 'Pronto para modernizar seu bar?',
      description: 'Comanda digital, custo por dose e caixa conferido.',
    },
    color: 'from-yellow-700 to-amber-800',
  },
];

export function getSegmentBySlug(slug: string): Segment | undefined {
  return SEGMENTS.find((s) => s.slug === slug);
}
