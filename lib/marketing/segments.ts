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
      { icon: 'Package', title: 'Estoque com Alertas', description: 'Baixa automática pelas vendas e alerta de estoque baixo; validade dos preparos com etiquetas (plano Business).' },
      { icon: 'Utensils', title: 'Cardápio Digital + QR', description: 'Cardápio digital com QR Code nas mesas e pedidos pelo celular; no Business, o cliente também paga a conta pelo celular.' },
      { icon: 'TrendingUp', title: 'DRE e Caixa', description: 'DRE montada com as vendas do caixa, as contas a pagar e as contas de consumo.' },
      { icon: 'Users', title: 'Gestão de Equipe', description: 'Escalas, comissões e permissões por função (garçom, caixa, cozinha, gerente).' },
      { icon: 'Brain', title: 'Pergunte ao Gastrux', description: 'Pergunte quanto vendeu, o que está acabando ou qual prato dá mais margem, e a IA responde com os seus números.' },
    ],
    cta: {
      headline: 'Pronto para transformar a gestão do seu restaurante?',
      description: 'Teste 30 dias grátis, com tudo do Business, sem cartão e com os seus próprios pratos.',
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
    heroDescription: 'Organize os pedidos do delivery, a cozinha e o estoque, e saiba a margem de cada prato. Ainda não há conexão pronta com iFood, Keeta ou 99Food.',
    painPoints: [
      'Pedidos chegando de vários apps sem controle',
      'Sem saber qual plataforma dá mais lucro',
      'Estoque não acompanha o volume de pedidos',
      'Pedidos anotados em papel que se perdem no pico',
    ],
    benefits: [
      { icon: 'Smartphone', title: 'API de Pedidos', description: 'Seu site, bot ou sistema manda pedidos direto para a Gastrux, com chave e documentação em português (Pro e Business).' },
      { icon: 'BarChart3', title: 'Margem por prato', description: 'CMV e margem de contribuição de cada item do cardápio.' },
      { icon: 'Package', title: 'Estoque Integrado', description: 'Pedidos feitos na Gastrux baixam o estoque pela ficha técnica.' },
      { icon: 'Clock', title: 'Tela da Cozinha', description: 'A tela da cozinha mostra os pedidos na ordem e há quanto tempo cada um espera.' },
      { icon: 'MapPin', title: 'Status dos Pedidos', description: 'Acompanhe cada pedido do recebimento à saída para entrega.' },
      { icon: 'MessageSquare', title: 'Bot WhatsApp', description: 'Receba pedidos pelo WhatsApp com cardápio interativo, com o WhatsApp Business conectado.' },
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
      { icon: 'Building2', title: 'Multi-Unidade', description: 'Painel com faturamento, vendas, ticket médio e CMV de cada loja, com os números do Caixa e da DRE (Business: 2 lojas; Enterprise: ilimitadas).' },
      { icon: 'BookOpen', title: 'Ficha Técnica Padrão', description: 'Copie as fichas técnicas de uma loja para as outras.' },
      { icon: 'BarChart3', title: 'Comparação entre Lojas', description: 'Compare faturamento, pedidos e ticket médio entre unidades.' },
      { icon: 'Package', title: 'Lista de Compras', description: 'Compras de cada loja a partir do estoque e dos fornecedores cadastrados.' },
      { icon: 'Shield', title: 'Controle de Acesso', description: 'Permissões por unidade: o gerente vê só a loja dele, o dono vê todas.' },
      { icon: 'TrendingUp', title: 'Relatórios por Unidade', description: 'DRE e CMV de cada loja, com as vendas do caixa de cada uma.' },
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
      { icon: 'Truck', title: 'Delivery Integrado', description: 'Pedidos do site de delivery, do WhatsApp e do balcão chegam na mesma tela da cozinha.' },
      { icon: 'Timer', title: 'KDS para o Forno', description: 'Pedidos na tela da cozinha na ordem de chegada, com o tempo de espera de cada um.' },
      { icon: 'Package', title: 'Controle de Insumos', description: 'Estoque de massa, molho e queijo com baixa pelas vendas e alerta de estoque baixo.' },
      { icon: 'Gift', title: 'Cashback', description: 'O cliente ganha crédito em reais a cada pizza e usa como desconto na próxima (plano Business).' },
    ],
    cta: {
      headline: 'Pronto para modernizar sua pizzaria?',
      description: 'Teste 30 dias grátis e veja a diferença no primeiro fim de semana.',
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
      { icon: 'Layers', title: 'Adicionais', description: 'Bacon extra, queijo, ponto da carne: o garçom escolhe na conta e a cozinha vê no pedido.' },
      { icon: 'Truck', title: 'Pedidos pelo WhatsApp', description: 'Pedidos pelo WhatsApp com cardápio; ainda sem conexão pronta com apps de delivery.' },
      { icon: 'Thermometer', title: 'Controle de Carnes', description: 'Estoque de carnes com baixa pelas vendas e alerta de estoque baixo.' },
      { icon: 'Timer', title: 'Tela da Cozinha', description: 'Pedidos na tela da chapa na ordem de chegada, com o tempo de espera de cada um.' },
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
    metaDescription: 'Sistema para restaurantes japoneses. Ficha técnica de sushi, sashimi e temaki, estoque de peixes e validade dos preparos com etiquetas.',
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
      { icon: 'Package', title: 'Estoque de Peixes', description: 'Estoque de peixes com baixa pelas vendas e validade dos preparos com etiquetas (plano Business).' },
      { icon: 'Calculator', title: 'CMV por Peça', description: 'Saiba o custo de cada peça de sushi, sashimi e temaki.' },
      { icon: 'BookOpen', title: 'Fichas Técnicas', description: 'Padronize a montagem de cada prato com gramagem exata.' },
      { icon: 'QrCode', title: 'Pedido por QR Code', description: 'O cliente faz o pedido pelo celular na mesa; no Business, também paga a conta pelo celular.' },
      { icon: 'BarChart3', title: 'Análise de Popularidade', description: 'Descubra quais peças são mais pedidas e ajuste o preparo.' },
    ],
    cta: {
      headline: 'Pronto para otimizar seu japonês?',
      description: 'Controle o custo de cada peça de sushi e o estoque de peixe.',
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
      { icon: 'Zap', title: 'PDV Rápido', description: 'Venda de balcão em poucos toques, com o celular do cliente para o cashback.' },
      { icon: 'Calculator', title: 'Custo por Item', description: 'Saiba a margem de cada salgado, suco e sanduíche.' },
      { icon: 'ClipboardList', title: 'Contagem do Dia', description: 'Quantos salgados você fritou, vendeu e perdeu: no fim do dia, o Gastrux mostra quanto deveria sobrar.' },
      { icon: 'Wallet', title: 'Controle de Caixa', description: 'Abertura, sangria, fechamento e conferência de caixa.' },
      { icon: 'Smartphone', title: 'Pedidos WhatsApp', description: 'Receba pedidos pelo WhatsApp e integre com a produção.' },
      { icon: 'Receipt', title: 'NFC-e Automática', description: 'A nota do consumidor sai ao fechar a conta, com o certificado digital e os dados do contador.' },
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
      { icon: 'ClipboardList', title: 'Contagem do Dia', description: 'Brigadeiros, fatias e doces de pote: no fim do dia, o Gastrux mostra quanto deveria sobrar.' },
      { icon: 'Package', title: 'Estoque de Insumos', description: 'Controle chocolate, farinha, manteiga e receba alertas de reposição.' },
      { icon: 'Camera', title: 'Cardápio Visual', description: 'Cardápio digital com fotos dos doces para encantar clientes.' },
      { icon: 'Gift', title: 'Cashback', description: 'O cliente ganha crédito em reais a cada compra e usa como desconto na próxima (plano Business).' },
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
    metaDescription: 'Sistema para marmitarias. Custo por marmita, planejamento de produção, embalagens e contagem do dia.',
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
      { icon: 'ClipboardList', title: 'Contagem do Dia', description: 'Quantas marmitas você montou, vendeu e perdeu: no fim do dia, o Gastrux mostra quanto deveria sobrar.' },
      { icon: 'Gift', title: 'Cashback', description: 'O cliente ganha crédito em reais a cada marmita e usa como desconto na próxima (plano Business).' },
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
      { icon: 'Snowflake', title: 'Estoque de Polpa', description: 'Estoque de polpa com baixa pelas vendas e alerta de estoque baixo.' },
      { icon: 'Calculator', title: 'CMV por Tamanho', description: 'Uma ficha técnica por tamanho mostra a margem de cada copo, do P ao GG.' },
      { icon: 'Truck', title: 'Delivery Integrado', description: 'Pedidos do site de delivery, do WhatsApp e do balcão na mesma tela da cozinha.' },
      { icon: 'Gift', title: 'Cashback', description: 'Crédito em reais a cada copo, usado como desconto no próximo. Sem cartãozinho de papel (plano Business).' },
      { icon: 'Brain', title: 'Pergunte ao Gastrux', description: 'Pergunte quais tamanhos mais vendem e quanto sobra de margem em cada copo, e a IA responde com os seus números.' },
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
      { icon: 'Smartphone', title: 'Pagamento na Mesa', description: 'O cliente paga a conta pelo celular, por PIX ou cartão, e divide com os amigos (plano Business).' },
      { icon: 'Users', title: 'Equipe e Permissões', description: 'Garçom, caixa e gerente, cada um com o acesso que precisa.' },
    ],
    cta: {
      headline: 'Pronto para modernizar seu bar?',
      description: 'Comanda digital, custo por dose e caixa conferido.',
    },
    color: 'from-yellow-700 to-amber-800',
  },
  {
    slug: 'espetaria',
    name: 'Sistema para Espetaria',
    shortName: 'Espetaria',
    emoji: '🍢',
    metaTitle: 'Sistema para Espetaria e Espetinho | Gastrux',
    metaDescription: 'Sistema para espetarias. Comanda por mesa no celular, custo de cada espeto, estoque de carnes e caixa.',
    heroHeadline: 'O sistema para a sua espetaria',
    heroDescription: 'Lance os espetos na comanda pelo celular, saiba quanto custa cada espeto e controle carnes, carvão e caixa. Tudo digital.',
    painPoints: [
      'Comanda de papel com dezenas de espetos que somem ou saem errados',
      'Custo de cada espeto desconhecido quando a carne sobe',
      'Carne e carvão acabando no meio da noite',
      'Fechamento de caixa que nunca bate',
    ],
    benefits: [
      { icon: 'Smartphone', title: 'Comanda no Celular', description: 'O garçom lança os espetos da mesa pelo celular, sem papel.' },
      { icon: 'Utensils', title: 'Pedido na Churrasqueira', description: 'O pedido da mesa aparece na tela da cozinha ou da churrasqueira.' },
      { icon: 'DollarSign', title: 'Custo por Espeto', description: 'A ficha técnica mostra o custo e a margem de cada espeto.' },
      { icon: 'Package', title: 'Estoque de Carnes', description: 'Baixa pelas vendas e alerta quando a carne ou o carvão está acabando.' },
      { icon: 'Clock', title: 'Funciona sem Internet', description: 'Comanda e venda de balcão continuam se a internet cair.' },
      { icon: 'ClipboardList', title: 'Contagem de Espetos', description: 'Montados, vendidos e perdas de cada espeto: no fim da noite, o Gastrux mostra quanto deveria sobrar.' },
    ],
    cta: {
      headline: 'Pronto para modernizar sua espetaria?',
      description: 'Comanda no celular, custo por espeto e caixa conferido.',
    },
    color: 'from-orange-700 to-red-800',
  },
  // Padaria and cafeteria (owner, 2026-10-23). Only what works today: sale by weight and encomendas come later
  {
    slug: 'padaria',
    name: 'Sistema para Padaria',
    shortName: 'Padaria',
    emoji: '🥖',
    metaTitle: 'Sistema para Padaria | Gastrux',
    metaDescription: 'Sistema para padarias: custo de cada pão e salgado, fornadas planejadas, contagem do que sobrou, caixa e NFC-e.',
    heroHeadline: 'Controle de verdade para a sua padaria',
    heroDescription: 'Saiba quanto custa cada pão, salgado e fatia de bolo, planeje as fornadas do dia e confira no fim do dia o que foi vendido e o que sobrou.',
    painPoints: [
      'Não saber quanto custa de verdade um pão francês ou um sonho',
      'Fornada demais vira perda; fornada de menos vira fila',
      'Farinha, manteiga e fermento acabando sem aviso',
      'Caixa do balcão que nunca bate no fim do dia',
    ],
    benefits: [
      { icon: 'Calculator', title: 'Custo de Cada Produto', description: 'Ficha técnica do pão, do salgado e do bolo: o Gastrux mostra o custo e a margem de cada um.' },
      { icon: 'Calendar', title: 'Planejamento das Fornadas', description: 'Planeje quanto produzir de cada item no dia e veja quanto a fornada custa.' },
      { icon: 'ClipboardList', title: 'Contagem do Dia', description: 'Quantos pães e salgados saíram do forno, quantos foram vendidos e quantos sobraram.' },
      { icon: 'Thermometer', title: 'Etiquetas e Validades', description: 'Etiqueta de manipulação com data de preparo e validade para o que vai para a vitrine.' },
      { icon: 'Zap', title: 'Venda de Balcão Rápida', description: 'Venda em poucos toques no caixa, com NFC-e ao fechar a venda.' },
      { icon: 'Gift', title: 'Cashback', description: 'O cliente da manhã ganha crédito em reais a cada compra e volta para usar (plano Business).' },
    ],
    cta: {
      headline: 'Pronto para profissionalizar sua padaria?',
      description: 'Custo de cada produto, fornadas planejadas e caixa conferido.',
    },
    color: 'from-amber-500 to-orange-600',
  },
  {
    slug: 'cafeteria',
    name: 'Sistema para Cafeteria',
    shortName: 'Cafeteria',
    emoji: '☕',
    metaTitle: 'Sistema para Cafeteria | Gastrux',
    metaDescription: 'Sistema para cafeterias: custo de cada café, adicionais como bebida vegetal e dose extra, balcão rápido, cashback e NFC-e.',
    heroHeadline: 'O sistema certo para a sua cafeteria',
    heroDescription: 'Do espresso ao latte com bebida vegetal: saiba a margem de cada bebida, venda rápido no balcão e traga o cliente de volta com cashback.',
    painPoints: [
      'Café especial caro e margem de cada bebida desconhecida',
      'Adicionais (dose extra, bebida vegetal) que ninguém cobra direito',
      'Pão de queijo e bolo do dia que sobram sem controle',
      'Cliente fiel sem nenhum motivo para voltar',
    ],
    benefits: [
      { icon: 'Calculator', title: 'Margem de Cada Bebida', description: 'Ficha técnica do espresso, do cappuccino e do latte, com o custo do grão e do leite.' },
      { icon: 'Layers', title: 'Adicionais', description: 'Dose extra, bebida vegetal e chantilly como adicionais com preço próprio no pedido.' },
      { icon: 'Zap', title: 'Balcão Rápido', description: 'Pedido pelo nome do cliente, comanda para a cozinha e pagamento em poucos toques.' },
      { icon: 'ClipboardList', title: 'Contagem do Dia', description: 'Pão de queijo e fatias de bolo: quanto saiu do forno, quanto vendeu, quanto sobrou.' },
      { icon: 'Gift', title: 'Cashback', description: 'O cliente ganha crédito em reais a cada compra e usa como desconto na próxima (plano Business).' },
      { icon: 'Receipt', title: 'NFC-e Automática', description: 'A nota do consumidor sai ao fechar a venda, com o certificado digital e os dados do contador.' },
    ],
    cta: {
      headline: 'Pronto para organizar sua cafeteria?',
      description: 'Margem de cada bebida, balcão rápido e cliente que volta.',
    },
    color: 'from-yellow-700 to-amber-900',
  },
];

export function getSegmentBySlug(slug: string): Segment | undefined {
  return SEGMENTS.find((s) => s.slug === slug);
}
