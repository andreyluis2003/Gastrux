# Cupom no WhatsApp, no balcão e na conta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O cupom de Clientes e marketing > Cupons passa a valer na Conta do Vender, na venda balcão e no robô do
WhatsApp, além do site.

**Architecture:** O cupom fica **na comanda** (`OrderSession.couponDiscountCents` + `couponCode`), como o cashback
(`cashbackUsedCents`), e o uso fica em `CouponRedemption.orderSessionId`. Um módulo novo `lib/coupons/session.ts`
aplica/tira/devolve o cupom de uma comanda reaproveitando `evaluate` de `lib/coupons/service.ts`. Todo lugar que hoje
desconta o cashback da comanda passa a descontar `couponDiscountCents + cashbackUsedCents`.

**Tech Stack:** Next.js 14 (app router), Prisma + Postgres, Jest (unit: `jest.unit.config.js`; integração:
`jest.integration.config.js`, banco de teste 127.0.0.1:55432), React + Tailwind + shadcn.

**Spec:** `docs/superpowers/specs/2026-11-16-cupom-whatsapp-balcao-design.md`

## Global Constraints

- Migração `20261116120000_coupon_on_comanda`: `order_sessions.couponDiscountCents INT NOT NULL DEFAULT 0`,
  `order_sessions.couponCode TEXT NULL`, `coupon_redemptions.orderSessionId TEXT NULL` (+ índice),
  `coupon_redemptions.outOfRule BOOLEAN NOT NULL DEFAULT false`. Colunas em tabela existente: **Deploy e
  `npx prisma migrate deploy` em seguida** (homolog, depois app); avisar o dono.
- Quem aplica/tira cupom na comanda: `CASHIER_PLUS` (`lib/caixa/roles`), mensagem "Usar cupom exige o caixa".
- Todo acesso filtra por `restaurantId`. Toda escrita no cupom de uma comanda roda com `lockComanda(tx, id)` e com a
  trava do cupom (`pg_advisory_xact_lock(hashtext('coupon:'+couponId))`, como `reserveCoupon`).
- Cupom não existe ou pausado → sempre `INVALID` ("Cupom inválido ou fora do ar."), nunca revela se o código existe.
- Textos exatos: "Identifique o cliente pelo celular antes"; "Este cupom é de entrega grátis e esta venda não tem
  taxa de entrega."; "Esta conta já tem cupom"; "Cupom precisa de internet"; linha da conta
  `Cupom {CODE} − {R$}`; robô: `Tem cupom de desconto? Digite o código ou *não*.` e no resumo
  `Cupom {CODE}: −{R$}`; juntar: "As duas comandas têm cupom: tire um antes de juntar".
- Base do desconto na comanda = soma dos itens (`comandaTotalCents`), sem taxa de serviço; taxa de serviço calculada
  sobre os itens sem desconto (como hoje). Total = itens + serviço − cupom − cashback, nunca < 0.
- Plano: todos. Cada recurso para o cliente atualiza `lib/ai/knowledge/*.ts` e `lib/help/seed-articles.ts` (com o
  hash antigo, como nos commits anteriores do artigo de cupom).
- Rodar só os testes tocados (pouca memória); integração com `--workerIdleMemoryLimit=10MB`. `npx tsc --noEmit` no
  fim de cada tarefa.

## Rulings (decisões minhas sobre o que a spec deixou ao builder)

- **Venda balcão e código inexistente:** cupom não é apagável (só PATCH pausa) e o campo só manda o código depois de
  uma prévia aceita; então na venda o código sempre existe. Se não existir (requisição forjada) → 422 `INVALID`.
  Qualquer outra recusa (limite, validade, pausado, celular, mínimo) → a venda entra com o desconto calculado pelo
  servidor e a redemption com `outOfRule: true`; a resposta traz `couponWarning`.
- **Juntar comandas:** origem com cupom e destino sem → o cupom passa para o destino (campos copiados, redemption
  re-apontada); as duas com cupom → recusa com o texto acima.
- **DRE:** o cupom usado nas comandas fechadas entra como o cashback (soma de volta na receita bruta e sai nas
  deduções), na mesma linha de descontos.
- **Robô sem enum novo:** a pergunta do cupom usa `state: 'CONFIRMING'` + `context.couponStep = 'ASK'`
  (evita `ALTER TYPE`); o cupom aceito fica em `context.coupon = { code, discountCents, label }`.
- **Tentativas:** `takeCouponTry(key, restaurantId)` com `key = 'wa:'+phone` (robô) e `'user:'+userId` (Conta,
  prévia do balcão). Sem mudar `lib/coupons/attempts.ts`.

## Review Focus

1. Pagar uma conta com cupom em partes: `remainingCents` e o fechamento pela tela Conta usam o total já com cupom.
   → teste na Task 2.
2. Cancelar comanda com cupom e pagamento: uso devolvido **e** pagamentos estornados; reabrir mantém o cupom e
   devolve o cashback. → testes na Task 3.
3. Dois caixas aplicando o último uso do mesmo cupom ao mesmo tempo: só um passa. → teste na Task 1.
4. Venda balcão reenviada pela fila (mesma Idempotency-Key) depois que o limite acabou: venda gravada uma vez, com
   desconto e `outOfRule`. → teste na Task 5.
5. Cliente do WhatsApp que digita "menu" ou "cancelar" na pergunta do cupom: os comandos globais continuam
   valendo e o contexto do cupom é limpo. → teste na Task 6.

---

### Task 1: Modelo e serviço do cupom na comanda

**Files:**
- Modify: `prisma/schema.prisma` (OrderSession, CouponRedemption)
- Create: `prisma/migrations/20261116120000_coupon_on_comanda/migration.sql`
- Modify: `lib/coupons/service.ts` (`evaluate`, `customerOrdered`, export de `evaluate` como `evaluateCoupon`)
- Create: `lib/coupons/session.ts`
- Test: `__tests__/integration/orders/cupons-comanda.test.ts`

**Interfaces:**
- Produces (`lib/coupons/service.ts`):
  - `evaluateCoupon(db, restaurantId, code, phoneDigits, subtotalCents, deliveryFeeCents, now, opts: { phoneRules?: boolean; channel: 'site' | 'comanda' }): Promise<Check>` — `channel: 'comanda'` com `kind === 'FREE_DELIVERY'` → `{ ok:false, error:'Este cupom é de entrega grátis e esta venda não tem taxa de entrega.' }`. `Check` ok ganha `phoneRules: boolean` (true se `maxPerCustomer !== null || firstOrderOnly`).
  - `customerOrdered` passa a contar também `orderSession` com `customerId` do cliente e `status: 'CLOSED'` (vale para o site também).
- Produces (`lib/coupons/session.ts`):
  - `applyCouponToSession(tx, { restaurantId, sessionId, code, phoneDigits: string, force?: boolean }): Promise<{ ok: true; code: string; discountCents: number; outOfRule: boolean } | { ok: false; error: string; status: number }>` — chamada dentro de transação já com `lockComanda`; pega a trava do cupom; base = `comandaTotalCents(tx, sessionId)`; recusa 409 "Esta conta já tem cupom" se `couponCode` já setado; recusa 422 se conta CLOSED/CANCELLED (exceto quando chamada pela venda balcão antes de fechar); com `force` qualquer recusa que não seja "não existe" vira `outOfRule: true` com `discountFor(...)`; grava `usedCount+1`, redemption `{ orderSessionId, phoneDigits, discountCents, outOfRule }` e `couponDiscountCents/couponCode` na comanda.
  - `removeSessionCoupon(tx, restaurantId, sessionId): Promise<void>` — apaga a redemption da comanda, `usedCount−1`, zera os dois campos. Sem cupom: nada.
  - `previewSessionCoupon(db, { restaurantId, code, phoneDigits, subtotalCents }): Promise<Check>` — sem gravar, `channel: 'comanda'`.
  - `sessionDiscountCents(s: { couponDiscountCents: number; cashbackUsedCents: number }): number`.

- [ ] **Step 1: Teste que falha** — em `cupons-comanda.test.ts` (setup como `orders/cupons.test.ts`; uma comanda OPEN com 2 × R$ 20):
  - `applies 10% on the comanda items and records the use` → `couponDiscountCents === 400`, `couponCode === 'DEZ'`, redemption com `orderSessionId`, `usedCount === 1`.
  - `refuses free delivery on a comanda` → erro com o texto exato.
  - `refuses a second coupon` → status 409.
  - `remove gives the use back` → `usedCount === 0`, campos zerados.
  - `two cashiers, last use: only one passes` → cupom `maxUses: 1`, dois `prisma.$transaction` em `Promise.all` em comandas diferentes → exatamente 1 ok.
  - `first order counts closed comandas` → cliente com comanda CLOSED ligada → `evaluateCoupon` de cupom `firstOrderOnly` com esse celular falha com `NOT_FOR_THIS_PHONE`.
  - `force keeps the discount past the limit` → cupom esgotado, `force: true` → ok, `outOfRule: true`.
- [ ] **Step 2:** `npx jest --config jest.integration.config.js __tests__/integration/orders/cupons-comanda.test.ts --workerIdleMemoryLimit=10MB` → FAIL (módulo não existe).
- [ ] **Step 3:** Schema + migração SQL (as quatro colunas e `CREATE INDEX ON coupon_redemptions("orderSessionId")`), `npx prisma generate`, `npm run test:db:migrate`.
- [ ] **Step 4:** Implementar as funções acima. `reserveCoupon` do site continua igual (passa `channel: 'site'`).
- [ ] **Step 5:** Rodar o teste novo e `__tests__/integration/orders/cupons.test.ts` → PASS. `npx tsc --noEmit`.
- [ ] **Step 6:** Commit `feat(cupons): cupom na comanda (modelo e serviço)`.

### Task 2: O desconto do cupom em todos os totais da comanda

**Files:**
- Modify: `lib/comanda/bill-service.ts` (`Bill` ganha `couponDiscountCents: number; couponCode: string | null`; `totalCents` tira `sessionDiscountCents`)
- Modify: `app/api/comanda/sessions/[id]/route.ts:145-152` (fechamento de uma requisição)
- Modify: `lib/cashback/bill.ts` (`billNumbers`: base e pago tiram também o cupom)
- Modify: `lib/print/tickets.ts:161` (`grandTotal`; novos campos `couponDiscount`, `couponCode`) e o template que imprime o cashback
- Modify: `app/imprimir/pre-conta/[sessionId]/page.tsx:50` (linha `Cupom {CODE} − {R$}`)
- Modify: `lib/comanda/public-bill.ts` (`couponCents`, `couponCode`) e a tela pública que mostra `cashbackCents`
- Modify: `lib/nfe/emit-session.ts:100` (rateia `sessionDiscountCents`)
- Modify: `lib/finance/dre.ts:24-31` (soma `couponDiscountCents` com o cashback)
- Test: `__tests__/integration/orders/cupons-comanda.test.ts` (novos casos), `__tests__/integration/cashback/dre-nfce.test.ts`

**Interfaces:**
- Consumes: `sessionDiscountCents` (Task 1).
- Produces: `Bill.couponDiscountCents`, `Bill.couponCode`; `PublicOpenBill.couponCents`, `couponCode`.

- [ ] **Step 1: Testes que falham:**
  - `bill total and remaining take the coupon out` → comanda 40, cupom 4 → `loadBill(...).totalCents === 3600`; pagar 20 → `remainingCents === 1600`.
  - `coupon and cashback together` → cupom 4 + cashback 6 → `totalCents === 3000`.
  - `cashback earned counts what was paid` → cashback 10% → crédito sobre 3600, não 4000.
  - em `dre-nfce.test.ts`: `NFC-e spreads the coupon over the items` (soma dos descontos dos itens = cupom + cashback) e `DRE adds the coupon back to gross revenue and deducts it`.
- [ ] **Step 2:** Rodar os dois arquivos → FAIL.
- [ ] **Step 3:** Implementar nos arquivos listados.
- [ ] **Step 4:** Rodar os dois arquivos + `__tests__/integration/vender/bill.test.ts` + `vender/pre-bill.test.ts` + `caixa/comanda-close.test.ts` → PASS. `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(cupons): desconto do cupom na conta, impressão, NFC-e e DRE`.

### Task 3: Rotas da Conta, cancelar, reabrir e juntar

**Files:**
- Create: `app/api/comanda/sessions/[id]/coupon/route.ts` (`POST { code }`, `DELETE`)
- Modify: `app/api/comanda/sessions/[id]/route.ts` (cancelamento ~linhas 285-296: `removeSessionCoupon` na mesma transação; reabrir: nada)
- Modify: `lib/comanda/transfer.ts` (`mergeSessions`)
- Test: `__tests__/integration/orders/cupons-comanda.test.ts`

**Interfaces:**
- Consumes: `applyCouponToSession`, `removeSessionCoupon` (Task 1), `loadBill` (Task 2).
- Produces: `POST /api/comanda/sessions/[id]/coupon` → 200 com o `Bill`; erros `{ error }` com o status da recusa; 429 "Muitas tentativas. Tente em um minuto." quando `takeCouponTry('user:'+userId, restaurantId)` recusa. Celular: `bill.customer?.phone` normalizado; cupom com `phoneRules` e sem cliente → 422 "Identifique o cliente pelo celular antes". `DELETE` → 200 com o `Bill`.

- [ ] **Step 1: Testes que falham:** `cook gets 403`; `cashier applies and removes`; `coupon with per-phone rule needs the customer`; `cancel gives the use back and refunds payments` (comanda com 1 pagamento → cancelar → `usedCount` volta, redemption apagada); `reopen keeps the coupon, gives the cashback back`; `merge moves the coupon to the target`; `merge of two comandas with coupon is refused`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar (modelo: `app/api/comanda/sessions/[id]/cashback/route.ts`).
- [ ] **Step 4:** Rodar o arquivo + `vender/merge.test.ts` + `caixa/sessions.test.ts` → PASS. `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(cupons): aplicar e tirar cupom na Conta; cancelar devolve o uso`.

### Task 4: Campo Cupom na tela Conta

**Files:**
- Modify: `components/vender/conta-dialog.tsx` (perto do cashback, ~linhas 136-230 e 354)

**Interfaces:**
- Consumes: rotas da Task 3; `Bill.couponDiscountCents/couponCode` (Task 2).

- [ ] **Step 1:** Sem cupom e conta aberta: input "Cupom" + botão **Aplicar** (POST; erro mostrado embaixo do campo). Com cupom: linha `Cupom {CODE} − {R$}` e botão **Tirar** (DELETE). Conta fechada: só a linha.
- [ ] **Step 2:** Conferir no navegador (dev server, comanda de teste): aplicar, ver total e "falta pagar" mudarem, tirar; largura 380px.
- [ ] **Step 3:** `npx tsc --noEmit`; commit `feat(vender): campo de cupom na Conta`.

### Task 5: Cupom na venda balcão

**Files:**
- Create: `app/api/comanda/coupon-preview/route.ts` (`POST { code, customerPhone?, items }` → `{ code, discountCents, label }` ou `{ error }`)
- Modify: `app/api/comanda/quick-sale/route.ts` (aceita `couponCode`)
- Modify: `components/comanda/counter-sale.tsx`
- Test: `__tests__/integration/caixa/quick-sale.test.ts` (novos casos)

**Interfaces:**
- Consumes: `previewSessionCoupon`, `applyCouponToSession({ force: true })` (Task 1).
- Produces: quick-sale com `couponCode` → depois de `addComandaItem`, chama `applyCouponToSession` com `force: true` e o celular normalizado; o total passado a `settlePayments` é `comandaTotalCents − couponDiscountCents`; resposta ganha `couponDiscountCents` e `couponWarning` (texto da regra quando `outOfRule`). Prévia: subtotal pelos preços do cardápio (`menuItem.price` + modificadores, sem gravar), CASHIER_PLUS, `takeCouponTry('user:'+userId, …)`.

- [ ] **Step 1: Testes que falham:** `counter sale with coupon charges the discounted total` (2 × 20, 10% → pagamento de 36 fecha; 35 recusa "Faltam"); `replay after the limit ran out records once, with the discount and outOfRule` (mesma Idempotency-Key duas vezes, limite esgotado entre elas → 1 comanda, `outOfRule: true`, resposta com `couponWarning`); `unknown code is refused 422`; `preview never writes` (`usedCount` igual).
- [ ] **Step 2:** Rodar `caixa/quick-sale.test.ts` → FAIL.
- [ ] **Step 3:** Implementar rota de prévia e quick-sale.
- [ ] **Step 4:** Tela: campo "Cupom" + **Aplicar** ao lado do celular; desligado com o texto "Cupom precisa de internet" quando `!navigator.onLine` (mesma fonte que a tela já usa para offline); aplicado → linha `Cupom {CODE} − {R$}`, total/troco com desconto, envia `couponCode`; mostrar `couponWarning` da resposta num aviso.
- [ ] **Step 5:** Rodar `caixa/quick-sale.test.ts` + `cashback/counter-delivery.test.ts` → PASS; conferir a tela no navegador; `npx tsc --noEmit`.
- [ ] **Step 6:** Commit `feat(balcao): cupom na venda balcão`.

### Task 6: Cupom no robô do WhatsApp

**Files:**
- Modify: `lib/whatsapp/bot.ts` (`route`, `handleCollectInfo`, `handleShowConfirmation`, `handleConfirmOrder`, `handleReset`/`handleGreeting` limpam `context.coupon*`)
- Test: `__tests__/integration/vender/whatsapp-coupon.test.ts` (setup como `vender/whatsapp-kitchen.test.ts`)

**Interfaces:**
- Consumes: `previewSessionCoupon`, `applyCouponToSession`, `upsertCustomerByPhone`, `normalizePhone` (`lib/cashback/rules`).
- Produces: fluxo `COLLECTING_INFO → (há cupom ativo no restaurante? CONFIRMING + context.couponStep='ASK' : resumo)`; resposta `não|nao|n` → resumo sem cupom; código → `takeCouponTry('wa:'+phone, …)`, prévia; válido → `context.coupon` e resumo; inválido → mensagem da regra + a pergunta de novo. Na confirmação: comanda criada com `customerId` (sempre, `upsertCustomerByPhone` com o nome da conversa) e, havendo `context.coupon`, `applyCouponToSession` (sem force) na **mesma transação** da criação da comanda; recusa → apaga `context.coupon`, manda a mensagem e o resumo de novo, sem criar comanda. "Pedido confirmado" mostra o total com desconto.

- [ ] **Step 1: Testes que falham:** `asks for a coupon when the restaurant has one`; `skips the question when there is none`; `valid code shows the discount in the summary` (`Cupom DEZ: −R$ 8,00`, total R$ 72,00); `invalid code asks again`; `confirm records the use on the comanda and links the customer`; `limit ran out between summary and confirm: no comanda, summary again without coupon`; `"menu" during the question clears the coupon step`; `order without coupon also links the customer`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar o arquivo + `vender/whatsapp-kitchen.test.ts` → PASS; `npx tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(whatsapp): cupom no robô e cliente ligado à comanda`.

### Task 7: Ajuda, IA, tela de Cupons, pendências

**Files:**
- Modify: `lib/help/seed-articles.ts:740-770` (artigo do cupom: tira "só no site"; explica Conta, balcão e WhatsApp; hash antigo na lista de hashes)
- Modify: `lib/ai/knowledge/delivery.ts:17` e qualquer outro `lib/ai/knowledge/*.ts` que cite cupom (`grep -n -i cupom lib/ai/knowledge`)
- Modify: `app/admin/cupons/page.tsx` (texto sobre onde vale; marca "fora da regra" nos usos se a tela lista usos)
- Modify: `docs/pendencias.md` (seção Cupons: tira "Só no site de delivery"; anota o que ficou: QR/API sem cupom, uso fora da regra no balcão, desconto fixo ao aplicar)

- [ ] **Step 1:** Editar; rodar os testes unitários dos artigos de ajuda/hash se existirem (`grep -rl seed-articles __tests__/unit`).
- [ ] **Step 2:** `npx tsc --noEmit`; commit `docs(cupons): ajuda, IA e pendências do cupom na conta, balcão e WhatsApp`.
- [ ] **Step 3 (controlador, não subagente):** atualizar o manual (Claude Doc) e a memória; avisar o dono da migração.
