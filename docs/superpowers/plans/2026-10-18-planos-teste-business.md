# Planos novos (teste de 30 dias do Business) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free Starter with a 30-day Business trial, Pro R$ 149 / Business R$ 199, a read-only lock after the trial, a platform "Estender teste" with reason, and every text that mentions the old plans.

**Architecture:** One pure rule `planAccess()` (lib/billing/plan-access.ts) decides trial / paid / internal / locked. New sign-ups are stored as `business` + `trialing`, so every existing plan check reads Business during the trial. The JWT carries `planLocked` (refreshed every 5 min and on `update()`), the middleware answers 402 to writes of a locked restaurant, and the customer-facing order routes check `planAccess` themselves.

**Tech Stack:** Next.js 14 (app router), NextAuth (JWT), Prisma + PostgreSQL, Jest (unit: `jest.unit.config.js`; integration: `jest.integration.config.js`, test DB on 127.0.0.1:55432 via `npm run test:db:start`).

**Spec:** `docs/superpowers/specs/2026-10-18-planos-teste-business-design.md`

## Global Constraints

- Prices: Pro R$ 149/month, R$ 1.639/year; Business R$ 199/month, R$ 2.189/year; Enterprise "sob consulta".
- Limits: monthlySales Pro 1000, Business 3500 (warn only, never block); users Pro 2, Business 5; kitchenStations Pro 2, Business 5, Enterprise 999999; AI questions Pro 50, Business 350, Enterprise null.
- Business-only features: `tablePayment`, `labelExpiry`, `utilityInsights`, `dailyCountAlert` (plus the existing `crmCampaigns`, `loyalty`, `multiLocation`, `advancedReports`).
- Trial: 30 days, `subscriptionTier: 'business'`, `subscriptionStatus: 'trialing'`, `status: 'TRIAL'`, no card.
- `'starter'` stays in the database and means "sem plano" (locked unless internal); it is never shown as a plan.
- Lock message (exact): `Seu teste terminou. Escolha um plano para voltar a vender.` code `PLAN_REQUIRED`, HTTP 402.
- Customer order refusal (exact): `Este restaurante não está recebendo pedidos agora.` code `RESTAURANT_UNAVAILABLE`, HTTP 403.
- Copy rule (exact): `Teste grátis por 30 dias, com tudo do Business. Sem cartão.` No "grátis para sempre", no "Starter", no R$ 99 / R$ 249 anywhere a customer reads.
- Code comments in English, user-facing text in Brazilian Portuguese (repo convention).
- Every user-visible change also updates `lib/ai/knowledge/*.ts` and `lib/help/seed-articles.ts` (a changed default article text needs its OLD sha256 added to `LEGACY_DEFAULT_HASHES`).

## Review Focus

1. A user whose old JWT has no `planCheckedAt` (logged in before the deploy) must not be locked out nor bypass forever: missing claim = not locked until the next refresh (≤ 5 min, the session refetch) → Task 3 test "token without planLocked passes".
2. A paying restaurant whose Stripe/MP status is `past_due` must keep working (card retry window) → Task 1 test `past_due` = paid.
3. A locked restaurant with an open table that pays by phone must still close the bill (money already owed) → Task 4 test "table pay accepted while locked".
4. Extending the trial of a restaurant that already has a paid plan must not downgrade it to a trial → Task 6 test "extend refused with paid plan".
5. A platform admin who is also owner of a locked restaurant must not be locked (he must reach the platform screens and act) → Task 3 test "platform admin never locked".

---

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261018120000_plan_access/migration.sql` | `Restaurant.isInternal`; existing rows → internal, `'starter'` → `'business'` |
| `lib/billing/plan-access.ts` (new) | `planAccess()` pure rule, `restaurantPlanAccess(id)`, `currentRestaurantIdOf(userId)`, `trialEnd(from)`, `LOCK_MESSAGE` |
| `lib/billing/pricing-tiers.ts`, `lib/tier-guard.ts`, `lib/ai/config.ts`, `lib/ai/ask.ts`, `lib/ai/usage.ts` | plan matrix, AI limits, end of the 100 free questions |
| `app/api/signup/route.ts`, `lib/auth.ts` (createUser event) | new restaurants start the trial |
| `lib/auth.ts` (jwt + session callbacks), `middleware.ts`, `components/providers.tsx` | lock claim, 402, session fields, 5-min refetch |
| `lib/billing/order-gate.ts` (new) + 4 order entry points | refuse customer orders when locked |
| `components/billing/plan-banner.tsx` (new), `components/app-shell/app-shell.tsx` | trial / locked bar |
| `lib/admin/trial.ts` (new), `app/api/admin/customers/[id]/trial/route.ts`, `.../internal/route.ts`, `app/admin/customers/[id]/page.tsx`, `app/admin/customers/page.tsx`, `lib/admin/customer-service.ts` | extend trial with reason, internal toggle, list labels |
| `app/api/billing/trial-reminders/route.ts` (new), `lib/billing/trial-reminders.ts` (new) | day 23/27/30 bell + e-mail |
| site, e-mails, app, terms, help, AI files (Task 8) | copy |

---

### Task 1: Plan rule, schema and plan matrix

**Files:**
- Modify: `prisma/schema.prisma` (model `Restaurant`, after `trialEndsAt` ~line 2901)
- Create: `prisma/migrations/20261018120000_plan_access/migration.sql`
- Create: `lib/billing/plan-access.ts`, `lib/billing/plan-lock-text.ts`
- Modify: `lib/billing/pricing-tiers.ts`, `lib/tier-guard.ts:85-108`, `lib/ai/config.ts`, `lib/ai/ask.ts:39-60,152`, `lib/ai/usage.ts:20-30`
- Test: `__tests__/unit/plan-access.test.ts`, `__tests__/unit/plan-matrix.test.ts`

**Interfaces:**
- Produces:
  - `type PlanState = 'internal' | 'trial' | 'paid' | 'locked'`
  - `interface PlanFields { isInternal: boolean; subscriptionTier: string | null; subscriptionStatus: string | null; trialEndsAt: Date | null }`
  - `planAccess(r: PlanFields, now?: Date): { state: PlanState; locked: boolean; daysLeft: number | null }`
  - `restaurantPlanAccess(restaurantId: string, now?: Date): Promise<ReturnType<typeof planAccess> | null>`
  - `currentRestaurantIdOf(userId: string): Promise<string | null>` (same choice as `getCurrentRestaurantId`: `currentRestaurantId` else first active membership by `restaurantId` asc)
  - `trialEnd(from?: Date): Date` (= from + 30 days)
  - `TRIAL_DAYS = 30`, `LOCK_MESSAGE`, `LOCK_CODE = 'PLAN_REQUIRED'`

- [ ] **Step 1: Write the failing tests**

`__tests__/unit/plan-access.test.ts`:
```ts
import { planAccess, trialEnd, TRIAL_DAYS } from '@/lib/billing/plan-access';

const NOW = new Date('2026-10-18T12:00:00Z');
const day = 86_400_000;
const base = { isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: new Date(NOW.getTime() + 10 * day) };

describe('planAccess (spec 2026-10-18 §5)', () => {
  it('internal is never locked, whatever the plan says', () => {
    expect(planAccess({ ...base, isInternal: true, subscriptionTier: 'starter', subscriptionStatus: 'canceled', trialEndsAt: null }, NOW)).toEqual({ state: 'internal', locked: false, daysLeft: null });
  });
  it('trial in time: free, with the days left rounded up', () => {
    expect(planAccess(base, NOW)).toEqual({ state: 'trial', locked: false, daysLeft: 10 });
    expect(planAccess({ ...base, trialEndsAt: new Date(NOW.getTime() + 1) }, NOW).daysLeft).toBe(1);
  });
  it('trial over or without a date: locked', () => {
    expect(planAccess({ ...base, trialEndsAt: new Date(NOW.getTime() - 1) }, NOW).state).toBe('locked');
    expect(planAccess({ ...base, trialEndsAt: null }, NOW).state).toBe('locked');
  });
  it.each(['pro', 'business', 'enterprise'])('paid %s (active or past_due) is free', (tier) => {
    expect(planAccess({ ...base, subscriptionTier: tier, subscriptionStatus: 'active', trialEndsAt: null }, NOW).state).toBe('paid');
    expect(planAccess({ ...base, subscriptionTier: tier, subscriptionStatus: 'past_due', trialEndsAt: null }, NOW).state).toBe('paid');
  });
  it('ended plan ("starter" or canceled) is locked', () => {
    expect(planAccess({ ...base, subscriptionTier: 'starter', subscriptionStatus: 'active', trialEndsAt: null }, NOW).state).toBe('locked');
    expect(planAccess({ ...base, subscriptionTier: 'pro', subscriptionStatus: 'canceled', trialEndsAt: null }, NOW).state).toBe('locked');
  });
  it('trialEnd is 30 days later', () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(trialEnd(NOW).getTime() - NOW.getTime()).toBe(30 * day);
  });
});
```

`__tests__/unit/plan-matrix.test.ts`:
```ts
import { BASE_PRICING_TIERS } from '@/lib/billing/pricing-tiers';
import { hasFeature } from '@/lib/tier-guard';
import { monthlyLimit } from '@/lib/ai/config';

describe('plans of 2026-10-18', () => {
  it('prices and limits', () => {
    const { PRO, BUSINESS, ENTERPRISE } = BASE_PRICING_TIERS as any;
    expect([PRO.priceMonthly, PRO.priceAnnual, BUSINESS.priceMonthly, BUSINESS.priceAnnual]).toEqual([149, 1639, 199, 2189]);
    expect([PRO.limits.monthlySales, BUSINESS.limits.monthlySales]).toEqual([1000, 3500]);
    expect([PRO.limits.users, BUSINESS.limits.users]).toEqual([2, 5]);
    expect([PRO.limits.kitchenStations, BUSINESS.limits.kitchenStations, ENTERPRISE.limits.kitchenStations]).toEqual([2, 5, 999999]);
    expect((BASE_PRICING_TIERS as any).STARTER).toBeUndefined();
  });
  it.each(['tablePayment', 'labelExpiry', 'utilityInsights', 'dailyCountAlert'])('%s is Business and up', (f) => {
    expect(hasFeature('pro', f as any)).toBe(false);
    expect(hasFeature('business', f as any)).toBe(true);
    expect(hasFeature('enterprise', f as any)).toBe(true);
  });
  it('AI questions per month', () => {
    expect([monthlyLimit('pro'), monthlyLimit('business'), monthlyLimit('enterprise')]).toEqual([50, 350, null]);
  });
});
```
(Check the exported name of the feature check in `lib/tier-guard.ts:81`; if it is not `hasFeature`, import the real name.)

- [ ] **Step 2: Run them, expect FAIL** — `npx jest --config jest.unit.config.js __tests__/unit/plan-access.test.ts __tests__/unit/plan-matrix.test.ts` → module not found / wrong numbers.

- [ ] **Step 3: Schema + migration**

`prisma/schema.prisma`, model `Restaurant`, after `trialEndsAt`:
```prisma
  /// Gastrux's own and test accounts (spec 2026-10-18): never locked, behave as Business
  isInternal              Boolean                   @default(false)
```
`prisma/migrations/20261018120000_plan_access/migration.sql` (idempotent: the owner may run it twice):
```sql
-- Plans of 2026-10-18: internal accounts; every restaurant that exists today is a test account
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;
UPDATE "restaurants" SET "isInternal" = true, "subscriptionTier" = CASE WHEN "subscriptionTier" = 'starter' THEN 'business' ELSE "subscriptionTier" END
WHERE "createdAt" < '2026-10-19T00:00:00Z' AND "isInternal" = false;
```
Run `npx prisma generate`.

- [ ] **Step 4: `lib/billing/plan-lock-text.ts` and `lib/billing/plan-access.ts`**
```ts
// lib/billing/plan-lock-text.ts — no imports: the edge middleware reads it
export const LOCK_CODE = 'PLAN_REQUIRED';
export const LOCK_MESSAGE = 'Seu teste terminou. Escolha um plano para voltar a vender.';
```
```ts
import { prisma } from '@/lib/prisma';

/**
 * Who may write (spec 2026-10-18 §5): internal accounts, a trial in time, or a paid plan. Everything else
 * is the read-only lock. 'starter' in the database now means "no plan".
 */
export type PlanState = 'internal' | 'trial' | 'paid' | 'locked';
export interface PlanFields { isInternal: boolean; subscriptionTier: string | null; subscriptionStatus: string | null; trialEndsAt: Date | null }

export const TRIAL_DAYS = 30;
// The texts live in an edge-safe file (no prisma) because middleware.ts imports them
export { LOCK_CODE, LOCK_MESSAGE } from './plan-lock-text';
const PAID_TIERS = ['pro', 'business', 'enterprise'];
const DAY_MS = 86_400_000;

export function trialEnd(from = new Date()): Date {
  return new Date(from.getTime() + TRIAL_DAYS * DAY_MS);
}

export function planAccess(r: PlanFields, now = new Date()): { state: PlanState; locked: boolean; daysLeft: number | null } {
  if (r.isInternal) return { state: 'internal', locked: false, daysLeft: null };
  if (r.subscriptionStatus === 'trialing') {
    if (r.trialEndsAt && r.trialEndsAt.getTime() > now.getTime()) {
      return { state: 'trial', locked: false, daysLeft: Math.ceil((r.trialEndsAt.getTime() - now.getTime()) / DAY_MS) };
    }
    return { state: 'locked', locked: true, daysLeft: 0 };
  }
  if (PAID_TIERS.includes(String(r.subscriptionTier)) && (r.subscriptionStatus === 'active' || r.subscriptionStatus === 'past_due')) {
    return { state: 'paid', locked: false, daysLeft: null };
  }
  return { state: 'locked', locked: true, daysLeft: null };
}

const PLAN_SELECT = { isInternal: true, subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true } as const;

export async function restaurantPlanAccess(restaurantId: string, now = new Date()) {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: PLAN_SELECT });
  return r ? planAccess(r, now) : null;
}

/** The restaurant a user works in, chosen like lib/whatsapp/get-restaurant.ts getCurrentRestaurantId */
export async function currentRestaurantIdOf(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { currentRestaurantId: true, restaurants: { where: { isActive: true }, select: { restaurantId: true }, orderBy: { restaurantId: 'asc' }, take: 1 } },
  });
  return user?.currentRestaurantId ?? user?.restaurants[0]?.restaurantId ?? null;
}
```
(Before writing `currentRestaurantIdOf`, read `lib/whatsapp/get-restaurant.ts:10-45` and copy its exact choice rule if it differs.)

- [ ] **Step 5: Plan matrix**
  - `lib/billing/pricing-tiers.ts`: delete the `STARTER` entry. PRO: `priceMonthly: 149, priceAnnual: 1639`, `limits: { monthlySales: 1000, ingredients: 500, users: 2, recipes: 100, deliveryIntegrations: 1, kitchenStations: 2 }`, features list = `['1.000 vendas por mês','500 ingredientes','2 usuários','NFC-e (nota do consumidor)','Tela da cozinha (KDS) com 2 estações','Cardápio digital com QR Code','Estoque, fichas técnicas e CMV','Clientes com anotações','Etiquetas de manipulação','Assistente com IA: 50 perguntas por mês','Suporte por e-mail']`. BUSINESS: `priceMonthly: 199, priceAnnual: 2189`, `limits.monthlySales: 3500`, `limits.kitchenStations: 5`, `description: 'O mais escolhido: vende mais e perde menos'`, features = `['Tudo do Pro','3.500 vendas por mês','5 usuários','Tela da cozinha (KDS) com 5 estações','Pagamento na mesa pelo celular (Pix e cartão)','Controle de validades com aviso','Indicadores das contas de consumo e aviso de diferença na contagem','Campanhas e programa de fidelidade','Relatórios avançados','Até 2 lojas','Assistente com IA: 350 perguntas por mês','Suporte pelo WhatsApp']`. ENTERPRISE features: replace the stations line, keep `kitchenStations: 999999`, add `'Estações de cozinha ilimitadas'`. Update the header comment: `// Plans of 2026-10-18 (spec planos-teste-business): no free plan; a new restaurant tries Business for 30 days`.
  - `lib/stripe-config.ts`: delete the `STARTER` entry; `getTierLimits` falls back to `STRIPE_PRICING_TIERS.PRO.limits` (comment: `'starter' = no plan; the lock stops writes, reads use Pro limits`).
  - `lib/tier-guard.ts`: `tablePayment`, `labelExpiry`, `dailyCountAlert`, `utilityInsights` → `['business', 'enterprise']`, comment `// Plans of 2026-10-18: what earns or saves money is Business`. `TIER_ORDER` keeps `'starter'` first (it is still a stored value).
  - `lib/ai/config.ts`: `AI_LIMITS = { starter: 0, pro: 50, business: 350, enterprise: null }`; delete `FREE_DAYS` and `FREE_QUESTIONS`.
  - `lib/ai/ask.ts` and `lib/ai/usage.ts`: remove the free-window branch (`inFreeWindow`, `freeUsed`, `free`); questions always count against `monthlyLimit`; the response keeps `free: null` so the chat UI does not break; the usage screen returns `free: null`. Keep the `ai_questions.free` column (history).

- [ ] **Step 6: Run the two tests → PASS; then the whole unit suite** — `npx jest --config jest.unit.config.js` (fix tests that assert the old numbers: search `__tests__` for `99`, `249`, `kitchenStations`, `FREE_QUESTIONS`, `starter: 30`, `tablePayment` and update them to the new matrix) and `npx tsc --noEmit -p .`.

- [ ] **Step 7: Commit** — `git add -A prisma lib __tests__ && git commit -m "feat(plans): plan access rule, isInternal, plans of 2026-10-18"`

---

### Task 2: New sign-ups start the 30-day Business trial

**Files:**
- Modify: `app/api/signup/route.ts:35-59`, `lib/auth.ts` (event `createUser`, ~line 180-195)
- Test: `__tests__/integration/api/signup-trial.test.ts`

**Interfaces:** Consumes `trialEnd()` from Task 1.

- [ ] **Step 1: Failing integration test**
```ts
// @ts-nocheck
/** Plans of 2026-10-18: a new restaurant tries Business for 30 days */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { POST as signup } from '../../../app/api/signup/route';
import { planAccess } from '../../../lib/billing/plan-access';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const email = `trial-${crypto.randomBytes(4).toString('hex')}@gastrux.test`;

afterAll(async () => {
  const u = await prisma.user.findUnique({ where: { email } });
  if (u) { await prisma.restaurantUser.deleteMany({ where: { userId: u.id } }); await prisma.restaurant.deleteMany({ where: { ownerId: u.id } }); await prisma.user.delete({ where: { id: u.id } }); }
});

it('sign-up stores business + trialing + 30 days, not internal', async () => {
  const res = await signup(new Request('https://x/api/signup', { method: 'POST', body: JSON.stringify({ name: 'Ana', email, password: 'SenhaForte#2026', acceptedTerms: true }) }) as any);
  expect(res.status).toBeLessThan(300);
  const r = await prisma.restaurant.findFirst({ where: { owner: { email } } });
  expect(r).toMatchObject({ subscriptionTier: 'business', subscriptionStatus: 'trialing', status: 'TRIAL', isInternal: false });
  const days = (r.trialEndsAt.getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThanOrEqual(30);
  expect(planAccess(r).state).toBe('trial');
});
```
(Read the top of `app/api/signup/route.ts` for the exact body fields and any rate limiter to mock; copy the pattern of the existing signup test in `__tests__/integration` — search `signup` — if there is one.)

- [ ] **Step 2: Run → FAIL** (`subscriptionTier: 'starter'`). `npx jest --config jest.integration.config.js __tests__/integration/api/signup-trial.test.ts` (test DB up: `npm run test:db:start` in the background, wait for port 55432).

- [ ] **Step 3: Implement**
  - `app/api/signup/route.ts`: user `subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: trialEnd()`; restaurant `status: 'TRIAL', subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: trialEnd()` (one `const ends = trialEnd()` used by both). Comment: `// Plans of 2026-10-18: 30 days of Business, no card (lib/billing/plan-access.ts)`.
  - `lib/auth.ts` `createUser` (Google): same values on the user update and on `restaurant.create` (`status: 'TRIAL'` instead of `'ACTIVE'`).

- [ ] **Step 4: Run → PASS.** Also run `__tests__/integration/api` signup-related suites (`npx jest --config jest.integration.config.js signup`).

- [ ] **Step 5: Commit** — `git commit -am "feat(plans): sign-up starts the 30-day Business trial"` (add the new test file).

---

### Task 3: The lock — JWT claim, middleware 402, session fields

**Files:**
- Modify: `lib/auth.ts` (callbacks `jwt`, `session`), `middleware.ts` (API block ~line 195-220), `components/providers.tsx`
- Test: `__tests__/unit/middleware-plan-lock.test.ts`, `__tests__/unit/plan-claim.test.ts`

**Interfaces:**
- Consumes: `currentRestaurantIdOf`, `restaurantPlanAccess`, `LOCK_MESSAGE`, `LOCK_CODE`.
- Produces: token fields `planLocked?: boolean`, `planCheckedAt?: number`; session fields `session.user.planState: PlanState | null`, `session.user.trialDaysLeft: number | null`; exported `refreshPlanClaim(token, now?)` in `lib/billing/plan-claim.ts`; `PLAN_OPEN_API_PREFIXES` exported from `middleware.ts`.

- [ ] **Step 1: Failing tests**

`__tests__/unit/middleware-plan-lock.test.ts` (pattern of `__tests__/unit/middleware-platform-gate.test.ts`):
```ts
/** Plans of 2026-10-18 §6: a locked restaurant reads but does not write */
import { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
jest.mock('next-auth/jwt', () => ({ getToken: jest.fn() }));
import { middleware } from '../../middleware';

const as = (t: Record<string, unknown>) => (getToken as jest.Mock).mockResolvedValue({ sub: 'u1', role: 'OWNER', email: 'dono@r.com', ...t });
const call = (path: string, method = 'POST') => middleware(new NextRequest(new URL(path, 'https://gastrux.com'), { method }));

describe('middleware: plan lock', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s of a locked restaurant answers 402 PLAN_REQUIRED', async (method) => {
    as({ planLocked: true });
    const res = await call('/api/comanda/sessions/s1/items', method);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'Seu teste terminou. Escolha um plano para voltar a vender.', code: 'PLAN_REQUIRED' });
  });
  it('GET still works', async () => {
    as({ planLocked: true });
    expect((await call('/api/comanda/sessions/s1', 'GET')).status).not.toBe(402);
  });
  it.each(['/api/billing/mp/checkout-session', '/api/auth/session', '/api/conta/profile', '/api/support/tickets', '/api/feedback', '/api/notifications/read', '/api/password/reset'])('%s stays open', async (path) => {
    as({ planLocked: true });
    expect((await call(path)).status).not.toBe(402);
  });
  it('not locked, or a token without the claim (logged in before the deploy), passes', async () => {
    as({ planLocked: false });
    expect((await call('/api/comanda/sessions/s1/items')).status).not.toBe(402);
    as({});
    expect((await call('/api/comanda/sessions/s1/items')).status).not.toBe(402);
  });
  it('platform admin never locked', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'equipe@gastrux.com';
    as({ planLocked: true, email: 'equipe@gastrux.com' });
    expect((await call('/api/comanda/sessions/s1/items')).status).not.toBe(402);
  });
});
```

`__tests__/unit/plan-claim.test.ts`:
```ts
jest.mock('@/lib/billing/plan-access', () => ({
  ...jest.requireActual('@/lib/billing/plan-access'),
  currentRestaurantIdOf: jest.fn(async () => 'r1'),
  restaurantPlanAccess: jest.fn(async () => ({ state: 'locked', locked: true, daysLeft: 0 })),
}));
import { refreshPlanClaim, PLAN_CLAIM_TTL_MS } from '@/lib/billing/plan-claim';
import { restaurantPlanAccess } from '@/lib/billing/plan-access';

it('refreshes when missing or older than 5 minutes, keeps it otherwise', async () => {
  const now = 1_000_000_000;
  const t1: any = { id: 'u1' };
  await refreshPlanClaim(t1, { now });
  expect(t1).toMatchObject({ planLocked: true, planCheckedAt: now });
  (restaurantPlanAccess as jest.Mock).mockResolvedValueOnce({ state: 'paid', locked: false, daysLeft: null });
  await refreshPlanClaim(t1, { now: now + PLAN_CLAIM_TTL_MS - 1 });
  expect(t1.planLocked).toBe(true); // still fresh, not read again
  await refreshPlanClaim(t1, { now: now + PLAN_CLAIM_TTL_MS + 1 });
  expect(t1.planLocked).toBe(false);
});
it('force (update() after paying) reads at once; no restaurant = not locked', async () => {
  const t: any = { id: 'u1', planLocked: true, planCheckedAt: Date.now() };
  (restaurantPlanAccess as jest.Mock).mockResolvedValueOnce({ state: 'paid', locked: false, daysLeft: null });
  await refreshPlanClaim(t, { force: true });
  expect(t.planLocked).toBe(false);
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: `lib/billing/plan-claim.ts`**
```ts
import { currentRestaurantIdOf, restaurantPlanAccess } from '@/lib/billing/plan-access';

/** The lock travels in the JWT for the middleware (spec 2026-10-18 §6): read again every 5 minutes or on update() */
export const PLAN_CLAIM_TTL_MS = 5 * 60_000;

export async function refreshPlanClaim(token: Record<string, any>, opts: { now?: number; force?: boolean } = {}) {
  const now = opts.now ?? Date.now();
  if (!token.id) return token;
  if (!opts.force && typeof token.planCheckedAt === 'number' && now - token.planCheckedAt < PLAN_CLAIM_TTL_MS) return token;
  try {
    const rid = await currentRestaurantIdOf(String(token.id));
    const access = rid ? await restaurantPlanAccess(rid, new Date(now)) : null;
    token.planLocked = !!access?.locked;
    token.planCheckedAt = now;
  } catch (error) {
    console.error('[plan-claim] could not read the plan; keeping the previous claim', error);
  }
  return token;
}
```

- [ ] **Step 4: Wire it**
  - `lib/auth.ts` `jwt` callback, before `return token`: `await refreshPlanClaim(token, { force: !!user || trigger === 'update' });`
  - `lib/auth.ts` `session` callback, after `isPlatformAdmin`:
    ```ts
    // The trial / locked bar (components/billing/plan-banner.tsx): read fresh, the JWT claim only feeds the middleware
    const rid = token.id ? await currentRestaurantIdOf(String(token.id)) : null;
    const access = rid ? await restaurantPlanAccess(rid) : null;
    (session.user as any).planState = (session.user as any).isPlatformAdmin ? null : access?.state ?? null;
    (session.user as any).trialDaysLeft = access?.daysLeft ?? null;
    ```
  - `components/providers.tsx`: `<NextAuthSessionProvider refetchInterval={300} refetchOnWindowFocus>` with comment `// Every 5 minutes the JWT reads the plan again (lib/billing/plan-claim.ts)`.
  - `middleware.ts`: next to `PLATFORM_ADMIN_API_PREFIXES`:
    ```ts
    // Plans of 2026-10-18 §6: what a locked restaurant can still do (pay, log in/out, account, support)
    export const PLAN_OPEN_API_PREFIXES = ['/api/auth', '/api/billing', '/api/conta', '/api/password', '/api/support', '/api/feedback', '/api/feature-requests', '/api/notifications', '/api/push-notifications', '/api/signup'];
    const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    ```
    and in the API block after the platform-admin 403 (inside the `try`, with `token` in scope):
    ```ts
    if (token?.planLocked === true && WRITE_METHODS.has(request.method) && !matchesPrefix(pathname, PLAN_OPEN_API_PREFIXES) && !isPlatformAdminToken(token)) {
      return NextResponse.json({ error: LOCK_MESSAGE, code: LOCK_CODE }, { status: 402 });
    }
    ```
    Import `LOCK_MESSAGE`, `LOCK_CODE` from `@/lib/billing/plan-lock-text` (never from `plan-access.ts`: it imports prisma, which the edge middleware cannot load).

- [ ] **Step 5: Run the two tests + `middleware-platform-gate`, `middleware-public-pages`, `middleware-framing` → PASS; `npx tsc --noEmit -p .`.**

- [ ] **Step 6: Commit** — `git commit -m "feat(plans): read-only lock in the JWT and the middleware (402 PLAN_REQUIRED)"`

---

### Task 4: Customer orders refused for a locked restaurant

**Files:**
- Create: `lib/billing/order-gate.ts`
- Modify: `app/api/public/delivery/order/route.ts` (after the restaurant lookup, ~line 48-51), `app/api/public/orders/[qrToken]/route.ts` (after the table lookup, ~line 66-68), `lib/whatsapp/bot.ts` `handleConfirmOrder` (~line 549-556), `app/api/external/orders/webhook/route.ts` (after the signature check, ~line 72, only for `order.new`/`ORDER_RECEIVED`)
- Test: `__tests__/integration/api/plan-lock-orders.test.ts`

**Interfaces:**
- Produces: `restaurantAcceptsOrders(restaurantId: string): Promise<boolean>`, `ORDER_REFUSAL = { error: 'Este restaurante não está recebendo pedidos agora.', code: 'RESTAURANT_UNAVAILABLE' }`.

- [ ] **Step 1: Failing integration test** — one restaurant built with `createMultiRestaurantScenario` (`__tests__/integration/helpers/multi-tenant`), a table with `qrToken`, a menu item on sale (copy the setup of `__tests__/integration/vender/qr-order.test.ts`). Cases:
  - restaurant `subscriptionStatus: 'trialing', trialEndsAt: yesterday, isInternal: false` → QR `POST` 403 `RESTAURANT_UNAVAILABLE`, delivery `POST` 403, external webhook new order 403 (signed like `__tests__/integration` external webhook tests; search `external/orders/webhook`), bot `handleInboundMessage` confirm → reply text equals the refusal and no `orderSession` created (copy `vender/whatsapp-kitchen.test.ts` setup);
  - same restaurant with `trialEndsAt: tomorrow` → QR order 2xx;
  - locked restaurant with an OPEN comanda: `POST /api/public/table/[qrToken]/pay` is NOT refused with `RESTAURANT_UNAVAILABLE` (Review Focus 3; mock `createConnectPix` like `public-table-bill.test.ts`).

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement**
```ts
// lib/billing/order-gate.ts
import { restaurantPlanAccess } from '@/lib/billing/plan-access';

/** Customer orders (QR, delivery site, WhatsApp, external platforms) stop when the plan is locked (spec 2026-10-18 §6) */
export const ORDER_REFUSAL = { error: 'Este restaurante não está recebendo pedidos agora.', code: 'RESTAURANT_UNAVAILABLE' } as const;

export async function restaurantAcceptsOrders(restaurantId: string): Promise<boolean> {
  const access = await restaurantPlanAccess(restaurantId);
  return !!access && !access.locked;
}
```
In each route: `if (!(await restaurantAcceptsOrders(restaurantId))) return NextResponse.json(ORDER_REFUSAL, { status: 403 });`. In the bot: `if (!(await restaurantAcceptsOrders(ctx.restaurantId))) return safeSendText(ctx, ORDER_REFUSAL.error);` before the cart is turned into an order. Do NOT touch `public/table/*`, `/api/pagamentos/mp/webhook`, `/api/billing/webhook`.

- [ ] **Step 4: Run → PASS**, plus `__tests__/integration/vender/qr-order.test.ts`, `whatsapp-kitchen.test.ts`, `__tests__/integration/api/public-table-bill.test.ts` (their restaurants are created without trial fields: `createMultiRestaurantScenario` and inline `restaurant.create` default to `subscriptionTier 'starter'`, `subscriptionStatus 'active'` → **locked**). Fix the fixtures, not the gate: make `createMultiRestaurantScenario` and the inline fixtures create `isInternal: true` (one line in the helper; grep `restaurant.create` in `__tests__/integration` and add `isInternal: true` where an order route is exercised).

- [ ] **Step 5: Commit** — `git commit -m "feat(plans): customer orders refused while the plan is locked"`

---

### Task 5: Trial / locked bar in the app

**Files:**
- Create: `components/billing/plan-banner.tsx`, `lib/billing/plan-banner-text.ts`
- Modify: `components/app-shell/app-shell.tsx` (render the banner once, next to the header), checkout return pages that confirm a payment (search `checkout-session/status` and the MP return in `app/billing` / `app/dashboard/billing`): call `update()` from `useSession` after a confirmed payment
- Test: `__tests__/unit/plan-banner-text.test.ts`

**Interfaces:** Consumes `session.user.planState`, `session.user.trialDaysLeft`. Produces `bannerFor(state, daysLeft): { tone: 'info' | 'warn' | 'danger'; text: string } | null`.

- [ ] **Step 1: Failing unit test**
```ts
import { bannerFor } from '@/lib/billing/plan-banner-text';
it('texts', () => {
  expect(bannerFor('trial', 12)).toEqual({ tone: 'info', text: 'Teste grátis: faltam 12 dias' });
  expect(bannerFor('trial', 1)).toEqual({ tone: 'warn', text: 'Teste grátis: último dia' });
  expect(bannerFor('trial', 3)).toEqual({ tone: 'warn', text: 'Teste grátis: faltam 3 dias' });
  expect(bannerFor('locked', 0)).toEqual({ tone: 'danger', text: 'Teste encerrado: escolha um plano para voltar a vender' });
  expect(bannerFor('paid', null)).toBeNull();
  expect(bannerFor('internal', null)).toBeNull();
  expect(bannerFor(null, null)).toBeNull();
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `bannerFor` (`warn` when `daysLeft <= 7`), and `PlanBanner`: `'use client'`, reads `useSession()`, returns null when `bannerFor` is null; otherwise a full-width bar under the top bar using the same placement as `components/offline-indicator.tsx` (`shellMode` → `top-14`, `md:top-0 md:left-64` in sidebar mode, `z-40`), colors `bg-sky-700` / `bg-amber-600` / `bg-red-700`, text plus a `Link` "Escolher plano" to `/pricing` shown to everyone (the pricing page is public); when `locked` and `session.user.role !== 'OWNER'`, append " Avise o dono do restaurante.". Use `z-30` so the offline bar (z-40) covers it when both show: the offline state matters more at that moment. Leave the content padding as is (the bar is one line, 40 px, over the page top like the offline bar).
- [ ] **Step 4:** In `AppShell`, render `<PlanBanner />` before the `<aside>`; nothing else in the shell changes. After a confirmed checkout (`status === 'approved'` / Stripe success page), `await update()` so the JWT drops the lock at once.
- [ ] **Step 5: Run → PASS; tsc.** Commit `feat(plans): trial and locked bar`.

---

### Task 6: Platform — extend the trial with a reason, internal toggle

**Files:**
- Create: `lib/admin/trial.ts`, `app/api/admin/customers/[id]/trial/route.ts`, `app/api/admin/customers/[id]/internal/route.ts`
- Modify: `app/api/admin/customers/[id]/route.ts` (remove the `extend_trial` action), `lib/admin/customer-service.ts` (delete `extendTrial`; `getCustomerDetails` and the list return `isInternal` and `trialExtensions`), `app/admin/customers/[id]/page.tsx:305-327` (replace the "Estender trial" input; Plano select loses "Starter", gains nothing else), `app/admin/customers/page.tsx:292` ("Teste até DD/MM · estendido N×", badge "Interna")
- Test: `__tests__/unit/admin-trial.test.ts`, `__tests__/integration/admin/trial-extend.test.ts`

**Interfaces:**
- Produces: `extendedTrialEnd(current: Date | null, opts: { days?: number; until?: Date }, now?: Date): Date`; `extendTrial(input: { restaurantId: string; days?: number; until?: string; reason: string; actor: { id: string; email: string } }): Promise<{ ok: true; trialEndsAt: Date } | { ok: false; status: number; error: string }>`; `setInternal(input: { restaurantId: string; isInternal: boolean; reason: string; actor })`. Notes text prefix `Teste estendido` (counted for "estendido N×").

- [ ] **Step 1: Failing unit test** (`extendedTrialEnd`):
```ts
import { extendedTrialEnd } from '@/lib/admin/trial';
const NOW = new Date('2026-10-18T12:00:00Z'); const D = 86_400_000;
it('adds to the current end when it is in the future, else to now', () => {
  expect(extendedTrialEnd(new Date(NOW.getTime() + 5 * D), { days: 7 }, NOW).getTime()).toBe(NOW.getTime() + 12 * D);
  expect(extendedTrialEnd(new Date(NOW.getTime() - 5 * D), { days: 7 }, NOW).getTime()).toBe(NOW.getTime() + 7 * D);
  expect(extendedTrialEnd(null, { days: 15 }, NOW).getTime()).toBe(NOW.getTime() + 15 * D);
});
it('a chosen date is used at the end of that day (Brasília) and must be in the future', () => {
  expect(extendedTrialEnd(null, { until: new Date('2026-11-30T00:00:00-03:00') }, NOW).toISOString()).toBe('2026-12-01T02:59:59.999Z');
  expect(() => extendedTrialEnd(null, { until: new Date('2026-10-01T00:00:00-03:00') }, NOW)).toThrow('A data precisa ser depois de hoje');
});
```
- [ ] **Step 2: Failing integration test** (`__tests__/integration/admin/trial-extend.test.ts`, call the route handlers directly, mock `requirePlatformAdmin` like `__tests__/integration/admin/client-profile.test.ts`):
  - locked trial restaurant + `POST trial {days: 7, reason: 'piloto espetaria'}` → 200, restaurant `trialing`, `business`, `TRIAL`, `trialEndsAt ≈ now+7d`, one `adminLog` (`SYSTEM_CONFIG_CHANGE`, entityType `Restaurant`, changesBefore/After with `trialEndsAt`), one `platformClientNote` starting `Teste estendido até`;
  - missing reason → 400 `Informe o motivo`;
  - `days` not in 1..180 → 400;
  - restaurant with `subscriptionTier 'pro', subscriptionStatus 'active'` → 409 `Este cliente já tem um plano pago` (Review Focus 4);
  - `PATCH internal {isInternal: true, reason}` → `isInternal` true + adminLog + note `Conta interna ligada: <motivo>`;
  - non-platform user → 401 (the guard's own answer).
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement** `lib/admin/trial.ts`:
```ts
import { prisma } from '@/lib/prisma';
import { logAdminAction } from '@/lib/admin-helpers';
import { planAccess } from '@/lib/billing/plan-access';
import { invalidate, cacheKey } from '@/lib/cache'; // use the same imports customer-service.ts uses for invalidate/cacheKey

const DAY_MS = 86_400_000;
export class TrialInputError extends Error {}

/** Extending never makes a client lose days: from the current end when it is still ahead, else from now */
export function extendedTrialEnd(current: Date | null, opts: { days?: number; until?: Date }, now = new Date()): Date {
  if (opts.until) {
    // The last millisecond of the chosen day in Brasília (UTC-3): midnight BRT of the next day is 03:00 UTC
    const brDay = new Date(opts.until.getTime() - 3 * 3_600_000);
    const close = new Date(Date.UTC(brDay.getUTCFullYear(), brDay.getUTCMonth(), brDay.getUTCDate() + 1, 3, 0, 0) - 1);
    if (close.getTime() <= now.getTime()) throw new TrialInputError('A data precisa ser depois de hoje');
    return close;
  }
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(base.getTime() + (opts.days ?? 0) * DAY_MS);
}
```
Then `extendTrial` (validate reason trimmed 3..200 chars, days integer 1..180 or `until`; refuse 409 when `planAccess(r).state === 'paid'`; update `{ trialEndsAt, subscriptionStatus: 'trialing', subscriptionTier: 'business', status: 'TRIAL' }`; `logAdminAction({ userId: actor.id, action: 'SYSTEM_CONFIG_CHANGE', entityType: 'Restaurant', entityId, entityName: name, changesBefore: { trialEndsAt, subscriptionStatus, subscriptionTier }, changesAfter: {...} })`; `platformClientNote.create({ restaurantId, authorEmail: actor.email, text: \`Teste estendido até ${dd/mm/aaaa}: ${reason}\` })`; invalidate the customer cache keys exactly like `updateCustomer`) and `setInternal` (same audit + note `Conta interna ligada: <motivo>` / `Conta interna desligada: <motivo>`). Routes: `requirePlatformAdmin()` → body → helper → JSON; `TrialInputError` → 400.
  UI (`app/admin/customers/[id]/page.tsx`): a "Teste" card with buttons `+7 dias`, `+15 dias`, `+30 dias`, a date input + "Usar data", a required "Motivo" input (buttons disabled while empty), the current "Teste até DD/MM/AAAA" and "estendido N×"; a "Conta interna" switch that asks the reason in a dialog. Hide the trial buttons when the client has a paid plan (show "Plano pago: Pro/Business").
- [ ] **Step 5: Run → PASS** (unit + integration + `__tests__/integration/admin`). tsc.
- [ ] **Step 6: Commit** — `feat(platform): extend trial with reason and internal accounts`.

---

### Task 7: Trial reminders (bell + e-mail on days 23, 27, 30)

**Files:**
- Create: `lib/billing/trial-reminders.ts`, `app/api/billing/trial-reminders/route.ts`
- Test: `__tests__/integration/api/trial-reminders.test.ts`

**Interfaces:** Produces `sendTrialReminders(now?: Date): Promise<{ sent: number }>`; milestones `[7, 3, 1]` days left (day 23, 27, 30 of 30).

- [ ] **Step 1: Failing integration test**: three trial restaurants ending in 6.5 d, 2.5 d and 0.5 d, one ending in 20 d, one internal ending in 2.5 d, one locked; mock `@/lib/email/transactional` `sendTransactionalEmail`. Expect 3 notifications (`data.kind: 'trial-reminder'`, `data.dedupeKey: 'trial-reminder:<rid>:<7|3|1>'`, `actionUrl: '/pricing'`), 3 e-mails to the owners; a second run sends nothing; titles `Faltam 7 dias do seu teste`, `Faltam 3 dias do seu teste`, `Último dia do seu teste`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — select restaurants `isInternal: false, subscriptionStatus: 'trialing', trialEndsAt: { gt: now, lte: now + 7d }` with `owner { email, name }`; milestone = the smallest of `[1,3,7]` that is ≥ ceil(days left); skip when a notification with that dedupeKey exists; create the notification (same shape as `lib/comanda/table-payment-alerts.ts` `notify`: restaurant-wide, `type: 'SYSTEM_INFO'`, `severity: 'MEDIUM'` for 7 days and `'HIGH'` for 3 and 1, `actionUrl: '/pricing'`, `actionLabel: 'Escolher plano'`), then `sendTransactionalEmail({ to, subject: title, html, notificationId })` with html: `<p>Olá, {nome}.</p><p>{title}: o teste do Gastrux com tudo do Business termina em {dd/mm}.</p><p>Escolha um plano para continuar vendendo sem parar: Pro R$ 149 ou Business R$ 199 por mês.</p><p><a href="https://gastrux.com/pricing">Escolher plano</a></p>`; e-mail failure is logged, never throws. Route: `POST`, `isCronAuthorized(req)` else 401, returns `{ sent }`. Middleware: `/api/billing` is already open; the route has no session.
- [ ] **Step 4: Run → PASS.** Commit `feat(plans): trial reminders on days 23, 27 and 30`.

---

### Task 8: Copy everywhere (site, pricing page, e-mails, app, terms, help, AI)

**Files:** every file in spec §9, plus a guard test `__tests__/unit/plan-copy.test.ts`.

- [ ] **Step 1: Failing guard test**
```ts
import fs from 'fs';
import path from 'path';

/** Plans of 2026-10-18: nobody reads about a free plan or the old prices */
const FILES = [
  'app/page.tsx', 'app/pricing/page.tsx', 'app/para/[segmento]/segment-client.tsx', 'lib/marketing/segments.ts',
  'app/lp/[campaign]/ppc-client.tsx', 'lib/marketing/ppc-campaigns.ts', 'app/calculadora/page.tsx',
  'components/marketing/faq-section.tsx', 'components/marketing/how-it-works.tsx', 'components/marketing/trust-section.tsx', 'components/marketing/why-gastrux.tsx',
  'app/api/email/send-welcome/route.ts', 'app/api/email/send-day7/route.ts', 'app/api/email/send-new-user/route.ts',
  'app/dashboard/billing/page.tsx', 'app/conta/cobranca/page.tsx', 'app/conta/page.tsx', 'components/tier/upgrade-banner.tsx', 'components/upgrade-modal.tsx',
  'components/transaction-limit-badge.tsx', 'app/dashboard/usage/page.tsx', 'app/termos/page.tsx',
  'lib/help/seed-articles.ts', 'lib/ai/knowledge/planos.ts', 'lib/ai/knowledge/implantacao.ts', 'lib/ai/knowledge/pagamento-mesa.ts', 'lib/ai/knowledge/vender.ts',
];
const FORBIDDEN = [/gr[aá]tis para sempre/i, /gratuito para sempre/i, /\bStarter\b/, /R\$ ?99\b/, /R\$ ?249\b/, /Come[cç]ar? gr[aá]tis/i, /Comece gr[aá]tis/i, /Plano gr[aá]tis/i, /R\$ ?0\b/];

describe.each(FILES)('%s', (file) => {
  const text = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
  it.each(FORBIDDEN.map((r) => [r.source, r]))('has no %s', (_s, re) => {
    expect(text).not.toMatch(re as RegExp);
  });
});

it('landing and pricing say the trial', () => {
  for (const f of ['app/page.tsx', 'app/pricing/page.tsx']) {
    expect(fs.readFileSync(path.join(process.cwd(), f), 'utf8')).toContain('Teste grátis por 30 dias, com tudo do Business');
  }
});
```
(If a file does not exist, drop it from the list after confirming with `git grep`; run `git grep -nE "Starter|grátis para sempre|R\\$ ?99|R\\$ ?249|Começar Grátis|Comece grátis"` and add any other customer-facing file it finds.)
- [ ] **Step 2: Run → FAIL** (lists every file to change).
- [ ] **Step 3: Rewrite** using these replacements (keep each file's tone; one sentence each):

| Old | New |
|---|---|
| "Começar Grátis" / "Criar Conta Grátis" / "Começar 30 dias grátis" (buttons) | "Testar 30 dias grátis" |
| "Começa grátis, sem cartão" | "30 dias grátis, sem cartão" |
| `{ value: 'R$ 0', label: 'Plano Starter, sem cartão' }` | `{ value: '30 dias', label: 'de teste com tudo do Business' }` |
| "Sem cartão • Sem contrato • Grátis para sempre no Starter" | "Sem cartão • Sem contrato • Teste grátis por 30 dias, com tudo do Business" |
| "Começa grátis em 10 minutos. Se não gostar, volta pro caderno…" | "Teste 30 dias grátis, com tudo do Business. Se não gostar, volta pro caderno, sem custo e sem burocracia." |
| FAQ "O plano Starter é gratuito para sempre…" | "Não. Você testa 30 dias com tudo do Business, sem cartão. Depois escolhe o Pro (R$ 149) ou o Business (R$ 199) por mês; se não escolher, seus dados ficam guardados para consulta." |
| why-gastrux "Todos (Starter 1 estação, Pro 3, Business ilimitado)" | "Pro 2 estações, Business 5, Enterprise ilimitadas" |
| pricing page subtitle "Comece grátis no Starter. Upgrade quando precisar…" | "Teste grátis por 30 dias, com tudo do Business. Sem cartão. Depois, escolha o plano." |

  Pricing page (`app/pricing/page.tsx`): tiers come from `STRIPE_PRICING_TIERS` (Starter already gone after Task 1); remove the `tierId === 'starter'` branches and the "Grátis" price block; mark Business with the badge "Mais escolhido" (reuse the existing popular/badge markup if present; else a `Badge` above the card) and order the cards Business first on mobile (`order-first md:order-none` on the Business card); the comparison table rows that used `tierId !== 'starter'` become plain `true` and the Business-only rows (`Pagamento na mesa`, validades) use `tierId !== 'pro'`; the button of every plan reads "Testar 30 dias grátis" for logged-out visitors and keeps the checkout for logged-in owners.
  Terms (`app/termos/page.tsx`): §2 "(Starter, Pro, Business ou Enterprise)" → "(Pro, Business ou Enterprise)"; §3 last sentence → "Ao se cadastrar, um restaurante é criado automaticamente com 30 dias de teste gratuito, com os recursos do plano Business. Ao fim do teste, sem um plano contratado, a conta fica disponível apenas para consulta e exportação dos dados, até a contratação de um plano." — **show this diff to the owner and wait for OK before committing this file.**
  Help (`lib/help/seed-articles.ts`): articles `como-cancelar` (canceled → "a conta fica só para consulta até contratar de novo", not "volta para o Starter"), `pergunte-ao-gastrux` (Pro 50, Business 350, no 100 free), `convidar-equipe` (Pro 2, Business 5), `usar-kds` (Pro 2, Business 5, Enterprise ilimitadas), `abrir-comanda-lancar-pedido` if it mentions plans; for every article whose `content` changes, add the sha256 of its current text to `LEGACY_DEFAULT_HASHES` (compute with `node -e "console.log(require('crypto').createHash('sha256').update(require('./lib/help/seed-articles').HELP_ARTICLES.find(a=>a.slug==='X').content).digest('hex'))"` via the transpile trick in the 2026-10-17 commit, or by copying the string). Add a new article `teste-gratis` in `faturamento-e-assinatura`: "Como funciona o teste grátis?" (30 days of Business, banner with days left, reminders on days 23/27/30, read-only after, how to choose a plan).
  AI (`lib/ai/knowledge/planos.ts`): rewrite to the §4 table, trial and lock rules; `implantacao.ts`: remove "primeiras 100 perguntas grátis"; `pagamento-mesa.ts`: "Plano Business e Enterprise"; `vender.ts`: stations line "Pro 2, Business 5, Enterprise ilimitadas".
  E-mails: welcome/day7/new-user mention the 30-day Business trial and the date it ends instead of "plano grátis".
- [ ] **Step 4: Run the guard test + `help-seed-articles` + full unit suite → PASS; tsc; `npx next build` if RAM allows (else note it).**
- [ ] **Step 5: Commit** (terms only after the owner's OK) — `feat(plans): copy of the new plans everywhere`.

---

### Task 9: Verify, review, publish and roll out

- [ ] **Step 1:** Full suites: unit, `__tests__/integration/api`, `vender`, `caixa`, `bad-day`, `staff`, `admin`, `multi-tenant` read-isolation shard 1 (`ISOLATION_SHARD=1`), `npx tsc --noEmit -p .`. Fix fixtures that now create locked restaurants (the integration helpers must create `isInternal: true` by default).
- [ ] **Step 2:** Final review by a fresh reviewer (most capable model) over `origin/main..HEAD` with the spec; fix Important findings; minors to the ledger.
- [ ] **Step 3:** Push to main (`GIT_SSH_COMMAND='ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes'`).
- [ ] **Step 4: Owner runbook (homolog):** Deploy `homolog` → console `npx prisma migrate deploy` (20261018120000_plan_access). I check on homolog: new sign-up shows "Teste grátis: faltam 30 dias" and Business features (pagamento na mesa); the owner runs in the homolog console a one-line `node -e` (I write it with the restaurant id) setting that restaurant's `trialEndsAt` to yesterday (the platform screen refuses past dates by design); reload → red bar, "Vender" refused with the lock text, screens open, QR order refused; Plataforma "+7 dias" with reason → unlocked; Mercado Pago checkout shows R$ 149 for Pro.
- [ ] **Step 5: Owner runbook (production):** Stripe dashboard → products Pro and Business → "Add price": Pro R$ 149 monthly, Pro R$ 1.639 yearly, Business R$ 199 monthly, Business R$ 2.189 yearly (BRL, recurring) → copy the 4 `price_…` ids → Easypanel `app` › Ambiente: `STRIPE_PRICE_ID_PRO_MONTHLY`, `STRIPE_PRICE_ID_PRO_ANNUAL`, `STRIPE_PRICE_ID_BUSINESS_MONTHLY`, `STRIPE_PRICE_ID_BUSINESS_ANNUAL`; VPS crontab (same `x-internal-trigger` header the existing lines use, `lib/mercadopago-connect/cron-auth.ts`): `0 12 * * * curl -s -X POST -H "x-internal-trigger: <CRON_SECRET>" https://gastrux.com/api/billing/trial-reminders > /dev/null` (12:00 UTC = 09:00 BRT); Deploy `app` → `npx prisma migrate deploy`. I check gastrux.com landing + /pricing + /ajuda, and that the owner's restaurants are internal (no bar).
- [ ] **Step 6:** Update the manual (Planos paragraph, onboarding script, pendências), the backlog memory, and `lib/stripe-config.ts` default price ids with the 4 new ids (small commit).
