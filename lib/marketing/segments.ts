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
  stats: Array<{ value: string; label: string }>;
  testimonial: {
    quote: string;
    author: string;
    role: string;
  };
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
    metaDescription: 'Software completo para gestão de restaurantes. Controle estoque, CMV, pedidos, mesas e financeiro em um único lugar.',
    heroHeadline: 'O sistema completo para o seu restaurante',
    heroDescription: 'Gerencie estoque, cardápio, mesas, pedidos e financeiro em uma única plataforma. Reduza desperdício e aumente sua margem de lucro.',
    painPoints: [
      'Falta de controle sobre o que sai da cozinha',
      'CMV calculado na mão, sempre atrasado',
      'Desperdício de alimentos sem visibilidade',
      'Dificuldade de gerenciar múltiplas frentes ao mesmo tempo',
    ],
    benefits: [
      { icon: 'BarChart3', title: 'CMV Automático', description: 'Saiba exatamente o custo de cada prato em tempo real, sem planilhas.' },
      { icon: 'Package', title: 'Estoque Inteligente', description: 'Alertas de estoque baixo e controle de validade automatizados.' },
      { icon: 'Utensils', title: 'Cardápio Digital + QR', description: 'Cardápio digital com QR Code nas mesas e pedidos direto pelo celular.' },
      { icon: 'TrendingUp', title: 'DRE e Fluxo de Caixa', description: 'Relatórios financeiros completos para tomar decisões com dados.' },
      { icon: 'Users', title: 'Gestão de Equipe', description: 'Controle de ponto, escalas, folha e performance da equipe.' },
      { icon: 'Brain', title: 'Insights com IA', description: 'Inteligência artificial analisa seus dados e sugere ações para melhorar.' },
    ],
    stats: [
      { value: '22%', label: 'Menos desperdício' },
      { value: 'R$ 3.200', label: 'Economia média/mês' },
      { value: '21h', label: 'Horas salvas/semana' },
      { value: '+18%', label: 'Margem de lucro' },
    ],
    testimonial: {
      quote: 'Depois do Gastrux, finalmente consigo ver o CMV real do meu restaurante. Reduzi o desperdício em 25% no primeiro mês.',
      author: 'Carlos Mendes',
      role: 'Dono de restaurante, SP',
    },
    cta: {
      headline: 'Pronto para transformar a gestão do seu restaurante?',
      description: 'Comece grátis e veja resultados em menos de 30 dias.',
    },
    color: 'from-blue-600 to-blue-800',
  },
  {
    slug: 'delivery',
    name: 'Sistema para Delivery',
    shortName: 'Delivery',
    emoji: '🛵',
    metaTitle: 'Sistema para Delivery | Gastrux',
    metaDescription: 'Gerencie pedidos de delivery, integre com iFood, Rappi e Uber Eats. Controle entregas e aumente suas vendas online.',
    heroHeadline: 'Seu delivery organizado e lucrativo',
    heroDescription: 'Centralize pedidos de iFood, Rappi e Uber Eats. Controle entregas, estoque e margem de cada canal em tempo real.',
    painPoints: [
      'Pedidos chegando de vários apps sem controle',
      'Sem saber qual plataforma dá mais lucro',
      'Estoque não acompanha o volume de pedidos',
      'Dificuldade de gerenciar entregadores e rotas',
    ],
    benefits: [
      { icon: 'Smartphone', title: 'Hub de Pedidos Unificado', description: 'Todos os pedidos de todos os apps em uma tela só.' },
      { icon: 'BarChart3', title: 'Analytics por Canal', description: 'Saiba exatamente a margem de lucro por plataforma de delivery.' },
      { icon: 'Package', title: 'Estoque Integrado', description: 'Estoque atualiza automaticamente a cada pedido recebido.' },
      { icon: 'Clock', title: 'Tempo de Preparo', description: 'KDS digital para cozinha com tempo médio de preparo por prato.' },
      { icon: 'MapPin', title: 'Gestão de Entregas', description: 'Controle status de cada entrega e performance dos entregadores.' },
      { icon: 'MessageSquare', title: 'Bot WhatsApp', description: 'Receba pedidos direto pelo WhatsApp com cardápio interativo.' },
    ],
    stats: [
      { value: '40%', label: 'Mais eficiência' },
      { value: '15min', label: 'Tempo médio de preparo' },
      { value: '3x', label: 'Mais pedidos/hora' },
      { value: '98%', label: 'Pedidos corretos' },
    ],
    testimonial: {
      quote: 'Centralizamos iFood e Rappi no Gastrux. Nosso tempo de preparo caiu de 35 para 18 minutos.',
      author: 'Fernanda Lima',
      role: 'Dona de delivery, RJ',
    },
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
    metaDescription: 'Gerencie múltiplas unidades de franquia com padronização de receitas, estoque centralizado e relatórios consolidados.',
    heroHeadline: 'Controle total das suas franquias',
    heroDescription: 'Padronize receitas, centralize estoque e monitore cada unidade em tempo real. Dashboard consolidado para franqueadores.',
    painPoints: [
      'Cada unidade opera de um jeito diferente',
      'Sem visibilidade consolidada de vendas e custos',
      'Dificuldade de padronizar receitas e porções',
      'Comunicação fragmentada entre unidades',
    ],
    benefits: [
      { icon: 'Building2', title: 'Multi-Unidade', description: 'Painel consolidado com dados de todas as unidades em tempo real.' },
      { icon: 'BookOpen', title: 'Ficha Técnica Padrão', description: 'Receitas padronizadas que se replicam automaticamente em todas as lojas.' },
      { icon: 'BarChart3', title: 'Benchmark entre Lojas', description: 'Compare performance, CMV e vendas entre unidades.' },
      { icon: 'Package', title: 'Compras Centralizadas', description: 'Lista de compras unificada com os melhores preços para todas as unidades.' },
      { icon: 'Shield', title: 'Controle de Acesso', description: 'Permissões por unidade — gerente vê só sua loja, franqueador vê tudo.' },
      { icon: 'TrendingUp', title: 'Relatórios Consolidados', description: 'DRE, CMV e fluxo de caixa consolidados ou por unidade.' },
    ],
    stats: [
      { value: '100%', label: 'Padronização' },
      { value: '30%', label: 'Economia em compras' },
      { value: '5min', label: 'Para ver todas as lojas' },
      { value: '0', label: 'Desvios de receita' },
    ],
    testimonial: {
      quote: 'Com o Gastrux, nossas 3 lojas operam com a mesma ficha técnica. O CMV caiu 8% em todas as unidades.',
      author: 'Ricardo Souza',
      role: 'Franqueador, MG',
    },
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
    metaDescription: 'Sistema completo para pizzarias. Controle sabores, tamanhos, bordas, delivery e estoque de insumos.',
    heroHeadline: 'O sistema feito para pizzarias',
    heroDescription: 'Gerencie sabores, tamanhos, bordas recheadas, delivery e estoque de massa e insumos. Tudo no mesmo sistema.',
    painPoints: [
      'Cardápio complexo com sabores, tamanhos e bordas',
      'Cálculo de custo por fatia é complicado',
      'Volume alto de delivery nos fins de semana',
      'Controle de massa fresca e insumos perecíveis',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Cardápio Flexível', description: 'Monte sabores por tamanho, meia-pizza, borda recheada e adicionais.' },
      { icon: 'Calculator', title: 'CMV por Sabor', description: 'Saiba o custo real de cada sabor e tamanho automaticamente.' },
      { icon: 'Truck', title: 'Delivery Integrado', description: 'Pedidos de iFood, WhatsApp e balcão em uma tela só.' },
      { icon: 'Timer', title: 'KDS para Forno', description: 'Tela de produção com timer por pizza e sequência de preparo.' },
      { icon: 'Package', title: 'Controle de Massa', description: 'Estoque de massa fresca, molho e queijo com alertas de validade.' },
      { icon: 'Star', title: 'Programa de Fidelidade', description: 'A cada 10 pizzas, 1 grátis. Configure promoções que fidelizam.' },
    ],
    stats: [
      { value: '200+', label: 'Pizzarias atendidas' },
      { value: '25%', label: 'Menos desperdício de massa' },
      { value: '2x', label: 'Mais pedidos delivery' },
      { value: '15min', label: 'Tempo médio preparo' },
    ],
    testimonial: {
      quote: 'Finalmente um sistema que entende pizzaria. O controle de meia-pizza e bordas mudou nosso delivery.',
      author: 'Marcos Oliveira',
      role: 'Dono de pizzaria, SP',
    },
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
    metaDescription: 'Sistema para hamburguerias artesanais. Controle blend, montagem, combos, delivery e estoque de carnes.',
    heroHeadline: 'O sistema para hamburguerias artesanais',
    heroDescription: 'Gerencie blends, montagem personalizada, combos, acompanhamentos e delivery. Controle de carne moída e insumos premium.',
    painPoints: [
      'Custo do blend artesanal difícil de calcular',
      'Combos com muitas variações de acompanhamento',
      'Alto volume de delivery com montagem personalizada',
      'Controle de carne moída fresca e validade',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Ficha Técnica por Blend', description: 'Custos precisos de cada blend e montagem personalizada.' },
      { icon: 'Layers', title: 'Combos Inteligentes', description: 'Monte combos com burger + acompanhamento + bebida e calcule margem.' },
      { icon: 'Truck', title: 'Delivery Otimizado', description: 'Integração com apps + WhatsApp para pedidos personalizados.' },
      { icon: 'Thermometer', title: 'Controle de Carnes', description: 'Estoque de carnes premium com rastreabilidade e validade.' },
      { icon: 'Timer', title: 'KDS por Chapa', description: 'Tela de produção com tempo por smash e sequência de montagem.' },
      { icon: 'TrendingUp', title: 'Menu Engineering', description: 'Descubra quais burgers são estrelas e quais precisam sair do cardápio.' },
    ],
    stats: [
      { value: '150+', label: 'Hamburguerias' },
      { value: '18%', label: 'Aumento de margem' },
      { value: 'R$ 2.800', label: 'Economia média/mês' },
      { value: '4.9/5', label: 'Satisfação' },
    ],
    testimonial: {
      quote: 'O Gastrux me mostrou que meu blend mais vendido tinha a pior margem. Ajustei e o lucro subiu 20%.',
      author: 'Thiago Ferreira',
      role: 'Dono de hamburgueria, BH',
    },
    cta: {
      headline: 'Pronto para turbinar sua hamburgueria?',
      description: 'Controle cada grama de carne e cada centavo de lucro.',
    },
    color: 'from-amber-600 to-orange-700',
  },
  {
    slug: 'japones',
    name: 'Sistema para Restaurante Japonês',
    shortName: 'Japonês',
    emoji: '🍣',
    metaTitle: 'Sistema para Restaurante Japonês | Gastrux',
    metaDescription: 'Sistema para restaurantes japoneses. Controle rodízio, sushi, sashimi, temaki e estoque de peixes frescos.',
    heroHeadline: 'O sistema ideal para restaurantes japoneses',
    heroDescription: 'Gerencie rodízio, combos de sushi, sashimi e temaki. Controle peixes frescos, alga nori e arroz com precisão.',
    painPoints: [
      'Rodízio dificulta controle de custo por cliente',
      'Peixes frescos com prazo curtíssimo de validade',
      'Muitos itens no cardápio com variações complexas',
      'Custo de insumos importados volátil',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Gestão de Rodízio', description: 'Controle consumo médio por pessoa e custo real do rodízio.' },
      { icon: 'Package', title: 'Estoque de Peixes', description: 'Rastreabilidade de lotes, controle de validade hora-a-hora.' },
      { icon: 'Calculator', title: 'CMV por Peça', description: 'Saiba o custo de cada peça de sushi, sashimi e temaki.' },
      { icon: 'BookOpen', title: 'Fichas Técnicas', description: 'Padronize a montagem de cada prato com gramagem exata.' },
      { icon: 'QrCode', title: 'Pedido por QR Code', description: 'Cliente faz pedido pelo celular no rodízio — menos garçons, mais agilidade.' },
      { icon: 'BarChart3', title: 'Análise de Popularidade', description: 'Descubra quais peças são mais pedidas e ajuste o preparo.' },
    ],
    stats: [
      { value: '30%', label: 'Menos desperdício de peixe' },
      { value: 'R$ 4.500', label: 'Economia média/mês' },
      { value: '100%', label: 'Rastreabilidade' },
      { value: '2x', label: 'Velocidade do rodízio' },
    ],
    testimonial: {
      quote: 'O controle de peixe fresco era nosso maior problema. Com o Gastrux, o desperdício caiu pela metade.',
      author: 'Kenji Tanaka',
      role: 'Chef e proprietário, SP',
    },
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
      { icon: 'Wallet', title: 'Controle de Caixa', description: 'Abertura, fechamento e conferência de caixa digitalizados.' },
      { icon: 'Smartphone', title: 'Pedidos WhatsApp', description: 'Receba pedidos pelo WhatsApp e integre com a produção.' },
      { icon: 'Receipt', title: 'NFC-e Automática', description: 'Emita nota fiscal de consumidor em 1 clique.' },
    ],
    stats: [
      { value: '50%', label: 'Menos tempo no caixa' },
      { value: 'R$ 1.800', label: 'Economia média/mês' },
      { value: '0', label: 'Furos no caixa' },
      { value: '3s', label: 'Tempo de registro' },
    ],
    testimonial: {
      quote: 'Sistema rápido, sem frescura. Perfeito para a correria da lanchonete no horário de almoço.',
      author: 'Ana Paula Costa',
      role: 'Dona de lanchonete, GO',
    },
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
    metaDescription: 'Sistema para docerias e confeitarias. Controle produção sob encomenda, fichas técnicas de doces e estoque de ingredientes.',
    heroHeadline: 'O sistema perfeito para docerias',
    heroDescription: 'Gerencie encomendas, fichas técnicas de doces e bolos, estoque de ingredientes e custos com precisão de confeiteira.',
    painPoints: [
      'Produção sob encomenda difícil de organizar',
      'Cálculo de custo de bolos personalizados é complexo',
      'Ingredientes caros com validade curta',
      'Sem controle de agenda de encomendas',
    ],
    benefits: [
      { icon: 'Calendar', title: 'Agenda de Encomendas', description: 'Organize produção por data de entrega e tipo de doce.' },
      { icon: 'Calculator', title: 'Precificação Exata', description: 'Calcule o custo de cada bolo, brigadeiro e sobremesa automaticamente.' },
      { icon: 'BookOpen', title: 'Fichas Técnicas', description: 'Receitas padronizadas com gramagem exata para cada doce.' },
      { icon: 'Package', title: 'Estoque de Insumos', description: 'Controle chocolate, farinha, manteiga e receba alertas de reposição.' },
      { icon: 'Camera', title: 'Cardápio Visual', description: 'Cardápio digital com fotos dos doces para encantar clientes.' },
      { icon: 'Heart', title: 'Fidelidade', description: 'A cada 10 encomendas, ofereça desconto — fidelize suas clientes.' },
    ],
    stats: [
      { value: '100%', label: 'Custo preciso' },
      { value: '20%', label: 'Aumento de margem' },
      { value: '0', label: 'Encomendas esquecidas' },
      { value: 'R$ 2.000', label: 'Economia média/mês' },
    ],
    testimonial: {
      quote: 'Eu calculava custo de bolo no papel. O Gastrux faz em 5 segundos e mostra a margem real.',
      author: 'Juliana Martins',
      role: 'Confeiteira, PR',
    },
    cta: {
      headline: 'Pronto para profissionalizar sua doceria?',
      description: 'Controle encomendas, custos e estoque como profissional.',
    },
    color: 'from-pink-500 to-rose-600',
  },
  {
    slug: 'marmitaria',
    name: 'Sistema para Marmitaria',
    shortName: 'Marmitaria',
    emoji: '🍱',
    metaTitle: 'Sistema para Marmitaria | Gastrux',
    metaDescription: 'Sistema para marmitarias. Controle produção em escala, cardápio rotativo, embalagens e entregas.',
    heroHeadline: 'Gestão inteligente para marmitarias',
    heroDescription: 'Controle produção em escala, cardápio rotativo semanal, estoque de embalagens e entregas com precisão.',
    painPoints: [
      'Produção em grande volume sem controle de custo',
      'Cardápio rotativo difícil de planejar',
      'Desperdício alto em dias de baixa demanda',
      'Entrega de marmitas sem rastreamento',
    ],
    benefits: [
      { icon: 'Calendar', title: 'Cardápio Rotativo', description: 'Programe o cardápio semanal com receitas e quantidades.' },
      { icon: 'Calculator', title: 'Custo por Marmita', description: 'Saiba exatamente o custo de cada tipo de marmita.' },
      { icon: 'Package', title: 'Estoque + Embalagens', description: 'Controle insumos e embalagens descartáveis juntos.' },
      { icon: 'Truck', title: 'Gestão de Entregas', description: 'Organize rotas e rastreie entregas por região.' },
      { icon: 'BarChart3', title: 'Previsão de Demanda', description: 'IA prevê a demanda do dia baseada no histórico.' },
      { icon: 'Wallet', title: 'Assinaturas', description: 'Clientes assinam planos semanais/mensais de marmita.' },
    ],
    stats: [
      { value: '35%', label: 'Menos desperdício' },
      { value: '500+', label: 'Marmitas/dia gerenciadas' },
      { value: 'R$ 2.500', label: 'Economia média/mês' },
      { value: '98%', label: 'Entregas no prazo' },
    ],
    testimonial: {
      quote: 'Antes eu jogava fora 30 marmitas por dia. Com a previsão de demanda do Gastrux, caiu para 5.',
      author: 'Roberto Silva',
      role: 'Dono de marmitaria, MG',
    },
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
    metaDescription: 'Sistema para lojas de açaí e smoothies. Controle toppings, tamanhos, estoque de polpa e delivery.',
    heroHeadline: 'O sistema para lojas de açaí',
    heroDescription: 'Gerencie tamanhos, toppings, complementos e delivery. Controle estoque de polpa e frutas com alertas inteligentes.',
    painPoints: [
      'Muitas combinações de tamanho + toppings',
      'Controle de polpa congelada e validade',
      'Alto volume de delivery em dias quentes',
      'Margem apertada nos tamanhos menores',
    ],
    benefits: [
      { icon: 'Utensils', title: 'Montagem Personalizada', description: 'Configure tamanhos, bases, toppings e adicionais com custo automático.' },
      { icon: 'Snowflake', title: 'Estoque de Polpa', description: 'Controle lotes de polpa congelada com validade e fornecedor.' },
      { icon: 'Calculator', title: 'CMV por Tamanho', description: 'Saiba a margem de cada copo, do P ao GG.' },
      { icon: 'Truck', title: 'Delivery Integrado', description: 'iFood + WhatsApp + balcão em uma tela só.' },
      { icon: 'Star', title: 'Fidelidade', description: 'Carimbo digital: comprou 10, ganhou 1. Sem cartãozinho de papel.' },
      { icon: 'Sun', title: 'Previsão por Clima', description: 'IA sugere produção baseada na previsão do tempo.' },
    ],
    stats: [
      { value: '300+', label: 'Lojas de açaí' },
      { value: '20%', label: 'Menos desperdício de polpa' },
      { value: '2x', label: 'Mais pedidos delivery' },
      { value: 'R$ 1.500', label: 'Economia média/mês' },
    ],
    testimonial: {
      quote: 'No verão nosso delivery explode. O Gastrux organizou tudo e não perdemos mais pedido.',
      author: 'Camila Santos',
      role: 'Dona de loja de açaí, BA',
    },
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
    metaDescription: 'Sistema para bares, pubs e cervejarias. Controle comandas, chopp, estoque de bebidas e programação de eventos.',
    heroHeadline: 'O sistema para bares e cervejarias',
    heroDescription: 'Gerencie comandas, chopp por litro, estoque de bebidas, happy hour e programação de eventos. Tudo digital.',
    painPoints: [
      'Comandas perdidas e furos no fechamento',
      'Controle de chopp por litro é manual',
      'Happy hour sem controle de preços automático',
      'Estoque de bebidas alcoólicas sem organização',
    ],
    benefits: [
      { icon: 'CreditCard', title: 'Comanda Digital', description: 'Comanda eletrônica por mesa, sem papel, sem perda.' },
      { icon: 'Beer', title: 'Controle de Chopp', description: 'Meça litros por barril, saiba quando trocar e o custo por copo.' },
      { icon: 'Clock', title: 'Happy Hour Automático', description: 'Preços ajustam automaticamente no horário programado.' },
      { icon: 'Package', title: 'Estoque de Bebidas', description: 'Controle garrafas, latas, barris e doses com precisão.' },
      { icon: 'Music', title: 'Agenda de Eventos', description: 'Programe shows, DJs e eventos com controle de custo.' },
      { icon: 'Users', title: 'Controle de Acesso', description: 'Gerencie entrada, couvert e consumação mínima.' },
    ],
    stats: [
      { value: '0', label: 'Comandas perdidas' },
      { value: '25%', label: 'Menos furo no caixa' },
      { value: 'R$ 3.000', label: 'Economia média/mês' },
      { value: '100%', label: 'Controle de chopp' },
    ],
    testimonial: {
      quote: 'Acabou a era da comanda de papel. O Gastrux digitalizou tudo e nosso furo de caixa zerou.',
      author: 'Pedro Augusto',
      role: 'Dono de pub, SP',
    },
    cta: {
      headline: 'Pronto para modernizar seu bar?',
      description: 'Comanda digital, controle de chopp e zero furo no caixa.',
    },
    color: 'from-yellow-700 to-amber-800',
  },
];

export function getSegmentBySlug(slug: string): Segment | undefined {
  return SEGMENTS.find((s) => s.slug === slug);
}
