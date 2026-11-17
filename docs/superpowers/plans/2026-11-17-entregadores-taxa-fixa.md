# Cadastro de entregadores com diária e valor por entrega — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregadores cadastrados com diária e valor por entrega; escolhidos em "Saiu para entrega" (Pedidos de
delivery e comanda de entrega do WhatsApp); o Acerto do entregador calcula e paga o que cada um ganhou; relatório
por período.

**Architecture:** Tabela `Driver` + pagamento em tabela própria `DriverPayment` (com `DriverPaidDay` único por
entregador e dia de trabalho). Entregas = `ExternalOrder` e `OrderSession` de entrega do WhatsApp, cada uma com
`driverId`, `dispatchedAt` e `driverPaymentId`. Um módulo novo `lib/delivery/driver-pay.ts` lista as entregas não
pagas e calcula o valor; o acerto de dinheiro de hoje (`lib/caixa/driver-settlement.ts`) continua com a mesma regra e
ganha a parte de pagamento, independente, no mesmo POST.

**Tech Stack:** Next.js 14 (app router), Prisma + Postgres, Jest (integração: `jest.integration.config.js`, banco de
teste 127.0.0.1:55432 — `npm run test:db:start` se parado), React + Tailwind + shadcn.

**Spec:** `docs/superpowers/specs/2026-11-17-entregadores-taxa-fixa-design.md`

## Global Constraints

- Migração `20261117120000_drivers` (tabelas novas + colunas em `external_orders` e `order_sessions`): Deploy e
  `npx prisma migrate deploy` em seguida (homolog, depois app); avisar o dono.
- Cadastro/edição de entregadores: `MANAGER_PLUS` (`lib/caixa/roles`). Acerto: `CASHIER_PLUS` (como hoje). "Saiu
  para entrega": quem já pode hoje (`DELIVERY_ROLES` em Pedidos de delivery; `CASHIER_PLUS` na comanda).
- Todo acesso filtra por `restaurantId`. Valores em centavos (`Int`).
- Dia de trabalho: data em `America/Sao_Paulo` de `(dispatchedAt − 5 h)` (vira às 05:00). Entrega sem
  `dispatchedAt` (antiga) usa `orderReceivedAt`.
- Entrega elegível: tem entregador (`driverId` ou, para nome digitado, `driverName`), `dispatchedAt` (ou status Saiu/
  Entregue em `ExternalOrder`), não CANCELLED/REJECTED, `driverPaymentId` nulo. Qualquer forma de pagamento.
- Valor sugerido = `dailyRateCents × dias de trabalho ainda sem diária paga` + `nº de entregas × perDeliveryCents`
  (valores lidos do cadastro na hora do acerto). Caixa paga até o sugerido; acima, só gerente: "Pagar ao entregador
  mais que o calculado exige um gerente". Nome digitado sem cadastro: sem sugestão; teto do caixa = soma das
  `deliveryFee` das entregas dele não pagas (comandas do WhatsApp somam 0), mesma mensagem de hoje.
- Pagamento = `CashSessionEntry` EXPENSE, CASH, `category: 'entregador'`, no turno aberto; pode deixar o esperado
  negativo (aviso na tela "O esperado em dinheiro fica negativo"). Turno fechado → 409 "Este caixa já foi fechado".
- Textos: lista "Outro (digitar nome)"; conta "2 diárias × R$ 40,00 + 14 entregas × R$ 8,00 = R$ 192,00".
- Nome do entregador único entre os ativos do restaurante (servidor): "Já existe um entregador ativo com esse nome".
- Cada recurso atualiza `lib/ai/knowledge/*.ts` e `lib/help/seed-articles.ts` (hash antigo do artigo do acerto na
  lista de hashes antigos). Sobras inteiras em `docs/pendencias.md`.
- Rodar só os testes tocados (pouca memória); integração com `--workerIdleMemoryLimit=10MB`; `npx tsc --noEmit` no
  fim de cada tarefa.

## Review Focus

1. Dois acertos ao mesmo tempo pagando o mesmo entregador (dois aparelhos): só um paga as entregas e a diária; o
   outro 409. → teste na Task 3.
2. Noite que passa da meia-noite (saídas 22:30 e 01:30): uma diária só. → teste na Task 3.
3. Segundo acerto no mesmo dia de trabalho: entregas novas pagas, diária não repetida. → teste na Task 3.
4. Pedido cancelado depois de "Saiu" e antes do acerto: não conta. → teste na Task 3.
5. Pedido antigo com nome digitado e sem `dispatchedAt` continua no acerto de dinheiro como hoje. → teste
   existente `caixa/driver-settlement.test.ts` precisa continuar passando (Task 3).

---

### Task 1: Modelo, migração e cadastro de entregadores (API + tela)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261117120000_drivers/migration.sql`
- Create: `lib/delivery/drivers.ts`
- Create: `app/api/delivery/drivers/route.ts` (GET lista, POST cria), `app/api/delivery/drivers/[id]/route.ts` (PATCH)
- Create: `app/caixa/entregadores/page.tsx`; Modify: `lib/navigation/app-nav.ts` (link "Entregadores" no grupo do
  Caixa, `MANAGERS`)
- Test: `__tests__/integration/delivery/drivers.test.ts`

**Interfaces:**
- Produces (schema): `Driver { id, restaurantId, name, phone?, dailyRateCents Int @default(0), perDeliveryCents Int
  @default(0), active Boolean @default(true), createdAt, updatedAt }`; `ExternalOrder.driverId?`,
  `ExternalOrder.dispatchedAt DateTime?`, `ExternalOrder.driverPaymentId?`; `OrderSession.driverId?`,
  `OrderSession.dispatchedAt?`, `OrderSession.driverPaymentId?`; `DriverPayment { id, restaurantId, driverId?,
  driverName?, cashSessionId, deliverySettlementId?, deliveryCount, dailyCount, dailyRateCents, perDeliveryCents,
  suggestedCents, paidCents, createdById, createdAt }`; `DriverPaidDay { id, driverId, workDay String (YYYY-MM-DD),
  driverPaymentId, @@unique([driverId, workDay]) }`. Índices em `restaurantId`, `driverId`, `driverPaymentId`.
- Produces (`lib/delivery/drivers.ts`): `listDrivers(restaurantId, { includeInactive? }): Promise<Driver[]>`;
  `createDriver(restaurantId, input: { name, phone?, dailyRate?, perDelivery? })`; `updateDriver(restaurantId, id,
  input: Partial<{ name, phone, dailyRate, perDelivery, active }>)` — valores em reais vindos da tela convertidos para
  centavos com o parser de valores do caixa; nome normalizado como `normalizeDriverName`; nome repetido entre ativos
  → `CashRuleError('Já existe um entregador ativo com esse nome', 409)`.

- [ ] **Step 1: Testes que falham** — `cashier cannot create a driver` (403); `manager creates with daily and per
  delivery` (centavos gravados: "40" → 4000, "8,50" → 850); `duplicate active name is refused` (409, texto exato);
  `deactivated name can be reused`; `other restaurant's driver is 404 on PATCH`; `GET lists active only by default`.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** schema + migração SQL, `npx prisma generate`, `npm run test:db:migrate`; implementar serviço e
  rotas (padrão de erro: `cashErrorResponse` de `lib/caixa/http`).
- [ ] **Step 4:** tela: lista (nome, celular, diária, por entrega, ativo) + formulário de novo/editar + botão
  Desativar/Ativar; sem apagar.
- [ ] **Step 5:** testes PASS; `npx tsc --noEmit`; commit `feat(entregadores): cadastro com diária e valor por entrega`.

### Task 2: Escolher o entregador em "Saiu para entrega"

**Files:**
- Modify: `app/api/admin/integrations/orders/[id]/route.ts` (PUT aceita `driverId`; grava `dispatchedAt` ao ir para
  PICKED_UP)
- Modify: `app/admin/integrations/orders/page.tsx` (diálogo "Saiu para entrega": lista de ativos + "Outro (digitar
  nome)")
- Create: `app/api/comanda/sessions/[id]/dispatch/route.ts` (`POST { driverId? , driverName? }`)
- Modify: `lib/comanda/bill-service.ts` (`Bill` ganha `isDelivery: boolean`, `driver: { id: string | null; name:
  string } | null`, `dispatchedAt: string | null`)
- Modify: `components/vender/conta-dialog.tsx` (comanda de entrega: botão "Saiu para entrega" / mostra o entregador)
- Test: `__tests__/integration/delivery/driver-dispatch.test.ts`

**Interfaces:**
- Consumes: `listDrivers` (Task 1).
- Produces: PUT pedido `{ status: 'PICKED_UP', driverId }` → grava `driverId`, `driverName = driver.name`,
  `dispatchedAt = now`; `{ driverName }` sem `driverId` → como hoje (`driverId` nulo) + `dispatchedAt`. `driverId` de
  outro restaurante ou inativo → 422 "Entregador não encontrado". Comanda: `POST .../dispatch` só em comanda cuja
  conversa WhatsApp tem `orderType = 'DELIVERY'` (senão 422 "Esta comanda não é de entrega"), não CANCELLED, e
  sem `driverPaymentId` (senão 409 "Esta entrega já foi paga ao entregador"); grava driver + `dispatchedAt` (troca
  permitida enquanto não paga). `CASHIER_PLUS`.

- [ ] **Step 1: Testes que falham:** `PICKED_UP with driverId stores driver, name and dispatchedAt`; `typed name still
  works`; `foreign driver is refused`; `whatsapp delivery comanda dispatch`; `non-delivery comanda is refused`;
  `paid delivery cannot change driver`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** telas (largura 380px).
- [ ] **Step 5:** testes + `caixa/driver-settlement.test.ts` PASS; `npx tsc --noEmit`; commit
  `feat(entregadores): escolher o entregador ao sair para entrega`.

### Task 3: Cálculo e pagamento no acerto

**Files:**
- Create: `lib/delivery/driver-pay.ts`
- Modify: `lib/caixa/driver-settlement.ts` (`pendingByDriver` devolve também o pagamento; `settleDriver` aceita a
  parte de pagamento)
- Modify: `app/api/caixa/sessions/[id]/acerto-entregador/route.ts` (contrato abaixo)
- Test: `__tests__/integration/caixa/driver-pay.test.ts` (+ o existente `driver-settlement.test.ts` continua)

**Interfaces:**
- Produces (`lib/delivery/driver-pay.ts`): `workDayOf(d: Date): string` (YYYY-MM-DD, regra dos Global Constraints);
  `unpaidDeliveries(db, restaurantId): Promise<Array<{ key: string /* driverId ou 'name:'+nome */; driverId: string |
  null; driverName: string | null; deliveries: Array<{ kind: 'order' | 'comanda'; id: string; label: string; workDay:
  string; deliveryFeeCents: number }> }>>`; `payQuote(db, restaurantId, key): Promise<{ deliveryCount; workDays:
  string[]; dailyCount; dailyRateCents; perDeliveryCents; suggestedCents: number | null; feeCapCents: number; text:
  string }>` (`text` = a conta do Global Constraints; `null`/sem texto para nome digitado).
- GET do acerto passa a devolver `{ drivers, driverNames, pay: Array<{ key, driverId, driverName, quote }> }` (`drivers`
  = o mesmo de hoje, só dinheiro na porta).
- POST aceita, além do de hoje, `pay?: { key: string; amount: string | number }`. Regras: com `orderIds` faz o acerto de
  dinheiro como hoje; com `pay` paga o entregador: dentro da transação, com o turno travado, trava as entregas do
  entregador (`FOR UPDATE` em `external_orders`/`order_sessions` dele), recalcula a cotação, valida teto (sugerido ou
  taxas), cria `DriverPayment`, `DriverPaidDay` por dia novo (violação de único → 409 "Este entregador já foi pago
  agora. Atualize a tela."), marca `driverPaymentId` em todas as entregas da cotação, lança a Despesa. Sem `orderIds`
  e sem `pay` → 400 "Escolha os pedidos do acerto". O antigo `driverPay` continua aceito só para nome digitado (vira
  `pay` internamente).

- [ ] **Step 1: Testes que falham:**
  - `quote counts paid-online and door deliveries` (3 pedidos: 1 dinheiro, 1 PIX online, 1 comanda WhatsApp; diária
    4000, entrega 800 → `suggestedCents === 4000 + 3*800`, `text === '1 diária × R$ 40,00 + 3 entregas × R$ 8,00 = R$ 64,00'`).
  - `night past midnight is one daily` (saídas 22:30 e 01:30 do dia seguinte, horário de São Paulo → `dailyCount === 1`).
  - `second settlement same work day pays new deliveries, no second daily`.
  - `cancelled after dispatch does not count`.
  - `cashier above suggested is 403, manager passes`.
  - `two settlements at once: one 409` (dois `Promise.all`).
  - `payment can leave expected cash negative` (turno sem dinheiro → 201).
  - `typed-name driver: cap is the delivery fees`.
  - `closed shift is 409`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** novos + `caixa/driver-settlement.test.ts` PASS;
  `npx tsc --noEmit`. **Step 5:** commit `feat(entregadores): acerto calcula e paga diária e entregas`.

### Task 4: Tela do acerto

**Files:**
- Modify: `components/caixa/driver-settlement-dialog.tsx`

**Interfaces:**
- Consumes: GET/POST da Task 3.

- [ ] **Step 1:** por entregador, duas partes: "Dinheiro dos pedidos" (como hoje) e "Pagamento" (a conta `text`,
  campo valor preenchido com o sugerido, editável; nome digitado: campo vazio com "até R$ X (taxas de entrega)").
  Aviso "O esperado em dinheiro fica negativo" quando o pagamento passar do dinheiro esperado do turno (se a tela já
  tiver esse número; senão só depois do 201, pelo toast). Um botão "Confirmar acerto" manda o que estiver preenchido.
  Entregador só com entregas online aparece só com a parte de pagamento.
- [ ] **Step 2:** conferir no navegador (dev ou homolog), largura 380px; `npx tsc --noEmit`; commit
  `feat(caixa): pagamento do entregador no acerto`.

### Task 5: Relatório de entregadores

**Files:**
- Create: `lib/delivery/driver-report.ts`, `app/api/delivery/drivers/report/route.ts`, `app/caixa/entregadores/relatorio/page.tsx`
  (ou aba na tela da Task 1)
- Modify: `lib/navigation/app-nav.ts` (grupo Relatórios: "Entregadores", `MANAGERS`)
- Test: `__tests__/integration/delivery/driver-report.test.ts`

**Interfaces:**
- Produces: `driverReport(restaurantId, from: string, to: string /* YYYY-MM-DD, fuso São Paulo */): Promise<Array<{
  key; driverName; active: boolean | null; deliveries; dailies; paidCents; unpaidDeliveries }>>` — pago = soma de
  `DriverPayment.paidCents` com `createdAt` no período; entregas/diárias = das entregas com `workDay` no período; a pagar
  = entregas do período sem `driverPaymentId`. Inclui desativados e nomes digitados (uma linha por nome). `MANAGER_PLUS`.

- [ ] **Step 1: Testes que falham:** `report sums payments in the period`; `includes deactivated and typed names`;
  `other restaurant is not counted`.
- [ ] **Step 2–4:** implementar, tela com seletor de período (padrão: mês atual) e tabela; PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** commit `feat(entregadores): relatório por período`.

### Task 6: Ajuda, IA, pendências

**Files:**
- Modify: `lib/help/seed-articles.ts` (artigo do acerto do entregador + hash antigo; parágrafo do cadastro)
- Modify: `lib/ai/knowledge/caixa.ts`, `lib/ai/knowledge/delivery.ts`
- Modify: `docs/pendencias.md` (seção "Acerto com o entregador": tira o que foi feito; anota: venda balcão sem marca de
  entrega fica fora; valor do cadastro vale para entregas ainda não pagas; entrega cancelada depois de paga não
  desfaz; pagamento só em dinheiro; nomes antigos não se juntam ao cadastro; o que mais sobrar das revisões)

- [ ] **Step 1:** editar; testes unitários dos artigos (`npx jest --config jest.unit.config.js` nos arquivos de
  `__tests__/unit` que citam seed-articles).
- [ ] **Step 2:** `npx tsc --noEmit`; commit `docs(entregadores): ajuda, IA e pendências`.
- [ ] **Step 3 (controlador):** manual (Claude Doc), memória, avisar o dono da migração.
