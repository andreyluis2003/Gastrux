import { prisma } from '@/lib/prisma';

/**
 * Seeds default help categories and starter FAQ articles if none exist yet.
 * Idempotent - uses upsert by slug.
 */
export async function seedDefaultHelpContent() {
  const existing = await prisma.helpCategory.count();

  const categories = [
    { slug: 'primeiros-passos', name: 'Primeiros Passos', icon: 'Rocket', order: 1, description: 'Como começar a usar o Gastrux' },
    { slug: 'cardapio-e-receitas', name: 'Cardápio & Receitas', icon: 'ChefHat', order: 2, description: 'Cadastrar itens, calcular CMV, gerenciar receitas' },
    { slug: 'estoque-e-insumos', name: 'Estoque & Insumos', icon: 'Package', order: 3, description: 'Movimentações, alertas e inventário' },
    { slug: 'pdv-e-caixa', name: 'PDV & Caixa', icon: 'CreditCard', order: 4, description: 'Operação do caixa, pagamentos, fechamento' },
    { slug: 'comanda-e-kds', name: 'Comanda & KDS', icon: 'Utensils', order: 5, description: 'Mesa, KDS, despacho para cozinha' },
    { slug: 'faturamento-e-assinatura', name: 'Faturamento & Assinatura', icon: 'Receipt', order: 6, description: 'Planos, pagamento, faturas' },
    { slug: 'integracao-delivery', name: 'Integrações Delivery', icon: 'Truck', order: 7, description: 'iFood, Rappi, Uber Eats' },
  ];

  const createdCats: Record<string, string> = {};
  for (const c of categories) {
    const cat = await prisma.helpCategory.upsert({
      where: { slug: c.slug },
      update: c,
      create: c,
    });
    createdCats[c.slug] = cat.id;
  }

  if (existing > 0) return { created: false, reason: 'categories already existed', articles: 0 };

  const articles = [
    {
      categorySlug: 'primeiros-passos',
      slug: 'como-criar-restaurante',
      title: 'Como crio meu primeiro restaurante?',
      summary: 'Passos para cadastrar o restaurante, equipe e configurações básicas.',
      keywords: 'cadastro, setup, configuração, inicial, começar, novo',
      featured: true,
      order: 1,
      content: '## Passo a passo\n\n1. Acesse **Configurações → Meu Restaurante**\n2. Preencha nome, CNPJ (opcional), endereço e telefone\n3. Escolha fuso horário e moeda\n4. Convide sua equipe em **Admin → Usuários**\n5. Configure permissões\n\n### Depois do cadastro\n\n- Cadastre insumos em **Insumos**\n- Crie categorias de cardápio\n- Adicione receitas com ingredientes\n- Configure mesas em **Mesas**\n\n> 💡 **Dica**: Comece pelas suas 5 receitas mais vendidas.',
    },
    {
      categorySlug: 'primeiros-passos',
      slug: 'convidar-equipe',
      title: 'Como convido minha equipe?',
      summary: 'Adicionar usuários com diferentes permissões (OWNER, MANAGER, CASHIER, COOK).',
      keywords: 'usuário, equipe, colaborador, permissão, role, convidar',
      order: 2,
      content: '## Adicionando colaboradores\n\n1. Vá em **Admin → Usuários → Novo**\n2. Escolha a função:\n   - **OWNER**: Acesso total\n   - **MANAGER**: Operação completa (exceto financeiro crítico)\n   - **CASHIER**: PDV e pagamentos\n   - **COOK**: Apenas comanda e KDS\n3. Defina senha temporária\n4. Na primeira entrada o colaborador deve alterar a senha',
    },
    {
      categorySlug: 'cardapio-e-receitas',
      slug: 'calcular-cmv',
      title: 'Como calcular o CMV de uma receita?',
      summary: 'O Gastrux calcula automaticamente o Custo de Mercadoria Vendida.',
      keywords: 'cmv, custo, margem, receita, preço',
      featured: true,
      order: 1,
      content: '## CMV automático\n\nAo cadastrar ou atualizar uma receita, o sistema calcula:\n\n- **Custo total**: soma dos ingredientes (usando o último preço de compra)\n- **CMV %**: custo / preço de venda\n- **Margem**: preço − custo\n\n### Como melhorar seu CMV\n\n1. Compre em quantidades maiores dos itens mais usados\n2. Negocie com fornecedores (**Análise de Custos**)\n3. Padronize porções — use **Escalar receita**\n4. Substitua itens com custo muito volátil',
    },
    {
      categorySlug: 'estoque-e-insumos',
      slug: 'importar-csv',
      title: 'Como importo insumos via CSV?',
      summary: 'Importação em massa de catálogos de insumos.',
      keywords: 'csv, importar, planilha, bulk, massa',
      order: 1,
      content: '## Importação via CSV\n\n1. Em **Insumos**, clique em **Importar CSV**\n2. Baixe o template\n3. Preencha colunas: code, name, unit, category, minStock, referenceCost\n4. Faça upload do arquivo\n5. Confira preview e confirme\n\n### Erros comuns\n\n- Coluna unit deve ser: kg, g, l, ml, un\n- code deve ser único\n- Valores numéricos com ponto (.), não vírgula',
    },
    {
      categorySlug: 'pdv-e-caixa',
      slug: 'abrir-fechar-caixa',
      title: 'Como abrir e fechar o caixa?',
      summary: 'Operacional diário do PDV.',
      keywords: 'pdv, caixa, abertura, fechamento, sangria, suprimento',
      featured: true,
      order: 1,
      content: '## Abertura\n\n1. Acesse **PDV** e clique em **Abrir Caixa**\n2. Informe valor inicial (troco)\n\n## Movimentações\n\n- **Suprimento**: entrada de dinheiro (não-venda)\n- **Sangria**: retirada\n- **Venda**: automática ao fechar pedido\n\n## Fechamento\n\n1. Clique em **Fechar Caixa**\n2. Confira totais por forma de pagamento\n3. Informe valor contado em dinheiro\n4. Sistema calcula diferença (sobra/falta)\n5. Salve o fechamento',
    },
    {
      categorySlug: 'comanda-e-kds',
      slug: 'usar-kds',
      title: 'Como usar o KDS na cozinha?',
      summary: 'Display de pedidos em tempo real para a cozinha.',
      keywords: 'kds, cozinha, tablet, pedido, tempo real',
      order: 1,
      content: '## Configurando o KDS\n\n1. Em um tablet da cozinha, acesse **/admin/kds**\n2. Escolha a estação (Grill, Salada, Bebidas, etc)\n3. Pedidos aparecem em tempo real\n4. Toque nos cards: **Em preparo** → **Pronto**\n5. Ao marcar pronto, mesa/garçom é avisado\n\n### Alertas de tempo\n\n- Amarelo: >10 min sem mexer\n- Vermelho: >20 min (atrasado)',
    },
    {
      categorySlug: 'faturamento-e-assinatura',
      slug: 'como-cancelar',
      title: 'Como cancelo minha assinatura?',
      summary: 'Cancele a qualquer momento sem multa.',
      keywords: 'cancelar, assinatura, plano, churn',
      order: 1,
      content: '## Cancelando\n\n1. Acesse **Conta → Cobrança**\n2. Clique em **Cancelar assinatura**\n3. Confirme o motivo (nos ajuda a melhorar)\n4. Seu acesso continua até o fim do período pago\n5. Seus dados ficam arquivados por 90 dias\n\n> ❗ Após 90 dias dados podem ser removidos permanentemente conforme LGPD.',
    },
    {
      categorySlug: 'faturamento-e-assinatura',
      slug: 'baixar-fatura',
      title: 'Onde baixo minhas faturas?',
      summary: 'Acesse todas as faturas emitidas em PDF.',
      keywords: 'fatura, nota, fiscal, pdf, recibo, invoice',
      order: 2,
      content: '## Baixando faturas\n\n1. Acesse **Conta → Cobrança**\n2. Vá até **Histórico de Faturas**\n3. Clique no ícone de download (⬇️)\n4. Fatura abre em PDF no navegador\n\nTodas as faturas ficam disponíveis por 5 anos.',
    },
    {
      categorySlug: 'integracao-delivery',
      slug: 'conectar-ifood',
      title: 'Como conecto o iFood?',
      summary: 'Integre pedidos do iFood direto no KDS.',
      keywords: 'ifood, delivery, integração, pedido, online',
      featured: true,
      order: 1,
      content: '## Integração com iFood\n\n1. Em **Admin → Integrações**, clique em **iFood**\n2. Informe seu token de merchant (painel iFood)\n3. Mapeie o cardápio (automático ou manual)\n4. Ative a sincronização\n\n### Fluxo\n\n- Pedidos chegam no KDS automaticamente\n- Status (aceito, em preparo, pronto, em entrega) sincroniza\n- Comprovantes e faturas em **Pedidos Externos**',
    },
  ];

  let createdArticles = 0;
  for (const a of articles) {
    const categoryId = createdCats[a.categorySlug];
    if (!categoryId) continue;
    await prisma.helpArticle.upsert({
      where: { slug: a.slug },
      update: {},
      create: {
        categoryId,
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        content: a.content,
        keywords: a.keywords,
        featured: a.featured ?? false,
        order: a.order ?? 0,
        published: true,
        publishedAt: new Date(),
      },
    });
    createdArticles++;
  }

  return { created: true, categories: categories.length, articles: createdArticles };
}
