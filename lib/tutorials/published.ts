/**
 * The tutorial videos already made (gastrux-videos/tutoriais/publish.mjs writes this file): the written step by step
 * is the narration of each step, and the length is the real video. A video not listed here does not show.
 */
export const PUBLISHED: Record<string, { durationSec: number; steps: string[] }> = {
  'conhecendo-o-painel': {
    durationSec: 44,
    steps: [
      "Bem-vindo ao Gastrux! Esta é a tela de Início. Aqui você vê o resumo do dia: quanto vendeu hoje, o caixa, as comandas, a cozinha e o estoque.",
      "Cada quadro é um atalho. Clique em Comandas abertas, por exemplo, e você vai direto para as mesas.",
      "De volta ao Início, o botão Vender abre o salão para lançar os pedidos.",
      "No menu da esquerda ficam todas as áreas do sistema, em grupos. Clique em um grupo para ver as telas dele.",
      "O sino mostra os avisos importantes, como estoque baixo e contas para vencer.",
      "E em qualquer tela, se bater uma dúvida, clique em Vídeo desta tela. O passo a passo daquela tela abre na hora.",
    ],
  },
  'insumos': {
    durationSec: 37,
    steps: [
      "Insumos são tudo o que você compra para produzir: carne, carvão, palito, bebida. Aqui fica a lista, com a unidade e o preço de cada um.",
      "Para cadastrar um novo, clique em Novo Insumo.",
      "Dê um código e um nome, escolha a categoria e a unidade em que você compra: quilo, litro ou unidade.",
      "Informe o estoque mínimo, para o Gastrux avisar quando estiver acabando, e o preço que você paga.",
      "Clique em Criar Insumo. Pronto: ele já pode entrar nas fichas técnicas.",
    ],
  },
  'fichas-tecnicas': {
    durationSec: 43,
    steps: [
      "A ficha técnica diz o que vai em cada prato e em que quantidade. Com ela, o Gastrux calcula sozinho o custo de cada prato.",
      "Abra uma ficha. No Resumo de Custos aparecem o custo do prato, o preço de venda e o Food Cost: quanto do preço vira custo.",
      "Food Cost alto? O Gastrux já sugere um preço de venda para chegar a trinta por cento.",
      "Mais abaixo ficam os ingredientes, com a quantidade de cada um e o custo calculado pelo preço do insumo.",
      "Para incluir mais um, clique em Adicionar Ingrediente e escolha o insumo e a quantidade.",
      "E para um prato novo, use Nova ficha técnica, na lista de fichas.",
    ],
  },
  'cardapio-digital': {
    durationSec: 31,
    steps: [
      "Aqui ficam os produtos que você vende, separados por categoria: espetos, acompanhamentos e bebidas.",
      "Para cadastrar um produto, clique em Item.",
      "Escreva o nome e o preço de venda. A descrição é opcional.",
      "Clique em Criar Item, e ele já aparece para vender nas mesas, no balcão e no cardápio do cliente.",
      "Precisa de uma categoria nova, como sobremesas? Use Nova Categoria.",
    ],
  },
  'cadastro-de-mesas': {
    durationSec: 28,
    steps: [
      "Aqui você cadastra as mesas do restaurante, separadas por área, como Salão e Varanda.",
      "Para criar uma mesa, clique em Mesa.",
      "Escolha a área, o número da mesa e quantos lugares ela tem.",
      "Clique em Criar, e a mesa já aparece em Vender.",
      "Para o cliente pedir e pagar pelo celular, imprima o QR Code de cada mesa em QR Codes.",
    ],
  },
  'caixa': {
    durationSec: 43,
    steps: [
      "No Caixa você acompanha o turno: as vendas de cada forma de pagamento e o dinheiro que deve estar na gaveta.",
      "Tirou dinheiro da gaveta para guardar no cofre? Registre uma Sangria, com o valor e o motivo.",
      "Pagou alguma coisa com o dinheiro da gaveta? Use Despesa: ela entra nos custos do mês.",
      "No fim do dia, clique em Fechar caixa. Conte a gaveta e informe o total de cada forma de pagamento.",
      "Clique em Continuar e confirme o fechamento. Só então o Gastrux mostra o esperado, o contado e a diferença de cada forma.",
      "Clique em Concluir. No dia seguinte, abra o caixa informando o troco que ficou na gaveta.",
    ],
  },
  'mesas-e-balcao': {
    durationSec: 35,
    steps: [
      "Em Vender aparecem as mesas: as livres e as ocupadas, com o valor e há quanto tempo estão abertas.",
      "Toque numa mesa livre para abrir a comanda.",
      "Escolha os itens no cardápio. Cada toque adiciona um.",
      "Toque em Enviar para cozinha, e o pedido aparece na hora na tela da cozinha.",
      "Quando a mesa pedir a conta, toque em Conta. Dá para dividir e receber em dinheiro, PIX ou cartão.",
      "Para vender sem mesa, use Venda balcão ou Comanda por nome.",
    ],
  },
  'cozinha-kds': {
    durationSec: 37,
    steps: [
      "A tela da cozinha mostra os pedidos que chegam das mesas, do balcão e do delivery, na ordem em que chegaram.",
      "Em cima, o resumo: quantos pedidos estão a fazer, em preparo e prontos.",
      "Ao começar um pedido, toque em Iniciar. Ele passa para Em preparo.",
      "Quando ficar pronto, toque em Pronto: o pedido fica marcado como pronto para servir.",
      "Com mais de uma estação, como churrasqueira e bar, use Configurar estações. Cada uma passa a ver só os seus pedidos.",
    ],
  },
  'equipe-e-acessos': {
    durationSec: 34,
    steps: [
      "Em Equipe e acessos você cadastra quem trabalha com você. Cada pessoa entra com o próprio login.",
      "Clique em Novo Funcionário e preencha o nome e o e-mail. Telefone e CPF são opcionais.",
      "Escolha o cargo. Caixa é para quem vende, como o garçom. Cozinheiro vê a cozinha e o estoque. Gerente cuida de tudo.",
      "Clique em Adicionar Funcionário. O Gastrux mostra uma senha provisória, e a pessoa troca no primeiro acesso.",
    ],
  },
  'pedidos-de-delivery': {
    durationSec: 35,
    steps: [
      "Em Pedidos de delivery chegam os pedidos do seu cardápio digital e dos sistemas ligados pela API de pedidos.",
      "Em cima, o resumo: os pedidos novos, em preparo, prontos e em entrega.",
      "Com Aceitar pedidos sozinho ligado, o pedido vai direto para a cozinha. Desligado, você confirma cada um.",
      "Cada pedido mostra de onde veio, os itens, o valor e há quanto tempo chegou.",
      "Use os filtros para ver os pedidos por situação ou por plataforma.",
    ],
  },
  'contagem-do-dia': {
    durationSec: 33,
    steps: [
      "A Contagem do dia é para o que você prepara antes de vender, como os espetos: quanto tinha, quanto montou, quanto vendeu e quanto perdeu.",
      "Montou mais? Toque em mais um, mais dez ou mais vinte. As vendas entram sozinhas.",
      "Perdeu algum? Lance em Perda, para a conta bater.",
      "Lançou errado? Desfaça em Lançamentos desta noite.",
      "No fim da noite, toque em Fechar contagem. Cada noite fica guardada no Histórico.",
    ],
  },
  'pagamentos-online': {
    durationSec: 29,
    steps: [
      "Em Pagamentos online você acompanha o que entrou por PIX e cartão pelo celular: a receita, a quantidade e o ticket médio.",
      "Em Checkout PIX você gera um QR Code para receber na hora.",
      "A Conciliação confere os recebimentos e as taxas, e os Alertas mostram falhas e disputas.",
      "Mais abaixo ficam todos os pagamentos, com filtros por gateway e por situação.",
    ],
  },
  'contas-a-pagar': {
    durationSec: 32,
    steps: [
      "Em Contas a pagar ficam as contas do restaurante: as atrasadas, as que vencem hoje e as dos próximos dias.",
      "Para lançar uma conta, clique em Nova conta.",
      "Escolha se ela é de uma vez, parcelada ou se repete todo mês. Depois preencha a descrição, a categoria, o valor e o vencimento.",
      "Clique em Salvar. A conta aparece na lista e, na DRE, entra no mês a que se refere.",
    ],
  },
  'adicionais': {
    durationSec: 28,
    steps: [
      "Adicionais são as opções dos produtos, como o ponto da carne, sem cebola ou queijo extra.",
      "Clique em Novo adicional.",
      "Dê um nome e uma categoria, como Opções de preparo. Se a opção custa a mais, informe o ajuste de preço.",
      "Clique em Criar adicional. Na hora de vender, a opção aparece nos detalhes do produto.",
    ],
  },
  'qr-codes-das-mesas': {
    durationSec: 27,
    steps: [
      "Cada mesa tem o seu QR Code. O cliente aponta a câmera do celular e abre o cardápio daquela mesa.",
      "Imprima todos de uma vez em Imprimir Todos, ou baixe um por um em PNG.",
      "Para ver o que o cliente vê, use Abrir.",
      "Regenerar cria um código novo para a mesa, e o QR impresso antes deixa de funcionar.",
    ],
  },
  'estoque': {
    durationSec: 36,
    steps: [
      "Em Estoque você vê quanto tem de cada insumo, e quantos estão em situação crítica ou baixa.",
      "Cada venda dá baixa sozinha, pela ficha técnica. Quando um insumo fica abaixo do mínimo, o Gastrux avisa para reabastecer.",
      "Chegou mercadoria? Clique em Registrar entrada ou saída.",
      "Escolha o insumo, o tipo de movimentação e a quantidade, e clique em Registrar Movimentação.",
      "Para lançar vários insumos de uma vez, como as compras da semana, use Entrada em lote.",
    ],
  },
  'contagem-de-estoque': {
    durationSec: 28,
    steps: [
      "A Contagem de estoque é o checklist para contar o que você tem de verdade nas prateleiras e na câmara fria.",
      "Para cada insumo aparece o que o sistema calcula. Digite o que você contou.",
      "Para contar por partes, filtre por categoria, como as carnes.",
      "Ao terminar, clique em Salvar. Cada diferença vira um ajuste, e o estoque passa a bater com a contagem.",
    ],
  },
  'compras': {
    durationSec: 24,
    steps: [
      "Em Compras você monta as listas do que precisa comprar.",
      "Clique em Nova Lista.",
      "Gerar Automaticamente cria a lista com os insumos abaixo do estoque mínimo, já com o fornecedor de menor preço.",
      "Prefere fazer à mão? Em Nova Lista, escolha Lista Vazia e adicione os itens você mesmo.",
    ],
  },
  'desperdicio': {
    durationSec: 25,
    steps: [
      "Em Desperdício você registra o que foi perdido, e vê quanto isso custou no mês.",
      "Para registrar, clique em Registrar Perda.",
      "Escolha o insumo, a quantidade e o motivo, como vencimento ou erro no preparo.",
      "Clique em Registrar. A perda sai do estoque e aparece aqui, separada por motivo.",
    ],
  },
  'fornecedores': {
    durationSec: 23,
    steps: [
      "Em Fornecedores ficam os contatos de quem vende para você.",
      "Clique em Novo Fornecedor e preencha o código, o nome e os contatos.",
      "Clique em Criar Fornecedor.",
      "Em Comparar preços você vê qual fornecedor tem o melhor preço de cada insumo.",
    ],
  },
  'importar-nota-de-compra': {
    durationSec: 29,
    steps: [
      "Recebeu a nota fiscal do fornecedor? Importe o arquivo XML dela aqui.",
      "Arraste o arquivo para cá, ou clique em Selecionar Arquivo XML.",
      "O Gastrux lê os produtos da nota e liga cada um ao seu insumo. Os que forem ligados atualizam o estoque e o custo sozinhos.",
      "Os que ele não reconhecer ficam pendentes, para você cadastrar ou ligar à mão.",
    ],
  },
  'nfce': {
    durationSec: 69,
    steps: [
      "Em Notas fiscais, a Visão geral mostra em que etapa está a configuração da NFC-e e o que ainda falta. Toque em Continuar.",
      "A primeira etapa é a lista do que ter em mãos: o CNPJ com inscrição estadual, o certificado digital A1, a conta na Focus NFe, o CSC da SEFAZ e a tributação passada pelo contador.",
      "Na etapa Empresa, preencha o CNPJ, a inscrição estadual, a razão social, o estado e o regime. Cada etapa salva quando você avança.",
      "Depois, cole o token da sua empresa na Focus NFe. Comece no ambiente de Teste. O certificado e o CSC ficam cadastrados na Focus.",
      "Na tributação, copie o texto pronto e mande ao seu contador. Ele passa o NCM, o CFOP, a origem, o CSOSN e o código de PIS e COFINS.",
      "Por fim, confira se todas as etapas estão completas e emita uma nota de teste. Se ela sair autorizada, troque para Produção com o token de produção, e a nota sai sozinha a cada venda.",
    ],
  },
  'notas-emitidas': {
    durationSec: 25,
    steps: [
      "Em Notas emitidas fica o histórico de todas as notas fiscais do restaurante.",
      "Para achar uma nota, busque pelo número, pela chave ou pelo cliente.",
      "E filtre pela situação, como autorizada, rejeitada ou cancelada, e pelo tipo de nota.",
      "Para ajustar a emissão, use o botão Configuração.",
    ],
  },
  'cmv': {
    durationSec: 33,
    steps: [
      "O CMV mostra quanto do que você vendeu virou custo de mercadoria, no período escolhido.",
      "O percentual é comparado com a faixa ideal, de vinte e oito a trinta e cinco por cento.",
      "Logo abaixo ficam as compras, o consumo, as perdas e a receita do período.",
      "Em Top Insumos por Custo você vê quais ingredientes mais pesam no custo.",
      "Mude o período no seletor de cima, e use Salvar snapshot para guardar a foto do mês.",
    ],
  },
  'consumo-de-insumos': {
    durationSec: 27,
    steps: [
      "Em Consumo de insumos você vê o que saiu do estoque no período: pelas vendas, pelas saídas manuais e pelas perdas.",
      "Escolha os tipos de movimentação e os insumos que quer analisar, e clique em Aplicar Filtros.",
      "Os gráficos mostram a tendência do consumo e quanto ele custou.",
      "E dá para baixar tudo em Exportar CSV, para abrir na planilha.",
    ],
  },
  'vendas': {
    durationSec: 26,
    steps: [
      "Em Vendas você vê o total vendido, o número de vendas e o ticket médio do período.",
      "Escolha as datas e clique em Aplicar Filtro.",
      "Top Pratos mostra os itens que mais venderam.",
      "E Vendas por Categoria mostra o peso de cada parte do cardápio.",
      "Para levar os números para a planilha, use Baixar planilha.",
    ],
  },
  'lucratividade': {
    durationSec: 28,
    steps: [
      "Lucratividade mostra a margem de contribuição: a receita de cada item menos o custo da ficha técnica.",
      "Itens sem ficha técnica ficam fora da margem, e o Gastrux avisa quantos são.",
      "Em Pratos Mais Lucrativos aparecem os que mais deixam dinheiro no caixa.",
      "E em Todos os Pratos, a margem de cada um, em percentual e em reais.",
    ],
  },
  'financeiro': {
    durationSec: 37,
    steps: [
      "O Financeiro junta os números do Caixa e da DRE: a receita, o resultado, a margem e o ticket médio dos últimos trinta dias.",
      "Na previsão do mês, o Gastrux calcula como o mês fecha se o ritmo continuar.",
      "Mais abaixo, as formas de pagamento dos últimos trinta dias.",
      "Os atalhos levam para a DRE, as contas a pagar, as contas de consumo e os relatórios.",
      "Em Contas de consumo, lance a luz, a água e o gás do mês. Elas entram na DRE pelo mês de referência.",
    ],
  },
  'relatorio-executivo': {
    durationSec: 27,
    steps: [
      "Em Relatório executivo você gera relatórios prontos em PDF, para analisar ou apresentar.",
      "Escolha o tipo: CMV, engenharia de cardápio, desperdício, ou o relatório completo.",
      "Clique em Abrir relatório. Ele abre numa nova aba.",
      "Lá, toque em Imprimir e escolha Salvar como PDF para guardar o arquivo.",
    ],
  },
  'clientes-crm': {
    durationSec: 31,
    steps: [
      "Em Clientes você vê quem compra no restaurante, quanto já gastou e quantas vezes comprou.",
      "O cliente entra aqui sozinho quando o caixa digita o celular dele ao fechar a conta, ou quando ele pede pelo site de delivery.",
      "Cada um ganha um segmento pelas compras dos últimos noventa dias: VIP, Regular, Ocasional ou Inativo.",
      "Busque pelo nome ou pelo celular, ou cadastre à mão em Novo Cliente.",
    ],
  },
  'cashback': {
    durationSec: 29,
    steps: [
      "Com o cashback, o cliente ganha um crédito em reais a cada compra e usa como desconto na próxima.",
      "Ligue o cashback e escolha o percentual de cada compra.",
      "Defina a validade do crédito em meses e o valor mínimo para usar. Depois, clique em Salvar.",
      "No caixa, basta digitar o celular do cliente ao fechar a conta. Aqui você acompanha o crédito dado, o usado e o que vai vencer.",
    ],
  },
  'campanhas': {
    durationSec: 27,
    steps: [
      "Em Campanhas você manda mensagens para listas de clientes pelo WhatsApp.",
      "Primeiro, ligue o provedor de mensagens, como Meta, Take Blip ou Zenvia.",
      "Depois, cadastre os modelos de mensagem. O WhatsApp só deixa enviar modelos aprovados.",
      "Com isso pronto, clique em Nova Campanha, escolha o modelo e a lista, e envie na hora ou agende.",
    ],
  },
  'site-de-delivery': {
    durationSec: 31,
    steps: [
      "O site de delivery é a sua loja própria: o cliente vê o cardápio, monta o pedido e paga, sem comissão.",
      "Copie o link e mande no WhatsApp, no Instagram e nas redes sociais.",
      "Os pedidos aparecem sozinhos em Pedidos de delivery.",
      "Aqui também ficam prontas as mensagens do WhatsApp Business, para ele responder sozinho com o link do cardápio.",
      "E, no fim, você escolhe as formas de pagamento aceitas na entrega.",
    ],
  },
  'planejamento-de-producao': {
    durationSec: 27,
    steps: [
      "No Planejamento de produção você decide quanto preparar de cada receita para o dia.",
      "Clique em Novo Plano, escolha a data e clique em Criar Plano.",
      "Abra o plano e, em Inserir Item, adicione cada receita com a quantidade a produzir.",
      "A equipe da cozinha acompanha o plano, do rascunho até a produção concluída.",
    ],
  },
  'escalonar-receita': {
    durationSec: 22,
    steps: [
      "Escalonar receita mostra quanto separar de cada insumo para produzir uma quantidade.",
      "Escolha a ficha técnica.",
      "Diga quantas porções quer fazer, e clique em Escalonar.",
      "Pronto: a lista mostra a quantidade de cada insumo para essa produção.",
    ],
  },
  'etiquetas-e-validades': {
    durationSec: 26,
    steps: [
      "Em Etiquetas você imprime a etiqueta de cada preparo ou insumo aberto, com a data de validade.",
      "Busque o item e toque nele.",
      "Escolha onde ele vai ficar guardado: a validade é calculada sozinha. Depois, clique em Imprimir.",
      "Em Validades você vê o que vence hoje e amanhã, para usar antes ou descartar.",
    ],
  },
  'engenharia-de-cardapio': {
    durationSec: 30,
    steps: [
      "A engenharia de cardápio cruza o quanto cada prato vende com o quanto ele dá de margem.",
      "Estrela vende muito e dá lucro. Cavalo de Batalha vende muito, com margem baixa. Enigma dá lucro, mas vende pouco. E Abacaxi vai mal nas duas coisas.",
      "Em Recomendações, o Gastrux diz o que fazer com cada prato.",
      "Pratos sem ficha técnica ficam de fora, porque não têm custo.",
    ],
  },
  'dre': {
    durationSec: 33,
    steps: [
      "A DRE mostra o resultado do mês: do que entrou com as vendas até o que sobrou de lucro.",
      "Escolha a visão mensal, trimestral, anual ou um período seu, e use as setas para trocar o mês.",
      "Ela começa pela receita, separando salão e delivery, tira os impostos e os descontos, e o CMV.",
      "Depois vêm as despesas: folha, contas a pagar, contas de consumo e taxas de pagamento. No fim, o resultado líquido.",
    ],
  },
  'turnos': {
    durationSec: 24,
    steps: [
      "Em Turnos você monta a escala da semana: quem trabalha em cada dia.",
      "Cada linha é uma pessoa da equipe, e cada coluna é um dia.",
      "Clique em Turno para lançar o dia, a entrada e a saída.",
      "Assim todo mundo sabe a escala da semana, e você vê quem estava em cada dia.",
    ],
  },
  'comissoes': {
    durationSec: 30,
    steps: [
      "Em Comissões você vê quanto cada pessoa ganhou sobre as contas fechadas que ela abriu. A taxa de serviço não entra.",
      "Escolha se o pagamento é semanal, quinzenal ou mensal.",
      "A tabela mostra a regra, as contas, as vendas e a comissão de cada um. A regra é definida em Equipe e acessos.",
      "Quando o período terminar, clique em Fechar período para guardar o fechamento.",
    ],
  },
  'configuracoes-do-restaurante': {
    durationSec: 27,
    steps: [
      "Em Configurações ficam os dados do restaurante: nome, CNPJ, contato e endereço.",
      "A taxa de serviço é sugerida na conta das mesas. O cliente pode recusar, e zero desliga.",
      "Escolha também o tamanho da etiqueta da sua impressora térmica.",
      "Preencha o horário de funcionamento de cada dia e clique em Salvar alterações.",
    ],
  },
  'minha-assinatura': {
    durationSec: 23,
    steps: [
      "Em Minha assinatura você vê o seu plano, o preço e o que está incluído.",
      "Para trocar o cartão ou o plano, clique em Gerenciar assinatura.",
      "Em Indique e ganhe, mande o seu link para outros restaurantes. Cada um que assinar vale um mês grátis para você.",
    ],
  },
  'whatsapp': {
    durationSec: 26,
    steps: [
      "Aqui você liga o WhatsApp do restaurante para receber pedidos pelo robô.",
      "Copie os dados da sua conta do WhatsApp Business no painel da Meta e cole aqui.",
      "Depois, informe na Meta o endereço do webhook mostrado nesta tela.",
      "Ajuste as mensagens do robô, salve, e envie uma mensagem de teste para o seu número.",
    ],
  },
  'api-de-pedidos': {
    durationSec: 29,
    steps: [
      "A API de pedidos deixa o seu site, um robô de WhatsApp ou outro sistema mandar pedidos de delivery direto para o Gastrux.",
      "Dê um nome para a chave, como Site da loja, e clique em Criar chave.",
      "Passe a chave para quem cuida do sistema, junto com a página para desenvolvedores.",
      "Os pedidos que chegarem aparecem em Vender, Pedidos de delivery.",
    ],
  },
  'varias-lojas': {
    durationSec: 31,
    steps: [
      "Em Várias lojas você acompanha todas as unidades juntas: faturamento, vendas, ticket médio e CMV.",
      "O ranking mostra qual unidade vai melhor no período.",
      "Em Alertas Cruzados aparecem os avisos de todas as lojas num lugar só.",
      "Para abrir uma nova loja, clique em Nova Unidade. E use Sincronizar Fichas para levar as fichas técnicas de uma loja para outra.",
    ],
  },
  'uso-da-ia': {
    durationSec: 21,
    steps: [
      "Em Uso da IA você vê quantas perguntas foram feitas ao Pergunte ao Gastrux neste mês.",
      "Cada plano tem um limite de perguntas por mês, e aqui aparece quanto ainda sobra.",
      "Abaixo fica a lista das perguntas, com quem perguntou e quando.",
    ],
  },
};
