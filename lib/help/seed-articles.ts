import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';

/**
 * Default help center content (public /ajuda). Rewritten 2026-10-17 against the current menu: the
 * first version (2026-10-11) promised an iFood integration and a card machine connection that do not
 * exist, and pointed to an "Admin" menu that was reorganized.
 *
 * It runs on the first GET /api/help/categories of each server process. It creates what is missing
 * and never overwrites the team's work: an existing article is only replaced while its text is still a
 * default this file wrote before (LEGACY_DEFAULT_HASHES or the current default), so an article edited
 * in Plataforma Gastrux > Base de conhecimento stays as edited.
 */

/** sha256 of every default content this file ever wrote (version of 2026-10-11, live until 2026-10-17) */
const LEGACY_DEFAULT_HASHES = new Set([
  '00ae95b1cbaec17ccfa675598c4511a75c6ef19b287ab2c4d2011d5ac34477c9', // como-criar-restaurante
  'b24e6588fbc264022b24b2a9c0141c14c31037677073a78f516c96f3b81e03b7', // convidar-equipe
  '5ceb36b37ddbf804c4160078f30140d111d636d4ee0487e05cb3d1e4e9ea69c4', // configurar-mesas-qrcode
  '0836f98eb56d96f228f061725bd39e649da04bb00e90d428808cc82195575794', // cadastrar-receita
  'f466ca793e08843bff919387687ddd97ae79ca5cf4e047c47b3887f7d69743e6', // calcular-cmv
  '3ea137627bd550f8eb402964a3bb4bb079f87bfe007906ab628e2375e0dc79bf', // cadastrar-insumos
  'd8811068d305a4c6e15949f4f912c6b390b7c1332f6906649db6aaad8a091bc4', // controle-estoque-alertas
  '015d5cde058ad3cc75981c41be848c61061aeb9eef4efeac6dd1930f60587656', // conectar-maquininha-cartao
  '13655ae7c597f0a20a2bc70039f6b4ad33a76a8399152b34c68bf33fdb7fe042', // abrir-comanda-lancar-pedido
  '1b9162f4cab8d3daf663d085e18bee9b8c848fc68c08e9958922794141ff220c', // usar-kds
  '84fb0e79510d1cdefe042475737061534b07c15c580b647203840a5dc89f5f8b', // como-cancelar
  '77cc38e8218f43b95013fac7ebbbb782a2304e9085515b172ba65b95855ca466', // baixar-fatura
  '4b229bf0f3212dac1a5d9d60e9d3eebf3a6d9745d4fb899983ebbcd4ab80c287', // conectar-ifood
  // Version of 2026-10-17 (live until the plans of 2026-10-18)
  '707363d9803371ade83b7796a8e8fbcc0dd33bb2a8b4665880ac5c53dc4277bc', // convidar-equipe
  'a9399e99e303d4347d644fda37b89fd77505de393ac3c3f2d5cb033633402cee', // pergunte-ao-gastrux
  '42a5a7553655414dfd680009bdaa8e0418290d4ac53b39ebe8b2ccc7c26f6266', // usar-kds
  'c065d71e3c9e0d0a5138dd57f6bb345ab90454b448ec93c33296216a07efae82', // cadastrar-insumos
  '48537abefdff56b666ce7c2d738dfef7d4831cabd0a39aa423ba6f9f46e044b9', // como-cancelar
  '665449ae68f039482354ba97a7ab2fe068e65ade42bccd62848c0b37a5513454', // controle-estoque-alertas (2026-10-17 version, before 'Contagem de estoque')
  '3f29b4f010aa7391a133992cf7e5820feb59983fc0e377fcfdf9dcfbe1afad0e', // cadastrar-receita (2026-10-17 version, before the cost inside the product)
  '4d23d4e94701e30c2c55cb9b3285fb31ca61578755de8f0e4253ed436a95e8c7', // controle-estoque-alertas ('Contagem de estoque', before 'Entrada em lote')
  'e637112bcbb515bb07f62712d3ad6eb6fa286053d2d49051a5da578890a6d395', // teste-gratis (2026-10-18 version, before 'assinar durante o teste')
  '50bdca4036da85cdde76704e94fd1e506118a67157978ee63b4606abaa309b9d', // cadastrar-receita (cost inside the product, before 'Escalonar receita')
  '3c66bbb8df87a6e6725fd2f3c6d2a267ec21944f4273e14fdd153eddc6970b7c', // teste-gratis (before the sales per month and fichas técnicas limits)
  '4a7897cd78a0223844fdd4fbba22e5eec613af7c4ba3ff6e05df24a83d36888a', // turnos-comissoes (2026-10-20, before Editar remuneração)
  '24e420ce5854167428ea970c39c1cf41b5daaf01ff20ef60221209a85d36525f', // planejamento-producao (2026-10-20, before the cook without costs)
]);

/** Articles that described features Gastrux does not have; removed while nobody rewrote them */
const OBSOLETE_SLUGS = ['conectar-ifood', 'conectar-maquininha-cartao', 'importar-csv'];

export const contentHash = (content: string) => createHash('sha256').update(content).digest('hex');

export const HELP_CATEGORIES = [
  { slug: 'primeiros-passos', name: 'Primeiros passos', icon: 'Rocket', order: 1, description: 'Configurar o restaurante, a equipe e as mesas' },
  { slug: 'pdv-e-caixa', name: 'Vendas e caixa', icon: 'CreditCard', order: 2, description: 'Mesas, balcão, caixa e pagamentos' },
  { slug: 'comanda-e-kds', name: 'Cozinha', icon: 'Utensils', order: 3, description: 'Tela da cozinha (KDS) e estações' },
  { slug: 'cardapio-e-receitas', name: 'Cardápio e fichas técnicas', icon: 'ChefHat', order: 4, description: 'Produtos, fichas técnicas e CMV' },
  { slug: 'estoque-e-insumos', name: 'Estoque e insumos', icon: 'Package', order: 5, description: 'Insumos, entradas, contagem e alertas' },
  { slug: 'fiscal', name: 'Nota fiscal', icon: 'FileText', order: 6, description: 'NFC-e: o que é preciso e como configurar' },
  { slug: 'integracao-delivery', name: 'Delivery', icon: 'Truck', order: 7, description: 'Site de delivery próprio e pedidos' },
  { slug: 'faturamento-e-assinatura', name: 'Assinatura', icon: 'Receipt', order: 8, description: 'Planos, faturas e cancelamento' },
  { slug: 'financeiro', name: 'Financeiro', icon: 'BarChart3', order: 9, description: 'DRE, contas de consumo e relatórios' },
  { slug: 'equipe-e-lojas', name: 'Equipe e lojas', icon: 'Users', order: 10, description: 'Turnos, comissões e várias lojas' },
];

export const HELP_ARTICLES = [
  {
    categorySlug: 'primeiros-passos',
    slug: 'como-criar-restaurante',
    title: 'Como configuro meu restaurante pela primeira vez?',
    summary: 'O cartão "Primeiros passos" do Início mostra o que falta, na ordem, até a primeira venda.',
    keywords: 'cadastro, setup, configuração, inicial, começar, novo, dados do restaurante, primeiros passos',
    featured: true,
    order: 1,
    content: `## Siga o cartão "Primeiros passos"

Ao entrar no Gastrux, o **Início** mostra o cartão **Primeiros passos** com o que falta para começar a vender:

1. **Abrir o caixa**: Caixa e pagamentos > Caixa, com o troco inicial
2. **Fazer a primeira venda**: Vender > Mesas e balcão
3. **Cadastrar seus produtos e preços**: Cardápio e produtos > Cardápio digital
4. **Cadastrar as mesas**: Vender > Mesas
5. **Cadastrar a equipe** (opcional para quem trabalha sozinho): Equipe > Equipe e acessos
6. **Completar o endereço**: Configurações > Configurações do restaurante
7. **Configurar a nota fiscal (NFC-e)**: Fiscal > Notas fiscais (NFC-e)

Cada etapa fica marcada quando está pronta.

## Faça o cadastro pesado com a IA

Nos passos de produtos, mesas e equipe aparece o botão **Fazer com a IA**. Mande fotos do cardápio impresso (até 4), um PDF ou o texto do cardápio, e a IA monta um rascunho. Você revisa nome, preço e categoria e só então confirma; nada entra no sistema antes disso.

> **Dica**: a conta começa com um cardápio de exemplo do seu tipo de negócio. Na revisão do cardápio feito pela IA, marque "Remover o cardápio de exemplo".`,
  },
  {
    categorySlug: 'primeiros-passos',
    slug: 'convidar-equipe',
    title: 'Como cadastro minha equipe?',
    summary: 'Cadastre gerente, caixa e cozinha, cada um com o acesso certo.',
    keywords: 'usuário, equipe, colaborador, permissão, função, convidar, staff, garçom, caixa, cozinha, gerente',
    order: 2,
    content: `## Cadastrando uma pessoa

1. Abra **Equipe > Equipe e acessos**
2. Clique em **Adicionar Funcionário**
3. Preencha nome e e-mail e escolha o perfil
4. Salve. O Gastrux mostra uma **senha provisória**: passe para a pessoa. No primeiro acesso ela cria a senha dela.

## Perfis

- **Gerente**: vê e faz tudo do dia a dia, inclusive valores e relatórios
- **Caixa**: vende, recebe, abre e fecha o caixa. Use este perfil para o garçom
- **Cozinha**: tela da cozinha, fichas técnicas, insumos, estoque e etiquetas; não vê faturamento

Ações sensíveis, como cancelar uma comanda, reabrir uma conta ou estornar um pagamento, pedem dono ou gerente.

## Desligando alguém

Na lista de **Equipe e acessos**, desligue a pessoa. O acesso termina na hora e o histórico dela continua registrado.

> O número de usuários depende do plano: Pro 2 e Business 5 (no teste grátis, 5).`,
  },
  {
    categorySlug: 'primeiros-passos',
    slug: 'configurar-mesas-qrcode',
    title: 'Como configuro mesas e QR Code para os clientes?',
    summary: 'Cadastre as mesas por setor e imprima o QR Code de cada uma.',
    keywords: 'mesa, qr code, setor, salão, cardápio digital',
    order: 3,
    content: `## Cadastrando as mesas

1. Abra **Vender > Mesas**
2. Cadastre cada mesa com número e setor (por exemplo Salão, Varanda)
3. Uma mesa fora de uso pode ficar **em manutenção**: ela não aparece como livre na hora de vender

Também dá para pedir à IA: "crie 10 mesas no salão".

## QR Code de cada mesa

1. Abra **Cardápio e produtos > QR Codes das mesas**
2. Imprima o código de cada mesa e cole na mesa

O cliente lê o QR Code com o celular e vê o cardápio daquela mesa. O que ele pedir por ali entra na comanda da mesa certa.`,
  },
  {
    categorySlug: 'primeiros-passos',
    slug: 'pergunte-ao-gastrux',
    title: 'O que é o "Pergunte ao Gastrux"?',
    summary: 'O assistente com IA que responde sobre o sistema e sobre os números do seu restaurante.',
    keywords: 'ia, assistente, inteligência artificial, chat, pergunta, ajuda',
    order: 4,
    content: `## O que ele faz

O botão redondo no canto da tela abre o **Pergunte ao Gastrux**. Ele responde:

- como fazer algo no sistema ("como fecho o caixa?")
- perguntas sobre os números do seu restaurante ("quanto vendi ontem?", "qual o CMV do mês?")
- e monta rascunhos de cardápio, mesas e equipe na implantação

Ele só lê; nada muda no sistema sem você confirmar. Cada pessoa vê só o que o perfil dela permite: a cozinha, por exemplo, não recebe valores de venda.

## Limites por plano

Pro 50 perguntas por mês, Business 350 (no teste grátis, 350). O uso aparece em **Configurações > Uso da IA**.`,
  },
  {
    categorySlug: 'pdv-e-caixa',
    slug: 'contas-a-pagar',
    title: 'Como controlo as contas a pagar?',
    summary: 'Lance aluguel, contador, boletos e impostos, veja o que vence e marque como paga pelo banco ou pela gaveta.',
    keywords: 'contas a pagar, boleto, aluguel, vencimento, parcela, fornecedor, despesa, folha, imposto, atrasada',
    order: 20,
    content: `## Onde fica

**Caixa e pagamentos > Contas a pagar**, só para o dono e o gerente. No topo: Atrasadas, Vencem hoje, Próximos 7 dias e Total do mês.

## Nova conta

Toque em **Nova conta** e escolha:

- **Uma vez**: uma conta só. Se ela se refere a outro mês (a conta de setembro que vence em outubro), informe o mês da conta (competência).
- **Parcelar**: informe o valor total e de 2 a 24 parcelas. A sobra de centavos vai na última.
- **Repetir todo mês** (plano Business): aluguel, contador e outras contas fixas. A conta do mês e dos 2 seguintes aparece sozinha.

## Pagar

Na conta, toque em **Pagar** e escolha de onde saiu o dinheiro:

- **Banco / outro**: Pix, boleto, cartão ou débito automático.
- **Dinheiro da gaveta**: sai do caixa aberto como despesa ligada à conta. Se houver mais de um caixa aberto, escolha qual.

Errou? **Desfazer pagamento** pede um motivo. Se o dinheiro saiu da gaveta, ele volta para o caixa aberto.

## Editar e cancelar

Só contas a pagar podem ser editadas. Numa conta que repete, escolha "Só esta" ou "Esta e as próximas". **Cancelar** pede um motivo e a conta fica no histórico.

As contas de consumo com vencimento aparecem aqui sozinhas; valor e vencimento delas se editam em Contas de consumo.

## Avisos e nota de compra (Business)

- Todo dia às 7h, o sino e o e-mail do dono avisam as contas que vencem hoje, as atrasadas e as que vencem em 3 dias.
- Ao importar o XML da nota de compra, os boletos dela viram contas a pagar.

## Na DRE

Cada conta entra no mês da competência (o mês a que ela se refere), na linha **Contas a pagar**. A folha lançada aqui substitui a estimativa da Equipe. Compras de mercadoria ficam fora, porque o custo já está no CMV, e pagar pela gaveta não conta duas vezes.`,
  },
  {
    categorySlug: 'pdv-e-caixa',
    slug: 'abrir-comanda-lancar-pedido',
    title: 'Como abro uma mesa e lanço um pedido?',
    summary: 'Na tela Vender, toque na mesa, toque nos itens e envie para a cozinha.',
    keywords: 'comanda, pedido, mesa, garçom, lançar, balcão, vender, conta, dividir',
    featured: true,
    order: 1,
    content: `## Lançando na mesa

1. Abra **Vender > Mesas e balcão**
2. Toque numa mesa livre: a comanda dela abre
3. Toque nos itens do cardápio (cada toque soma 1). Para "sem cebola" e afins, use a observação do item
4. Toque em **Enviar para a cozinha**. Só os itens novos são enviados

## Fechando a conta

Na comanda, abra a **Conta**: ela mostra o subtotal, a taxa de serviço (o cliente pode recusar), o que já foi pago e o que falta. Dá para imprimir a pré-conta, receber em mais de uma forma de pagamento e dividir.

Também dá para transferir itens entre comandas e juntar mesas.

## Venda de balcão

Na mesma tela, a **venda de balcão** vende e recebe na hora. A opção "Enviar para a cozinha" vem desmarcada; marque quando o item precisar ser preparado.

> O caixa precisa estar aberto para receber (Caixa e pagamentos > Caixa).`,
  },
  {
    categorySlug: 'pdv-e-caixa',
    slug: 'abrir-fechar-caixa',
    title: 'Como abro e fecho o caixa?',
    summary: 'Abra com o troco, registre sangrias e despesas e feche contando o que tem.',
    keywords: 'caixa, abrir, fechar, troco, sangria, suprimento, despesa, turno, fechamento',
    featured: true,
    order: 2,
    content: `## Abrindo

Abra **Caixa e pagamentos > Caixa** e informe o troco inicial. Cada caixa tem um turno aberto por vez.

## Durante o turno

As vendas pagas entram sozinhas, por forma de pagamento (Dinheiro, PIX, Crédito, Débito, Outros). Pelo caixa você também registra:

- **Despesa**: dinheiro que sai da gaveta para pagar algo; entra como despesa na DRE
- **Sangria**: dinheiro retirado para guardar (cofre, banco); não é despesa
- **Suprimento**: dinheiro colocado na gaveta

## Fechando

Conte o que tem em cada forma de pagamento. Depois da contagem, o Gastrux mostra o esperado e a diferença; uma diferença pede o motivo. Você pode imprimir o fechamento.

O histórico de todos os turnos fica em **Caixa e pagamentos > Histórico de caixas** (dono e gerente).`,
  },
  {
    categorySlug: 'comanda-e-kds',
    slug: 'usar-kds',
    title: 'Como uso a tela da cozinha (KDS)?',
    summary: 'Os pedidos enviados pelas mesas e pelo balcão aparecem na tela da cozinha, por estação.',
    keywords: 'kds, cozinha, tablet, pedido, tempo real, estação',
    order: 1,
    content: `## Abrindo a tela

Abra **Vender > Cozinha (KDS)** num tablet ou monitor da cozinha. O perfil **Cozinha** já entra com essa opção no menu.

## No dia a dia

Cada pedido tem um botão por etapa:

1. **Iniciar**: o pedido passa a Em preparo
2. **Pronto**: quando terminar
3. **Completar**: quando sai da cozinha; o pedido some da tela

O ícone de impressora imprime o ticket da cozinha. Um item riscado com "CANCELADO: não fazer" foi tirado da comanda.

## Estações

As abas **Todos Pedidos** e **Por Estação** mudam a visão. Quantas estações você pode ter depende do plano: Pro 2, Business 5, Enterprise ilimitadas. Só o dono configura as estações.

> **Dica**: crie uma estação por praça real da cozinha (grelha, fritura, bebidas), não por categoria do cardápio.`,
  },
  {
    categorySlug: 'comanda-e-kds',
    slug: 'contagem-do-dia',
    title: 'Como faço a contagem de espetos (contagem do dia)?',
    summary: 'Lance o que montou e o que perdeu; no fechamento, o Gastrux mostra quanto deveria sobrar de cada item.',
    keywords: 'contagem, espetos, espeto, salgados, sobra, montados, perda, fechamento, noite, diferença, sumiu',
    order: 2,
    content: `## Para que serve

Para o que é preparado antes de vender, como espetos e salgados. No fim da noite, o Gastrux mostra quanto deveria sobrar de cada item, e você confere com o que sobrou de verdade. Em espetarias a tela se chama **Contagem de espetos**. Está em todos os planos.

## Quais itens entram

Na ficha técnica do item (**Cardápio e produtos > Fichas técnicas**), ligue **Contar na contagem do dia**. No cardápio de exemplo de espetaria, os espetos e o pão de alho já vêm ligados.

## Durante a noite

Abra **Vender > Contagem do dia**:

- **Montados**: toque em +1, +10, +20 ou **Outro valor** sempre que montar mais.
- **Perda**: toque em **Perda** e escolha o motivo (Caiu, Queimou, Venceu ou Outro).
- **Vendidos** entram sozinhos: comandas, balcão, QR Code, WhatsApp e site de delivery. Pedidos de aplicativos como o iFood só contam se forem lançados no Gastrux.
- Lançou errado? Quem lançou desfaz em até 2 minutos. Depois disso, só o dono ou o gerente.

Para cada item: **deveria ter = início + montados − vendidos − perdas**.

Na primeira noite, toque em **Lançar o início** e diga quantos já tem de cada item na geladeira.

## Fechando

Só o dono e o gerente fecham. Toque em **Fechar contagem** e conte a sobra de cada item: a tela mostra em vermelho o que falta e em amarelo o que está a mais. A sobra contada vira o início da noite seguinte.

O **Histórico** mostra as noites fechadas e os totais por item das últimas 4 semanas. No plano Business, uma falta gera aviso no sino com o valor em R$.`,
  },
  {
    categorySlug: 'cardapio-e-receitas',
    slug: 'cadastrar-receita',
    title: 'Como cadastro uma ficha técnica?',
    summary: 'A ficha técnica lista os insumos de uma porção; o custo sai do preço dos insumos.',
    keywords: 'receita, ficha técnica, ingredientes, rendimento, porção, prato, cardápio, custo',
    order: 1,
    content: `## Para que serve

A ficha técnica diz quais insumos, e quanto de cada um, vão numa porção. Com ela o Gastrux calcula o custo do prato e dá baixa no estoque quando o prato é vendido.

## Cadastrando

1. Abra **Cardápio e produtos > Fichas técnicas** e crie uma nova
2. Dê o nome e o rendimento
3. Adicione os insumos com a quantidade usada
4. Salve. O custo por porção aparece na hora

## No produto do cardápio

Em **Cardápio e produtos > Cardápio digital**, ao criar ou editar um produto, escolha a ficha técnica dele. Logo abaixo aparecem o custo de um item vendido, a margem e o CMV no preço do produto, a lista de insumos e o link **Editar ficha técnica**. Mudou o preço? A margem muda na hora.

Na ficha também ficam a validade por conservação (usada nas etiquetas) e a opção "Contar na contagem do dia".

## Escalonar para uma produção

Em **Mais recursos > Escalonar receita**, escolha a ficha e diga quantas porções vai produzir. O Gastrux mostra quanto separar de cada insumo, quanto tem no estoque e quanto falta. Uma ficha que rende 10 porções, pedida para 25, vira 2,5 vezes a ficha. Dono e gerente também veem o custo da produção; a cozinha vê só as quantidades.

## Ficha técnica é opcional para vender

Um produto sem ficha (um refrigerante, por exemplo) vende normalmente na mesa, no balcão e no QR Code. Só não entra no custo nem baixa insumos.

> Se um insumo estiver sem custo de referência, o custo da ficha fica abaixo do real. Mantenha os custos em dia em Cardápio e produtos > Insumos.`,
  },
  {
    categorySlug: 'cardapio-e-receitas',
    slug: 'calcular-cmv',
    title: 'Como o Gastrux calcula o CMV?',
    summary: 'O CMV junta o custo das fichas técnicas com o que foi vendido no período.',
    keywords: 'cmv, custo, margem, food cost, receita, preço, lucro, engenharia de cardápio',
    featured: true,
    order: 2,
    content: `## De onde vem o número

- O **custo de cada porção** vem da ficha técnica: quantidade de cada insumo × custo de referência do insumo
- O **CMV** soma o custo das porções vendidas no período e compara com as vendas

Veja em **Relatórios > CMV**. Produtos sem ficha técnica não entram no custo.

## Engenharia de cardápio

Em **Mais recursos > Engenharia de cardápio**, cada item é classificado por popularidade e margem, para você ver o que destacar, revisar ou tirar do cardápio.

## Como manter o número certo

1. Atualize o custo dos insumos quando o fornecedor reajustar, ou importe a nota de compra (Estoque e compras > Importar nota de compra)
2. Mantenha as quantidades das fichas iguais ao que a cozinha realmente usa

> Referência de mercado: muitos restaurantes buscam CMV entre 28% e 35% das vendas.`,
  },
  {
    categorySlug: 'estoque-e-insumos',
    slug: 'cadastrar-insumos',
    title: 'Como cadastro meus insumos?',
    summary: 'Insumos com unidade e custo de referência são a base do custo das fichas e do estoque.',
    keywords: 'insumo, ingrediente, cadastro, unidade, categoria, fornecedor, preço, custo',
    featured: true,
    order: 1,
    content: `## Cadastrando

Abra **Cardápio e produtos > Insumos** e cadastre cada insumo com:

- nome e categoria
- **unidade** (kg, g, l, ml, un)
- **custo de referência** por unidade
- **estoque mínimo**, se quiser ser avisado antes de faltar
- fornecedores, se quiser saber de quem compra cada item

## Mantendo o custo em dia

O custo das fichas técnicas e o CMV usam o custo de referência daqui. Ao importar o XML da nota de compra em **Estoque e compras > Importar nota de compra**, os insumos vinculados recebem o custo e a entrada no estoque.

O número de insumos depende do plano: Pro 500, Business 1.000.`,
  },
  {
    categorySlug: 'estoque-e-insumos',
    slug: 'controle-estoque-alertas',
    title: 'Como funciona o estoque e os alertas?',
    summary: 'As vendas dão baixa pelos insumos da ficha técnica; entradas, compras e contagem ajustam o resto.',
    keywords: 'estoque, alerta, baixo, mínimo, entrada, contagem, inventário, compra, desperdício',
    order: 2,
    content: `## O que mexe no estoque

- **Vendas**: ao fechar a conta ou a venda de balcão, o Gastrux dá baixa nos insumos da ficha técnica de cada item, mesmo sem usar a tela da cozinha. Cancelar uma venda fechada devolve o estoque
- **Entrada em lote**: em **Estoque e compras > Estoque**, toque em **Entrada em lote**. Aparecem todos os insumos: digite a quantidade que chegou e, se quiser, o custo por unidade de cada um, e confirme tudo de uma vez. O custo informado passa a ser o custo do insumo
- **Entrada de um insumo**: no mesmo lugar, **Registrar entrada ou saída**. A primeira entrada de um insumo começa o controle dele; antes disso ele aparece como sem entrada ainda
- **Compras**: em **Estoque e compras > Compras**, marcar uma lista como Recebido (ou Parcial) dá entrada nos itens recebidos
- **Nota de compra**: **Estoque e compras > Importar nota de compra** lê o XML da NF-e do fornecedor
- **Contagem de estoque**: em **Estoque e compras > Contagem de estoque**, confira o estoque físico e ajuste
- **Desperdício**: registre perdas com motivo em **Estoque e compras > Desperdício**

## Alertas

Insumos abaixo do estoque mínimo aparecem como estoque baixo. O mínimo de cada insumo fica no cadastro do insumo.

> **Dica**: comece com uma contagem de estoque dos insumos principais. A partir dela, as vendas e as compras mantêm o número em dia.`,
  },
  {
    categorySlug: 'estoque-e-insumos',
    slug: 'etiquetas-validades',
    title: 'Como imprimo etiquetas e controlo as validades?',
    summary: 'Imprima a etiqueta com a validade calculada; no Business, a lista de validades avisa o que vence.',
    keywords: 'etiqueta, validade, vencimento, manipulação, vigilância sanitária, conservação, congelado, refrigerado, impressora, lote, descarte',
    order: 3,
    content: `## Imprimindo a etiqueta (todos os planos)

1. Abra **Mais recursos > Etiquetas**
2. Busque o preparo (ficha técnica) ou o insumo aberto
3. Escolha a conservação (ambiente, refrigerado ou congelado). A validade é calculada sozinha e pode ser mudada na hora
4. Escolha o lote, se quiser, e toque em **Imprimir**

A impressão é pela impressora térmica, pelo navegador, nos tamanhos 60x40 mm e 40x25 mm, e precisa de internet. As etiquetas dos últimos 30 dias ficam logo abaixo, com o botão **Reimprimir**.

## De onde vem a validade

Os dias de validade de cada conservação ficam no cadastro da ficha técnica e do insumo.

## Controle de validades (plano Business)

Em **Mais recursos > Validades** aparece o que já venceu e o que vence hoje e amanhã. Em cada etiqueta, toque em:

- **Usado**: o item foi consumido
- **Descartado**: o item foi jogado fora; a perda entra no Desperdício com o custo

Todo dia às 7h, o sino avisa o dono e o gerente quando há etiquetas vencidas ou vencendo.`,
  },
  {
    categorySlug: 'fiscal',
    slug: 'configurar-nfce',
    title: 'Como configuro a nota fiscal (NFC-e)?',
    summary: 'O Gastrux emite a NFC-e pela Focus NFe; veja o que pedir ao contador.',
    keywords: 'nfc-e, nota fiscal, cupom, sefaz, csc, certificado, contador, fiscal',
    order: 1,
    content: `## O que é preciso

- CNPJ com inscrição estadual
- certificado digital **A1**
- **CSC** (código de segurança do contribuinte) da SEFAZ do seu estado
- token da Focus NFe
- dados fiscais de cada produto (NCM, CFOP, CSOSN), definidos pelo seu contador

## Onde configurar

Abra **Fiscal > Notas fiscais (NFC-e)** (dono e gerente). As notas emitidas ficam em **Fiscal > Notas emitidas**. A NFC-e está em todos os planos.

## No dia a dia

A nota pode sair automaticamente ao fechar a conta. Uma nota rejeitada gera aviso no sino com o motivo. O cancelamento é feito pelo Gastrux, dentro do prazo da SEFAZ.

> Dúvidas sobre impostos e sobre quando é obrigatório emitir: o contador do restaurante orienta.`,
  },
  {
    categorySlug: 'integracao-delivery',
    slug: 'site-de-delivery',
    title: 'Como recebo pedidos de delivery?',
    summary: 'Pelo site de delivery próprio do restaurante; os pedidos chegam na tela de pedidos.',
    keywords: 'delivery, entrega, retirada, site, pedido online, ifood',
    order: 1,
    content: `## Site de delivery próprio

Em **Clientes e marketing > Site de delivery** você configura o site do restaurante para pedidos de entrega e retirada, com o seu cardápio.

Os pedidos chegam em **Vender > Pedidos de delivery**.

## Pagamento online

Com a conta do Mercado Pago do restaurante conectada, o cliente pode pagar pelo site. Os pagamentos aparecem em **Caixa e pagamentos > Pagamentos online**.

## iFood e outros aplicativos

Hoje o Gastrux não recebe pedidos direto do iFood ou de outros aplicativos de entrega.`,
  },
  {
    categorySlug: 'integracao-delivery',
    slug: 'cardapio-no-whatsapp',
    title: 'Como mando o cardápio automático no WhatsApp?',
    summary: 'Configure a saudação do WhatsApp Business com o link do cardápio: o cliente recebe sozinho quando chama o restaurante.',
    keywords: 'whatsapp, cardápio, cardapio, saudação, mensagem automática, resposta rápida, link, delivery',
    order: 2,
    content: `## Onde estão as mensagens

Em **Clientes e marketing > Site de delivery**, o quadro **Cardápio automático no WhatsApp** traz três mensagens prontas, com o nome do restaurante e o link do cardápio online. Dá para editar o texto antes de copiar.

## No celular (app WhatsApp Business)

1. Abra **Ferramentas comerciais** (no iPhone, dentro de Configurações).
2. **Mensagem de saudação**: ative, cole a mensagem e escolha os destinatários **Todos**.
3. **Mensagem de ausência**: ative, cole a mensagem e escolha **Fora do horário comercial**.
4. **Respostas rápidas**: crie a resposta com o atalho **/cardapio**.
5. No **Perfil comercial**, coloque o link do cardápio no campo Site.

## Quando o cliente recebe

A saudação vai sozinha no primeiro contato do cliente ou depois de 14 dias sem conversa (regra do WhatsApp). Nas outras vezes, o atendente digita **/cardapio** na conversa.

O link aparece no WhatsApp com o nome e o logo do restaurante.

> O Gastrux não lê nem responde as conversas do app WhatsApp Business. Os pedidos feitos pelo link chegam em **Vender > Pedidos de delivery**.`,
  },
  {
    categorySlug: 'faturamento-e-assinatura',
    slug: 'teste-gratis',
    title: 'Como funciona o teste grátis?',
    summary: '30 dias com tudo do Business, sem cartão. Depois, você escolhe o plano.',
    keywords: 'teste, grátis, trial, 30 dias, plano, assinatura, bloqueio, consulta',
    featured: true,
    order: 0,
    content: `## 30 dias com tudo do Business

Toda conta nova começa com **30 dias grátis do plano Business**, sem cartão. Uma faixa no topo da tela mostra quantos dias faltam.

## Avisos

Nos dias 23, 27 e 30 do teste, o sino do Gastrux e o e-mail do dono avisam que o teste está acabando.

## Escolhendo o plano

No rodapé do menu, abra **Minha assinatura** (só o dono vê) e escolha:

- **Pro** (R$ 149 por mês): vender, caixa, nota fiscal, cozinha com 2 estações, estoque, fichas técnicas e CMV, 2 usuários
- **Business** (R$ 199 por mês): tudo do Pro, mais pagamento na mesa pelo celular, controle de validades, indicadores das contas de consumo, campanhas e fidelidade, 5 usuários e 5 estações de cozinha

Cada plano tem uma referência de vendas por mês: Pro 1.000 e Business 3.500. Passar dela só gera um aviso, nunca trava uma venda. Fichas técnicas: Pro 100 e Business 500.

No plano anual, você paga 11 meses e usa 12.

Se você assinar durante o teste, a primeira cobrança só acontece quando os 30 dias acabam, e a faixa do teste sai da tela.

## Se o teste acabar sem plano

A conta fica **só para consulta**: você vê tudo, mas não vende nem cadastra, e os pedidos pelo QR Code, site de delivery e WhatsApp param. Nenhum dado é apagado: ao escolher um plano, tudo volta a funcionar na hora.`,
  },
  {
    categorySlug: 'faturamento-e-assinatura',
    slug: 'como-cancelar',
    title: 'Como cancelo minha assinatura?',
    summary: 'O dono cancela em Minha assinatura, sem multa.',
    keywords: 'cancelar, assinatura, plano, churn',
    order: 1,
    content: `## Cancelando

1. No rodapé do menu, abra **Minha assinatura** (só o dono vê)
2. Clique em **Gerenciar assinatura**
3. Clique em **Cancelar assinatura** e confirme

Nada mais é cobrado. O plano continua até o fim do período já pago. Depois, a conta fica **só para consulta**: você vê tudo, mas não vende nem cadastra até escolher um plano de novo. Nenhum dado é apagado.`,
  },
  {
    categorySlug: 'faturamento-e-assinatura',
    slug: 'baixar-fatura',
    title: 'Onde baixo minhas faturas?',
    summary: 'Em Minha assinatura > Gerenciar assinatura, em PDF.',
    keywords: 'fatura, nota, pdf, recibo, invoice, cobrança, pagamento',
    order: 2,
    content: `## Baixando faturas

1. No rodapé do menu, abra **Minha assinatura** (só o dono vê)
2. Clique em **Gerenciar assinatura**
3. Em **Faturas emitidas**, clique em **PDF** na fatura que precisar

Logo abaixo fica o **Histórico de pagamentos**. Dúvida sobre uma cobrança: abra um ticket em Suporte.`,
  },
  {
    categorySlug: 'financeiro',
    slug: 'contas-de-consumo',
    title: 'Como lanço as contas de luz, água e gás?',
    summary: 'Lance cada conta com valor e consumo; ela entra na DRE e, no Business, mostra se o consumo subiu.',
    keywords: 'contas de consumo, luz, energia, água, gás, botijão, internet, telefone, kwh, m³, conta mensal',
    order: 1,
    content: `## Onde fica

**Relatórios > Contas de consumo**, só para o dono e o gerente.

## As contas

Energia (kWh), Água (m³), Gás encanado (m³), Gás de botijão (número de botijões), Telefone/Internet e **Outra conta**, com o nome que você quiser. Aluguel, contador e boletos de fornecedor ficam em **Caixa e pagamentos > Contas a pagar**.

## Lançando

1. Na conta, toque em **Lançar conta**
2. Escolha o mês de referência (vem o mês anterior)
3. Digite o valor e o consumo como estão na conta. Abaixo do consumo, a tela mostra o número que vai ser gravado: "1.380" é mil trezentos e oitenta, como na conta de luz. Para decimal, use vírgula (12,5)
4. Se quiser, informe o vencimento: a conta aparece também em Contas a pagar

É uma conta por mês. Lançar de novo o mesmo mês corrige o valor.

## Na DRE

A conta entra no mês de referência, na linha **Contas de consumo**, em todos os planos.

## Indicadores e aviso (plano Business)

Comparação com o mês anterior, com a média de 3 meses e com o mesmo mês do ano passado, preço por kWh ou m³ e quanto a conta pesa no faturamento. O sino avisa quando o consumo fica 20% acima da média dos meses anteriores (precisa de 2 meses lançados).

Uma conta que não usa mais pode ser desativada: ela sai da lista e o histórico fica guardado.`,
  },
  {
    categorySlug: 'financeiro',
    slug: 'dre',
    title: 'Como leio a DRE?',
    summary: 'A DRE mostra a receita, o custo, as despesas e o resultado de um período, em horário de Brasília.',
    keywords: 'dre, demonstrativo, resultado, lucro, prejuízo, receita, despesa, margem, financeiro, mês',
    order: 2,
    content: `## Onde fica

**Mais recursos > DRE**, só para o dono e o gerente. Escolha o período e toque em **Buscar**. Os dias seguem o horário de Brasília.

## As linhas

- **Receita bruta**: comandas e vendas de balcão pagas, pagamento na mesa (já descontados os estornos) e delivery. Ela se divide em **Vendas Salão** e **Vendas Delivery**; a taxa de serviço aparece à parte, já incluída
- **Deduções**: impostos e descontos
- **Custo das Mercadorias Vendidas (CMV)**: o custo das fichas técnicas do que foi vendido. Produto sem ficha técnica não entra
- **Despesas**: despesas lançadas no Caixa (sangria não é despesa), folha de pagamento, contas a pagar, contas de consumo e taxas dos pagamentos online
- **Resultado líquido**, com as margens bruta, operacional e líquida

## Folha de pagamento

Se você lança a folha em Contas a pagar, a DRE usa o valor lançado. Sem isso, ela estima pela Equipe, e a linha diz qual das duas usou.

## Para o número ficar certo

1. Mantenha as fichas técnicas e o custo dos insumos em dia (o CMV sai deles)
2. Lance as despesas pagas pela gaveta no Caixa e as outras em Contas a pagar
3. Lance as contas de luz, água e gás em Contas de consumo

> O "Pergunte ao Gastrux" também responde sobre a DRE ("qual foi meu resultado em setembro?").`,
  },
  {
    categorySlug: 'financeiro',
    slug: 'relatorios',
    title: 'Quais relatórios o Gastrux tem?',
    summary: 'Vendas, Lucratividade e Consumo de insumos mostram o que foi vendido, a margem de cada item e o que saiu do estoque.',
    keywords: 'relatórios, relatorio, vendas, lucratividade, margem, ticket médio, mais vendidos, consumo, insumos, planilha, csv, exportar',
    order: 3,
    content: `Os relatórios ficam no menu **Relatórios**, só para o dono e o gerente. Em Vendas e Lucratividade, os dias seguem o horário de Brasília e o último dia do período entra inteiro.

## Vendas

O total vendido, o número de vendas e o ticket médio do período, com os mesmos números do Caixa e da DRE: comandas e vendas de balcão pagas, pagamento na mesa e delivery. Abaixo, os itens mais vendidos (pelo preço cobrado) e as vendas por categoria do cardápio. Item que não está no cardápio aparece em "Sem categoria".

## Lucratividade

Para cada item vendido: quanto vendeu, a receita, o custo da ficha técnica e a **margem de contribuição** (receita menos o custo da ficha). Mostra os itens que mais dão margem e os com margem abaixo de 20%.

Item sem custo na ficha (sem insumos, ou com insumos sem custo) aparece como "sem custo" e fica fora da margem média. Mantenha as fichas e o custo dos insumos em dia.

A margem de contribuição não é o lucro do restaurante: aluguel, folha e contas não entram aqui. O resultado do mês está na **DRE**.

## Consumo de insumos

O que saiu do estoque de cada insumo no período (7 dias a 1 ano): baixa automática das vendas, saídas manuais e perdas. Você também pode ver entradas e ajustes no filtro **Tipo de Movimentação**.

## CMV e Contas de consumo

O CMV tem um artigo próprio ("Como o Gastrux calcula o CMV?"), assim como as contas de luz, água e gás.

## Planilha

Vendas e Lucratividade têm o botão **Baixar planilha (CSV)**, e Consumo de insumos tem **Exportar CSV**. O arquivo abre no Excel e no Google Planilhas.`,
  },
  {
    categorySlug: 'cardapio-e-receitas',
    slug: 'planejamento-producao',
    title: 'Como uso o planejamento de produção?',
    summary: 'Monte o plano do dia com as fichas técnicas e as quantidades, e veja o custo estimado da produção.',
    keywords: 'planejamento, produção, plano, pré-preparo, mise en place, quantidade, custo estimado, cozinha',
    order: 3,
    content: `## Onde fica

**Mais recursos > Planejamento de produção**. O dono e o gerente criam e mudam os planos e veem os custos; a cozinha vê os planos e as quantidades.

## Criando um plano

1. Toque em **Novo Plano**, escolha a **Data do Plano** e, se quiser, escreva observações
2. Toque em **Criar Plano** e abra o plano na lista
3. Em **Inserir Item**, escolha a ficha técnica e a quantidade a produzir

A quantidade é em unidades do item vendido (porções, espetos, pratos). O **Custo estimado** de cada item sai da ficha técnica, com o custo dos insumos na hora em que você insere o item. Embaixo aparece o **Custo Total** do plano.

## Durante o dia

Em **Editar**, mude o **Status** (Rascunho, Confirmado, Em Produção, Concluído ou Cancelado) e as observações. Cada item pode ter a quantidade corrigida ou ser removido.

O plano é um roteiro para a cozinha: ele não dá baixa no estoque e não cria lista de compras. O estoque baixa quando o item é vendido. Para receitas que você produz em quantidade diferente da ficha, use **Mais recursos > Escalonar receita**.`,
  },
  {
    categorySlug: 'equipe-e-lojas',
    slug: 'turnos-comissoes',
    title: 'Como monto os turnos e pago as comissões da equipe?',
    summary: 'Turnos é a escala da semana; Comissões calcula o que cada pessoa ganhou sobre as contas que abriu.',
    keywords: 'turnos, escala, folga, feriado, comissão, comissões, garçom, percentual, por conta, pagamento, quinzena',
    order: 1,
    content: `As duas telas ficam em **Mais recursos**, para o dono e o gerente. Quem aparece nelas é a equipe cadastrada em **Equipe > Equipe e acessos**.

## Turnos

A tela mostra a semana, de segunda a domingo, com uma linha por pessoa. Use as setas para trocar de semana.

1. Toque em **Turno**
2. Escolha o **Funcionário**, a **Data**, a **Entrada**, a **Saída** e o **Tipo**: Normal, Estendido, Reduzido, Folga ou Feriado
3. Toque em **Salvar**

É um turno por pessoa por dia: salvar de novo o mesmo dia troca o turno. A escala serve para organizar a equipe: ela não registra ponto e não entra na folha.

## A regra de comissão

Em **Equipe e acessos**, ao adicionar a pessoa ou depois, em **Editar remuneração**, escolha o **Tipo Comissão**:

- **% das vendas**: um percentual sobre o valor dos itens das contas que ela abriu
- **R$ por conta fechada**: um valor fixo por conta

Só contam as contas fechadas. Conta cancelada não entra, e a taxa de serviço também não. Mudar a regra vale para os períodos ainda não fechados; os já fechados não mudam.

## Acompanhando e pagando

Em **Comissões**, veja por **Semana** (segunda a domingo), **Quinzena** (1 a 15 e 16 ao fim do mês) ou **Mês**: as vendas, as contas fechadas e a comissão de cada pessoa. Em **Pagamento**, escolha se a equipe recebe por semana, quinzena ou mês.

Quando o período termina:

1. Escolha a visão do seu pagamento e o período que terminou
2. Toque em **Fechar período**: as comissões viram **Pendente**
3. Em **Fechamentos**, toque em **Aprovar** e depois em **Marcar como paga**

Antes de aprovar, **Ajustar** soma um valor (use o sinal de menos para um desconto) com o motivo. **Cancelar** pede o motivo.`,
  },
  {
    categorySlug: 'equipe-e-lojas',
    slug: 'varias-lojas',
    title: 'Como cadastro e acompanho várias lojas?',
    summary: 'No plano Business você tem 2 lojas: compare faturamento, vendas e CMV e copie fichas técnicas de uma para outra.',
    keywords: 'várias lojas, multi-loja, filial, unidade, segunda loja, franquia, comparar lojas, sincronizar fichas',
    order: 2,
    content: `## Quem pode

**Configurações > Várias lojas**. O plano Business tem 2 lojas (contando a primeira); o Enterprise, quantas precisar. Só o dono cria uma loja. O dono e o gerente veem os números das lojas onde têm esse papel.

## Criando a segunda loja

1. Toque em **Nova Unidade**
2. Informe o nome e, se quiser, cidade, estado, endereço, telefone e e-mail
3. Toque em **Criar Unidade**

A loja nova tem o mesmo plano da primeira (inclusive os dias do teste grátis). Ela começa vazia: cadastre a equipe, o cardápio e as mesas, ou copie as fichas técnicas (abaixo).

Para trabalhar em uma loja, toque em **Acessar** ao lado dela.

## Dashboard

Escolha 7, 30 ou 90 dias. Para cada loja: faturamento, vendas (com as de hoje), ticket médio, CMV, fichas e insumos. Os números são os mesmos do Caixa e da DRE de cada loja. A lista vem em ordem de faturamento.

## Alertas Cruzados

Com 2 lojas, o Gastrux compara os últimos 30 dias e avisa quando o CMV de uma está bem acima do da outra ou passa de 40%, quando uma fatura muito menos, quando uma loja não vendeu nada e quando uma tem 5 ou mais insumos abaixo do estoque mínimo.

## Sincronizar Fichas

Copia fichas técnicas de uma loja para a outra: escolha a **Unidade Origem**, a **Unidade Destino** e as fichas, e toque em **Sincronizar**. Os insumos que faltam são criados na loja de destino. Uma ficha que já existe lá (mesmo código) não é copiada de novo. O estoque e o cardápio digital não são copiados.`,
  },
];

let synced: Promise<{ categories: number; created: number; updated: number; removed: number }> | null = null;

/** Once per server process: the public help pages call it on every visit */
export function seedDefaultHelpContent() {
  if (!synced) {
    synced = syncHelpContent().catch((e) => {
      synced = null;
      throw e;
    });
  }
  return synced;
}

export async function syncHelpContent() {
  const catIds: Record<string, string> = {};
  for (const c of HELP_CATEGORIES) {
    const cat = await prisma.helpCategory.upsert({ where: { slug: c.slug }, update: c, create: c });
    catIds[c.slug] = cat.id;
  }

  const currentHashes = new Set(HELP_ARTICLES.map((a) => contentHash(a.content)));
  const isDefault = (content: string) => {
    const h = contentHash(content);
    return LEGACY_DEFAULT_HASHES.has(h) || currentHashes.has(h);
  };

  let removed = 0;
  const obsolete = await prisma.helpArticle.findMany({ where: { slug: { in: OBSOLETE_SLUGS } }, select: { id: true, content: true } });
  for (const o of obsolete) {
    if (!isDefault(o.content)) continue;
    await prisma.helpArticle.delete({ where: { id: o.id } });
    removed++;
  }

  let created = 0;
  let updated = 0;
  for (const a of HELP_ARTICLES) {
    const categoryId = catIds[a.categorySlug];
    const fields = {
      categoryId,
      title: a.title,
      summary: a.summary,
      content: a.content,
      keywords: a.keywords,
      featured: a.featured ?? false,
      order: a.order ?? 0,
    };
    const existing = await prisma.helpArticle.findUnique({ where: { slug: a.slug }, select: { id: true, content: true } });
    if (!existing) {
      await prisma.helpArticle.create({ data: { ...fields, slug: a.slug, published: true, publishedAt: new Date() } });
      created++;
    } else if (existing.content !== a.content && isDefault(existing.content)) {
      await prisma.helpArticle.update({ where: { id: existing.id }, data: fields });
      updated++;
    }
  }

  return { categories: HELP_CATEGORIES.length, created, updated, removed };
}
