# Contas a pagar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One list of the restaurant's bills with due dates, pay/undo/cancel, installments, monthly series, utility bills and NF-e duplicatas feeding it, Business alerts, and a DRE by competence that never counts a cost twice.

**Architecture:** New `Payable` + `PayableSeries` models; pure rules in `lib/payables/rules.ts`; service in `lib/payables/service.ts` behind `/api/payables*` (managers only); drawer payments reuse `lib/caixa/sessions.ts addEntry` with a `payableId` link; utility bills and the NF-e import call the service; a daily cron generates series and sends the Business summary.

**Tech Stack:** Next.js 14, Prisma/Postgres, NextAuth, Jest (unit `jest.unit.config.js`, integration `jest.integration.config.js` on the test DB at 127.0.0.1:55432).

**Spec:** `docs/superpowers/specs/2026-10-18-contas-a-pagar-design.md`

## Global Constraints

- Money in integer cents (`amountCents`); pt-BR input parsed with `parseAmountCents` from `lib/utility-bills/rules.ts` (`1.240,50` → 124050).
- Dates of bills are `@db.Date` at 00:00 UTC; "today" is the Brasília day (`new Date(Date.now() - 3*3600e3).toISOString().slice(0,10)`).
- Competence month = first day of the month (`monthDate('YYYY-MM')` from `lib/utility-bills/rules.ts`).
- Access: `requireRestaurantRole(MANAGER_ROLES, 'Contas a pagar são do dono e do gerente')`; every query scoped by `restaurantId`.
- Business-only features (new keys in `lib/tier-guard.ts` → `['business','enterprise']`): `payableSeries`, `payableAlerts`, `payableFromNfe`. The trial is stored as `business`, so it has them.
- DRE (competence): RENT, TAXES, SERVICES, LOANS, OTHER → operational "Contas a pagar"; PAYROLL → replaces the staff-salary estimate when the period has any; UTILITIES and MERCHANDISE → never added; drawer EXPENSE entries with `payableId` → excluded from the drawer sum.
- User text in pt-BR, code comments in English; every user-visible change updates `lib/ai/knowledge/*.ts` and `lib/help/seed-articles.ts`.

## Review Focus

1. Paying from the drawer when two registers are open: the request must name the shift; with one open shift use it; with none answer 409 "Abra o caixa para pagar com dinheiro da gaveta" → Task 3 test.
2. A series created on day 31: February gets the 28th/29th, never March 3 → Task 1 test (`dueDateIn`).
3. Editing "esta e as próximas" must not touch PAID or CANCELED occurrences → Task 2 test.
4. A utility bill whose due date is cleared after its payable was paid must not delete the paid payable → Task 5 test (cleared due date cancels only an OPEN payable; a PAID one stays).
5. The same NF-e imported twice (or the duplicatas with the same nDup) never creates a second payable → Task 6 test.

---

### Task 1: Schema, migration and pure rules

**Files:** `prisma/schema.prisma`, `prisma/migrations/20261018150000_payables/migration.sql`, `lib/payables/rules.ts`, `__tests__/unit/payables-rules.test.ts`

**Produces:**
- `type PayableCategory = 'MERCHANDISE'|'RENT'|'UTILITIES'|'PAYROLL'|'TAXES'|'SERVICES'|'LOANS'|'OTHER'`, `CATEGORY_LABEL: Record<PayableCategory,string>` (pt-BR: Compra de mercadoria, Aluguel e condomínio, Contas de consumo, Salários e encargos, Impostos e taxas, Serviços, Empréstimos e parcelas, Outras)
- `type DisplayState = 'OVERDUE'|'TODAY'|'WEEK'|'LATER'|'PAID'|'CANCELED'`; `displayState(p: {status, dueDate: Date}, today: string): DisplayState`
- `brtToday(now?: Date): string` ('YYYY-MM-DD')
- `dueDateIn(ym: string, day: number): Date` (day clamped to the month's last day)
- `splitInstallments(totalCents: number, n: number): number[]` (equal parts, remainder cents on the last)
- `installmentDueDates(firstDue: string, n: number): Date[]` (same day each month via `dueDateIn`)
- `seriesMonths(currentYm: string): string[]` → `[cur, cur+1, cur+2]`
- `dreLine(c: PayableCategory): 'OPERATIONAL'|'PAYROLL'|null` (null for UTILITIES, MERCHANDISE)
- `PayableError extends Error { status: number }`

- [ ] **Step 1: failing unit test** `__tests__/unit/payables-rules.test.ts`:
```ts
import { displayState, dueDateIn, splitInstallments, installmentDueDates, seriesMonths, dreLine, brtToday } from '@/lib/payables/rules';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

it('display state by the Brasília day', () => {
  const today = '2026-10-18';
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-17') }, today)).toBe('OVERDUE');
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-18') }, today)).toBe('TODAY');
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-25') }, today)).toBe('WEEK');
  expect(displayState({ status: 'OPEN', dueDate: d('2026-10-26') }, today)).toBe('LATER');
  expect(displayState({ status: 'PAID', dueDate: d('2026-10-01') }, today)).toBe('PAID');
  expect(displayState({ status: 'CANCELED', dueDate: d('2026-10-01') }, today)).toBe('CANCELED');
  expect(brtToday(new Date('2026-10-19T02:00:00Z'))).toBe('2026-10-18'); // 23h in Brasília
});

it('day 31 falls on the last day of shorter months', () => {
  expect(dueDateIn('2027-02', 31).toISOString().slice(0, 10)).toBe('2027-02-28');
  expect(dueDateIn('2028-02', 30).toISOString().slice(0, 10)).toBe('2028-02-29');
  expect(dueDateIn('2026-11', 5).toISOString().slice(0, 10)).toBe('2026-11-05');
});

it('installments: equal parts, cents on the last, monthly dates', () => {
  expect(splitInstallments(100000, 3)).toEqual([33333, 33333, 33334]);
  expect(installmentDueDates('2026-12-31', 3).map((x) => x.toISOString().slice(0, 10))).toEqual(['2026-12-31', '2027-01-31', '2027-02-28']);
});

it('series keeps the current month and the next two', () => {
  expect(seriesMonths('2026-11')).toEqual(['2026-11', '2026-12', '2027-01']);
});

it('what reaches the DRE', () => {
  expect(['RENT', 'TAXES', 'SERVICES', 'LOANS', 'OTHER'].map((c) => dreLine(c as any))).toEqual(Array(5).fill('OPERATIONAL'));
  expect(dreLine('PAYROLL')).toBe('PAYROLL');
  expect(dreLine('UTILITIES')).toBeNull();
  expect(dreLine('MERCHANDISE')).toBeNull();
});
```
- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: schema** (add to `prisma/schema.prisma`, relations on `Restaurant` (`payables Payable[]`, `payableSeries PayableSeries[]`), `Supplier`, `User` (named relations `PayableCreatedBy`, `PayablePaidBy`), `UtilityBill` (`payable Payable?`), `CashSessionEntry.payableId String?` + `@@index([payableId])`):
```prisma
enum PayableCategory { MERCHANDISE RENT UTILITIES PAYROLL TAXES SERVICES LOANS OTHER }
enum PayableStatus { OPEN PAID CANCELED }
enum PayableSource { MANUAL SERIES INSTALLMENT UTILITY NFE }

/// "Repete todo mês" (spec 2026-10-18 contas a pagar §5)
model PayableSeries {
  id           String          @id @default(cuid())
  restaurantId String
  description  String
  category     PayableCategory
  supplierId   String?
  amountCents  Int
  dueDay       Int
  active       Boolean         @default(true)
  createdById  String
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  restaurant   Restaurant      @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  payables     Payable[]
  @@index([restaurantId, active])
  @@map("payable_series")
}

model Payable {
  id                String          @id @default(cuid())
  restaurantId      String
  description       String
  category          PayableCategory
  supplierId        String?
  amountCents       Int
  competenceMonth   DateTime        @db.Date
  dueDate           DateTime        @db.Date
  status            PayableStatus   @default(OPEN)
  notes             String?
  source            PayableSource   @default(MANUAL)
  seriesId          String?
  installmentGroup  String?
  installmentNumber Int?
  installmentTotal  Int?
  utilityBillId     String?         @unique
  nfeKey            String?
  nfeDupNumber      String?
  paidAt            DateTime?       @db.Date
  paidMethod        String?
  paidFrom          String?
  cashEntryId       String?         @unique
  paidById          String?
  canceledAt        DateTime?
  canceledById      String?
  cancelReason      String?
  createdById       String
  updatedById       String?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  restaurant        Restaurant      @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  series            PayableSeries?  @relation(fields: [seriesId], references: [id], onDelete: SetNull)
  supplier          Supplier?       @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  utilityBill       UtilityBill?    @relation(fields: [utilityBillId], references: [id], onDelete: SetNull)
  @@unique([seriesId, competenceMonth])
  @@unique([restaurantId, nfeKey, nfeDupNumber])
  @@index([restaurantId, status, dueDate])
  @@index([restaurantId, competenceMonth])
  @@map("payables")
}
```
(`Supplier` is the model behind `/fornecedores` and `app/api/suppliers`.) Create the migration with `npx prisma migrate dev --create-only --name payables` against the test DB, rename the folder to `20261018150000_payables`, review the SQL (enums, tables, unique indexes, `cash_session_entries.payableId`), apply with `npm run test:db:migrate`.
- [ ] **Step 4:** implement `lib/payables/rules.ts` (import `addMonths`, `monthDate`, `parseAmountCents` from `@/lib/utility-bills/rules`; `displayState` compares ISO day strings; WEEK = 1..7 days ahead).
- [ ] **Step 5:** run → PASS; `npx tsc --noEmit -p .`; commit `feat(payables): schema, migration and rules`.

---

### Task 2: Service and API — create, list, edit, cancel

**Files:** `lib/payables/service.ts`, `app/api/payables/route.ts` (GET list+summary, POST create), `app/api/payables/[id]/route.ts` (PATCH edit, DELETE = cancel with reason in body), `__tests__/integration/payables/crud.test.ts`

**Produces:**
- `createPayables(member, body: { description, category, supplierId?, amount, dueDate, competenceMonth?, notes?, mode: 'ONCE'|'INSTALLMENTS'|'SERIES', installments?, dueDay? }, now?)` → `{ ids: string[] }`; SERIES refused 403 `Repetir todo mês é do plano Business` when `!isTierFeatureEnabled(tier,'payableSeries')`; SERIES creates the series and calls `ensureSeries(restaurantId, now)` for it.
- `ensureSeries(restaurantId: string, now?: Date): Promise<number>` → creates missing occurrences for active series of a Business restaurant for `seriesMonths(currentYm)` (upsert-safe on `@@unique([seriesId, competenceMonth])`, P2002 ignored); returns created count.
- `listPayables(member, query: { status?, category?, month? }, now?)` → `{ summary: { overdue: {count, cents}, today, week, month }, items: Array<{ id, description, category, categoryLabel, supplierName, amountCents, dueDate: 'YYYY-MM-DD', competenceMonth: 'YYYY-MM', state: DisplayState, source, installment: 'k/n'|null, seriesId, paidAt, paidMethod, paidFrom, notes }>, features: { series: boolean, alerts: boolean, nfe: boolean } }`; calls `ensureSeries` first.
- `editPayable(member, id, body: { description?, amount?, dueDate?, competenceMonth?, category?, notes?, scope?: 'THIS'|'NEXT' })`: only OPEN; UTILITY source refuses amount/date changes (`Edite esta conta em Contas de consumo`); scope NEXT on a series payable updates the series (`amountCents`, `description`, `category`, `dueDay` from the new date) and every OPEN occurrence with `competenceMonth >=` this one.
- `cancelPayable(member, id, reason)`: OPEN only (PAID → 409 `Desfaça o pagamento antes de cancelar`), reason ≥ 3 chars, `canceledAt/ById/cancelReason`, audit.
- `stopSeries(member, seriesId)`: `active=false` (PATCH `/api/payables/series/[id]` `{ active:false }`).

- [ ] **Step 1: failing integration test** (restaurant `business`/`active` + owner membership; second restaurant for isolation; cashier user): create ONCE (amount `1.240,50` → 124050, competence defaults to due month); INSTALLMENTS 3 of R$ 1.000,00 first due 2026-12-31 → amounts [33333,33333,33334], dates 12-31/01-31/02-28, descriptions `"Freezer 1/3"`…; SERIES dueDay 10 created on 2026-10-18 → competences 2026-10, 11, 12 (and calling `listPayables` again creates nothing more); Pro restaurant SERIES → 403; edit scope NEXT on the November occurrence with amount 2.000 changes Nov and Dec and the series, not October nor a PAID occurrence (mark one PAID directly in the DB); cancel OPEN with reason ok, without reason 400, PAID 409; summary counts for a fixed `now`; cashier 403; other restaurant's id 404.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3:** implement service + routes (`PayableError` → status; unknown → 500 `Não foi possível …`; GET `Cache-Control: no-store`); audit (`recordAudit`) on edit/cancel.
- [ ] **Step 4:** run → PASS; tsc; commit `feat(payables): create, list, edit and cancel`.

---

### Task 3: Pay and undo (drawer or bank)

**Files:** `lib/payables/service.ts` (`payPayable`, `undoPayment`), `lib/caixa/sessions.ts` (`addEntry` accepts `payableId?: string` and stores it; EXPENSE category `'outros'` for payables), `app/api/payables/[id]/pay/route.ts` (POST pay, DELETE undo with `{ reason }`), `__tests__/integration/payables/pay.test.ts`

**Produces:**
- `payPayable(member, id, body: { paidAt?, method, from: 'DRAWER'|'BANK', cashSessionId?, force? })`: OPEN only (PAID → 409 `Esta conta já foi paga`); methods `CASH|PIX|BOLETO|CARD|AUTO_DEBIT|OTHER`; DRAWER → resolve shift: `cashSessionId` (must be OPEN and of this restaurant) else the only open shift else 409 `Abra o caixa para pagar com dinheiro da gaveta` (none) / 409 `Escolha o caixa` + `{ shifts: [{id, registerName}] }` (several); calls `addEntry(member, shiftId, { type:'EXPENSE', amount: cents/100, category:'outros', description: 'Conta a pagar: <descrição>', force, payableId })`, stores `cashEntryId`; the `CASH_NOT_ENOUGH` error passes through. Status update guarded (`updateMany where status OPEN`) so two clicks pay once.
- `undoPayment(member, id, reason)`: PAID only; DRAWER → `addEntry(..., { type:'ADJUSTMENT', direction:'IN', method:'CASH', amount, description: 'Pagamento desfeito: <reason>' })` on an open shift (none → 409 `Abra um caixa para devolver o dinheiro à gaveta`); clears paid fields and `cashEntryId`; audit.

- [ ] **Step 1: failing test:** pay by BANK (no cash entry); pay from DRAWER with one open shift → `CashSessionEntry` EXPENSE with `payableId`, the shift's expected cash drops; two open shifts without `cashSessionId` → 409 with the list; none open → 409; paying twice concurrently (`Promise.all`) → one 200, one 409, one cash entry; undo a DRAWER payment → ADJUSTMENT IN on the open shift, payable OPEN; undo without reason 400; cashier 403.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** run → PASS, plus `__tests__/integration/caixa` (addEntry change). Commit `feat(payables): pay from the drawer or the bank, undo`.

---

### Task 4: DRE by competence

**Files:** `lib/finance/dre.ts`, `lib/ai/tools/run.ts` (`dre_resumo` adds `contasAPagar`), `app/dashboard/financeiro/dre/page.tsx` (new line "Contas a pagar" under Despesas operacionais; Pessoal label shows "(contas lançadas)" when it came from payables), `__tests__/integration/payables/dre.test.ts`

- [ ] **Step 1: failing test** (month 2026-10, restaurant with one staff member baseSalary 2000): payables RENT 3000 (competence Oct, paid in Nov), TAXES 500 (OPEN), MERCHANDISE 4000, UTILITIES 800 (linked utility bill 800 in Oct), CANCELED OTHER 999, OTHER 200 competence Sept; drawer EXPENSE 150 without payable and 300 with `payableId` (the RENT payment). Expect: `contasAPagar = 3500`, `operacional = 150` (drawer, the 300 excluded), `contasConsumo = 800` (once), `pessoal = 2000` (estimate). Then add PAYROLL 2500 Oct → `pessoal = 2500`, `pessoalOrigem = 'contas'`.
- [ ] **Step 2:** FAIL. **Step 3:** implement in `computeDre`: payables aggregated with `groupBy category` where `competenceMonth` between `monthDate(startMonth)` and `monthDate(endMonth)`, `status != CANCELED`; drawer aggregate adds `payableId: null`; `despesasPessoal = payrollCents > 0 ? payrollCents/100 : estimate`; `despesasTotais += contasAPagar`; return `despesasOperacionais.contasAPagar` and `pessoalOrigem: 'contas'|'estimativa'`. **Step 4:** PASS + `__tests__/integration/api` DRE suites (`dre-revenue`). Commit `feat(payables): DRE by competence`.

---

### Task 5: Utility bills link, series job and the morning check

**Files:** `lib/utility-bills/service.ts` (`upsertBill` → `syncUtilityPayable`), `lib/payables/service.ts` (`syncUtilityPayable(restaurantId, billId, userId)`), `lib/payables/alerts.ts`, `app/api/payables/morning-check/route.ts`, `__tests__/integration/payables/utility-and-alerts.test.ts`

**Produces:**
- `syncUtilityPayable`: bill with `dueDate` → upsert payable by `utilityBillId` (UTILITIES, `description = account name + ' ' + mês/ano`, `amountCents`, `competenceMonth = referenceMonth`, `dueDate`, `source UTILITY`) only while the payable is OPEN (a PAID one keeps its values); bill without `dueDate` → an OPEN linked payable becomes CANCELED (`cancelReason 'Vencimento removido na conta de consumo'`), a PAID one stays.
- `morningCheck(now?)`: for each restaurant with active series → `ensureSeries`; for each Business restaurant (`payableAlerts`) with OPEN payables overdue / due today / due in 3 days → one restaurant-wide notification per Brasília day (`data.kind 'payables-morning'`, `dedupeKey 'payables:<rid>:<YYYY-MM-DD>'`, `type 'PAYMENT_PENDING'`, severity HIGH if any overdue else MEDIUM, title e.g. `Contas a pagar: 2 vencem hoje (R$ 1.450,00) · 1 atrasada (R$ 300,00) · 1 em 3 dias`, `actionUrl '/contas-a-pagar'`, `actionLabel 'Ver contas'`) and an e-mail to the owner (`sendTransactionalEmail`, failure logged).
- Route `POST` with `isCronAuthorized` → `{ series: n, alerted: n }`.

- [ ] **Step 1: failing test:** saving a utility bill with due date creates the payable; saving again with another amount updates it; after paying it, saving a new amount does not change the payable; clearing the due date cancels an OPEN linked payable and keeps a PAID one; morning check: Business restaurant with overdue+today+3-day bills → one notification with that title and one e-mail (mock `@/lib/email/transactional`); second run same day → nothing; Pro restaurant → no notification, and `ensureSeries` creates nothing for a Pro restaurant (series are Business); route without secret 401.
- [ ] **Step 2:** FAIL. **Step 3:** implement (utility sync wrapped in try/catch with log: the bill itself is saved). **Step 4:** PASS + `__tests__/integration/staff/utility-bills.test.ts`. Commit `feat(payables): utility bills link and the morning check`.

---

### Task 6: NF-e duplicatas

**Files:** `lib/nfe/duplicatas.ts` (pure, used by the server and the page), `app/api/nfe/import-xml/route.ts`, `app/admin/nfe-import/page.tsx`, `lib/payables/service.ts` (`createFromNfe`), `__tests__/unit/nfe-duplicatas.test.ts`, `__tests__/integration/payables/nfe.test.ts`

**Produces:**
- `parseDuplicatas(xml: string): { key: string|null; nNF: string; emitente: string; cnpj: string; duplicatas: Array<{ nDup: string; dueDate: string; amountCents: number }> }` — key = digits of `infNFe Id` (`Id="NFe<44 digits>"`), each `<dup>` → `nDup`, `dVenc` (YYYY-MM-DD), `vDup` (`"400.00"` → 40000).
- `createFromNfe(member, parsed)` → `{ created: number; skipped: number }`: Business only (`payableFromNfe`, else `{created:0, skipped:n}` and the route reports `payablesRefused: 'business'`); one MERCHANDISE payable per dup (`description 'NF <nNF> - <emitente> <nDup>'`, supplier by CNPJ when a supplier with that document exists, competence = due month, `source NFE`, `nfeKey`, `nfeDupNumber`), P2002 (same key+dup) counted as skipped.
- Route body `{ xmlContent, launchPayables?: boolean }` (default true); response adds `payables: { created, skipped } | { refused: 'business' }`.

- [ ] **Step 1: failing tests:** unit parser with 0, 1 and 3 `<dup>` (fixture strings in the test) and a missing key; integration: import an XML with 3 duplicatas into a Business restaurant → 3 payables; import again → 0 created, 3 skipped; `launchPayables:false` → none; Pro restaurant → `{ refused: 'business' }` and none.
- [ ] **Step 2:** FAIL. **Step 3:** implement; page: after choosing the file, show "Boletos desta nota" (parsed in the browser with `parseDuplicatas`) with due date and value and a checkbox "Lançar no Contas a pagar" (checked; disabled with the Business seal when `features.nfe` is false, read from `GET /api/payables` `features`). **Step 4:** PASS; commit `feat(payables): NF-e duplicatas become payables`.

---

### Task 7: Screen, menu and plans

**Files:** `app/contas-a-pagar/page.tsx`, `components/payables/*` (summary cards, list, new-bill dialog, pay dialog, edit dialog), `lib/navigation/app-nav.ts` (Caixa e pagamentos › `Contas a pagar` `/contas-a-pagar`, MANAGERS), `lib/tier-guard.ts` (3 keys), `lib/billing/pricing-tiers.ts` (Pro feature `'Contas a pagar'`, Business `'Contas a pagar com avisos, repetição automática e boletos da nota de compra'`), `__tests__/unit/payables-nav-plans.test.ts`

- [ ] **Step 1: failing unit test:** `isTierFeatureEnabled('pro','payableSeries'|'payableAlerts'|'payableFromNfe') === false`, business/enterprise true; nav has `/contas-a-pagar` for OWNER/MANAGER and not for CASHIER/COOK (use `navFor`); the existing "every nav href has a page" test passes once the page exists.
- [ ] **Step 2:** FAIL. **Step 3:** build the screen per spec §8: four cards (Atrasadas red, Vencem hoje amber, Próximos 7 dias, Total do mês), filters (situação, categoria, mês), list rows (description, category, supplier, due dd/mm, value R$ 1.240,50, state chip, installment k/n, actions), dialogs: **Nova conta** (Uma vez / Parcelar / Repetir todo mês — the last disabled with "Business" seal when `features.series` false), **Marcar como paga** (date, method, origem Gaveta/Banco; on 409 with `shifts` show a register picker; on `CASH_NOT_ENOUGH` offer "Confirmar mesmo assim" for managers), **Editar** (scope question for series rows), **Desfazer pagamento** and **Cancelar** (reason). 390 px layout: cards 2×2, rows stacked. **Step 4:** PASS; tsc; commit `feat(payables): screen, menu and plans`.

---

### Task 8: Help, AI and copy

**Files:** `lib/help/seed-articles.ts` (new article `contas-a-pagar` in category `pdv-e-caixa` "Vendas e caixa": what it is, Nova conta, Parcelar, Repetir (Business), pagar pela gaveta ou banco, desfazer, avisos (Business), DRE pela competência, compras de mercadoria fora da DRE), `lib/ai/knowledge/contas-pagar.ts` (+ register in `lib/ai/knowledge/index.ts`), `lib/ai/tools/defs.ts` + `run.ts` (tool `contas_a_pagar`, roles M: `{ atrasadas, vencemHoje, proximos7Dias, totalMes, proximas: [{ descricao, vencimento, valor }] (até 10) }`), fix `contas_consumo` tool text "no Pro" → "no Business" and `indicadores: 'disponíveis no plano Business'`, `lib/ai/knowledge/planos.ts` (Pro "Contas a pagar", Business "com avisos…"), `__tests__/unit/ai-prompt.test.ts` facts ('Contas a pagar'), `__tests__/integration/staff/ai-tools.test.ts` (tool returns the summary for an owner; cook does not get it).

- [ ] Steps: failing test (knowledge fact + tool roles + tool data) → implement → PASS (unit + `staff/ai-tools`) → commit `feat(payables): help article and AI knowledge`.

---

### Task 9: Verify, review, publish, roll out

- [ ] Full suites: unit; integration `api`, `vender`, `caixa`, `bad-day`, `staff`, `admin`, `payables`; tsc; `npx next build` if memory allows.
- [ ] Final review by a fresh reviewer (most capable model) over the branch with spec + plan + Review Focus; fix Important findings (TDD), minors to the ledger.
- [ ] Push main. Owner: Deploy `homolog` + `npx prisma migrate deploy` (20261018150000_payables). I check on homolog: aluguel repetido (3 meses), parcelar uma compra, pagar pela gaveta e desfazer (caixa aberto), conta de luz com vencimento aparecendo, importar um XML de compra com `<dup>`, DRE do mês, sino (rodando a rotina com o script de cron do homolog ou chamando a rota com a chave).
- [ ] Owner: Deploy `app` + migrate; VPS crontab `0 10 * * * /root/gastrux-cron.sh /api/payables/morning-check`.
- [ ] Manual (Funcionalidades + crontab), memory.
