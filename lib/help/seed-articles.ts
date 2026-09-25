import { prisma } from '@/lib/prisma';

/**
 * Seeds/updates default help categories and articles.
 * Idempotent - upserts by slug, so re-running keeps content in sync with
 * this file (categories were already upserted unconditionally; articles
 * used to be created once and never touched again - fixed here).
 */
export async function seedDefaultHelpContent() {
  const categories = [
    { slug: 'primeiros-passos', name: 'Primeiros Passos', icon: 'Rocket', order: 1, description: 'Como começar a usar o Gastrux' },
    { slug: 'cardapio-e-receitas', name: 'Cardápio & Receitas', icon: 'ChefHat', order: 2, description: 'Cadastrar itens, calcular CMV, gerenciar receitas' },
    { slug: 'estoque-e-insumos', name: 'Estoque & Insumos', icon: 'Package', order: 3, description: 'Movimentações, alertas e inventário' },
    { slug: 'pdv-e-caixa', name: 'PDV & Caixa', icon: 'CreditCard', order: 4, description: 'Maquininha, vendas e reconciliação' },
    { slug: 'comanda-e-kds', name: 'Comanda & KDS', icon: 'Utensils', order: 5, description: 'Mesa, KDS, despacho para cozinha' },
    { slug: 'faturamento-e-assinatura', name: 'Faturamento & Assinatura', icon: 'Receipt', order: 6, description: 'Planos, pagamento, faturas' },
    { slug: 'integracao-delivery', name: 'Integrações Delivery', icon: 'Truck', order: 7, description: 'iFood, Rappi, Uber Eats' },
  ];

  const catIds: Record<string, string> = {};
  for (const c of categories) {
    const cat = await prisma.helpCategory.upsert({
      where: { slug: c.slug },
      update: c,
      create: c,
    });
    catIds[c.slug] = cat.id;
  }

  const articles = [
    {
      categorySlug: 'primeiros-passos',
      slug: 'como-criar-restaurante',
      title: 'Como configuro meu restaurante pela primeira vez?',
      summary: 'Cadastre os dados do seu restaurante, defina horário de funcionamento e prepare a base para operar no Gastrux.',
      keywords: 'cadastro, setup, configuração, inicial, começar, novo, dados do restaurante',
      featured: true,
      order: 1,
      content:
        '## Onde configurar\n\nAcesse **Configurações** (menu Admin) para preencher os dados do seu restaurante.\n\n## Passo a passo\n\n1. Preencha **Nome do restaurante** (obrigatório)\n2. Adicione **CNPJ**, **E-mail** e **Telefone** de contato\n3. Informe **Endereço**, **Cidade**, **Estado** e **CEP**\n4. Escolha o **Fuso horário** (ex.: America/Sao_Paulo)\n5. Configure o **Horário de Funcionamento** de cada dia da semana\n6. Clique em **Salvar alterações**\n\n## Depois de configurar\n\nCom os dados básicos salvos, siga esta ordem para deixar o Gastrux pronto para operar:\n\n1. Cadastre seus **Insumos** (ingredientes e suprimentos)\n2. Monte suas **Receitas** (fichas técnicas) — o custo é calculado automaticamente\n3. Configure suas **Mesas** e gere os QR Codes para os clientes\n4. Convide sua **Equipe**\n\n> 💡 **Dica**: comece cadastrando só as 5-10 receitas mais vendidas do seu cardápio. Dá para completar o resto depois, sem pressa.',
    },
    {
      categorySlug: 'primeiros-passos',
      slug: 'convidar-equipe',
      title: 'Como convido minha equipe?',
      summary: 'Adicione colaboradores com as funções certas: Admin, Gerente, Caixa ou Cozinheiro.',
      keywords: 'usuário, equipe, colaborador, permissão, função, convidar, staff, rh',
      order: 2,
      content:
        '## Adicionando colaboradores\n\n1. Acesse **Staff / RH** (menu Admin)\n2. Clique em **Novo Funcionário**\n3. Preencha nome, e-mail, telefone e horário de trabalho\n4. Escolha a função:\n   - **Admin**: acesso total ao sistema, incluindo configurações e financeiro\n   - **Gerente**: opera o dia a dia (cardápio, estoque, comandas) sem acesso a configurações críticas\n   - **Caixa**: foco em vendas e pagamentos\n   - **Cozinheiro**: acesso à comanda e ao KDS (tela da cozinha)\n5. Salve — o colaborador recebe as credenciais de acesso\n\n## Desligando um colaborador\n\nNa lista de **Equipe / RH**, clique em **Desligar** ao lado do nome. O acesso é revogado na hora, mas o histórico de vendas/ações do colaborador continua registrado.\n\n> 💡 **Dica**: dê a função de **Cozinheiro** para quem só precisa ver a tela da cozinha (KDS) — evita que a equipe operacional tenha acesso a números financeiros sem necessidade.',
    },
    {
      categorySlug: 'primeiros-passos',
      slug: 'configurar-mesas-qrcode',
      title: 'Como configuro mesas e QR Code para os clientes?',
      summary: 'Organize seções e mesas do salão e gere QR Codes para pedido/consulta direta na mesa.',
      keywords: 'mesa, qr code, seção, salão, cardápio digital',
      order: 3,
      content:
        '## Gerenciar Mesas\n\n1. Acesse **Gerenciar Mesas** (menu Admin)\n2. Crie uma **Seção** (ex.: Salão, Varanda, Área Externa)\n3. Dentro da seção, adicione as **Mesas** (número e capacidade)\n\n## Gerando QR Codes\n\n1. Clique em **QR Codes**\n2. Baixe ou imprima o código de cada mesa\n3. Cole o QR Code na mesa correspondente\n\nCada QR Code identifica a mesa automaticamente — quando o cliente escaneia, o pedido já entra vinculado à mesa certa, sem confusão na hora de servir ou fechar a conta.\n\n> 💡 **Dica**: organize por seção antes de criar as mesas — fica mais fácil localizar e reorganizar o salão depois, principalmente se você tiver área interna e externa.',
    },
    {
      categorySlug: 'cardapio-e-receitas',
      slug: 'cadastrar-receita',
      title: 'Como cadastro uma receita (ficha técnica)?',
      summary: 'Monte a ficha técnica do prato com ingredientes, rendimento e tempo de preparo — o custo é calculado sozinho.',
      keywords: 'receita, ficha técnica, ingredientes, rendimento, porção, prato, cardápio',
      order: 1,
      content:
        '## Cadastrando uma receita\n\n1. Acesse **Ficha Técnica** e clique em **Nova Receita**\n2. Preencha nome, código interno e descrição/modo de preparo\n3. Informe:\n   - **Rendimento**: quantas porções a receita gera\n   - **Porção**: tamanho de cada porção\n   - **Tempo de Preparo**\n   - **Fator de Perda**: percentual de perda no preparo (limpeza, corte, cocção)\n4. Clique em **Adicionar Ingrediente** e escolha os insumos, um a um, com a quantidade usada\n5. Salve\n\n## O que acontece automaticamente\n\nAssim que você adiciona os ingredientes, o Gastrux calcula sozinho, na seção **Resumo de Custos**:\n\n- **Custo Total da Receita**: soma do custo de todos os ingredientes\n- **Custo por Porção**: custo total dividido pelo rendimento\n- **Food Cost %**: depois que você define o **Preço de Venda**, o sistema calcula automaticamente qual porcentagem desse preço é custo de insumo\n\n> ⚠️ Se um ingrediente não tiver preço cadastrado em **Insumos**, o custo dele não entra na conta. Mantenha os preços atualizados para ter o custo real da receita.\n\n> 💡 **Dica**: cadastre o **Preço de Venda** assim que criar a receita — é o que permite ao sistema calcular o Food Cost % e te avisar se a margem está apertada.',
    },
    {
      categorySlug: 'cardapio-e-receitas',
      slug: 'calcular-cmv',
      title: 'Como funciona o cálculo automático de CMV (Food Cost)?',
      summary: 'O Gastrux calcula o custo de cada receita sozinho, direto a partir do preço dos seus insumos.',
      keywords: 'cmv, custo, margem, food cost, receita, preço, lucro',
      featured: true,
      order: 2,
      content:
        '## CMV automático\n\nToda vez que você cadastra ou atualiza uma receita, o Gastrux recalcula na hora:\n\n- **Custo Total da Receita**: soma do custo de cada ingrediente usado\n- **Custo por Porção**: custo total ÷ rendimento\n- **Food Cost %**: custo por porção ÷ preço de venda\n\nVocê encontra esses números na página de cada receita, em **Resumo de Custos**.\n\n## Onde ver a visão geral\n\nUse a **Calculadora de CMV** para ver o Food Cost consolidado do cardápio inteiro, não só de uma receita — útil para identificar rapidamente quais pratos estão com margem apertada.\n\n## Como melhorar seu Food Cost\n\n1. Mantenha o preço dos **insumos** sempre atualizado (o cálculo usa o último preço cadastrado)\n2. Negocie com fornecedores os itens que mais pesam no custo\n3. Padronize porções — receitas com rendimento inconsistente distorcem o custo por porção\n4. Revise o **Fator de Perda** de receitas com muito desperdício de preparo\n\n> 💡 **Referência de mercado**: a maioria dos restaurantes busca um Food Cost entre 28% e 35%. Acima disso, vale revisar o preço de venda ou a ficha técnica.',
    },
    {
      categorySlug: 'estoque-e-insumos',
      slug: 'cadastrar-insumos',
      title: 'Como cadastro meus insumos (ingredientes)?',
      summary: 'Cadastre ingredientes e suprimentos com categoria, unidade e preço — a base de todo o cálculo de custo do Gastrux.',
      keywords: 'insumo, ingrediente, cadastro, unidade, categoria, fornecedor, preço',
      featured: true,
      order: 1,
      content:
        '## Cadastrando um insumo\n\n1. Acesse **Cadastro de Insumos** e clique em **Novo Insumo**\n2. Preencha nome e código interno\n3. Escolha a **Categoria** (ex.: Hortifruti, Carnes, Bebidas)\n4. Escolha a **Unidade de medida** (kg, g, l, ml, un)\n5. Informe o **Preço** de referência\n6. Vincule um ou mais **Fornecedores**, se quiser rastrear de onde compra cada item\n7. Salve\n\n## Por que isso importa\n\nTodo o cálculo de custo de receita e Food Cost do Gastrux parte do preço cadastrado aqui. Um insumo com preço desatualizado gera um custo de receita errado — por isso vale revisar os preços sempre que o fornecedor reajustar.\n\n## Filtrando a lista\n\nUse os filtros de **Categoria**, **Unidade**, **Com fornecedores** e **Preço** no topo da página para encontrar rápido o insumo que precisa, e clique em **Salvar Filtro** se for um filtro que você usa com frequência.\n\n> 💡 **Dica**: use o mesmo código de insumo que aparece na nota fiscal do fornecedor — facilita conferir depois se o preço lançado bate com a compra real.',
    },
    {
      categorySlug: 'estoque-e-insumos',
      slug: 'controle-estoque-alertas',
      title: 'Como funciona o Controle de Estoque e os alertas?',
      summary: 'Acompanhe o nível de cada insumo e seja avisado antes de faltar.',
      keywords: 'estoque, alerta, crítico, baixo, movimento, mínimo',
      order: 2,
      content:
        '## Acompanhando o estoque\n\nAcesse **Controle de Estoque** para ver, insumo por insumo, a quantidade atual e o estoque mínimo configurado. Cada item recebe um status:\n\n- 🔴 **Crítico**: no mínimo ou abaixo dele — reabasteça o quanto antes\n- 🟡 **Baixo**: perto do mínimo\n- 🟢 **OK**: quantidade saudável\n\n## Registrando um movimento\n\n1. Clique em **Registrar Movimento**\n2. Escolha o insumo e o tipo de movimento (entrada, saída, ajuste)\n3. Informe a quantidade\n4. Salve — o estoque atualiza na hora\n\n## Configurando o estoque mínimo\n\nO estoque mínimo de cada insumo é definido no cadastro do insumo, em **Cadastro de Insumos**. É esse número que dispara o status Crítico/Baixo aqui no Controle de Estoque.\n\n> 💡 **Dica**: revise o estoque mínimo de cada insumo periodicamente — um mínimo mal calibrado gera alertas demais (ou de menos) e a equipe passa a ignorá-los.',
    },
    {
      categorySlug: 'pdv-e-caixa',
      slug: 'conectar-maquininha-cartao',
      title: 'Como conecto uma maquininha de cartão e acompanho as vendas?',
      summary: 'Integre sua maquininha (ex.: SumUp) e veja faturamento, ticket médio e transações em tempo real.',
      keywords: 'pdv, maquininha, cartão, pos, vendas, transação, sumup',
      featured: true,
      order: 1,
      content:
        '## Conectando a maquininha\n\n1. Acesse **Vendas Rápidas (POS)** e clique em **Configurar POS**\n2. Siga o passo a passo para conectar sua maquininha (ex.: SumUp)\n3. Depois de conectada, toda venda feita na maquininha aparece automaticamente aqui\n\n## O que você acompanha\n\nNa tela de **Vendas Rápidas (POS)**:\n\n- **Total de Vendas** e **Total de Transações** do período\n- **Ticket Médio**\n- Lista de transações com status: Concluídas, Pendentes, Falhadas\n\nUse o filtro de período (7, 30 ou 90 dias) para comparar.\n\n## Integração PDV (visão consolidada)\n\nSe você tem mais de uma maquininha ou provedor, use **Integração PDV** (menu Admin) para ver faturamento, descontos e reconciliação consolidados por método de pagamento e por provedor, em um só lugar.\n\n> 💡 **Dica**: confira "Pendente Reconciliar" com frequência — transações que não batem automaticamente com um pedido do sistema ficam nessa fila até você revisar.',
    },
    {
      categorySlug: 'comanda-e-kds',
      slug: 'abrir-comanda-lancar-pedido',
      title: 'Como abro uma comanda e lanço um pedido?',
      summary: 'Use a Comanda Eletrônica para lançar pedidos, que já caem direto na tela da cozinha.',
      keywords: 'comanda, pedido, mesa, garçom, lançar, eletrônica',
      featured: true,
      order: 1,
      content:
        '## Abrindo uma comanda\n\n1. Acesse **Comanda Eletrônica**\n2. Clique em **Nova Comanda**\n3. Vincule à mesa (se o pedido for no salão) ou identifique o cliente\n4. Adicione os itens do cardápio, com quantidade e observações (ex.: "sem cebola")\n5. Envie o pedido\n\n## O que acontece depois de enviar\n\nO pedido cai automaticamente na tela da cozinha (**KDS**), na estação correta, sem precisar de papel ou de gritar o pedido para a cozinha.\n\n## Adicionando itens depois\n\nUma comanda fica aberta até ser fechada — dá para voltar nela e adicionar novos itens conforme o cliente pede mais, sem precisar abrir uma comanda nova para a mesma mesa/cliente.\n\n> 💡 **Dica**: use o campo de observação para registrar qualquer alteração de prato (sem ingrediente, ponto da carne, etc.) — isso aparece direto para a cozinha no KDS, sem passar recado errado.',
    },
    {
      categorySlug: 'comanda-e-kds',
      slug: 'usar-kds',
      title: 'Como configuro e uso o KDS na cozinha?',
      summary: 'Organize a cozinha em estações e acompanhe os pedidos chegando em tempo real.',
      keywords: 'kds, cozinha, tablet, pedido, tempo real, estação',
      order: 2,
      content:
        '## Configurando as estações\n\n1. Acesse **Kitchen Display System** (menu Admin)\n2. Clique em **Nova Estação** (ex.: Grelha, Saladas, Bebidas, Sobremesas)\n3. Escolha um nome e uma cor de identificação para cada estação\n4. Repita para cada área da sua cozinha\n\n## Usando no dia a dia\n\nDeixe essa mesma tela aberta em um tablet ou monitor na cozinha. Assim que uma comanda é enviada:\n\n1. O item aparece automaticamente na estação certa\n2. A equipe toca no card para mover de **Em preparo** para **Pronto**\n3. Ao marcar como pronto, quem está no salão é avisado\n\n### Alertas de tempo\n\n- 🟡 Amarelo: item há mais de 10 minutos sem atualização\n- 🔴 Vermelho: mais de 20 minutos (atrasado)\n\n> 💡 **Dica**: crie uma estação por praça de trabalho real na sua cozinha (não por categoria de cardápio) — assim cada estação só vê o que ela mesma precisa preparar.',
    },
    {
      categorySlug: 'faturamento-e-assinatura',
      slug: 'como-cancelar',
      title: 'Como cancelo minha assinatura?',
      summary: 'Cancele a qualquer momento sem multa.',
      keywords: 'cancelar, assinatura, plano, churn',
      order: 1,
      content:
        '## Cancelando\n\n1. Acesse **Configurações → Assinatura**\n2. Clique em **Cancelar assinatura**\n3. Confirme o motivo (nos ajuda a melhorar)\n4. Seu acesso continua até o fim do período já pago\n5. Seus dados ficam arquivados por 90 dias\n\n> ❗ Após 90 dias, dados podem ser removidos permanentemente conforme a LGPD.',
    },
    {
      categorySlug: 'faturamento-e-assinatura',
      slug: 'baixar-fatura',
      title: 'Onde baixo minhas faturas?',
      summary: 'Acesse todas as faturas emitidas.',
      keywords: 'fatura, nota, fiscal, pdf, recibo, invoice',
      order: 2,
      content:
        '## Baixando faturas\n\n1. Acesse **Configurações → Assinatura**\n2. Vá até o histórico de faturas\n3. Baixe a fatura que precisar\n\nSe não encontrar uma fatura específica ou tiver dúvida sobre uma cobrança, abra um ticket de suporte — a equipe confirma os detalhes com você.',
    },
    {
      categorySlug: 'integracao-delivery',
      slug: 'conectar-ifood',
      title: 'Como conecto o iFood?',
      summary: 'Integre pedidos do iFood direto no KDS.',
      keywords: 'ifood, delivery, integração, pedido, online',
      featured: true,
      order: 1,
      content:
        '## Integração com iFood\n\n1. Em **Admin → Integrações**, clique em **iFood**\n2. Informe seu token de merchant (painel iFood)\n3. Mapeie o cardápio (automático ou manual)\n4. Ative a sincronização\n\n### Fluxo\n\n- Pedidos chegam no KDS automaticamente\n- Status (aceito, em preparo, pronto, em entrega) sincroniza\n- Comprovantes e faturas em **Pedidos Externos**',
    },
  ];

  // Slugs from an earlier seed that described features not actually reachable
  // in the live UI (CSV import and a cash-register sangria/suprimento flow -
  // both components exist in the codebase but aren't mounted on any route).
  const obsoleteSlugs = ['importar-csv', 'abrir-fechar-caixa'];
  await prisma.helpArticle.deleteMany({ where: { slug: { in: obsoleteSlugs } } });

  let upserted = 0;
  for (const a of articles) {
    const categoryId = catIds[a.categorySlug];
    if (!categoryId) continue;
    await prisma.helpArticle.upsert({
      where: { slug: a.slug },
      update: {
        categoryId,
        title: a.title,
        summary: a.summary,
        content: a.content,
        keywords: a.keywords,
        featured: a.featured ?? false,
        order: a.order ?? 0,
        published: true,
      },
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
    upserted++;
  }

  return { categories: categories.length, articles: upserted };
}
