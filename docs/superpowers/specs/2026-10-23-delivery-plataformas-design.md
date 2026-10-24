# Pedidos das plataformas de delivery (design, 2026-10-23)

Pedido do dono: "colocar nos pedidos de delivery a plataforma Keeta e as mais usadas no Brasil", e também "chegar os
pedidos pela integração esperada de um formato próprio do Gastrux". Ele aprovou começar por este projeto, antes da
indicação e dos novos tipos de negócio.

## Como está hoje

- A tela **Vender > Pedidos de delivery** (`/admin/integrations/orders`) lista iFood, Rappi e Uber Eats. A Uber Eats saiu
  do Brasil em 2022.
- A "integração" é um endereço (`/api/external/orders/webhook`) que espera os pedidos num formato do próprio Gastrux,
  assinado com HMAC, com a plataforma num cabeçalho `x-platform`. Nenhuma plataforma manda nesse formato, e ele não
  está documentado para ninguém: na prática, nenhum pedido entra sozinho.
- A base serve e fica: `DeliveryIntegration` (uma por restaurante e plataforma), `ExternalOrder` (o pedido como veio),
  `MenuItemMapping` (item da plataforma ↔ ficha técnica), `createOrderFromExternalOrder` (vira pedido da cozinha,
  com alerta no sino quando um item não é reconhecido) e o status do pedido externo. O pedido da cozinha sem comanda
  já entra nas vendas do Caixa e da DRE (`salesInRange`) e na contagem de espetos.

## O mercado (pesquisa de 2026-10-23)

- **Open Delivery** é o padrão aberto da Abrasel (cardápio, pedidos e logística na versão 1.4.0). A **99Food e a Keeta**
  concluíram a integração no fim de 2025; a **Rappi** anunciou adesão. Uma integração com o padrão serve para todas as
  plataformas que o adotam. A Keeta publica a documentação em `api-docs.mykeeta.com/apis/opendelivery`, a 99Food tem o
  portal `developer-food.99app.com`. Sistemas como PDV Legal e GCom já recebem pedidos da Keeta e da 99Food assim.
- **iFood**, a maior plataforma, não aderiu ao padrão. Tem API própria (Merchant API): o sistema busca os eventos de
  tempos em tempos, confirma cada um e busca o pedido; o restaurante autoriza o sistema no Portal do Parceiro. O sistema
  precisa de conta de desenvolvedor e passar pela homologação do iFood.
- **aiqfome**: sem confirmação de adesão ao Open Delivery. Fica para depois.

## O que vamos construir, em três partes

### 1. API de pedidos do Gastrux (o formato próprio)

Uma porta documentada para qualquer sistema mandar pedidos: site próprio do restaurante, bot de WhatsApp, automações,
uma plataforma pequena. É também o caminho interno por onde passam os pedidos das partes 2 e 3.

- Cada restaurante gera uma **chave de API** em Configurações > Integrações > API de pedidos (só o dono e o gerente),
  pode ter mais de uma, com nome, e revoga quando quiser. A chave aparece uma vez só.
- **Enviar pedido**: um pedido em JSON com o código do pedido no sistema de origem (repetir o envio não duplica), o
  cliente (nome e celular; endereço quando for entrega), os itens (código do produto ou nome, quantidade, preço,
  adicionais e observação), taxa de entrega, desconto, total, forma de pagamento (já pago online ou a cobrar na
  entrega, com o meio) e horário agendado quando houver.
- **Consultar e acompanhar**: o sistema de origem consulta o status do pedido e pode cadastrar um endereço para
  receber os avisos de mudança (aceito, em preparo, pronto, saiu para entrega, entregue, cancelado), assinados.
- **Documentação pública** numa página do site (`/desenvolvedores`), em português, com exemplos prontos para copiar.
- Os itens são reconhecidos pelo **código do produto** cadastrado no Gastrux (novo campo no produto do cardápio) ou
  pelo vínculo item ↔ ficha técnica; item não reconhecido vai para a cozinha como texto e toca o sino, como hoje.

### 2. Open Delivery: Keeta, 99Food e Rappi

- Em Configurações > Integrações, o restaurante escolhe a plataforma e segue o passo a passo para ligar a loja dele ao
  Gastrux (a autorização é feita no portal da plataforma; o Gastrux mostra o que preencher, como o código da loja).
- O Gastrux recebe os pedidos (aviso da plataforma ou busca de tempos em tempos, o que o padrão e a plataforma
  oferecerem), confirma o recebimento de cada evento e manda de volta os status: aceito, pronto, despachado e
  cancelado (com motivo).
- Os pedidos entram pela mesma esteira da parte 1.

### 3. iFood (Merchant API)

- O mesmo fluxo da parte 2, com a API própria do iFood: autorização do restaurante no Portal do Parceiro, busca dos
  eventos, confirmação de cada evento e envio dos status. Depende da conta de desenvolvedor da Gastrux e da homologação
  do iFood.

### Comum às três

- **Tela Pedidos de delivery**: mostra só as plataformas que funcionam, com a origem de cada pedido, o estado da
  integração (ligada, com erro, desligada) e o último pedido recebido.
- **Aceitar pedido (proposta)**: cada restaurante escolhe aceitar sozinho ou tocar o alarme e esperar o "Aceitar". O
  padrão é aceitar sozinho, porque as plataformas cancelam o pedido não aceito em poucos minutos.
- **Cozinha, Caixa, DRE e contagem**: o pedido aceito vai para a cozinha e entra nas vendas como delivery, com a
  plataforma separada na DRE (para ver quanto vende cada uma). A comissão da plataforma entra como despesa quando a
  plataforma informar o valor.
- **Cliente e cashback (proposta)**: pedidos da API própria criam o cliente pelo celular no CRM e ganham cashback, como
  o site de delivery. Pedidos do iFood, da Keeta e da 99Food não: o cliente é da plataforma, e o celular costuma vir
  mascarado.
- **NFC-e**: segue a regra de hoje para pedidos de delivery (a plataforma pode emitir a nota em alguns casos;
  conferir com o contador no plano).
- **Ajuda e IA**: artigos de cada integração e da API, e a base da IA atualizada.

## Metas, não metas e o que faria isso dar errado

- **Meta:** o pedido da Keeta, da 99Food, do iFood ou de outro sistema aparece no Gastrux sem ninguém digitar, vai para
  a cozinha e entra nos números.
- **Não metas, por enquanto:** mandar o cardápio do Gastrux para as plataformas (cada uma tem o seu); entregadores e
  logística; aiqfome; conciliação financeira com o repasse das plataformas.
- **Daria errado se:** um pedido entrar duas vezes (a plataforma repete o aviso); um pedido se perder sem ninguém saber;
  a plataforma cancelar porque o Gastrux não confirmou a tempo; a tela listar uma plataforma que não funciona (o erro de
  hoje); a chave de um restaurante aceitar pedido em outro.

## O que depende do dono (contas que só ele pode criar)

- **Keeta**: conta de desenvolvedor ou parceiro de integração da Gastrux.
- **99Food**: conta no portal de desenvolvedores, com o ambiente de teste.
- **iFood**: conta de desenvolvedor da Gastrux e pedido de homologação. Costuma ser o mais demorado: vale pedir logo.
- Uma loja de teste em cada plataforma, ou a de um restaurante parceiro disposto a testar.

## Ordem proposta

1. Parte 1 (a API do Gastrux) e a tela de Pedidos de delivery corrigida. Não depende de ninguém de fora.
2. Parte 2 (Open Delivery), assim que a conta da Keeta ou da 99Food sair.
3. Parte 3 (iFood), depois da homologação.

## Para o dono decidir

1. Em que plano entram as integrações? Proposta: a API própria no Pro e no Business; Keeta, 99Food e iFood no Business.
2. O pedido é aceito sozinho por padrão, com a opção de exigir o "Aceitar"?
3. Pedidos da API própria geram cliente no CRM e cashback, e os das plataformas não?
