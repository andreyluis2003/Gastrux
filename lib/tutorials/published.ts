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
    durationSec: 40,
    steps: [
      "Em Notas fiscais você configura a emissão da NFC-e, a nota do consumidor, direto pelo Gastrux.",
      "A Visão Geral mostra quantas notas foram emitidas, autorizadas, pendentes e rejeitadas.",
      "Para começar, abra Configuração e preencha os dados da empresa: CNPJ, inscrição estadual e regime tributário.",
      "Escolha o provedor fiscal e informe a chave de acesso e a senha do certificado digital A1.",
      "A tributação padrão dos produtos é preenchida pelo seu contador. Com tudo pronto, a nota pode sair sozinha a cada venda.",
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
};
