# Mercado Pago por restaurante (OAuth Marketplace) — Design

**Data:** 2026-09-19
**Status:** design aprovado em chat (3 seções), aguardando revisão deste documento
**Origem:** varredura de integrações de 2026-09-19, item P0

## 1. Problema

O PIX que o cliente final paga no delivery (`app/delivery/[restaurantId]/page.tsx`) e no cardápio QR (`app/menu/[qrToken]/page.tsx`) passa por `app/api/pagamentos/mp/pix/route.ts`, que cria o cliente do Mercado Pago com o token **global** da plataforma (`MERCADO_PAGO_ACCESS_TOKEN`). O dinheiro cai na conta do Gastrux, não na do restaurante. `Restaurant.mercadoPagoAccountId` existe no schema e nada o usa.

Problemas adicionais encontrados no mesmo fluxo:

- A rota não tem sessão nem `restaurantId`, e o `amount` vem do navegador (`orderData.total`).
- Nenhuma linha `Payment` é gravada. O webhook procura `Payment.id` usando como `external_reference` um id de **pedido**, então não consegue ligar o pagamento a nada.
- "Pago" é decidido no cliente, quando o polling devolve `approved`.
- `GET .../pix` e `.../pix/status` consultam qualquer `paymentId` sem autenticação e devolvem dados do pagador (ex.: e-mail).

O Stripe Connect (`lib/stripe-connect.ts`) já faz o modelo correto: conta Express por restaurante, `transfer_data`, `stripeAccount`. Este design leva o Mercado Pago ao mesmo padrão.

## 2. Decisões

| Decisão | Escolha |
|---|---|
| Conexão | OAuth Marketplace do Mercado Pago (um clique). Descartadas: colar Access Token do restaurante (fricção, sem taxa futura) e a plataforma receber e repassar (a plataforma viraria subadquirente, com implicações regulatórias e fiscais). |
| Taxa da plataforma | **Nenhuma por enquanto.** O ponto de extensão fica pronto: `marketplace_fee` é parâmetro opcional na criação do pagamento. |
| Princípio | **Nenhum pagamento de restaurante usa o token da plataforma**, em PIX, checkout de cartão, reembolso ou webhook. Só a cobrança da assinatura do Gastrux (preapproval) continua no token global. |
| Restaurante sem conexão | PIX online **indisponível**. Sem fallback para a conta da plataforma. |

## 3. Escopo

**Dentro:** conexão OAuth, armazenamento criptografado dos tokens, renovação, criação e consulta de PIX por restaurante, webhook com dois caminhos, reembolso e checkout de cartão com o token do restaurante, tela de conexão, aviso de migração.

**Fora, de propósito:** taxa da plataforma; várias contas Mercado Pago por restaurante; maquininha Point; trabalho novo em parcelamento (o checkout de cartão mantém o comportamento atual, apenas com o token do restaurante); retroajustar a criptografia das outras integrações (P0 separado); o parâmetro `applicationFeePercent` que a rota de payment-intent do Stripe aceita no corpo da requisição (investigação separada).

## 4. Conexão do restaurante

### 4.1 Dados

Tabela nova `MercadoPagoConnection`, uma linha por restaurante:

| Campo | Observação |
|---|---|
| `restaurantId` | único, relação com `Restaurant` (`onDelete: Cascade`) |
| `mpUserId` | id da conta no Mercado Pago |
| `accessToken`, `refreshToken` | **criptografados** |
| `publicKey`, `liveMode` | vindos da resposta do OAuth |
| `expiresAt` | calculado a partir da validade informada pelo Mercado Pago na resposta |
| `status` | `ACTIVE` ou `NEEDS_RECONNECT` (desconectar apaga a linha; ver seção 10) |
| `connectedAt`, `lastRefreshAt`, `lastRefreshError` | observabilidade |

`Restaurant.mercadoPagoAccountId` permanece sem uso; removê-lo fica fora do escopo. O enum `PaymentGateway` ganha `MERCADO_PAGO_CONNECT`, espelhando `STRIPE_CONNECT`. Ele separa pagamento recebido por restaurante (novo) de cobrança de assinatura da plataforma (`MERCADO_PAGO`, inalterado).

### 4.2 Criptografia

`lib/security/credential-crypto.ts`: AES-256-GCM, chave em `CREDENTIALS_ENCRYPTION_KEY`, IV aleatório por valor, formato versionado para permitir rotação. Este projeto é o primeiro consumidor; o P0 de criptografia reaproveita o mesmo helper nas demais integrações.

### 4.3 Fluxo

1. **Início.** `GET /api/pagamentos/mp/connect/start`, restrito a OWNER ou ADMIN do restaurante atual (mesmo padrão de `getCurrentRestaurantId` + `requireAdminSession`). Redireciona para a autorização do Mercado Pago. O `state` é assinado com HMAC e carrega `restaurantId`, `userId`, nonce e validade curta.
2. **Retorno.** `GET /api/pagamentos/mp/connect/callback`. Valida o `state` (assinatura, validade), confirma que a sessão atual ainda pertence ao restaurante do `state`, troca o `code` pelos tokens e faz upsert da conexão com status `ACTIVE`. Redireciona para a tela de configurações. `state` inválido, expirado ou adulterado: recusa sem gravar nada.
3. **Renovação.** Endpoint de cron protegido por `CRON_SECRET` (padrão já usado no projeto). Renova conexões `ACTIVE` quando restar menos de 25% da validade original. Falha: `NEEDS_RECONNECT`, `lastRefreshError` preenchido e aviso ao dono.
4. **Desconectar.** `DELETE /api/pagamentos/mp/connect` apaga a conexão e os tokens.

### 4.4 Tela

Cartão "Receber pagamentos online" nas configurações, no padrão de `app/dashboard/billing/connect/page.tsx`: estado (conectado, precisa reconectar, não conectado), conta conectada e botão de conectar ou desconectar.

### 4.5 Variáveis de ambiente novas

`MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`. Documentar em `.env.example`.

## 5. Fluxo de pagamento

### 5.1 Criar PIX — `POST /api/pagamentos/mp/pix`

A rota continua pública (o cliente final não tem login), mas:

- Recebe **`orderId`** em vez de `amount`. O valor é calculado no servidor a partir do pedido. Pedido já pago é recusado. Há limite de requisições.
- O restaurante vem do pedido. Carrega a conexão e descriptografa o token. Sem conexão `ACTIVE`: 409. Sem fallback.
- Cria `Payment` com `restaurantId`, `orderId`, valor, status PENDING e gateway `MERCADO_PAGO_CONNECT`. O id do Mercado Pago vai em `Payment.gatewayPaymentId`. `MercadoPagoTransaction` não é usada: ela exige `preferenceId` e não se aplica ao PIX direto.
- Cria o pagamento no Mercado Pago com o token do restaurante. `external_reference` e chave de idempotência são o id do nosso `Payment`. A `notification_url` é `${NEXTAUTH_URL}/api/pagamentos/mp/webhook?rid=<restaurantId>`. Sem `marketplace_fee`.

### 5.2 Consultar status — `GET /api/pagamentos/mp/pix/status`

Recebe o id do nosso `Payment` e lê o banco, que é a fonte de verdade atualizada pelo webhook. Devolve só o status, sem dados do pagador. Se continuar PENDING e o webhook tiver atrasado, consulta o Mercado Pago com o token do restaurante para reconciliar. A rota `GET` em `pix/route.ts` deixa de existir.

### 5.3 Webhook — `POST /api/pagamentos/mp/webhook`

A assinatura é validada como hoje. Dois caminhos:

- **Com `rid`** (pagamento de restaurante): carrega a conexão, busca o pagamento com o **token do restaurante** e só aceita se o `Payment` encontrado por `external_reference` tiver `restaurantId` igual ao `rid` (guarda de tenant). A atualização é idempotente: só PENDING vira aprovado, então notificação repetida ou fora de ordem não credita duas vezes.
- **Sem `rid`** (assinatura do Gastrux): comportamento atual **inalterado**, com o token global.

### 5.4 Reembolso e checkout de cartão

`app/api/pagamentos/mp/refund` e `app/api/pagamentos/mp/checkout` usam o token do restaurante quando o gateway é `MERCADO_PAGO_CONNECT`, e somente para o restaurante dono do pagamento. `app/api/pagamentos/mp/preapproval` e `app/api/billing/mp/*` (assinatura da plataforma) não mudam.

### 5.5 Telas públicas

Delivery e cardápio QR enviam `orderId`, fazem polling pelo id do `Payment` e **escondem a opção PIX** quando o restaurante não tem conexão ativa. Para isso, a resposta pública já usada por essas telas ganha um indicador de aceitação de pagamento online.

## 6. Migração e entrada em produção

Depois do deploy, o PIX online fica desligado para todo restaurante até ele conectar. Para não surpreender ninguém:

- Aviso no dashboard: "Conecte seu Mercado Pago para continuar recebendo PIX online".
- Antes do deploy, checar no painel do Mercado Pago da conta do Gastrux se algum PIX real passou por essa rota. O sistema não gravava `Payment` para eles, então só dá para reconstruir por lá, pelo `external_reference`. Se houver, é dinheiro a repassar aos restaurantes.

## 7. Falhas

| Situação | Comportamento |
|---|---|
| Token revogado ou vencido durante um pagamento (401) | Conexão vira `NEEDS_RECONNECT`, cliente recebe 409, dono é avisado |
| Renovação falha no cron | Mesmo tratamento |
| Webhook duplicado ou fora de ordem | Transição PENDING para aprovado torna a repetição inofensiva |
| `state` inválido, expirado ou adulterado | Recusa, nada é gravado |
| Restaurante sem conexão tenta criar PIX | 409, sem fallback |

## 8. Testes

- **Unitários (`fetch` mockado):** ida e volta da criptografia; `state` (assinatura, validade, adulteração); valor calculado do pedido, ignorando qualquer `amount` do cliente; guarda de tenant no webhook; transição idempotente; webhook com e sem `rid`, garantindo que a cobrança da assinatura segue intacta.
- **Integração:** gravação de `Payment` e da conexão, isolamento entre restaurantes.
- **Manual:** conectar uma conta de teste do Mercado Pago, pagar um PIX no sandbox e reembolsar.

## 9. Pré-requisitos e premissas a confirmar

**Tarefa 0 (manual, sem código):** no painel de desenvolvedores do Mercado Pago, configurar o app do Gastrux para OAuth de marketplace, cadastrar a URL de retorno e obter `client_id` e `client_secret`.

**Premissas de API a confirmar na documentação atual antes de qualquer código** (vêm de conhecimento geral, não foram verificadas):

1. Endpoints e parâmetros do OAuth (autorização e troca de `code`) e do refresh de token.
2. Validade do access token e do refresh token.
3. O segredo de assinatura do webhook é o mesmo para pagamentos de vendedores conectados por OAuth.
4. Nome e semântica do parâmetro de taxa (`marketplace_fee`), para o ponto de extensão futuro.

**Ainda não lido no código:** como o pedido é marcado como pago hoje. O plano começa por isso e usa o caminho que o sistema já usa.

**Bloqueio de banco:** as migrations e os testes de integração gravam no banco apontado pelo `.env` (remoto). É a mesma decisão pendente das Tarefas 1 a 4 do WhatsApp: usar um banco de teste separado antes de rodar qualquer coisa que grave dados.

## 10. Revisões após a leitura do código (2026-09-19)

Ao escrever o plano (`docs/superpowers/plans/2026-09-19-mercadopago-connect.md`), a leitura do código mudou ou acrescentou o seguinte. O plano é a referência quando houver diferença.

1. **Nada marcava o pedido como pago.** Nenhum código atualizava `Order.paymentStatus` depois do pagamento. A pendência "ainda não lido no código" da seção 9 está resolvida: o webhook novo passa a marcar o pedido como `APPROVED`, de forma idempotente, quando um `Payment` com `orderId` é aprovado.
2. **O PIX do cardápio QR não tem pedido.** A rota aceita `{ qrToken }` e calcula o valor pelos itens da comanda aberta da mesa (`price × quantity`). O botão "Pagar com Pix agora" envia o carrinho primeiro e só então pede o PIX. A comanda não é fechada automaticamente ao pagar; fechá-la continua sendo ação da equipe.
3. **Reembolso.** O helper atual (`refundPayment`) usa `Payment.cancel`, que o SDK documenta como válido só para pagamento ainda não aprovado. O reembolso Connect usa `PaymentRefund` (parcial com `create`, total com `total`). O helper antigo não foi alterado.
4. **Renovação também no uso.** Não há agendador de cron no repositório, então o token é renovado dentro de `getMpClientForRestaurant()` quando vence em menos de 24 horas, além do cron diário. Uma reserva por `updatedAt` impede duas renovações simultâneas, já que o refresh token pode ser de uso único (premissa 2).
5. **Sem limitador de requisições.** Não existe um no repositório. Criar PIX para o mesmo alvo e o mesmo valor em até 25 minutos reaproveita o `Payment` pendente e o mesmo QR code.
6. **Desconectar apaga a linha.** O enum de status fica `ACTIVE | NEEDS_RECONNECT`; `REVOKED` deixou de existir.
7. **Caminhos das rotas:** `GET|DELETE /api/pagamentos/mp/connect`, `GET .../connect/start`, `GET .../connect/callback`, `POST .../connect/refresh`.
8. **Delivery sem conexão.** O pedido é criado normalmente, o passo de PIX é pulado e a tela mostra "Pagamento na entrega". **Decisão de produto a confirmar:** hoje o delivery só oferece PIX.
9. **Verificações extras no webhook:** o id do pagamento no Mercado Pago deve bater com `Payment.gatewayPaymentId` (PIX), e uma aprovação exige `transaction_amount` igual ao valor do `Payment`.
10. **O gateway novo aparece nas listagens** (filtro de `GET /api/pagamentos`, sem entrar na lista de valores aceitos pelo `POST`, para ninguém fabricar um pagamento Connect), no painel de pagamentos e na conciliação.
11. **Um terceiro chamador da rota de PIX:** a tela de "PIX avulso" do dashboard (`app/dashboard/pagamentos/checkout/page.tsx`), usada pela equipe com um valor digitado. Ela ganha `POST /api/pagamentos/mp/pix/manual` (qualquer membro logado do restaurante atual, inclusive caixa; o restaurante vem da sessão) e passa a consultar o status pela rota nova. A rota pública continua estrita (`orderId` ou `qrToken`).
12. **Infraestrutura de teste.** Foi adicionado `jest.unit.config.js` (sem banco), porque toda a suíte de integração conecta no banco do `.env` e roda `cleanupAllTestData()` antes e depois.
