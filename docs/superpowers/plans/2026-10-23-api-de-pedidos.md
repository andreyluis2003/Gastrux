# API de pedidos do Gastrux (parte 1 das plataformas de delivery) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Qualquer sistema manda pedidos de delivery para um restaurante pelo formato próprio do Gastrux, com chave de API, e o pedido aparece em Pedidos de delivery, vai para a cozinha (sozinho ou depois do "Aceitar") e entra no Caixa, na DRE, no CRM e no cashback.

**Architecture:** Uma esteira única em `lib/delivery-orders/` (entrada validada → `ExternalOrder` idempotente → aceite → pedido da cozinha com os valores) que a API própria usa agora e as partes 2 (Open Delivery) e 3 (iFood) usarão depois. A API própria é uma `DeliveryIntegration` da plataforma `gastrux_api` por restaurante, com chaves em `OrderApiKey`. Os avisos de status saem de um só lugar (`notifyOrderStatus`), chamado pelo aceite/recusa e por `lib/kds/order-status.ts`.

**Tech Stack:** Next.js 14 (app router), Prisma + Postgres, Jest (unit `jest.unit.config.js`, integration `jest.integration.config.js --workerIdleMemoryLimit=10MB`), Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-10-23-delivery-plataformas-design.md` (parte 1 e "Comum às três"; decisões do dono no fim).

## Global Constraints

- Plano: API própria no **Pro e no Business** (e Enterprise, e no teste, que é Business); Keeta, 99Food e iFood (partes 2 e 3) só no Business.
- Aceite: o pedido é **aceito sozinho por padrão**; o restaurante pode exigir o "Aceitar" (`Restaurant.deliveryAutoAccept`, padrão `true`).
- CRM e cashback **só** para pedidos da API própria (e do site, como hoje); nunca para plataformas.
- Vale para **todos os tipos de negócio** (pedido do dono, 2026-10-23): nada nesta esteira depende de `businessType`; as páginas de segmento citam a API para todos.
- Textos da tela, erros da API e documentação em português do Brasil; a chave aparece uma vez só, na criação.
- Nenhuma tela lista plataforma que não funciona (iFood, Rappi e Uber Eats saem das listas até as partes 2 e 3).
- Plano travado (`restaurantAcceptsOrders`) recusa pedido novo com `ORDER_REFUSAL` e 403, como o site.
- Toda mudança de texto padrão de artigo de ajuda guarda o hash antigo em `LEGACY_DEFAULT_HASHES`; toda funcionalidade atualiza `lib/ai/knowledge/*.ts` e `lib/help/seed-articles.ts`.
- Arquivos com CRLF: normalizar antes de editar por script (edições por `node -e` perdem barras invertidas; usar Edit ou script em arquivo).

## Review Focus

- O mesmo pedido mandado duas vezes ao mesmo tempo (o sistema de origem repete por timeout) deixa um `ExternalOrder` e um pedido da cozinha, e as duas respostas dizem o mesmo id. (Task 4)
- A chave de um restaurante nunca lê, cria nem aceita pedido de outro; chave revogada ou digitada errada dá 401 sem dizer qual parte errou. (Tasks 2 e 5)
- O valor do pedido chega no Caixa e na DRE: hoje o pedido de fora vira pedido da cozinha sem `total`, então entraria como R$ 0 nas vendas. (Task 4)
- Endereço de aviso apontando para a rede interna (`localhost`, `10.x`, `169.254.x`) ou lento não trava o pedido nem vira acesso a máquinas internas. (Task 6)
- Item que o Gastrux não reconhece continua indo para a cozinha como texto, tocando o sino, e o valor dele continua no total. (Task 4)

---

### Task 1: Banco e plano

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261024120000_order_api/migration.sql`
- Modify: `lib/tier-guard.ts` (`isTierFeatureEnabled`: features `orderApi` e `deliveryPlatforms`)
- Test: `__tests__/unit/tier-order-api.test.ts`

**Interfaces:**
- Produces: enum `DeliveryPlatform` ganha `gastrux_api`, `keeta`, `ninety_nine_food` (mantém `ifood`, `uber_eats`, `rappi`, que só somem das telas); `model OrderApiKey { id, restaurantId, integrationId, name String, prefix String @unique, keyHash String @unique, callbackUrl String?, callbackSecret String, createdById String, createdAt, lastUsedAt DateTime?, revokedAt DateTime? }` (`@@map("order_api_keys")`, `@@index([restaurantId])`); `ExternalOrder` ganha `apiKeyId String?`, `subtotal Float @default(0)`, `discount Float @default(0)`, `paymentMethod DeliveryPaymentMethod?`, `paidOnline Boolean @default(false)`, `scheduledFor DateTime?`, `customerId String?`; `MenuItem` ganha `code String?` com `@@unique([restaurantId, code])`; `Restaurant` ganha `deliveryAutoAccept Boolean @default(true)`.
- Produces: `isTierFeatureEnabled(tier, 'orderApi')` verdadeiro em pro, business, enterprise; `'deliveryPlatforms'` em business, enterprise.

- [ ] **Step 1: Teste que falha** — `orderApi` é falso em `starter` e verdadeiro em `pro`, `business`, `enterprise`; `deliveryPlatforms` é falso em `starter` e `pro`.
- [ ] **Step 2: Rodar** `npx jest --config jest.unit.config.js __tests__/unit/tier-order-api.test.ts` → FAIL (tipo de feature desconhecido).
- [ ] **Step 3: Schema, migração e as duas features.** A migração é o `prisma migrate diff` do schema antigo para o novo (`ALTER TYPE ... ADD VALUE` para o enum).
- [ ] **Step 4: Rodar** o teste → PASS; `npm run -s test:db:reset` → "Drift check: OK"; `npx tsc --noEmit -p .` → sem erros.
- [ ] **Step 5: Commit** `feat(delivery): order API schema and plan features`.

### Task 2: Chaves de API

**Files:**
- Create: `lib/delivery-orders/api-keys.ts`
- Create: `app/api/admin/integrations/api-keys/route.ts` (GET lista, POST cria), `app/api/admin/integrations/api-keys/[id]/route.ts` (PATCH endereço de aviso, DELETE revoga)
- Test: `__tests__/integration/api/order-api-keys.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `createApiKey(member: RestaurantMember, name: string): Promise<{ id: string; key: string; prefix: string }>` — chave `gx_live_` + 32 caracteres aleatórios (base62); guarda só `sha256(key)`; `prefix` = os 12 primeiros caracteres; cria (ou reaproveita) a `DeliveryIntegration` `gastrux_api` do restaurante (`apiKey`/`webhookSecret` dessa linha recebem valores aleatórios, sem uso); `callbackSecret` aleatório (32 bytes hex).
  - `authenticateOrderApiKey(authorization: string | null): Promise<{ restaurantId: string; integrationId: string; apiKeyId: string } | null>` — `Bearer gx_live_...`, compara pelo hash, recusa revogada, marca `lastUsedAt`.
  - `listApiKeys(member)`, `revokeApiKey(member, id)`, `setCallback(member, id, url: string | null)` — só dono, gerente e ADMIN (`MANAGER_ROLES`), auditados com `recordAudit`, sempre restritos ao restaurante do membro.

- [ ] **Step 1: Testes que falham:**
  - dono cria chave → a resposta traz `key` começando por `gx_live_`; o banco não guarda a chave (só o hash); a lista mostra `prefix` e nunca a chave;
  - `authenticateOrderApiKey('Bearer ' + key)` devolve o restaurante; chave revogada, `Bearer` vazio e chave de outro formato → `null`;
  - caixa e cozinha recebem 403 nas rotas; o gerente do restaurante B não revoga a chave de A (404);
  - restaurante no plano `starter` recebe 403 com `upgradeUrl` ao criar chave.
- [ ] **Step 2: Rodar** `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB __tests__/integration/api/order-api-keys.test.ts` → FAIL.
- [ ] **Step 3: Implementar** as funções e as rotas.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(delivery): order API keys`.

### Task 3: O formato do pedido

**Files:**
- Create: `lib/delivery-orders/input.ts`
- Test: `__tests__/unit/order-api-input.test.ts`

**Interfaces:**
- Produces: `parseOrderApiInput(body: unknown): { ok: true; value: OrderApiInput } | { ok: false; error: string }`, com
  `OrderApiInput = { codigo: string; cliente: { nome: string; celular: string; email?: string }; entrega?: { endereco: string; numero?: string; complemento?: string; bairro?: string; cidade?: string; cep?: string; referencia?: string }; retirada: boolean; itens: Array<{ codigo?: string; nome: string; quantidade: number; precoUnitario: number; adicionais?: Array<{ nome: string; preco: number }>; observacao?: string }>; taxaEntrega: number; desconto: number; total: number; pagamento: { forma: 'PIX' | 'CREDITO' | 'DEBITO' | 'DINHEIRO' | 'VALE_REFEICAO' | 'OUTRO'; pago: boolean; trocoPara?: number }; agendadoPara?: string; observacao?: string }`.
  Mensagens de erro em português, nomeando o campo (`"itens[2].quantidade: deve ser um número inteiro de 1 a 99"`).

- [ ] **Step 1: Testes que falham:**
  - pedido completo de exemplo (o mesmo da página `/desenvolvedores`, Task 8) → `ok`;
  - sem `codigo`, sem itens, quantidade 0 ou 100, preço negativo, `celular` sem dígitos, `entrega` ausente com `retirada: false` → erro com o nome do campo;
  - `total` diferente de `soma(itens × (preço + adicionais)) + taxaEntrega − desconto` em mais de R$ 0,01 → erro `"total: não confere com os itens (esperado R$ X)"`;
  - `agendadoPara` que não é data ISO, ou no passado → erro; textos longos são cortados (nome 120, observação 500) e quebras de linha viram " / ".
- [ ] **Step 2: Rodar** `npx jest --config jest.unit.config.js __tests__/unit/order-api-input.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `parseOrderApiInput`; `pagamento.forma` mapeia para `DeliveryPaymentMethod` no Task 4.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(delivery): order API input`.

### Task 4: A esteira (entrada, aceite, cozinha, valores, cliente)

**Files:**
- Create: `lib/delivery-orders/ingest.ts`
- Modify: `lib/kds-integration.ts` (`createKdsOrder` grava `subtotal`, `fees`, `discount`, `total`, `paymentMethod`, `paymentStatus`, `customerId`; itens reconhecidos também por `MenuItem.code`)
- Modify: `lib/vender/salao.ts` (`deliveryNew` conta só `PENDING` à espera de aceite)
- Test: `__tests__/integration/api/order-api-ingest.test.ts`

**Interfaces:**
- Consumes: Tasks 1 a 3.
- Produces:
  - `ingestDeliveryOrder(args: { restaurantId: string; integrationId: string; apiKeyId?: string; platform: DeliveryPlatform; input: OrderApiInput }): Promise<{ externalOrder: ExternalOrder; kitchenOrderId: string | null; duplicate: boolean }>` — idempotente por `(restaurantId, externalOrderId = input.codigo)`, como o webhook atual (P2002 → usa a linha que venceu); com `deliveryAutoAccept` aceita na hora, sem ele deixa `PENDING` e toca o sino "Novo pedido de delivery: aceite em Pedidos de delivery"; grava `subtotal`, `discount`, `paymentMethod`, `paidOnline`, `scheduledFor`; itens com adicionais e observação vão no JSON de itens, e os adicionais viram texto na observação do item ("+ Queijo extra").
  - `acceptDeliveryOrder(restaurantId: string, externalOrderId: string, by: { userId?: string }): Promise<{ kitchenOrderId: string | null }>` — `PENDING` → `CONFIRMED` (guardado no status atual), cria o pedido da cozinha uma vez só.
  - `rejectDeliveryOrder(member: RestaurantMember, externalOrderId: string, reason: string): Promise<void>` — `PENDING` → `CANCELLED`, motivo de 3 a 200 caracteres, auditado.
  - Valores do pedido da cozinha (convenção da DRE, `lib/finance/dre.ts`): `subtotal` = itens, `fees` = taxa de entrega, `discount` = desconto, `total` = `subtotal + fees` (bruto; a DRE desconta `discount` em Deduções); `paymentStatus` `PAID` quando `pago`.
  - Cliente: só quando `platform === 'gastrux_api'`, o mesmo de `app/api/public/delivery/order/route.ts` (`findCustomerByPhone`, cria com celular normalizado; e-mail só se livre); o cashback sai sozinho na conclusão (`creditCashback` em `lib/kds/order-status.ts` exige `customerId` e pedido sem comanda).

- [ ] **Step 1: Testes que falham:**
  - aceito sozinho: o pedido vira `CONFIRMED`, o pedido da cozinha tem `total` 47,00 para itens 40,00 + taxa 7,00 e `discount` 0, e `salesInRange` do dia soma 4700 centavos em `deliveryCents`;
  - com `deliveryAutoAccept: false`: fica `PENDING`, sem pedido da cozinha, com uma notificação; `acceptDeliveryOrder` cria o pedido da cozinha; um segundo `acceptDeliveryOrder` não cria outro; `rejectDeliveryOrder` num aceito dá erro 409;
  - o mesmo `codigo` mandado duas vezes com `Promise.all` → um `ExternalOrder`, um pedido da cozinha, `duplicate: true` numa das respostas;
  - item com `codigo` igual ao `MenuItem.code` do restaurante vira a ficha certa; item desconhecido vai como texto e gera a notificação "Pedido de plataforma NÃO foi para a cozinha" só se nenhum item foi reconhecido (comportamento atual), e o `total` continua com o valor dele;
  - cliente: pedido com celular novo cria cliente no CRM ligado ao pedido; concluir o pedido pela cozinha (`changeOrderStatus` de `lib/kds/order-status.ts`) credita cashback quando o restaurante tem cashback ligado; um `ExternalOrder` de `platform: 'keeta'` não cria cliente.
- [ ] **Step 2: Rodar** `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB __tests__/integration/api/order-api-ingest.test.ts` → FAIL.
- [ ] **Step 3: Implementar** `ingest.ts` e as mudanças em `kds-integration.ts` e `salao.ts`.
- [ ] **Step 4: Rodar** o teste novo e as pastas `api`, `bad-day` e `vender` (o webhook antigo usa `createOrderFromExternalOrder`) → PASS.
- [ ] **Step 5: Commit** `feat(delivery): one ingest pipeline with values, accept and customer`.

### Task 4b: O cardápio digital (site de delivery) pela mesma esteira, com "Retirar no local"

Pedido do dono (2026-10-23, durante a execução): os pedidos feitos pelo cardápio digital, cujo link o restaurante manda
ao cliente pelo WhatsApp, inclusive para o cliente buscar no local, chegam pelo formato próprio do Gastrux.

**Files:**
- Modify: `prisma/schema.prisma` e a migração `20261024120000_order_api` (ainda não publicada): `DeliveryPlatform` ganha `delivery_site`
- Modify: `app/api/public/delivery/order/route.ts` (monta um `OrderApiInput` e chama `ingestDeliveryOrder` com a integração `delivery_site` do restaurante, criada na primeira vez como a `gastrux_api`)
- Modify: `app/delivery/[restaurantId]/page.tsx` (opção "Retirar no local": sem endereço nem taxa de entrega)
- Test: `__tests__/integration/api/delivery-site-ingest.test.ts`

**Interfaces:**
- Consumes: `ingestDeliveryOrder`, `OrderApiInput` (a resposta do site continua a mesma: `{ success, order: { id, orderNumber, total, ... } }`).
- O pedido do site vira `ExternalOrder` da plataforma `delivery_site` com o código `DLV-...` de hoje; cria o cliente pelo celular
  (como hoje); aceite sozinho ou "Aceitar" pela mesma regra; aparece em Pedidos de delivery como "Cardápio digital".

- [ ] **Step 1: Testes que falham:** pedido do site com entrega fica igual para o cliente (mesma resposta) e aparece como
  `ExternalOrder` `delivery_site` com o pedido da cozinha e o total certo; pedido com `retirada: true` não exige endereço nem
  cobra taxa e a cozinha vê "RETIRADA NO LOCAL"; com `deliveryAutoAccept: false` o pedido do site espera o "Aceitar"; os
  testes atuais do site (`__tests__/integration/api/delivery-*.test.ts`) continuam passando.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** este teste e a pasta `api` → PASS.
- [ ] **Step 5: Commit** `feat(delivery): the digital menu goes through the order pipeline, with pickup`.

### Task 5: As rotas públicas da API

**Files:**
- Create: `app/api/v1/pedidos/route.ts` (POST), `app/api/v1/pedidos/[codigo]/route.ts` (GET)
- Test: `__tests__/integration/api/order-api-routes.test.ts`

**Interfaces:**
- Consumes: `authenticateOrderApiKey`, `parseOrderApiInput`, `ingestDeliveryOrder`.
- Produces: POST responde `201 { id, codigo, status, aceito: boolean }` no pedido novo e `200` com o mesmo corpo no repetido; GET responde `{ codigo, status, atualizadoEm }`, com `status` em português: `aguardando_aceite`, `aceito`, `em_preparo`, `pronto`, `saiu_para_entrega`, `entregue`, `cancelado`. Erros: `401 { erro: "Chave de API inválida" }`, `403` plano (`ORDER_REFUSAL` ou `{ erro, upgradeUrl: '/pricing' }` sem `orderApi`), `400 { erro: <mensagem do parse> }`, `404 { erro: "Pedido não encontrado" }`.

- [ ] **Step 1: Testes que falham:** chave válida cria (201) e repete (200, mesmo `id`); GET de pedido de outro restaurante com a chave de A → 404; chave revogada → 401; restaurante `starter` → 403 com `upgradeUrl`; restaurante travado → 403 `ORDER_REFUSAL`; corpo inválido → 400 com o nome do campo; corpo maior que 256 KB → 413.
- [ ] **Step 2: Rodar** `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB __tests__/integration/api/order-api-routes.test.ts` → FAIL.
- [ ] **Step 3: Implementar** as duas rotas (`export const dynamic = 'force-dynamic'`; o mapa de status fica numa função `publicStatus(external: ExternalOrderStatus, kitchen: OrderStatus | null)` em `lib/delivery-orders/status.ts`).
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(delivery): public order API routes`.

### Task 6: Avisos de mudança de status

**Files:**
- Create: `lib/delivery-orders/callback.ts`
- Modify: `lib/kds/order-status.ts` (depois de mudar o status de um pedido com `externalOrderId`, chama `notifyOrderStatus`), `lib/delivery-orders/ingest.ts` (aceite e recusa chamam também)
- Test: `__tests__/integration/api/order-api-callback.test.ts`

**Interfaces:**
- Consumes: `publicStatus`, `OrderApiKey.callbackUrl/callbackSecret`.
- Produces: `notifyOrderStatus(externalOrderId: string): Promise<void>` — nunca lança; só para `ExternalOrder` com `apiKeyId` e chave com `callbackUrl`; manda `POST` JSON `{ codigo, status, atualizadoEm }` com cabeçalho `x-gastrux-signature: sha256=<hex>` (HMAC-SHA256 do corpo com `callbackSecret`), tempo máximo 5 s, sem seguir redirecionamento; grava o resultado em `DeliveryLog`. `isSafeCallbackUrl(url: string): Promise<boolean>` — só `https`, recusa `localhost`, IP privado, `169.254.0.0/16`, `.local` e nome que resolve para IP privado; usada também ao salvar o endereço (Task 2, `setCallback` recusa com 400).

- [ ] **Step 1: Testes que falham** (com `fetch` substituído por `jest.spyOn(global, 'fetch')`): aceitar manda `status: 'aceito'` com a assinatura que confere com o `callbackSecret`; a cozinha marcar pronto manda `pronto`; endereço que demora 10 s não atrasa `ingestDeliveryOrder` mais que 6 s e grava a falha; `setCallback` com `http://localhost:3000/x`, `https://10.0.0.5/x` e `https://169.254.169.254/` → 400; pedido sem endereço de aviso não chama `fetch`.
- [ ] **Step 2: Rodar** `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB __tests__/integration/api/order-api-callback.test.ts` → FAIL.
- [ ] **Step 3: Implementar** (`notifyOrderStatus` é chamado sem `await` bloqueante no fluxo da cozinha: `void notifyOrderStatus(id)`).
- [ ] **Step 4: Rodar** este teste e a pasta `staff` (mudança de status da cozinha) → PASS.
- [ ] **Step 5: Commit** `feat(delivery): signed status callbacks`.

### Task 7: As telas

**Files:**
- Create: `app/admin/integrations/api/page.tsx` (Configurações > API de pedidos)
- Modify: `app/admin/integrations/orders/page.tsx` e `app/api/admin/integrations/orders/route.ts`, `.../[id]/route.ts` (origem do pedido, "Aceitar" e "Recusar", opção "Aceitar pedidos sozinho"; só as plataformas `gastrux_api` agora)
- Modify: `app/admin/integrations/delivery/page.tsx` (vira `redirect('/admin/integrations/api')` até a parte 2)
- Modify: tela de produto do Cardápio digital (`app/admin/cardapio/page.tsx` e `app/api/cardapio/itens/*`): campo "Código do produto (opcional)", único no restaurante
- Modify: `lib/navigation/app-nav.ts` (Configurações: `{ label: 'API de pedidos', href: '/admin/integrations/api', roles: MANAGERS }`)
- Test: `__tests__/integration/api/order-api-admin.test.ts`, `__tests__/unit/nav-page-titles.test.ts` (título "API de pedidos")

**Interfaces:**
- Consumes: Tasks 2, 4 e 6.
- Produces: `PATCH /api/admin/integrations/orders/[id]` com `{ action: 'accept' }` ou `{ action: 'reject', reason }`; `PUT /api/admin/delivery-settings` com `{ autoAccept: boolean }` (só gerentes, auditado).
- A tela da API mostra: as chaves (nome, prefixo, criada por, último uso, revogar), "Nova chave" com a chave exibida uma vez e botão copiar, o endereço de aviso e o segredo da assinatura (mostrar e copiar), o link para `/desenvolvedores`, e no Pro sem a feature o convite para assinar.
- A tela de Pedidos de delivery mostra a origem ("API do Gastrux", com o nome da chave), os pedidos aguardando aceite no topo com som e os botões, e o seletor "Aceitar pedidos sozinho".

- [ ] **Step 1: Testes que falham:** aceitar pela rota cria o pedido da cozinha; recusar exige motivo; a cozinha recebe 403 em aceitar e no ajuste; código de produto repetido no mesmo restaurante → 400 `"Este código já é de outro produto"`; o título da tela é o nome no menu; `page-hook-order.test.ts` continua verde com a tela nova no menu.
- [ ] **Step 2: Rodar** os testes → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** os testes e `npx jest --config jest.unit.config.js` → PASS. Abrir as duas telas no `npm run dev` (ou na homologação) e conferir criar chave, mandar um pedido com `curl`, aceitar e ver na cozinha.
- [ ] **Step 5: Commit** `feat(delivery): API keys screen, accept on Pedidos de delivery, product code`.

### Task 8: Documentação, DRE por origem, ajuda, IA e site

**Files:**
- Create: `app/desenvolvedores/page.tsx` (pública, sem login)
- Modify: `lib/finance/month-sales.ts` e `lib/finance/dre.ts` (vendas delivery por origem: Site, API do Gastrux; as plataformas entram nas partes 2 e 3), `app/dashboard/financeiro/dre/page.tsx`
- Modify: `lib/help/seed-articles.ts` (artigo "Como recebo pedidos de outros sistemas (API de pedidos)?"; hash antigo de artigos alterados), `lib/ai/knowledge/` (novo `delivery.ts` ou o arquivo de delivery existente), `lib/marketing/segments.ts` (todos os segmentos: "Recebe pedidos do seu site ou sistema pela API do Gastrux"), `lib/billing/pricing-tiers.ts` e `app/pricing/page.tsx` (Pro: "API de pedidos"), `components/marketing/faq-section.tsx` e `components/marketing/features-showcase.tsx` (hoje dizem que outros sistemas mandam pedidos por webhook, o que só passa a ser verdade com esta API; a pergunta do FAQ passa a apontar para `/desenvolvedores`), e o benefício "Pedidos externos por API" do segmento delivery
- Modify: `docs/pendencias.md`, manual (Claude Doc `e47fd4d1-0a3f-4e2b-a96d-86475da2833e`)
- Test: `__tests__/unit/help-seed-articles.test.ts`, `__tests__/unit/plan-copy.test.ts`, `__tests__/integration/staff/utility-dre.test.ts` ou um novo `__tests__/integration/api/dre-delivery-origin.test.ts`

**Interfaces:**
- Produces: `PeriodSales.deliveryByOrigin: Record<'site' | 'gastrux_api', number>` (centavos); a DRE mostra as linhas "Delivery: site" e "Delivery: API do Gastrux" dentro de Vendas Delivery.
- A página `/desenvolvedores` traz: como pedir a chave, o endereço `POST https://gastrux.com/api/v1/pedidos` com `Authorization: Bearer gx_live_...`, a tabela dos campos de `OrderApiInput`, um exemplo completo em JSON e em `curl` (o mesmo do teste do Task 3), os status e o que cada um quer dizer, como conferir `x-gastrux-signature` (exemplo em Node), os erros e o limite de 256 KB.

- [ ] **Step 1: Testes que falham:** a DRE de um dia com um pedido do site (R$ 30) e um da API (R$ 47) mostra 3000 e 4700 por origem e o total de delivery 7700; o artigo novo cita "Configurações > API de pedidos", "Aceitar pedidos sozinho" e "/desenvolvedores"; nenhum texto do site promete iFood, Keeta, 99Food ou Rappi.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npx jest --config jest.unit.config.js` e as pastas de integração `api`, `staff`, `bad-day`, `vender`, `caixa` → PASS; `npx tsc --noEmit -p .` → sem erros.
- [ ] **Step 5: Commit** `feat(delivery): developer page, delivery by origin in the DRE, help, AI and site copy`.

---

## Depois do plano

- Deploy + `npx prisma migrate deploy` (migração `20261024120000_order_api`).
- Conferir em produção com um pedido de teste mandado por `curl` para a sua conta de Admin, aceitar, concluir na cozinha e cancelar.
- O webhook antigo `/api/external/orders/webhook` fica como está (testado no bad-day) até a parte 2, que passa a usar `ingestDeliveryOrder`; registrar em `docs/pendencias.md`.
