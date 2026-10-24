# Programa de indicação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A restaurant owner shares a link; the referred restaurant gets 45 days of trial, and the owner gets one free month on the invoice when the referred restaurant pays its first charge and keeps paying for 7 days.

**Architecture:** One `Referral` row per referred restaurant carries the whole story (trial → confirming → earned → applied, or cancelled). Signup creates it; the two billing webhooks mark the first charge; a daily job confirms after 7 days and applies the month (Stripe: customer balance credit; Mercado Pago: pause one cycle, only after the sandbox experiment of Task 1 passes). Everything is idempotent per row.

**Tech Stack:** Next.js 14 App Router, Prisma 6 / PostgreSQL, Stripe Node SDK (`lib/stripe-connect.ts`), Mercado Pago SDK (`lib/mercado-pago.ts`), Resend (`lib/email/transactional.ts`), Jest (unit + integration with the local test DB).

**Spec:** `docs/superpowers/specs/2026-10-23-indicacao-design.md`

## Global Constraints

- Referred restaurant: **45 days** of trial instead of 30 (`TRIAL_DAYS` stays 30; the referral adds 15).
- Referrer: **1 free month** of their own plan per referred restaurant that **pays its first charge**; a referral that only tests gives nothing.
- Refund or cancellation of the referred restaurant **within 7 days** of its first charge cancels the month (it is not applied before those 7 days).
- **12 free months per year** per referring restaurant (calendar year in Brasília, by `earnedAt`); beyond that → cancelled with reason "limite do ano".
- No self-referral: the referred restaurant's owner is the referrer's owner, or its CNPJ equals a CNPJ of any restaurant of the referrer's owner → cancelled.
- `isInternal` restaurants neither earn nor generate months.
- Month value = `priceMonthly` of the referrer's current tier in `lib/billing/pricing-tiers.ts` (Pro R$ 149, Business R$ 199), also for annual plans.
- Link `https://gastrux.com/?ref=CODE`; cookie keeps it **60 days**; signup also has "Código de indicação (opcional)".
- Code: 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0, O, 1, I, L), stored upper case, typed case- and space-insensitive.
- Mercado Pago: **the pause of one cycle is used only if Task 1 proves it in the sandbox**; otherwise stop and ask the owner (spec: refund path only after a new owner decision).
- Copy is Portuguese, plain, no promise the invoice does not keep (the old version promised "R$ 50 em créditos" that billing never used).
- Every feature updates `lib/ai/knowledge/*.ts` and `lib/help/seed-articles.ts` (a changed default article adds its old sha256 to `LEGACY_DEFAULT_HASHES`).
- The old `users.referral*` columns and `referral_history` stay untouched (not used, not dropped here).

## Review Focus

1. The same Stripe `invoice.paid` or MP payment webhook delivered twice → the referral moves once, one month applied (idempotency key = referral id). Test in Task 4 and Task 5.
2. The R$ 0,00 invoice Stripe issues when a trial subscription starts → not a first charge (`isChargedInvoice`). Test in Task 4.
3. A code typed as ` abc23d ` or from a cookie of a restaurant that no longer exists / is internal → normalized, or ignored without breaking the signup (30 days). Test in Task 3.
4. The referrer is still in trial (no paid subscription) when the month is earned → stays EARNED ("guardado") and is applied when they subscribe on Stripe (checkout route). Test in Task 5.
5. The referred restaurant cancels on day 3 or its first charge is refunded → CANCELLED, no credit. Test in Task 5.

---

### Task 1: Mercado Pago sandbox experiment: pause one cycle

The Stripe path does not depend on this task; Task 6 does. The owner's sandbox test accounts are needed (seller + buyer).

**Files:**
- Create: `scripts/mp-pause-experiment.ts`, `docs/mp-pause-experiment.md`

- [ ] **Step 1:** Script with subcommands `create` (preapproval, sandbox seller token from `MP_SANDBOX_ACCESS_TOKEN`, `auto_recurring.frequency=1`, `frequency_type='days'`, R$ 5, prints `init_point`), `status <id>` (prints status, `next_payment_date`, and the payments of the preapproval via `/preapproval/search` + `/authorized_payments/search?preapproval_id=`), `pause <id>`, `resume <id>` (`status: 'authorized'`).
- [ ] **Step 2:** The owner opens `init_point` as the sandbox buyer and pays with the MP test card. Record the first charge.
- [ ] **Step 3:** After the first charge: `pause`; leave it paused past `next_payment_date`; check daily that no charge happens; `resume` the day after; record whether MP charges at once on resume or on the next date, and the new `next_payment_date`.
- [ ] **Step 4:** Write `docs/mp-pause-experiment.md`: dates, each status output, verdict **PASSA** (no charge while paused, next charge one cycle later) or **FALHA** (and why). Commit `docs(referral): Mercado Pago pause experiment`.

### Task 2: Data and rules

**Files:**
- Modify: `prisma/schema.prisma` (Restaurant `referralCode String? @unique`, `referredBy Referral?`; new `Referral` model + enum)
- Create: `prisma/migrations/20261025140000_referrals/migration.sql`, `lib/referrals/rules.ts`
- Test: `__tests__/unit/referral-rules.test.ts`

**Interfaces:**
- Produces:
  - `enum ReferralStatus { TRIAL CONFIRMING EARNED APPLIED CANCELLED }`
  - `model Referral { id, referrerRestaurantId, referredRestaurantId @unique, status @default(TRIAL), gateway String?, firstChargeRef String?, firstChargeAt DateTime?, earnedAt DateTime?, amountCents Int?, appliedAt DateTime?, appliedRef String?, resumeAt DateTime?, cancelReason String?, createdAt, updatedAt; @@index([referrerRestaurantId, status]); @@map("referrals") }` (both restaurant relations `onDelete: Cascade`)
  - `normalizeReferralCode(raw: unknown): string | null` (trim, upper, remove spaces; null unless 6 chars of the alphabet)
  - `newReferralCode(random = crypto.randomInt): string`
  - `REFERRAL_TRIAL_BONUS_DAYS = 15`, `CONFIRM_DAYS = 7`, `YEARLY_CAP = 12`
  - `monthValueCents(tier: string): number` (Pro 14900, Business 19900, Enterprise per `pricing-tiers`; unknown → 0)
  - `brtYear(d: Date): number`

- [ ] **Step 1: Failing tests:** `normalizeReferralCode(' abc23d ') === 'ABC23D'`; `normalizeReferralCode('ABC0OD') === null` (0 and O are not in the alphabet); `normalizeReferralCode('ABC23')` null; `newReferralCode` has 6 chars of the alphabet; `monthValueCents('pro') === 14900`, `('business') === 19900`, `('starter') === 0`; `brtYear(new Date('2027-01-01T02:00:00Z')) === 2026`.
- [ ] **Step 2:** Run `npx jest --config jest.unit.config.js __tests__/unit/referral-rules.test.ts` → FAIL.
- [ ] **Step 3:** Schema, migration (written by hand like the others; `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma` shows no difference after `migrate deploy` on the test DB), rules.
- [ ] **Step 4:** Tests PASS; `npx tsc --noEmit -p .` 0 errors.
- [ ] **Step 5: Commit** `feat(referral): referral data and rules`

### Task 3: Link, cookie and signup

**Files:**
- Modify: `middleware.ts` (any page with `?ref=` sets cookie `gx_ref`, 60 days, `sameSite lax`, httpOnly false so the signup page can read it), `app/api/signup/route.ts`, `app/auth/signup/page.tsx`
- Create: `lib/referrals/signup.ts`, `app/api/referrals/lookup/route.ts`
- Test: `__tests__/integration/referrals/signup.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `findReferrer(code: unknown): Promise<{ restaurantId: string; name: string } | null>` (normalized code; restaurant not internal)
  - `referralCodeFor(restaurantId: string): Promise<string>` (creates on first use; retries on a unique clash)
  - `attachReferral(referredRestaurantId: string, referrer: { restaurantId: string }): Promise<void>` (creates TRIAL; sends the "se cadastrou" e-mail to the referrer's owner without waiting; never throws)
  - Signup body/cookie: `referralCode` (body wins over the cookie `gx_ref`); valid → `trialEndsAt = trialEnd() + 15 days` on user and restaurant.
  - `GET /api/referrals/lookup?code=` → `{ name }` or 404 (public; only the restaurant name).
  - Signup page: with a code from `?ref`, the cookie or the field, shows "Indicado por <nome>: 45 dias grátis"; field label "Código de indicação (opcional)".

- [ ] **Step 1: Failing tests:** `signup with a valid code: 45 days and a TRIAL referral`; `code ' abc23d ' is normalized`; `unknown code: 30 days, signup still 201`; `code of an internal restaurant is ignored`; `cookie gx_ref is used when the body has no code`; `lookup returns only the name`; `the referrer gets one e-mail` (mock `sendTransactionalEmail`).
- [ ] **Step 2:** Run `npx jest --config jest.integration.config.js --workerIdleMemoryLimit=10MB __tests__/integration/referrals/signup.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests PASS; the middleware unit tests still pass.
- [ ] **Step 5: Commit** `feat(referral): the referral link gives 45 days at signup`

### Task 4: The referred restaurant's first charge

**Files:**
- Modify: `app/api/billing/webhook/route.ts` (`handleInvoicePaid`, after `isChargedInvoice`), `app/api/pagamentos/mp/webhook/route.ts` (`handleSubscriptionRecurringCharge`, after APPROVED)
- Create: `lib/referrals/charges.ts`
- Test: `__tests__/integration/referrals/first-charge.test.ts`

**Interfaces:**
- Produces: `noteFirstCharge(referredRestaurantId: string, charge: { gateway: 'STRIPE' | 'MERCADO_PAGO'; ref: string; at: Date }): Promise<void>` — `updateMany where { referredRestaurantId, status: 'TRIAL' }` → CONFIRMING with the charge; a second call does nothing. Never throws (logs).

- [ ] **Step 1: Failing tests:** `first charged Stripe invoice moves TRIAL to CONFIRMING`; `the same invoice twice changes nothing more`; `a R$ 0,00 trial invoice does not count`; `an approved MP recurring charge counts`; `a restaurant without referral: nothing happens`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS, plus `__tests__/integration/api` billing suites.
- [ ] **Step 5: Commit** `feat(referral): the first charge of the referred restaurant`

### Task 5: Daily job: confirm, earn, apply on Stripe

**Files:**
- Create: `lib/referrals/daily.ts`, `lib/referrals/apply-stripe.ts`, `app/api/referrals/daily/route.ts`
- Modify: `app/api/billing/checkout-session/route.ts` (after the customer exists, `applyEarnedOnStripe(restaurantId)` before creating the session)
- Test: `__tests__/integration/referrals/daily.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 4; `stripe` from `lib/stripe-connect.ts`; `getPayment` / `refundPayment` style helpers from `lib/mercado-pago.ts` for the MP refund check.
- Produces:
  - `runReferralDaily(now = new Date()): Promise<{ confirmed: number; cancelled: number; applied: number }>`:
    1. CONFIRMING with `firstChargeAt <= now − 7 days`: cancel if the referred restaurant's `subscriptionStatus` is not `active`/`past_due`, its first charge was refunded (Stripe invoice's charge `amount_refunded > 0`; MP payment `status refunded`), it is self-referral (owner or CNPJ, Global Constraints), or either restaurant is internal; else EARNED (`earnedAt = now`, `amountCents = monthValueCents(referrer tier)`), or CANCELLED "limite do ano" when 12 EARNED/APPLIED already have `earnedAt` in the same `brtYear`. EARNED sends "você ganhou 1 mês grátis" to the referrer's owner.
    2. EARNED rows: `applyEarnedOnStripe(referrerRestaurantId)` when the referrer's owner has `stripeCustomerId` and an active Stripe subscription; MP is Task 6; otherwise they stay EARNED.
  - `applyEarnedOnStripe(restaurantId: string): Promise<number>`: for each EARNED row, `stripe.customers.createBalanceTransaction(customer, { amount: -amountCents, currency: 'brl', description: 'Indicação: 1 mês grátis' }, { idempotencyKey: 'referral-' + id })` → APPLIED with `appliedRef = txn.id`, `appliedAt`.
  - `POST /api/referrals/daily` with `isCronAuthorized` (as `app/api/billing/trial-reminders/route.ts`).

- [ ] **Step 1: Failing tests** (Stripe client mocked; record calls): `after 7 days an active referred restaurant earns and the referrer with Stripe gets one balance credit of -14900`; `run twice: one credit`; `day 3 cancellation → CANCELLED`; `refunded first invoice → CANCELLED`; `same CNPJ as the referrer → CANCELLED`; `13th month of the year → CANCELLED "limite do ano"`; `referrer still in trial: stays EARNED, and the Stripe checkout applies it`; `internal referrer → CANCELLED`; `before 7 days nothing moves`; `daily route needs CRON_SECRET`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Commit** `feat(referral): the free month confirmed after 7 days and applied on Stripe`

### Task 6: Mercado Pago: skip one cycle (only if Task 1 says PASSA)

If `docs/mp-pause-experiment.md` says FALHA: do not implement; leave MP referrers EARNED ("guardado"), write it in `docs/pendencias.md`, and ask the owner (spec).

**Files:**
- Create: `lib/referrals/apply-mp.ts`
- Modify: `lib/referrals/daily.ts` (step 2 for MP referrers; step 3 resumes)
- Test: `__tests__/integration/referrals/mp-skip.test.ts`

**Interfaces:**
- Produces: `applyEarnedOnMp(restaurantId: string, now: Date): Promise<number>` — referrer with an active MP preapproval and no other referral paused: `updatePreApproval(id, 'paused')`, the oldest EARNED → APPLIED with `appliedRef = preapprovalId`, `resumeAt = next_payment_date + 1 day` (as the experiment recorded). `resumeSkipped(now)`: APPLIED MP rows with `resumeAt <= now` and the preapproval paused → status `authorized`; `resumeAt = null`. One paused cycle at a time; the next EARNED waits.
- Locked plan guard: while paused, the referrer's `subscriptionStatus` must stay granting (the sync of a paused preapproval maps to `paused` → the daily job writes nothing over it, and `lib/billing/subscription-sync.ts` keeps the access while a referral holds the pause: test it).

- [ ] **Step 1: Failing tests** (`lib/mercado-pago` mocked): `earned month pauses the preapproval once`; `resume after resumeAt`; `a second earned month waits for the first resume`; `the referrer keeps access while paused by a referral`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(referral): Mercado Pago skips one cycle for a free month`

### Task 7: Owner screen "Indique e ganhe"

**Files:**
- Create: `app/api/referrals/mine/route.ts`, `components/billing/referral-card.tsx`
- Modify: `app/dashboard/billing/page.tsx` (the card under the plan), `app/admin/indicacao/page.tsx` and `app/settings/referral` (redirect to `/dashboard/billing#indique`)
- Test: `__tests__/integration/referrals/mine.test.ts`

**Interfaces:**
- Produces: `GET /api/referrals/mine` (OWNER of the current restaurant only; others 403) → `{ code, link, rule: 'Ganhe 1 mês grátis para cada restaurante que assinar pelo seu link', counts: { trial, confirming, earned, applied, cancelled }, monthsThisYear, items: [{ restaurantName, status, createdAt, earnedAt, appliedAt }] }` (only the referred restaurant's name, no e-mail or phone). Card: link + code, Copiar, WhatsApp (`https://wa.me/?text=` with the link), the rule, the list with the states in Portuguese (Em teste, Pagou: confirmando, Mês ganho (guardado), Mês usado, Cancelada).

- [ ] **Step 1: Failing tests:** `owner gets code and link`; `cashier gets 403`; `items carry no e-mail or phone`.
- [ ] **Step 2–4:** FAIL → implement → PASS; open `/dashboard/billing` in the browser at 390 and 1280 px.
- [ ] **Step 5: Commit** `feat(referral): Indique e ganhe on Minha assinatura`

### Task 8: Plataforma Gastrux > Indicações

**Files:**
- Create: `app/admin/platform/indicacoes/page.tsx`, `app/api/admin/platform/referrals/route.ts`, `app/api/admin/platform/referrals/[id]/route.ts`
- Modify: `lib/navigation/app-nav.ts` (plataforma group: "Indicações"), `__tests__/unit/nav-page-titles.test.ts`
- Test: `__tests__/integration/referrals/platform.test.ts`

**Interfaces:**
- Produces: `GET` (staff via `requirePlatformAdmin`) → rows with both restaurant names, status, dates, `amountCents`, and month totals (`earnedThisMonth`, `estimatedCostCents`); `PATCH [id] { action: 'cancel', reason }` (reason 3–200 chars; only TRIAL/CONFIRMING/EARNED; audit log with the reason).

- [ ] **Step 1: Failing tests:** `a restaurant owner gets 401`; `staff lists`; `cancel needs a reason`; `an APPLIED referral cannot be cancelled`; `cancel writes the audit log`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(referral): Plataforma > Indicações`

### Task 9: Texts, help, AI, manual, runbook

**Files:**
- Modify: `lib/billing/pricing-tiers.ts` or the pricing page (one line "Indique o Gastrux e ganhe 1 mês grátis"), `lib/help/seed-articles.ts` (article `indique-e-ganhe`), `lib/ai/knowledge/planos.ts`, `docs/pendencias.md`
- Test: the existing help/knowledge unit tests

- [ ] **Step 1:** Texts (only what works: Stripe credit; MP per Task 6 outcome; "guardado" until the referrer subscribes).
- [ ] **Step 2:** `npx jest --config jest.unit.config.js` → all pass.
- [ ] **Step 3:** Manual (Claude Doc): the rule, the daily job and its crontab line `0 11 * * * /root/gastrux-cron.sh /api/referrals/daily`, the accountant question (NFS-e with a free month: desconto incondicional on Stripe; charge + refund or pause on MP) before the first real free month.
- [ ] **Step 4: Commit** `docs(referral): help, AI knowledge and pricing line`
