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
};
