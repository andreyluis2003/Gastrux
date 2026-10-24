# Pedidos do iFood (parte 3 das plataformas de delivery, design, 2026-10-24)

Continua o design `2026-10-23-delivery-plataformas-design.md`. O dono pediu para começar pelo iFood enquanto a Keeta e a
99Food não respondem (os e-mails já foram enviados).

## O que já existe

- **Conta de desenvolvedor da Help Flow no iFood**, criada pelo dono em 2026-10-24.
- **App de teste (centralizado)**: as credenciais estão em `.env.delivery-teste` (fora do Git).
  - O acesso funciona: o token dura 6 horas.
  - Ele enxerga a loja de teste "Teste - HELP FLOW LTDA".
  - A loja aparece fechada, com o aviso "Gestor de Pedidos ou PDV desconectado": o iFood espera um sistema conectado.
  - A busca de eventos responde 204 (nada novo).
- **Na parte 1 do Gastrux** já estão prontos:
  - a esteira de pedidos (`ingestDeliveryOrder`), que guarda o pedido como veio, sem duplicar pelo código;
  - o aceite sozinho ou pelo "Aceitar", e a cozinha;
  - Caixa, DRE por plataforma, alertas no sino, `followKitchen` (o pedido segue a cozinha) e a tela Pedidos de delivery.

## Como o iFood funciona (documentação e testes de 2026-10-24)

- **Acesso de cada restaurante (app distribuído, o de produção):**
  1. o Gastrux pede um código ao iFood (`/oauth/userCode`);
  2. o restaurante digita esse código no Portal do Parceiro e recebe um código de autorização;
  3. ele cola esse código de volta no Gastrux, que o troca por um token próprio da loja (com renovação).
- **App de teste (centralizado):** um token só, que enxerga a loja de teste. Não pode ser homologado.
- **Eventos:** o iFood avisa cada mudança do pedido de dois jeitos:
  - pela busca (`/events/v1.0/events:polling`), feita a cada 30 segundos, no mínimo;
  - ou por aviso ao Gastrux (webhook).

  Cada evento precisa ser confirmado (`/events/v1.0/events/acknowledgment`). Eventos repetidos acontecem e devem ser
  ignorados. É a busca que mantém a loja "conectada" (aberta) no iFood.
- **Pedido:**
  - `GET /order/v1.0/orders/{id}` traz os itens, os adicionais, as observações, o cliente (com telefone mascarado), o
    endereço, os pagamentos (bandeira, troco, já pago ou a cobrar), os cupons e quem paga cada um, o código de retirada,
    o CPF/CNPJ para nota e quem entrega (iFood ou a loja).
  - Ações: confirmar, iniciar preparo, pronto (`readyToPickup`), despachar (só na entrega própria e só depois do pronto)
    e pedir cancelamento com um motivo da lista `cancellationReasons`.
  - O cliente pode pedir para cancelar: o restaurante aceita ou recusa.
- **Homologação:**
  - feita pelo dono no Portal, com um app de produção da categoria PDV e uma loja de teste;
  - módulos Pedidos e Eventos, em cinco etapas com prints: conexão, receber e confirmar, cancelar, despachar e concluir;
  - exigências: confirmar em até 8 minutos, mostrar os motivos de cancelamento, a bandeira do cartão, o troco, os
    cupons e quem paga, as observações, o código de retirada e o CPF/CNPJ;
  - renovar o token só quando ele vencer e respeitar os limites de chamadas;
  - se for reprovada, dá para tentar de novo depois de 4 horas.

## O que vamos construir

1. **Ligar o iFood** em Configurações > Integrações > iFood (só no plano Business, só o dono e o gerente):
   - o botão "Conectar iFood" mostra o código e o link do Portal do Parceiro, com o passo a passo;
   - o restaurante cola o código de autorização e escolhe a loja (quando tem mais de uma);
   - o Gastrux mostra o estado (conectada, com erro, desconectada) e o último pedido;
   - o botão "Desconectar" encerra a ligação.
   - **Modo de teste:** com o app centralizado, só o administrador da plataforma liga um restaurante (o de teste) à
     loja de teste pelo código da loja.
2. **Buscar os eventos a cada 30 segundos**, por um laço que roda dentro do próprio servidor do Gastrux:
   - busca de todas as lojas ligadas, com a opção de desligar por variável de ambiente;
   - cada evento fica guardado pelo seu id (o repetido é ignorado) e é confirmado ao iFood só depois de processado.
3. **Pedido novo:** o Gastrux busca o pedido e o passa pela esteira da parte 1 (plataforma `ifood`).
   - **Cliente:** fora do CRM e sem cashback, como decidido.
   - **Aceite:** se o restaurante aceita sozinho, o Gastrux confirma no iFood na hora. Se ele exige o "Aceitar", o sino
     toca, o aviso repete depois de 5 minutos e o "Aceitar" confirma no iFood. O "Recusar" cancela no iFood com um motivo
     da lista dele.
   - **Comanda da cozinha:** mostra a bandeira, o troco, os cupons (quem paga), as observações, o código de retirada, o
     CPF/CNPJ e "Entrega iFood" ou "Entrega própria".
4. **A cozinha avisa o iFood:**
   - "em preparo" vira iniciar preparo;
   - "pronto" vira `readyToPickup`;
   - "concluído" vira despachar, só na entrega própria.

   O cancelamento feito pela cozinha pede o motivo da lista do iFood.
5. **O iFood avisa o Gastrux:**
   - cancelado pelo cliente ou pelo iFood: o pedido da cozinha é cancelado e sai da venda;
   - concluído: o pedido vira entregue;
   - pedido de cancelamento do cliente: aparece em Pedidos de delivery com "Aceitar cancelamento" e "Recusar", e o sino
     toca;
   - mudança de status feita em outro sistema (como o Gestor de Pedidos do iFood): o Gastrux acompanha.
6. **Loja aberta e fechada:** a loja fica conectada no iFood enquanto o Gastrux busca os eventos dela. Quando o
   restaurante desliga "Recebendo pedidos" no Gastrux, a busca daquela loja para, e o iFood fecha a loja.
7. **Ajuda e IA:** um artigo "Como ligar o iFood", a base da IA atualizada, uma linha no manual e o item na tela Pedidos
   de delivery (que hoje esconde o iFood).

## Valores no Caixa e na DRE (minha decisão, conferir com o contador)

- **Venda do restaurante:**
  - itens + adicionais;
  - mais a taxa de entrega, só quando a entrega é própria;
  - menos os descontos pagos pela loja.
- **Cupom pago pelo iFood:** não diminui a venda, porque o iFood repassa esse valor.
- **Comissão do iFood:** não vem no pedido. Fica de fora, como no design geral (sem conciliação do repasse).

## Decisões minhas (o dono pode mudar)

- **Busca a cada 30 segundos, não aviso por webhook:**
  - é o caminho mais simples, mantém a loja aberta e não depende de configurar um endereço no Portal;
  - o webhook fica para quando houver muitos restaurantes.
- **O laço da busca roda no próprio servidor do app**, porque o crontab da VPS só vai até 1 minuto.
- **Credenciais do app de produção:** entram nas variáveis do Easypanel (`IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`,
  `IFOOD_APP_MODE=distributed`).
- **Tokens das lojas:** ficam no banco cifrados, com a mesma chave usada para os tokens do Mercado Pago.
- **Pedido agendado:** é confirmado na chegada, como a homologação pede, e vai para a cozinha no horário, como os
  agendados da parte 1.

## O que depende do dono

- **Criar no Portal o app de produção (distribuído, categoria PDV)**, quando a integração estiver pronta e testada na
  loja de teste.
- **Pedir a homologação** (só o dono da conta pode) e tirar os prints das cinco etapas. Eu preparo o roteiro.

## Daria errado se

- **pedido duplicado:** um pedido entrar duas vezes;
- **evento perdido:** um evento se perder (ex.: confirmado ao iFood antes de ser guardado);
- **cancelamento por atraso:** o iFood cancelar por falta de confirmação em 8 minutos;
- **loja errada:** o token de uma loja buscar pedidos de outra;
- **loja fechada sem aviso:** a loja fechar no iFood sem o restaurante saber (servidor parado: o estado mostra
  "desconectada" e o sino avisa).
