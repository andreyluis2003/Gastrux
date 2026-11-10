# Cardápio da semana Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O restaurante monta o cardápio de um dia de atendimento (com prazo e limite de porções) e o cliente encomenda
antes pelo link de delivery; no dia, as encomendas viram pedidos no Quadro.

**Architecture:** Três tabelas novas (`WeeklyMenu`, `WeeklyMenuItem`, `WeeklyMenuOrder` + `WeeklyMenuOrderItem`). A
encomenda fica guardada na tabela própria (não é `Order`, então não aparece no KDS, no Quadro nem em relatórios antes
do dia). Um laço no servidor (e o carregamento do Quadro) "solta" as encomendas no dia: cria `ExternalOrder` +
`Order` pela mesma função que o link de delivery usa hoje, extraída da rota. O link público ganha o modo "cardápio da
semana" quando há um aberto.

**Tech Stack:** Next.js 14 (app router), Prisma + Postgres, Jest (unit: `jest.unit.config.js`; integração:
`jest.integration.config.js` com banco de teste em 127.0.0.1:55432), React + Tailwind + shadcn.

**Spec:** `docs/superpowers/specs/2026-11-10-cardapio-da-semana-design.md`

## Global Constraints

- Migração **só com tabelas novas** (`20261111120000_weekly_menus`): o Deploy roda antes do `migrate deploy`; nenhuma
  coluna nova em tabela existente.
- Quem gerencia: `MANAGER_ROLES` com a mensagem "Alterar o cardápio exige um gerente" (`requireRestaurantRole`).
- Todo acesso filtra por `restaurantId` (do `getCurrentRestaurantId()` no admin; do cardápio/rota no público).
- Data do atendimento é a data **do restaurante** (`Restaurant.timezone`, padrão `America/Sao_Paulo`), guardada como
  texto `YYYY-MM-DD`.
- Textos exatos: banner `Pedidos para {sábado, 15/11} · encomende até {quinta} às {20h}` (sem prazo: só
  `Pedidos para sábado, 15/11`); encerrado `Pedidos encerrados para {sábado, 15/11}`; produto sem porções `Esgotado`;
  remover produto com encomenda `Já tem {N} encomendas com este produto`; limite estourado no pedido
  `{Produto}: só restam {N} porções` (0 → `{Produto} esgotou`).
- "Fechar a loja" na mão (`stateOf(...).reason === 'manual'`) recusa encomendas; fechada **pelo horário** não recusa.
- `restaurantAcceptsOrders` (plano bloqueado) continua valendo.
- Cada recurso para o cliente atualiza `lib/ai/knowledge/*.ts` e `lib/help/seed-articles.ts` (com o hash antigo).
- Rodar só os testes tocados (máquina com pouca memória); integração com `--workerIdleMemoryLimit=10MB`.

## Rulings (decisões minhas sobre o que a spec deixou ao builder ou deixou em tensão)

- **Cupom**: validado e **reservado na encomenda** (o cliente precisa ver o desconto no total), liberado ao cancelar,
  e ligado ao `ExternalOrder` quando a encomenda vira pedido. A spec dizia "aplicados quando o pedido entra no dia";
  a intenção era estoque/cashback, que continuam no dia (vêm do `Order`). Custo se errado: mover a reserva para a
  soltura.
- **Preço congelado na encomenda** (`unitPrice` em `WeeklyMenuOrderItem`): mudar o preço depois não muda o que o
  cliente aceitou.
- **Hora da soltura**: 00:00 do dia do atendimento no fuso do restaurante, verificada a cada 60 s por um laço no
  servidor e também ao carregar o Quadro.

## Review Focus

1. Dois clientes pedindo a última porção ao mesmo tempo: só um passa (lock por cardápio).
2. A soltura rodando duas vezes ao mesmo tempo (dois processos/Quadro + laço): cada encomenda vira **um** pedido.
3. Pedido chegando 1 s depois do prazo, com a página aberta desde antes: recusado com a mensagem de encerrado.
4. Fuso: às 23:30 de sexta em São Paulo (02:30 UTC de sábado) a encomenda de sábado ainda **não** é solta.
5. Carrinho com produto que saiu do cardápio da semana (ou de outro restaurante): recusado como hoje.

---

### Task 1: Tabelas e regras puras

**Files:**
- Modify: `prisma/schema.prisma` (modelos novos + campos de relação em `Restaurant` e `MenuItem`, sem coluna)
- Create: `prisma/migrations/20261111120000_weekly_menus/migration.sql`
- Create: `lib/weekly-menu/rules.ts`
- Test: `__tests__/unit/weekly-menu/rules.test.ts`

**Interfaces:**
- Produces (schema):
  - `WeeklyMenu { id, restaurantId, serviceDate String /* YYYY-MM-DD */, orderDeadline DateTime?, createdAt, updatedAt }`,
    `@@unique([restaurantId, serviceDate])`, `@@map("weekly_menus")`.
  - `WeeklyMenuItem { id, weeklyMenuId, menuItemId, portionLimit Int? }`, `@@unique([weeklyMenuId, menuItemId])`,
    cascade do cardápio, `@@map("weekly_menu_items")`.
  - `WeeklyMenuOrder { id, restaurantId, weeklyMenuId, status WeeklyMenuOrderStatus @default(PLACED), customerId String?,
    customerName, customerPhone, customerEmail String?, isPickup Boolean, deliveryAddress String?, deliveryCity String?,
    deliveryZipCode String?, kitchenNote String, paymentMethod String, cashChangeFor Float?, voucherBrand String?,
    paymentNote String, subtotal Float, deliveryFee Float, discount Float, total Float, couponRedemptionId String?,
    couponCode String?, orderNumber String @unique, orderId String? @unique, cancelReason String?, cancelledAt DateTime?,
    createdAt }`, `@@index([weeklyMenuId, status])`, `@@index([status])`, `@@map("weekly_menu_orders")`.
  - `WeeklyMenuOrderItem { id, weeklyMenuOrderId, menuItemId, recipeId, name, unitPrice Float, quantity Int,
    specialInstructions String? }`, cascade, `@@map("weekly_menu_order_items")`.
  - `enum WeeklyMenuOrderStatus { PLACED RELEASING RELEASED CANCELLED }`.
- Produces (`lib/weekly-menu/rules.ts`):
  - `todayIn(timeZone: string, now?: Date): string` → `YYYY-MM-DD` (fuso inválido → `America/Sao_Paulo`).
  - `openMenuOf<T extends { serviceDate: string; orderDeadline: Date | null }>(menus: T[], today: string, now: Date): T | null`
    — o de menor `serviceDate` com `serviceDate >= today` e (`orderDeadline` nulo ou `> now`).
  - `isDue(serviceDate: string, today: string): boolean` → `serviceDate <= today`.
  - `remainingPortions(limit: number | null, ordered: number): number | null` (nulo = sem limite; nunca negativo).
  - `productionSummary(items: { menuItemId: string; name: string; quantity: number; specialInstructions?: string | null }[])`
    `: { menuItemId: string; name: string; quantity: number; notes: { text: string; quantity: number }[] }[]` (ordem
    por nome; notas iguais somadas).
  - `bannerText(serviceDate: string, deadline: Date | null, timeZone: string): string` e
    `closedText(serviceDate: string): string` com os textos exatos das Global Constraints (dia da semana em
    português minúsculo, `dd/mm`; hora `20h` ou `20h30`).

- [ ] **Step 1: Escrever os testes falhando** em `__tests__/unit/weekly-menu/rules.test.ts`:
  - `todayIn('America/Sao_Paulo', new Date('2026-11-15T02:30:00Z'))` → `'2026-11-14'` (Review Focus 4).
  - `openMenuOf`: com menus `2026-11-15` (prazo `2026-11-13T23:00Z`) e `2026-11-22` (sem prazo), `now=2026-11-13T22:59Z`
    → o de 15; `now=2026-11-13T23:00:01Z` → o de 22; `today='2026-11-23'` → `null`; lista vazia → `null`.
  - `isDue('2026-11-15','2026-11-14')` false; `('2026-11-15','2026-11-15')` true.
  - `remainingPortions(20, 18)` → 2; `(20, 25)` → 0; `(null, 5)` → null.
  - `productionSummary` soma quantidades por produto e agrupa a mesma observação.
  - `bannerText('2026-11-15', new Date('2026-11-13T23:00:00Z'), 'America/Sao_Paulo')` →
    `'Pedidos para sábado, 15/11 · encomende até quinta às 20h'`; sem prazo → `'Pedidos para sábado, 15/11'`;
    `closedText('2026-11-15')` → `'Pedidos encerrados para sábado, 15/11'`.
- [ ] **Step 2:** `npx jest --config jest.unit.config.js __tests__/unit/weekly-menu` → FAIL (módulo não existe).
- [ ] **Step 3:** Implementar o schema, a migração (gerar com `npx prisma migrate diff --from-schema-datamodel` do
  schema anterior para o novo, `--script`; conferir que só tem `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/FKs das
  tabelas novas) e `lib/weekly-menu/rules.ts`. `npx prisma generate`.
- [ ] **Step 4:** Testes passam; `npx tsc --noEmit -p .` limpo; `npm run test:db:migrate` aplica no banco de teste.
- [ ] **Step 5:** Commit `feat(cardapio-da-semana): tabelas e regras`.

### Task 2: Extrair a gravação do pedido do link de delivery

**Files:**
- Create: `lib/delivery-site/write-order.ts`
- Modify: `app/api/public/delivery/order/route.ts:213-268` (passa a chamar a função; sem mudança de comportamento)
- Test: `__tests__/integration/delivery-site/write-order.test.ts` + os testes de integração existentes da rota

**Interfaces:**
- Produces: `writeSiteOrder(input: { restaurantId: string; orderNumber: string; customerId: string | null;
  customerName: string; customerPhone: string; customerEmail: string | null; isPickup: boolean;
  deliveryAddress: string | null; deliveryCity: string | null; deliveryZipCode: string | null; kitchenNote: string;
  items: { recipeId: string; name: string; quantity: number; specialInstructions?: string }[]; subtotal: number;
  deliveryFee: number; discount: number; total: number; paymentMethod: string; cashChangeFor: number | null;
  voucherBrand: string | null }): Promise<{ orderId: string; externalOrderId: string }>` — cria o `ExternalOrder`
  (integração `delivery_site`, `CONFIRMED`) e o `Order` (`DELIVERY`, `PENDING`) exatamente como a rota faz hoje,
  apagando o `ExternalOrder` se o `Order` falhar.

- [ ] **Step 1:** Teste `writeSiteOrder cria ExternalOrder e Order ligados` (confere `internalOrderId`, totais, itens,
  `specialInstructions`) e `apaga o ExternalOrder quando o Order falha` (recipeId inexistente).
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Mover o trecho para a função; a rota chama e segue com cupom/limiares como hoje.
- [ ] **Step 4:** Novo teste + todos os testes de integração que importam `app/api/public/delivery/order/route`
  (`grep -rl` em `__tests__/integration`) passam.
- [ ] **Step 5:** Commit `refactor(delivery): writeSiteOrder compartilhado`.

### Task 3: Serviço e rotas do admin

**Files:**
- Create: `lib/weekly-menu/service.ts`
- Create: `app/api/cardapio/semana/route.ts` (GET lista, POST cria)
- Create: `app/api/cardapio/semana/[id]/route.ts` (GET detalhe, PUT itens/prazo, DELETE)
- Create: `app/api/cardapio/semana/[id]/encomendas/[orderId]/cancelar/route.ts` (POST `{ reason }`)
- Test: `__tests__/integration/weekly-menu/admin.test.ts`

**Interfaces:**
- Consumes: Task 1 (`productionSummary`, `todayIn`, schema).
- Produces:
  - `createWeeklyMenu(rid, { serviceDate, orderDeadline?: string | null, items: { menuItemId; portionLimit?: number | null }[], copyFromId?: string })`
    — `copyFromId` copia os itens (e limites) de outro cardápio do mesmo restaurante; data duplicada → erro 409
    `Já existe um cardápio para esta data`; data passada → 400; produto de outro restaurante ou inativo → 400.
  - `updateWeeklyMenu(rid, id, { orderDeadline?, items })` — tirar produto com encomenda `PLACED` → 409
    `Já tem {N} encomendas com este produto`.
  - `getWeeklyMenu(rid, id)` → `{ menu, items: [{ menuItemId, name, price, portionLimit, ordered, remaining }], summary
    (productionSummary das encomendas PLACED/RELEASING/RELEASED), orders: [...] }`.
  - `cancelWeeklyOrder(rid, orderId, reason)` — só `PLACED`; grava motivo e `cancelledAt`; libera o cupom
    (`releaseRedemption`); outro status → 409 `Esta encomenda já virou pedido; cancele pelo pedido`.
  - `deleteWeeklyMenu(rid, id)` — só sem encomendas não canceladas (409 caso contrário).
  - Rotas: sessão + `requireRestaurantRole(MANAGER_ROLES, 'Alterar o cardápio exige um gerente')` em tudo (GET também).

- [ ] **Step 1:** Testes: dono cria (com e sem prazo), copia de outro cardápio, data duplicada 409, produto de outro
  restaurante 400, garçom/cozinheiro 403, outro restaurante 404 no detalhe, tirar produto com encomenda 409, cancelar
  libera porções e cupom, cancelar RELEASED 409, detalhe traz `ordered`/`remaining`/`summary` certos.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + tsc.
- [ ] **Step 5:** Commit `feat(cardapio-da-semana): serviço e rotas do admin`.

### Task 4: Link público — mostrar e encomendar

**Files:**
- Create: `lib/weekly-menu/public.ts`
- Modify: `app/api/public/delivery/menu/[restaurantId]/route.ts`
- Modify: `app/api/public/delivery/order/route.ts` (ramo `weeklyMenuId`)
- Test: `__tests__/integration/weekly-menu/public.test.ts`

**Interfaces:**
- Consumes: Task 1 (`openMenuOf`, `todayIn`, `bannerText`, `remainingPortions`), Task 2 (nada: a encomenda não grava
  `Order` agora).
- Produces:
  - `openWeeklyMenu(restaurantId, now?) : Promise<{ id; serviceDate; orderDeadline; banner: string; items: Map<menuItemId, { portionLimit; remaining }> } | null>`.
  - Rota do cardápio: com cardápio aberto, `categories` só com os produtos dele (sem filtro de dias de venda e de
    `available`; respeita `active` e `displayOnWeb`), cada item com `soldOut: boolean`; `restaurant.weeklyMenu =
    { id, serviceDate, banner }`; `restaurant.closed` só `true` se fechado **na mão**. Sem cardápio aberto: resposta
    de hoje, mais `restaurant.weeklyMenu = null`.
  - `placeWeeklyOrder(restaurantId, weeklyMenuId, validated)` em `lib/weekly-menu/public.ts`: numa transação com
    `pg_advisory_xact_lock(hashtext('weekly-menu:' || id))`, reconfere prazo/aberto e porções e grava
    `WeeklyMenuOrder` + itens com `unitPrice`. Erros: prazo vencido/não é o cardápio aberto → 409 com `closedText`;
    porções → 409 com o texto de limite das Global Constraints; produto fora da lista → 400 (texto de hoje).
  - Rota de pedido com `weeklyMenuId`: mesma validação de cliente/pagamento/cupom de hoje (cupom reservado e o
    `redemptionId` guardado na encomenda; liberado se a gravação falhar); **não** checa `isStoreClosed` mas recusa
    `reason === 'manual'` com `CLOSED_MESSAGE`; cria/acha o `Customer` como hoje; resposta igual à de hoje com
    `order.serviceDate` a mais e `status: 'ENCOMENDA'`.

- [ ] **Step 1:** Testes: loja fechada pelo horário aceita encomenda; fechada na mão recusa; depois do prazo 409 com
  `Pedidos encerrados para …`; produto fora da lista 400; limite: 2 porções restantes, pedido de 3 → 409
  `Feijoada: só restam 2 porções`; **dois pedidos simultâneos** da última porção (`Promise.all`) → um 200 e um 409
  (Review Focus 1); encomenda não cria `Order` nem `ExternalOrder`; cardápio público mostra só os produtos do cardápio
  com `soldOut`; outro restaurante não usa o `weeklyMenuId` (404/400); preço congelado.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + testes de integração da rota de delivery de hoje.
- [ ] **Step 5:** Commit `feat(cardapio-da-semana): encomenda pelo link`.

### Task 5: Soltar as encomendas no dia

**Files:**
- Create: `lib/weekly-menu/release.ts`
- Create: `lib/weekly-menu/worker.ts`
- Modify: `instrumentation.ts` (inicia o laço sempre, como o da 99Food, sem variável)
- Modify: `lib/orders/board.ts` (`loadBoard` chama `releaseDue(restaurantId)` antes de ler, com try/catch que só loga)
- Test: `__tests__/integration/weekly-menu/release.test.ts`

**Interfaces:**
- Consumes: Task 1 (`isDue`, `todayIn`), Task 2 (`writeSiteOrder`), `attachRedemption` (`lib/coupons/service.ts`).
- Produces:
  - `releaseDue(restaurantId?: string, now?: Date): Promise<number>` — encomendas `PLACED` cujo cardápio `isDue` no
    fuso do restaurante; para cada uma: `updateMany({ where: { id, status: 'PLACED' }, data: { status: 'RELEASING' } })`
    (count 0 → pula), `writeSiteOrder` com `orderNumber` da encomenda e nota da cozinha com a linha extra
    `ENCOMENDA do cardápio de {sábado, 15/11}` no topo, `attachRedemption` se houver cupom, marca `RELEASED` +
    `orderId`; falha → volta para `PLACED` e loga (tenta de novo no próximo ciclo). Retorna quantas soltou.
  - `startWeeklyMenuWorker(everyMs = 60_000)` no padrão de `lib/ninetynine/worker.ts` (não sobrepõe execuções).

- [ ] **Step 1:** Testes: na sexta 23:30 de São Paulo nada é solto (Review Focus 4); no sábado 00:01 a encomenda vira
  `Order` + `ExternalOrder` com os totais e a nota, aparece em `loadBoard`; **duas chamadas simultâneas**
  (`Promise.all([releaseDue(rid), releaseDue(rid)])`) geram um pedido só (Review Focus 2); cancelada não é solta;
  falha no `writeSiteOrder` deixa `PLACED`; cupom ligado ao `ExternalOrder`; encomenda feita no próprio dia do
  atendimento (antes do prazo) é solta na chamada seguinte; dia já passado (servidor parado) também
  solta.
- [ ] **Step 2:** FAIL. **Step 3:** Implementar. **Step 4:** PASS + teste do Quadro (`__tests__/integration/orders/board*`).
- [ ] **Step 5:** Commit `feat(cardapio-da-semana): encomendas entram no dia`.

### Task 6: Telas

**Files:**
- Create: `app/admin/cardapio-da-semana/page.tsx` (lista + novo/copiar) e `app/admin/cardapio-da-semana/[id]/page.tsx`
  (produtos e limites, **O que fazer** com botão **Imprimir** via `window.print()` e CSS de impressão, **Encomendas**
  com **Cancelar** pedindo motivo num diálogo do próprio app, sem `confirm()`)
- Modify: `lib/navigation/app-nav.ts` (item `{ label: 'Cardápio da semana', href: '/admin/cardapio-da-semana', roles: MANAGERS }`
  logo depois de "Cardápio digital")
- Modify: `app/delivery/[restaurantId]/page.tsx` (banner do `weeklyMenu.banner` no topo; produto `soldOut` com selo
  `Esgotado` e sem botão de adicionar; envia `weeklyMenuId` no pedido; confirmação diz `Encomenda para sábado, 15/11`;
  erro 409 de prazo mostra o texto e recarrega o cardápio)
- Test: `__tests__/unit/weekly-menu/ui-helpers.test.ts` para qualquer função pura nova das telas (ex.: montar o
  pedido, formatar o resumo); sem teste de componente.

- [ ] **Step 1:** Testes das funções puras (se houver). **Step 2:** FAIL. **Step 3:** Implementar as telas seguindo
  `app/admin/cardapio/page.tsx` e `app/encomendas/page.tsx`. **Step 4:** PASS + tsc + `npx next lint --dir app/admin/cardapio-da-semana`.
- [ ] **Step 5:** Commit `feat(cardapio-da-semana): telas`.

### Task 7: Ajuda e IA

**Files:**
- Modify: `lib/ai/knowledge/cardapio.ts` (seção "Cardápio da semana": o que é, criar, copiar, porções, prazo, o que o
  cliente vê, loja fechada não bloqueia e "Fechar a loja" bloqueia, encomendas entram no Quadro à meia-noite do dia,
  cancelar antes do dia, sem Pix antecipado por enquanto)
- Modify: `lib/help/seed-articles.ts` (artigo `cardapio-da-semana`, título "Cardápio da semana: vender por encomenda
  para um dia", com o hash antigo conforme a regra do arquivo)
- Test: os testes existentes de `lib/help` e `lib/ai/knowledge` (`grep -rl seed-articles __tests__/unit`)

- [ ] **Step 1–4:** Escrever os textos, rodar os testes de unidade da ajuda/conhecimento → PASS.
- [ ] **Step 5:** Commit `docs(cardapio-da-semana): ajuda e conhecimento da IA`.
