# Agente de ativação — Etapa 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every trial account gets the right nudge toward its first sale at the right moment, drafted by the agent and approved by the owner in a queue, by e-mail or by a ready WhatsApp link.

**Architecture:** Pure rules (`lib/agents/activation/rules.ts`) decide *when* and *why* from signals read off the database; the Claude writer only drafts the text (fixed templates when AI is off). A runner called every 5 min by the VPS cron writes `AgentAction` rows (unique per account × trigger × channel, so reruns never repeat). The owner works the queue at `/admin/agente`; owner alerts go to the platform team's bell and e-mail. Stage 2 (official WhatsApp Cloud API number, chip free 2026-10-29) is a separate plan.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Jest (unit + integration), Anthropic SDK (`lib/ai/client.ts`), Resend (`lib/email/transactional.ts`).

**Spec:** `docs/superpowers/specs/2026-10-27-agente-ativacao-design.md`

## Global Constraints

- Owner decisions 2026-10-27: WhatsApp **required** in the sign-up qualification; approval queue first (no automatic sending in this stage); fixed onboarding e-mails of day 1, 7 and 14 removed (welcome stays).
- Limits per account: at most **1 message per day** and **3 per 7 days**; send/draft only **08:00–20:00 in `Restaurant.timezone`** (Sinop = America/Cuiaba, UTC-4).
- Never for: `Restaurant.isInternal`, staff, platform e-mails (`getPlatformAdminEmails()`), `User.onboardingEmailsOptOut = true`.
- Agent never gives discounts, extends trials, cancels or charges; texts never promise features absent from `lib/ai/knowledge`.
- Signature "Equipe Gastrux"; messages in Portuguese; WhatsApp text ≤ 700 characters; every message carries exactly one link (the next step's screen) and, in e-mail, the existing unsubscribe link (`unsubscribeUrl`).
- Welcome trigger fires **5 minutes** after sign-up; cron runs every 5 minutes with `CRON_SECRET` (`isCronAuthorized`).
- Every feature updates `lib/ai/knowledge/*.ts` and `lib/help/seed-articles.ts` (+ old hash), and the Claude Doc manual.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; tested work goes to main; owner deploys + `npx prisma migrate deploy`.

## Review Focus

1. Account signed up at 22:00 local → no draft until 08:00 local; welcome is drafted then, not lost.
2. Two cron runs at the same time → still one `AgentAction` per account × trigger × channel (unique index + `createMany skipDuplicates`).
3. WhatsApp typed as "(66) 9 9999-8888", "+55 66 99999-8888" or "66999998888" → all stored as `5566999998888`; landlines (10 digits) accepted; garbage refused with a message.
4. Owner opted out ("Parar as dicas") after a draft exists → approving it refuses (409) instead of sending.
5. Account that already sells and is paying (stage PAYING) → no trial nudges at all.

---

### Task 1: WhatsApp at sign-up + schema

**Files:**
- Create: `prisma/migrations/20261028120000_activation_agent/migration.sql`, `lib/onboarding/whatsapp.ts`
- Modify: `prisma/schema.prisma` (User, new AgentAction + enums), `app/api/onboarding/qualification/route.ts`, `app/auth/qualification/page.tsx`, `app/privacidade/page.tsx`
- Test: `__tests__/unit/whatsapp-number.test.ts`, `__tests__/integration/onboarding/qualification-whatsapp.test.ts`

**Interfaces:**
- Produces: `User.whatsapp String?` (digits, `55` + DDD + number); model `AgentAction` { id, restaurantId, userId, agent String @default("activation"), trigger String, channel AgentChannel (EMAIL | WHATSAPP | OWNER_ALERT), status AgentActionStatus (DRAFT | SENT | DISCARDED | FAILED), subject String?, text String, data Json?, costUsd Float @default(0), decidedBy String?, sentAt DateTime?, error String?, createdAt, updatedAt; `@@unique([restaurantId, agent, trigger, channel])`, `@@index([status, createdAt])`, `@@map("agent_actions")` }, relation to Restaurant with onDelete Cascade.
- Produces: `parseWhatsapp(raw: unknown): { ok: true; value: string } | { ok: false; error: string }`.

- [ ] **Step 1: Write failing unit tests** — `parseWhatsapp('(66) 9 9999-8888')` → `{ok:true,value:'5566999998888'}`; `'+55 66 99999-8888'` and `'66999998888'` same; `'6633334444'` → `'556633334444'`; `''`, `'123'`, `'00999998888'` (DDD 00) → `ok:false` with error `'Informe o WhatsApp com DDD'`.
- [ ] **Step 2: Run** `npx jest --config jest.unit.config.js __tests__/unit/whatsapp-number.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement `parseWhatsapp`** (strip non-digits, drop a leading `55` when 12–13 digits, accept 10–11 digits with DDD 11–99).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Schema + migration** (fields above), `npx prisma generate`.
- [ ] **Step 6: Failing integration test** — POST `/api/onboarding/qualification` as a new owner: without `whatsapp` → 400 `'Informe o WhatsApp com DDD'` (both normal and `skip: true`); with `'(66) 99999-8888'` → 200 and `User.whatsapp === '5566999998888'`, also on `skip: true`.
- [ ] **Step 7: Run** `npx jest --config jest.integration.config.js __tests__/integration/onboarding/qualification-whatsapp.test.ts` → FAIL.
- [ ] **Step 8: Route** — parse `body.whatsapp` first (before the skip branch), 400 on error, save on `prisma.user.update` in both branches.
- [ ] **Step 9: Page** — required field "Seu WhatsApp" (placeholder `(66) 99999-8888`, `inputMode="tel"`) above the business type, helper text exactly: "Para receber ajuda durante o teste. Para parar, é só responder SAIR." Sent on both buttons; "Pular por enquanto" disabled until the number is valid (`parseWhatsapp` on the client).
- [ ] **Step 10: Privacy policy** — add to the data-collected section: "WhatsApp informado no cadastro: usado para enviar ajuda durante o teste e avisos da conta; você pode parar quando quiser respondendo SAIR."
- [ ] **Step 11: Run** both tests + `npx tsc --noEmit` → PASS.
- [ ] **Step 12: Commit** `feat(onboarding): WhatsApp asked at sign-up; agent actions table`.

### Task 2: Signals and rules

**Files:**
- Create: `lib/agents/activation/signals.ts`, `lib/agents/activation/rules.ts`
- Test: `__tests__/unit/activation-rules.test.ts`, `__tests__/integration/agents/activation-signals.test.ts`

**Interfaces:**
- Consumes: `onboardingStatus(restaurantId, now)` (`lib/onboarding/first-steps.ts`), `clientStage(...)` (`lib/admin/client-health.ts`), `AgentAction` (Task 1).
- Produces:
  ```ts
  type ActivationTrigger = 'boas_vindas' | 'cardapio_parado' | 'sem_caixa' | 'sem_venda' | 'sumiu' | 'primeira_venda' | 'fim_teste_vendendo' | 'fim_teste_sem_venda' | 'travou' | 'o_que_faltou';
  interface ActivationSignals {
    restaurantId: string; restaurantName: string; ownerId: string; ownerName: string | null; email: string | null; whatsapp: string | null;
    businessType: string | null; timezone: string; createdAt: Date; trialEndsAt: Date | null; status: string; stage: ClientStage;
    lastActivityAt: Date | null; // max(owner lastSignInAt, last CLOSED orderSession closedAt, last menuItem createdAt)
    steps: FirstStep[]; stepsDone: number; excluded: boolean; // internal, opted out, platform e-mail
    sent: { trigger: string; createdAt: Date; stepsDone: number | null }[]; // this account's AgentActions, newest first
  }
  interface ActivationDecision { trigger: ActivationTrigger; reason: string; ownerAlert: boolean; nextStep: FirstStep | null }
  function loadActivationSignals(restaurantId: string, now: Date): Promise<ActivationSignals | null>;
  function listTrialRestaurantIds(now: Date): Promise<string[]>; // status TRIAL, not internal, created in the last 40 days
  function decide(s: ActivationSignals, now: Date): ActivationDecision | null;
  ```

- [ ] **Step 1: Failing unit tests for `decide`** (signals built by a local `make(overrides)`; `now` = 2026-10-28T15:00Z, timezone `America/Cuiaba` → 11:00 local):
  - created 4 min ago → `null`; 6 min ago, nothing sent → `boas_vindas`.
  - day 1, cardápio not done, welcome sent 1 day ago → `cardapio_parado`, `nextStep.key === 'cardapio'`.
  - day 2, cardápio done, caixa not → `sem_caixa`; day 3, caixa done, venda not → `sem_venda`.
  - `lastActivityAt` 3 days ago, venda not done, created ≥ 3 days → `sumiu`.
  - venda done and `primeira_venda` not sent → `primeira_venda`.
  - trial ends in 4 days: venda done → `fim_teste_vendendo` (`ownerAlert:false`); not done → `fim_teste_sem_venda` (`ownerAlert:true`).
  - last 2 actions had `stepsDone` equal to now and the last is ≥ 3 days old → `travou` (`ownerAlert:true`).
  - trial ended 1 day ago, stage not PAYING → `o_que_faltou`.
  - limits: something sent 20 h ago → `null` (except `ownerAlert` triggers); 3 sent in 7 days → `null`; 21:00 local → `null`; `excluded` → `null`; stage `PAYING` → `null`; a trigger already in `sent` never repeats.
  - priority when several apply: owner alerts first, then `primeira_venda`, `boas_vindas`, `sem_venda`, `sem_caixa`, `cardapio_parado`, `sumiu`.
- [ ] **Step 2: Run** `npx jest --config jest.unit.config.js __tests__/unit/activation-rules.test.ts` → FAIL.
- [ ] **Step 3: Implement `decide`** (pure; local hour via `Intl.DateTimeFormat(..., { timeZone, hour: 'numeric', hourCycle: 'h23' })`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Failing integration test for `loadActivationSignals`/`listTrialRestaurantIds`** — seeded trial restaurant with owner whatsapp, one closed sale, `isInternal` sibling: ids list excludes the internal one; signals have `stepsDone` from `onboardingStatus`, `lastActivityAt` = the sale's close, `excluded` true when owner `onboardingEmailsOptOut`.
- [ ] **Step 6: Implement** both loaders; run → PASS.
- [ ] **Step 7: Commit** `feat(agents): activation signals and rules`.

### Task 3: Writer (AI text with template fallback)

**Files:**
- Create: `lib/agents/activation/templates.ts`, `lib/agents/activation/writer.ts`
- Test: `__tests__/unit/activation-writer.test.ts`

**Interfaces:**
- Consumes: `ActivationSignals`, `ActivationDecision` (Task 2); `getAnthropic()`, `aiModels().default`, `estimateCostUsd` (`lib/ai`); knowledge `lib/ai/knowledge/implantacao.ts` + the segment file for `businessType` when it exists.
- Produces: `writeActivationMessage(s, d, channel: 'EMAIL' | 'WHATSAPP' | 'OWNER_ALERT'): Promise<{ subject: string | null; text: string; costUsd: number }>`; `templateFor(trigger, channel, ctx): { subject: string | null; text: string }`.

- [ ] **Step 1: Failing tests** — with `ANTHROPIC_API_KEY` unset: returns the template, `costUsd 0`, text contains `ownerName` first name, the step link `https://gastrux.com${nextStep.href}`, and ends with "Equipe Gastrux"; WHATSAPP text ≤ 700 chars; EMAIL has a subject. With a mocked client: the prompt sent contains the trigger's reason, the business type and the next step label; a model reply longer than 700 chars for WHATSAPP falls back to the template; an exception falls back to the template. `OWNER_ALERT` text names the restaurant, days since sign-up, steps done/total and a suggested message.
- [ ] **Step 2: Run** `npx jest --config jest.unit.config.js __tests__/unit/activation-writer.test.ts` → FAIL.
- [ ] **Step 3: Templates** — one per trigger × channel, in the tone of `lib/onboarding/emails.ts`; `boas_vindas` offers: menu by photo in the chat (IA monta), the "Comece por aqui" videos and "se quiser, marcamos 15 minutos para montar junto"; `o_que_faltou` asks one question ("O que faltou para o Gastrux servir para você?").
- [ ] **Step 4: Writer** — system prompt states the Global Constraints rules (no discounts, no features outside the knowledge given, one link, signature, length) and passes the knowledge text; `max_tokens` 600; cost from `estimateCostUsd`.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat(agents): activation message writer`.

### Task 4: Runner, cron route and owner alerts

**Files:**
- Create: `lib/agents/activation/run.ts`, `app/api/agents/activation/run/route.ts`
- Test: `__tests__/integration/agents/activation-run.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; `isCronAuthorized`, `getPlatformAdminSession`, `getPlatformAdminEmails`, `sendTransactionalEmail`.
- Produces: `runActivationAgent(now = new Date()): Promise<{ drafted: number; alerts: number; skipped: number }>`; POST `/api/agents/activation/run` (cron or platform admin) → that JSON.

- [ ] **Step 1: Failing integration tests**:
  - new trial owner with email + whatsapp, created 6 min ago (09:00 local) → 2 DRAFT rows (`EMAIL`, `WHATSAPP`) trigger `boas_vindas`, `data.stepsDone` stored; a platform-admin user gets a `Notification` (type `SYSTEM_INFO`, title "Novo cliente: mandar boas-vindas", `actionUrl '/admin/agente'`).
  - second run right after → `drafted: 0`, still 2 rows; two runs in `Promise.all` → still 2 rows.
  - `fim_teste_sem_venda` → one `OWNER_ALERT` row status `SENT`, a Notification and an e-mail to each platform admin (transactional mocked); no client message.
  - internal restaurant and opted-out owner → nothing.
  - POST without cron header and without admin session → 401.
- [ ] **Step 2: Run** `npx jest --config jest.integration.config.js __tests__/integration/agents/activation-run.test.ts` → FAIL.
- [ ] **Step 3: Implement** — for each id: signals → decide → write once per available channel (EMAIL if email, WHATSAPP if whatsapp; OWNER_ALERT alone when `ownerAlert`) → `prisma.agentAction.createMany({ skipDuplicates: true })`; notify only for rows actually inserted.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(agents): activation runner and cron route`.

### Task 5: Approval queue and client history

**Files:**
- Create: `app/admin/agente/page.tsx`, `app/api/admin/agent-actions/route.ts`, `app/api/admin/agent-actions/[id]/route.ts`
- Modify: `lib/navigation/app-nav.ts` (Plataforma Gastrux: `{ label: 'Fila do agente', href: '/admin/agente' }` right after Clientes), `app/api/admin/customers/[id]/route.ts` (add `agentActions`, newest 30), `components/admin/client-profile-panel.tsx` (section "Mensagens do agente": date, trigger label, channel, status)
- Test: `__tests__/integration/agents/agent-actions-api.test.ts`, `__tests__/unit/app-nav.test.ts` (existing; add the link)

**Interfaces:**
- Consumes: `AgentAction`; `sendTransactionalEmail`, `unsubscribeUrl`; `requirePlatformAdmin`.
- Produces: GET `/api/admin/agent-actions?status=DRAFT` → `{ actions: Array<AgentAction & { restaurantName: string; ownerName: string | null; whatsapp: string | null; email: string | null; stage: ClientStage }> }`; PATCH `/api/admin/agent-actions/[id]` body `{ action: 'approve' | 'discard'; text?: string; subject?: string }` → `{ status, waUrl?: string }`.

- [ ] **Step 1: Failing integration tests** — non-admin → 403; approve EMAIL with edited text → transactional called with the edited text plus the unsubscribe link, row `SENT`, `decidedBy` = admin e-mail; transactional throws → row `FAILED` with `error`, 502; approve WHATSAPP → row `SENT`, `waUrl === 'https://wa.me/5566999998888?text=' + encodeURIComponent(text)`; approving a non-DRAFT → 409; owner opted out after drafting → 409 `'O cliente pediu para parar as mensagens'`; discard → `DISCARDED`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement routes** (status change with `updateMany where status DRAFT` first, so a double click sends once).
- [ ] **Step 4: Page** — DRAFTs newest first, card per action: restaurant, stage, trigger label + reason, channel badge, editable textarea (and subject for e-mail), buttons "Enviar e-mail" / "Abrir no WhatsApp" (opens `waUrl` in a new tab after PATCH) / "Descartar"; empty state "Nada para aprovar agora". Works at 390 px.
- [ ] **Step 5: Nav + client history** as listed in Files; run all tests of this task + `app-nav` test → PASS.
- [ ] **Step 6: Commit** `feat(agents): approval queue for the activation agent`.

### Task 6: Retire fixed e-mails, knowledge, help and manual

**Files:**
- Modify: `lib/onboarding/emails.ts` (`ONBOARDING_STEPS` keeps only `welcome`; header comment cites this spec), tests that reference day1/day7/day14 steps, `lib/ai/knowledge/implantacao.ts`, `lib/help/seed-articles.ts` (+ old hash), `app/admin/onboarding` copy if it lists the 4 e-mails
- Test: existing onboarding e-mail tests updated

- [ ] **Step 1: Update tests first** — `runOnboardingEmails` sends only the welcome; a user created 7 days ago gets nothing from it.
- [ ] **Step 2: Run** → FAIL; **Step 3:** trim `ONBOARDING_STEPS` and the builders of the removed steps; **Step 4:** run → PASS.
- [ ] **Step 5: Knowledge** — implantacao: "Durante o teste, a Equipe Gastrux manda dicas por WhatsApp e e-mail conforme o que falta (abrir o caixa, primeira venda...). Para parar: responder SAIR no WhatsApp ou 'Parar as dicas' no e-mail." Help article "Mensagens de ajuda durante o teste" with the same facts.
- [ ] **Step 6: Full unit suite** `npx jest --config jest.unit.config.js` and integration folders `onboarding agents` → PASS; commit `feat(onboarding): agent replaces fixed tips; knowledge and help`.

### Task 7: Ship

- [ ] **Step 1:** push main; owner Deploy + `npx prisma migrate deploy` (migration `20261028120000_activation_agent`).
- [ ] **Step 2:** owner adds to the VPS crontab: `*/5 * * * * curl -s -X POST -H "x-internal-trigger: $CRON_SECRET" https://gastrux.com/api/agents/activation/run` (same header as the other routines).
- [ ] **Step 3:** browser check in prod: new test sign-up asks WhatsApp; within 5 min (08–20 local) two drafts appear in "Fila do agente" and the bell shows "Novo cliente"; "Abrir no WhatsApp" opens wa.me with the text; "Enviar e-mail" arrives; the client page shows the history. Test account then marked internal.
- [ ] **Step 4:** update the Claude Doc manual (Plataforma › Fila do agente; crontab line) and memory.
