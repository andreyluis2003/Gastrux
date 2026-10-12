# Pagamento na mesa, etapa 2: o cliente vê a conta, divide e paga a sua parte por Pix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At the table, the customer opens the bill from the QR menu (also items launched by the waiter), chooses "Tudo", "Partes iguais" (2 to 20) or "Outro valor", optionally types a CPF, and pays their part by PIX; the screen shows what is left and "Conta paga" when the bill closes by itself (stage 1).

**Architecture:** Two public routes keyed by the table's `qrToken`: `GET /api/public/table/[qrToken]/bill` (read-only bill of that table) and `POST /api/public/table/[qrToken]/pay` (one PIX for one part). The part is computed on the server by a pure module (`lib/comanda/table-share.ts`), shared with the screen for the preview. Each phone carries a random `payerKey` (browser storage); the PIX reuse and "supersede the older PIX" rules of `pix-service` become per phone, so two people never get or cancel each other's PIX. A new plan rule `tablePayment` (Pro, Business, Enterprise) gates the whole feature. No migration: `Payment.tableShareMode`, `customerDocument`, `orderSessionId` exist since stage 1.

**Tech Stack:** Next.js 14 (app router), Prisma 5 + PostgreSQL, Jest (unit: `jest.unit.config.js`; integration: `jest.integration.config.js` against the portable test DB on 127.0.0.1:55432, started with `npm run test:db:start`).

**Spec:** `docs/superpowers/specs/2026-10-10-pagamento-na-mesa-design.md` (this plan is stage 2 of §7, with the owner's change of 2026-10-12: Pro too, not only Business).

## Global Constraints

- Owner decision 2026-10-12: pay at the table on **Pro, Business and Enterprise**; Starter shows "Peça a conta ao garçom". (Replaces spec §3.5 "só Business".)
- The browser never decides amount, restaurant or comanda (spec §5.4): it sends only `qrToken`, the share choice, the CPF and its `payerKey`.
- Parts (spec §5.1): **Tudo** = what is left; **Partes iguais** = `ceil(totalCents / N)`, N from 2 to 20, capped at what is left; **Outro valor** = from R$ 1,00 (100 cents) to what is left.
- `Payment.tableShareMode` values: `ALL`, `EQUAL:<N>`, `AMOUNT` (spec §5.3).
- The CPF goes to `Payment.customerDocument` (11 digits, check digits validated); the NFC-e takes the CPF of the last applied payment that carried one (stage 1, `lib/comanda/table-payment.ts`).
- Money is integer cents in every rule; `Payment.amount` is `Decimal` (reais).
- Copy shown to people is Portuguese (pt-BR); code, comments and commit messages in English.
- No migration in this stage.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; publish with `git push origin HEAD:main` using `GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"` from `C:\Users\andre\gastrux-fix-delivery` (branch `feat/pay-at-table-stage2`).
- Integration suites interfere with each other when run in one process over the same DB: run them per folder with `--runInBand` (vender, caixa, bad-day, api).

## Review Focus

1. **Two phones choose the same equal part at the same moment** (R$ 60,00 in 2: both ask R$ 30,00) — each must get its own PIX; today the reuse rule would hand the second phone the first phone's QR. Pinned in Task 3 (`two phones, same part`).
2. **A phone changes its mind** (asked R$ 30,00, then "Outro valor" R$ 10,00) — only that phone's older PIX is cancelled; another person's pending PIX stays payable. Pinned in Task 3 (`changes its own part only`).
3. **The bill closes while a customer's screen is open** (the last part was paid on another phone) — the screen must say "Conta paga", not "Nenhuma comanda aberta". Pinned in Task 4 (`closed while the screen is open`).
4. **Two people tap "Tudo" and both pay** — both payments are kept (never refused once approved), the bill closes once and the manager gets the "pagou a mais" alert. Pinned in Task 3 (`both pay everything`).
5. **Starter restaurant, or Mercado Pago disconnected** — no pay button on the menu and the server refuses (403 / 409), also on the old route `/api/pagamentos/mp/pix` with `qrToken`. Pinned in Task 1.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/tier-guard.ts` | New feature key `tablePayment` (Task 1) |
| `lib/mercadopago-connect/table-payment-access.ts` (new) | "Can this restaurant take payments at the table?" plan + connection (Task 1) |
| `app/api/public/menu/[qrToken]/route.ts` | `acceptsOnlinePayment` now also needs the plan (Task 1) |
| `lib/billing/pricing-tiers.ts`, `app/pricing/page.tsx` | Pricing lines (Task 1) |
| `lib/comanda/table-share.ts` (new, client-safe) | Part rules, CPF, payerKey, `reais()` (Task 2) |
| `lib/mercadopago-connect/pix-target.ts` | Table target with share, CPF, payerKey, plan check (Task 3) |
| `lib/mercadopago-connect/pix-service.ts` | Reuse and supersede per phone; share mode and CPF on the row (Task 3) |
| `app/api/public/table/[qrToken]/bill/route.ts` (new) | Public bill of one table (Task 4) |
| `app/api/public/table/[qrToken]/pay/route.ts` (new) | One PIX for one part (Task 4) |
| `lib/comanda/public-bill.ts` (new) | What of the bill may be shown to the table (Task 4) |
| `components/menu/table-bill.tsx` (new) | The customer's bill and payment screen (Task 5) |
| `app/menu/[qrToken]/page.tsx` | Opens the bill screen; the old one-shot PIX screen is removed (Task 5) |

---

### Task 1: Plan rule `tablePayment` (Pro, Business, Enterprise)

**Files:**
- Modify: `lib/tier-guard.ts:79-104` (`isTierFeatureEnabled`)
- Create: `lib/mercadopago-connect/table-payment-access.ts`
- Modify: `app/api/public/menu/[qrToken]/route.ts:131-134`
- Modify: `lib/mercadopago-connect/pix-target.ts` (`resolveTable`)
- Modify: `lib/billing/pricing-tiers.ts` (features of pro, business, enterprise), `app/pricing/page.tsx` (comparison rows)
- Test: `__tests__/unit/tier-table-payment.test.ts` (new), `__tests__/integration/api/mp-public-flag.test.ts`, `__tests__/integration/api/mp-pix-route.test.ts`

**Interfaces:**
- Produces: `isTierFeatureEnabled(tier, 'tablePayment')`; `tablePaymentPlanAllows(restaurantId: string): Promise<boolean>`; `tablePaymentEnabled(restaurantId: string): Promise<boolean>` (plan AND active Mercado Pago connection); `TABLE_PAYMENT_UNAVAILABLE: string`.

- [ ] **Step 1: Write the failing tests**

`__tests__/unit/tier-table-payment.test.ts`:

```ts
import { isTierFeatureEnabled } from '@/lib/tier-guard';

describe('pay at the table by plan (owner, 2026-10-12)', () => {
  it.each([['starter', false], ['pro', true], ['business', true], ['enterprise', true], ['PRO', true]])('%s -> %s', (tier, expected) => {
    expect(isTierFeatureEnabled(tier, 'tablePayment')).toBe(expected);
  });
});
```

Append to `__tests__/integration/api/mp-public-flag.test.ts`, inside the `describe`:

```ts
  it('is false on the QR menu of a Starter restaurant, even with Mercado Pago connected (2026-10-12)', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'starter' } });
    try {
      expect((await qr()).restaurant.acceptsOnlinePayment).toBe(false);
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'pro' } });
      expect((await qr()).restaurant.acceptsOnlinePayment).toBe(true);
    } finally {
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'business' } });
    }
  });
```

In `__tests__/integration/api/mp-pix-route.test.ts`, inside `describe('POST /pix (table tab via qrToken)'` (it has the helper `makeTable(restaurantId, ownerId, items)`), add after the first `it`:

```ts
    it('refuses the table PIX of a Starter restaurant (403), the plan is checked on the server (2026-10-12)', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken } = await makeTable(A.restaurantId, A.ownerId, [[1, 10]]);
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'starter' } });
      try {
        const res = await post({ qrToken });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/Peça a conta ao garçom/);
        expect(createConnectPix).not.toHaveBeenCalled();
      } finally {
        await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'business' } });
      }
    });
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx jest -c jest.unit.config.js __tests__/unit/tier-table-payment.test.ts` — Expected: FAIL (`tablePayment` not a feature: pro/business return false).
Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api/mp-public-flag.test.ts __tests__/integration/api/mp-pix-route.test.ts` — Expected: the two new tests FAIL (flag true on Starter; PIX 200 on Starter).

- [ ] **Step 3: Implement**

`lib/tier-guard.ts`: add `'tablePayment'` to the `feature` union and to `featureMap`:

```ts
    // Owner decision 2026-10-12: pay at the table by phone (bill, split, PIX) from Pro
    tablePayment: ['pro', 'business', 'enterprise'],
```

Create `lib/mercadopago-connect/table-payment-access.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { hasActiveConnection } from './connection-service';

/** Shown to the table when the restaurant does not take payments at the table */
export const TABLE_PAYMENT_UNAVAILABLE = 'O pagamento pela mesa não está disponível neste restaurante. Peça a conta ao garçom.';

/** Pay at the table is a Pro, Business and Enterprise feature (owner, 2026-10-12) */
export async function tablePaymentPlanAllows(restaurantId: string): Promise<boolean> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  return isTierFeatureEnabled(r?.subscriptionTier || 'starter', 'tablePayment');
}

/** The plan allows it AND the restaurant's Mercado Pago is connected: only then the menu shows the pay button */
export async function tablePaymentEnabled(restaurantId: string): Promise<boolean> {
  return (await tablePaymentPlanAllows(restaurantId)) && (await hasActiveConnection(restaurantId));
}
```

`app/api/public/menu/[qrToken]/route.ts`: replace the import of `hasActiveConnection` with `import { tablePaymentEnabled } from '@/lib/mercadopago-connect/table-payment-access';` and the flag with:

```ts
        // The pay button of the QR menu: plan (Pro and up) and Mercado Pago connected
        acceptsOnlinePayment: await tablePaymentEnabled(table.restaurant.id),
```

`lib/mercadopago-connect/pix-target.ts`, in `resolveTable`, right after `if (!table) return ...`:

```ts
  if (!(await tablePaymentPlanAllows(table.restaurantId))) {
    return { ok: false, status: 403, error: TABLE_PAYMENT_UNAVAILABLE };
  }
```

with `import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentPlanAllows } from './table-payment-access';`.

`lib/billing/pricing-tiers.ts`: in the `features` of `pro`, `business` and `enterprise`, right after `'Cardápio digital com QR Code',` add `'Conta e pagamento na mesa por Pix',`.

`app/pricing/page.tsx`: in the feature list add `{ category: 'Operação', name: 'Pagamento na mesa (Pix pelo celular)' },` after the `'Cardápio digital com QR Code'` row, and in the values map add:

```ts
    // Owner decision 2026-10-12: from Pro
    'Pagamento na mesa (Pix pelo celular)': tierId !== 'starter',
```

- [ ] **Step 4: Run the tests again**

Same two commands. Expected: PASS. Then `npx tsc --noEmit -p .` — Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/tier-guard.ts lib/mercadopago-connect/table-payment-access.ts "app/api/public/menu/[qrToken]/route.ts" lib/mercadopago-connect/pix-target.ts lib/billing/pricing-tiers.ts app/pricing/page.tsx __tests__/unit/tier-table-payment.test.ts __tests__/integration/api/mp-public-flag.test.ts __tests__/integration/api/mp-pix-route.test.ts
git commit -m "Pay at the table: Pro, Business and Enterprise (owner, 2026-10-12)

The table PIX had no plan check at all. New feature key tablePayment; the
QR menu shows the pay button only with the plan and Mercado Pago
connected, and the server refuses a Starter table (403).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Part rules, CPF and the phone key (`lib/comanda/table-share.ts`)

**Files:**
- Create: `lib/comanda/table-share.ts` (no server imports: the screen uses it too)
- Test: `__tests__/unit/table-share.test.ts`

**Interfaces:**
- Produces:
  - `type ShareMode = 'ALL' | 'EQUAL' | 'AMOUNT'`
  - `MIN_PART_CENTS = 100`, `MAX_PEOPLE = 20`
  - `shareCents(input: { mode: unknown; people?: unknown; amountCents?: unknown }, bill: { totalCents: number; remainingCents: number }): { ok: true; cents: number; mode: ShareMode; label: string } | { ok: false; status: 422; error: string }` — `label` is the `tableShareMode` value (`ALL`, `EQUAL:<N>`, `AMOUNT`).
  - `normalizeCpf(raw: unknown): { ok: true; cpf: string | null } | { ok: false; error: string }` — empty → `cpf: null`.
  - `isValidPayerKey(raw: unknown): raw is string` — `/^[A-Za-z0-9_-]{16,64}$/`.
  - `reais(cents: number): string` — `"R$ 1.234,56"`.

- [ ] **Step 1: Write the failing test**

`__tests__/unit/table-share.test.ts`:

```ts
import { shareCents, normalizeCpf, isValidPayerKey, reais, MAX_PEOPLE } from '@/lib/comanda/table-share';

const bill = (totalCents: number, remainingCents = totalCents) => ({ totalCents, remainingCents });

describe('the part a person pays (spec 2026-10-10 §5.1)', () => {
  it('Tudo is what is left', () => {
    expect(shareCents({ mode: 'ALL' }, bill(10000, 4000))).toEqual({ ok: true, cents: 4000, mode: 'ALL', label: 'ALL' });
  });
  it('equal parts round up, and the last person pays only what is left (never 3 x 33,33 for 100,00)', () => {
    expect(shareCents({ mode: 'EQUAL', people: 3 }, bill(10000))).toMatchObject({ ok: true, cents: 3334, label: 'EQUAL:3' });
    expect(shareCents({ mode: 'EQUAL', people: 3 }, bill(10000, 3332))).toMatchObject({ ok: true, cents: 3332 });
  });
  it('equal parts follow the new total when an item was added after someone paid', () => {
    expect(shareCents({ mode: 'EQUAL', people: 2 }, bill(8000, 5000))).toMatchObject({ ok: true, cents: 4000 });
  });
  it.each([[1], [MAX_PEOPLE + 1], [2.5], ['x'], [undefined]])('equal parts refuse %p people', (people) => {
    expect(shareCents({ mode: 'EQUAL', people }, bill(10000))).toEqual({ ok: false, status: 422, error: 'Escolha de 2 a 20 pessoas.' });
  });
  it('another amount: from R$ 1,00 up to what is left', () => {
    expect(shareCents({ mode: 'AMOUNT', amountCents: 100 }, bill(10000))).toMatchObject({ ok: true, cents: 100, label: 'AMOUNT' });
    expect(shareCents({ mode: 'AMOUNT', amountCents: 99 }, bill(10000))).toEqual({ ok: false, status: 422, error: 'O valor mínimo é R$ 1,00.' });
    expect(shareCents({ mode: 'AMOUNT', amountCents: 4001 }, bill(10000, 4000))).toEqual({ ok: false, status: 422, error: 'O valor passa do que falta pagar (R$ 40,00).' });
    expect(shareCents({ mode: 'AMOUNT', amountCents: 12.5 }, bill(10000))).toMatchObject({ ok: false, status: 422 });
  });
  it('an unknown mode is refused', () => {
    expect(shareCents({ mode: 'ITEMS' }, bill(10000))).toEqual({ ok: false, status: 422, error: 'Escolha como vai pagar.' });
  });
});

describe('CPF on the note', () => {
  it('empty is no CPF', () => expect(normalizeCpf('  ')).toEqual({ ok: true, cpf: null }));
  it('keeps only the digits of a valid CPF', () => expect(normalizeCpf('529.982.247-25')).toEqual({ ok: true, cpf: '52998224725' }));
  it.each(['529.982.247-24', '111.111.111-11', '1234', 123])('refuses %p', (raw) => {
    expect(normalizeCpf(raw)).toEqual({ ok: false, error: 'CPF inválido.' });
  });
});

describe('phone key and money', () => {
  it('accepts a random key and refuses anything else', () => {
    expect(isValidPayerKey('a1B2c3D4e5F6g7H8')).toBe(true);
    expect(isValidPayerKey('short')).toBe(false);
    expect(isValidPayerKey('"payerKey":"x"-----------')).toBe(false);
    expect(isValidPayerKey(undefined)).toBe(false);
  });
  it('formats reais', () => {
    expect(reais(123456)).toBe('R$ 1.234,56');
    expect(reais(5)).toBe('R$ 0,05');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest -c jest.unit.config.js __tests__/unit/table-share.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/comanda/table-share.ts`**

```ts
/**
 * Pay at the table (spec 2026-10-10 §5.1): how much one person pays. Pure and client-safe: the server
 * decides the charge with it and the customer's screen shows the same number before asking.
 */
export type ShareMode = 'ALL' | 'EQUAL' | 'AMOUNT';
export const MIN_PART_CENTS = 100;
export const MAX_PEOPLE = 20;

export type ShareResult = { ok: true; cents: number; mode: ShareMode; label: string } | { ok: false; status: 422; error: string };

export function reais(cents: number): string {
  const [int, dec] = (Math.abs(cents) / 100).toFixed(2).split('.');
  return `${cents < 0 ? '-' : ''}R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

const refuse = (error: string): ShareResult => ({ ok: false, status: 422, error });

export function shareCents(input: { mode: unknown; people?: unknown; amountCents?: unknown }, bill: { totalCents: number; remainingCents: number }): ShareResult {
  const left = bill.remainingCents;
  if (input.mode === 'ALL') return { ok: true, cents: left, mode: 'ALL', label: 'ALL' };
  if (input.mode === 'EQUAL') {
    const n = input.people;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > MAX_PEOPLE) return refuse('Escolha de 2 a 20 pessoas.');
    return { ok: true, cents: Math.min(Math.ceil(bill.totalCents / n), left), mode: 'EQUAL', label: `EQUAL:${n}` };
  }
  if (input.mode === 'AMOUNT') {
    const c = input.amountCents;
    if (typeof c !== 'number' || !Number.isInteger(c)) return refuse('Informe um valor válido.');
    if (c < MIN_PART_CENTS) return refuse('O valor mínimo é R$ 1,00.');
    if (c > left) return refuse(`O valor passa do que falta pagar (${reais(left)}).`);
    return { ok: true, cents: c, mode: 'AMOUNT', label: 'AMOUNT' };
  }
  return refuse('Escolha como vai pagar.');
}

/** CPF typed for the note: optional; when typed, 11 digits with valid check digits */
export function normalizeCpf(raw: unknown): { ok: true; cpf: string | null } | { ok: false; error: string } {
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) return { ok: true, cpf: null };
  if (typeof raw !== 'string') return { ok: false, error: 'CPF inválido.' };
  const d = raw.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return { ok: false, error: 'CPF inválido.' };
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  if (check(9) !== Number(d[9]) || check(10) !== Number(d[10])) return { ok: false, error: 'CPF inválido.' };
  return { ok: true, cpf: d };
}

/** The random key of one phone at the table (kept in its browser): only letters, digits, _ and - */
export function isValidPayerKey(raw: unknown): raw is string {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(raw);
}
```

- [ ] **Step 4: Run it again**

Run: `npx jest -c jest.unit.config.js __tests__/unit/table-share.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/table-share.ts __tests__/unit/table-share.test.ts
git commit -m "Pay at the table: part rules, CPF and phone key

Tudo, equal parts (ceil, capped at what is left) and another amount from
R\$ 1,00; CPF with check digits; the random key of one phone. Pure, so the
customer's screen previews the same number the server charges.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: One PIX per phone and per part (target and service)

**Files:**
- Modify: `lib/mercadopago-connect/pix-target.ts` (`ResolvedPixTarget`, `resolveTable`, `resolvePixTarget`)
- Modify: `lib/mercadopago-connect/pix-service.ts` (`scopeFor`, `newPaymentData`)
- Test: `__tests__/integration/vender/table-split-pix.test.ts` (new); `__tests__/integration/bad-day/table-tab-changes.test.ts` (turn two `it.todo` of "splitting the bill" into pointers, Step 6)

**Interfaces:**
- Consumes: `shareCents`, `normalizeCpf`-checked CPF, `isValidPayerKey` from Task 2; `tablePaymentPlanAllows` from Task 1; `applyTablePayment(restaurantId, paymentId)` from stage 1 (`lib/comanda/table-payment.ts`).
- Produces:
  - `TableShareRequest = { mode: unknown; people?: unknown; amountCents?: unknown; cpf: string | null; payerKey: string }`
  - `resolvePixTarget(input: { orderId?: unknown; qrToken?: unknown; share?: TableShareRequest })` — without `share`, a table target is the old "pay everything" (legacy route, no phone key).
  - `ResolvedPixTarget` gains `payerKey?: string | null`, `shareMode?: string | null`, `customerDocument?: string | null`, `totalCents?: number`, `remainingCents?: number`.

- [ ] **Step 1: Write the failing test**

`__tests__/integration/vender/table-split-pix.test.ts`:

```ts
// @ts-nocheck
/** Pay at the table, stage 2: each phone pays its part with its own PIX (spec 2026-10-10 §5.1, §5.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  cancelConnectPayment: jest.fn(async () => ({})),
}));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { createConnectPix, cancelConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { resolvePixTarget } from '../../../lib/mercadopago-connect/pix-target';
import { createPixForTarget } from '../../../lib/mercadopago-connect/pix-service';
import { applyTablePayment } from '../../../lib/comanda/table-payment';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PHONE_A = 'phoneAAAAAAAAAAAAAAAA';
const PHONE_B = 'phoneBBBBBBBBBBBBBBBB';

describe('splitting the table bill: one PIX per phone and per part', () => {
  let A, table, session, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  let mpSeq = 70000;

  const pay = async (share, payerKey) => {
    const r = await resolvePixTarget({ qrToken: table.qrToken, share: { cpf: null, payerKey, ...share } });
    if (!r.ok) return r;
    return createPixForTarget(r.target, { email: 'cliente@exemplo.com', name: 'Cliente' });
  };
  const approve = async (paymentId) => {
    await prisma.payment.update({ where: { id: paymentId }, data: { status: 'APPROVED' } });
    return applyTablePayment(A.restaurantId, paymentId);
  };
  const rows = () => prisma.payment.findMany({ where: { orderSessionId: session.id }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA; // plan business
    await saveConnection(A.restaurantId, TOKENS);
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Salão ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 5, sectionId: section.id, capacity: 4, qrToken: `split-${tag}-qrtoken` } });
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    createConnectPix.mockImplementation(async () => {
      const id = ++mpSeq;
      return { id, status: 'pending', date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(), point_of_interaction: { transaction_data: { qr_code: `qr-${id}`, qr_code_base64: 'b64', ticket_url: `https://mp/${id}` } } };
    });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    // R$ 60,00 with the service charge off, so the numbers stay round
    session = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 5, status: 'OPEN', serviceChargeWaived: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: burger.id, price: 30, quantity: 2 } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  it('two phones, same part: each gets its own PIX of R$ 30,00 (never the other one\'s QR)', async () => {
    const [a, b] = await Promise.all([pay({ mode: 'EQUAL', people: 2 }, PHONE_A), pay({ mode: 'EQUAL', people: 2 }, PHONE_B)]);
    expect(a.ok && b.ok).toBe(true);
    expect(a.pix.paymentId).not.toBe(b.pix.paymentId);
    expect(a.pix.qrCode).not.toBe(b.pix.qrCode);
    const r = await rows();
    expect(r.map((p) => [Number(p.amount), p.status, p.tableShareMode])).toEqual([[30, 'PENDING', 'EQUAL:2'], [30, 'PENDING', 'EQUAL:2']]);
  });

  it('the same phone asking the same part again gets the same PIX back', async () => {
    const first = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    const again = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    expect(again.pix.paymentId).toBe(first.pix.paymentId);
    expect(createConnectPix).toHaveBeenCalledTimes(1);
  });

  it('changes its own part only: the older PIX of that phone is cancelled, the other person\'s stays payable', async () => {
    const a1 = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    const b1 = await pay({ mode: 'EQUAL', people: 2 }, PHONE_B);
    const a2 = await pay({ mode: 'AMOUNT', amountCents: 1000 }, PHONE_A);
    const byId = Object.fromEntries((await rows()).map((p) => [p.id, p]));
    expect(byId[a1.pix.paymentId].status).toBe('CANCELLED');
    expect(byId[b1.pix.paymentId].status).toBe('PENDING');
    expect(byId[a2.pix.paymentId]).toMatchObject({ status: 'PENDING', tableShareMode: 'AMOUNT' });
    expect(cancelConnectPayment).toHaveBeenCalledTimes(1);
  });

  it('the old "pay everything" route (no phone key) never cancels a phone\'s PIX', async () => {
    const a1 = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    const r = await resolvePixTarget({ qrToken: table.qrToken });
    await createPixForTarget(r.target, { email: 'cliente@exemplo.com', name: 'Cliente' });
    expect((await prisma.payment.findUnique({ where: { id: a1.pix.paymentId } })).status).toBe('PENDING');
  });

  it('keeps the CPF on the payment for the note', async () => {
    const r = await resolvePixTarget({ qrToken: table.qrToken, share: { mode: 'ALL', cpf: '52998224725', payerKey: PHONE_A } });
    const out = await createPixForTarget(r.target, { email: 'cliente@exemplo.com', name: 'Cliente' });
    expect((await prisma.payment.findUnique({ where: { id: out.pix.paymentId } })).customerDocument).toBe('52998224725');
  });

  it('two parts paid close the bill; the second part is what is left after the first', async () => {
    const a = await pay({ mode: 'AMOUNT', amountCents: 2500 }, PHONE_A);
    expect((await approve(a.pix.paymentId)).outcome).toBe('applied');
    const b = await pay({ mode: 'EQUAL', people: 2 }, PHONE_B);
    expect(b.pix.amount).toBe(30); // ceil(6000 / 2), less than the R$ 35,00 left
    await approve(b.pix.paymentId);
    const c = await pay({ mode: 'ALL' }, PHONE_A);
    expect(c.pix.amount).toBe(5);
    expect((await approve(c.pix.paymentId)).outcome).toBe('closed');
    expect((await prisma.orderSession.findUnique({ where: { id: session.id } })).status).toBe('CLOSED');
  });

  it('an item added after someone paid raises what is left', async () => {
    const a = await pay({ mode: 'EQUAL', people: 2 }, PHONE_A);
    await approve(a.pix.paymentId);
    await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: burger.id, price: 20, quantity: 1 } });
    const b = await pay({ mode: 'ALL' }, PHONE_B);
    expect(b.pix.amount).toBe(50); // 80 - 30
  });

  it('both pay everything: both are kept, the bill closes once and the manager is told to refund', async () => {
    const [a, b] = await Promise.all([pay({ mode: 'ALL' }, PHONE_A), pay({ mode: 'ALL' }, PHONE_B)]);
    const first = await approve(a.pix.paymentId);
    const second = await approve(b.pix.paymentId);
    expect([first.outcome, second.outcome].sort()).toEqual(['bill-closed', 'closed']);
    expect((await rows()).filter((p) => p.status === 'APPROVED')).toHaveLength(2);
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId, data: { path: ['kind'], equals: 'table-overpaid' } } })).toBe(1);
  });

  it('refuses a part over what is left, and a phone key that is not one', async () => {
    expect(await pay({ mode: 'AMOUNT', amountCents: 6001 }, PHONE_A)).toMatchObject({ ok: false, status: 422 });
    expect(await resolvePixTarget({ qrToken: table.qrToken, share: { mode: 'ALL', cpf: null, payerKey: 'bad' } })).toMatchObject({ ok: false, status: 422 });
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/table-split-pix.test.ts` — Expected: FAIL (`share` is ignored: same QR reused for both phones, amounts always the full remainder).

- [ ] **Step 3: Implement the target**

In `lib/mercadopago-connect/pix-target.ts`:

```ts
import { isValidPayerKey, shareCents } from '@/lib/comanda/table-share';

/** One person's part of the table bill (stage 2). The CPF is already checked by the route (normalizeCpf). */
export interface TableShareRequest { mode: unknown; people?: unknown; amountCents?: unknown; cpf: string | null; payerKey: string }
```

Add to `ResolvedPixTarget`:

```ts
  /** Pay at the table, stage 2: the phone that asked, the part chosen and the CPF for the note */
  payerKey?: string | null;
  shareMode?: string | null;
  customerDocument?: string | null;
  totalCents?: number;
  remainingCents?: number;
```

Change `resolveTable(qrToken: string)` to `resolveTable(qrToken: string, share?: TableShareRequest)`. Before loading the table, add:

```ts
  if (share && !isValidPayerKey(share.payerKey)) return { ok: false, status: 422, error: 'Recarregue a página e tente de novo.' };
```

and replace its final `return { ok: true, target: {...} }` with:

```ts
  // Stage 2: the part this phone pays; without a share (old route) it is everything that is left
  const part = shareCents(share ?? { mode: 'ALL' }, { totalCents: bill.totalCents, remainingCents: bill.remainingCents });
  if (!part.ok) return part;

  return {
    ok: true,
    target: {
      restaurantId: table.restaurantId,
      amount: part.cents / 100,
      description: `Mesa ${table.number}`,
      orderId: null,
      sessionId: session.id,
      metadata: {
        source: 'table', sessionId: session.id, tableId: table.id, tableNumber: table.number,
        ...(share ? { payerKey: share.payerKey, shareMode: part.label } : {}),
      },
      serviceCents: bill.serviceCents,
      paidCents: bill.paidCents,
      payerKey: share?.payerKey ?? null,
      shareMode: part.label,
      customerDocument: share?.cpf ?? null,
      totalCents: bill.totalCents,
      remainingCents: bill.remainingCents,
    },
  };
```

`resolvePixTarget` becomes:

```ts
export async function resolvePixTarget(input: { orderId?: unknown; qrToken?: unknown; share?: TableShareRequest }): Promise<ResolveResult> {
  if (typeof input.orderId === 'string' && input.orderId) return resolveOrder(input.orderId);
  if (typeof input.qrToken === 'string' && input.qrToken) return resolveTable(input.qrToken, input.share);
  return { ok: false, status: 400, error: 'Informe orderId ou qrToken' };
}
```

- [ ] **Step 4: Implement the service (reuse and supersede per phone)**

In `lib/mercadopago-connect/pix-service.ts` replace `scopeFor` with:

```ts
/**
 * Which pending PIX rows belong to the same payer as this target. A table split in parts (stage 2) has
 * one payer per phone: reuse and "supersede the older PIX" stay inside that phone, so two people never get
 * or cancel each other's QR. The old one-shot table PIX (no phone key) never touches a phone's rows.
 * The key is checked by isValidPayerKey (letters, digits, _ and -), so it is safe inside `contains`.
 */
function scopeFor(target: ResolvedPixTarget) {
  if (target.orderId) return { orderId: target.orderId };
  if (target.payerKey) return { orderSessionId: target.sessionId, metadata: { contains: `"payerKey":"${target.payerKey}"` } };
  return { orderSessionId: target.sessionId, NOT: { metadata: { contains: '"payerKey"' } } };
}
```

In `newPaymentData` replace the `tableShareMode` line and add the CPF:

```ts
    tableShareMode: target.sessionId ? (target.shareMode ?? 'ALL') : null,
    // CPF for the NFC-e of the bill (spec 2026-10-10 §3.4)
    customerDocument: target.customerDocument ?? null,
```

- [ ] **Step 5: Run the tests**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/table-split-pix.test.ts` — Expected: PASS.
Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/bad-day __tests__/integration/api __tests__/integration/vender` — Expected: PASS (the old table PIX behaviour of `table-tab-changes` is unchanged).

- [ ] **Step 6: Point the old split TODOs at the new tests**

In `__tests__/integration/bad-day/table-tab-changes.test.ts`, inside `describe('splitting the bill (a product gap: the feature does not exist)'`, delete these three `it.todo` lines (now covered by `vender/table-split-pix.test.ts` and `unit/table-share.test.ts`):
- `'equal split among N people: the parts add up to the total to the cent ...'`
- `'a tab total changed after a partial payment: ...'`
- `'one PIX per part, each tied to the tab; ...'`

and rename the `describe` to `'splitting the bill: by item and by waiter-typed values (stage 2 covers equal parts and another amount, vender/table-split-pix.test.ts)'`. The two remaining `it.todo` (by item, by waiter-typed values) stay: out of scope (spec §4).

- [ ] **Step 7: Commit**

```bash
git add lib/mercadopago-connect/pix-target.ts lib/mercadopago-connect/pix-service.ts __tests__/integration/vender/table-split-pix.test.ts __tests__/integration/bad-day/table-tab-changes.test.ts
git commit -m "Pay at the table: one PIX per phone and per part

The table target takes the part (Tudo, equal parts, another amount), the
CPF and the phone key. Reuse and 'supersede the older PIX' now stay inside
one phone: two people choosing the same equal part used to get the same
QR, and a new PIX cancelled everybody else's.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Public routes — read the bill, pay a part

**Files:**
- Create: `lib/comanda/public-bill.ts`
- Create: `app/api/public/table/[qrToken]/bill/route.ts`
- Create: `app/api/public/table/[qrToken]/pay/route.ts`
- Test: `__tests__/integration/api/public-table-bill.test.ts`

**Interfaces:**
- Consumes: `loadBill(db, restaurantId, sessionId): Promise<Bill | null>` (`lib/comanda/bill-service.ts`); `tablePaymentEnabled`, `TABLE_PAYMENT_UNAVAILABLE` (Task 1); `normalizeCpf`, `isValidPayerKey` (Task 2); `resolvePixTarget(... share)`, `createPixForTarget` (Task 3).
- Produces:
  - `GET /api/public/table/[qrToken]/bill[?session=<id>]` → `PublicTableBill`:
    `{ status: 'OPEN', sessionId, label, items: Array<{ name: string; quantity: number; totalCents: number }>, subtotalCents, serviceCents, servicePercent, serviceApplies, totalCents, paidCents, remainingCents }`
    or `{ status: 'CLOSED', sessionId, nfceUrl: string | null }` (only when `session` is the comanda of THIS table and it is closed)
    or `{ status: 'NONE' }`. `403 { error }` when the restaurant does not take payments at the table; `404` unknown table.
  - `POST /api/public/table/[qrToken]/pay` body `{ mode, people?, amountCents?, cpf?, payerKey, payerName? }` → `200 { success: true, paymentId, qrCode, qrCodeBase64, ticketUrl, amount, sessionId }`; errors `{ error, code? }` with 403 / 404 / 409 / 422 / 424.

- [ ] **Step 1: Write the failing test**

`__tests__/integration/api/public-table-bill.test.ts`:

```ts
// @ts-nocheck
/** What the table sees and how it pays a part (spec 2026-10-10 §5.1, §5.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(async () => ({ id: 515151, status: 'pending', date_of_expiration: new Date(Date.now() + 1800000).toISOString(), point_of_interaction: { transaction_data: { qr_code: 'QR', qr_code_base64: 'B64', ticket_url: 'https://t' } } })),
}));

import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { GET as getBill } from '../../../app/api/public/table/[qrToken]/bill/route';
import { POST as postPay } from '../../../app/api/public/table/[qrToken]/pay/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const KEY = 'phoneKEY1234567890ab';

describe('public table bill and pay', () => {
  let A, B, tableA, tableB, burger, recipeB;
  const tag = crypto.randomBytes(3).toString('hex');

  const bill = async (qrToken, session?) =>
    getBill(new Request(`https://x/api/public/table/${qrToken}/bill${session ? `?session=${session}` : ''}`) as any, { params: { qrToken } });
  const pay = async (qrToken, body) =>
    postPay(new Request(`https://x/api/public/table/${qrToken}/pay`, { method: 'POST', body: JSON.stringify(body) }) as any, { params: { qrToken } });
  const open = (restaurantId, table, data = {}) =>
    prisma.orderSession.create({ data: { restaurantId, userId: restaurantId === A.restaurantId ? A.ownerId : B.ownerId, tableId: table.id, tableNumber: table.number, status: 'OPEN', ...data } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'https://gastrux.test';
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    const secA = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `S ${tag}`, capacity: 20 } });
    const secB = await prisma.tableSection.create({ data: { restaurantId: B.restaurantId, name: `S ${tag}`, capacity: 20 } });
    tableA = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 3, sectionId: secA.id, capacity: 4, qrToken: `pubA-${tag}-0123456789` } });
    tableB = await prisma.table.create({ data: { restaurantId: B.restaurantId, number: 3, sectionId: secB.id, capacity: 4, qrToken: `pubB-${tag}-0123456789` } });
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `RA-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    recipeB = await prisma.recipe.create({ data: { restaurantId: B.restaurantId, code: `RB-${tag}`, name: `Segredo ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });

  beforeEach(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.nFeDocument.deleteMany({ where: { config: { restaurantId: A.restaurantId } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.nFeDocument.deleteMany({ where: { config: { restaurantId: A.restaurantId } } });
    await prisma.nFeConfig.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  it('shows the bill of this table only, with items launched by the waiter, service charge and what is left', async () => {
    const s = await open(A.restaurantId, tableA);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 25, quantity: 2 } });
    const sB = await open(B.restaurantId, tableB);
    await prisma.orderSessionItem.create({ data: { sessionId: sB.id, recipeId: recipeB.id, price: 99, quantity: 1 } });
    const res = await bill(tableA.qrToken);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: 'OPEN', sessionId: s.id, label: 'Mesa 3', subtotalCents: 5000, totalCents: body.subtotalCents + body.serviceCents, paidCents: 0 });
    expect(body.items).toEqual([{ name: `Burger ${tag}`, quantity: 2, totalCents: 5000 }]);
    expect(JSON.stringify(body)).not.toMatch(/Segredo|userId|restaurantId|cashSession/);
  });

  it('closed while the screen is open: the session of this table says CLOSED with the NFC-e link; another table\'s session says NONE', async () => {
    const s = await open(A.restaurantId, tableA, { status: 'CLOSED', closedAt: new Date() });
    // NFeDocument has no restaurantId of its own: the restaurant comes through its fiscal config
    const config = await prisma.nFeConfig.upsert({
      where: { restaurantId: A.restaurantId },
      update: {},
      create: { restaurantId: A.restaurantId, cnpj: `${Date.now()}`.slice(-14).padStart(14, '2'), nfeApiKey: 'k' },
    });
    await prisma.nFeDocument.create({ data: { configId: config.id, documentType: 'NFCe', documentSeries: 1, documentNumber: Number(`${Date.now()}`.slice(-6)), status: 'authorized', orderSessionId: s.id, qrCodeUrl: 'https://sefaz/consulta?p=1' } });
    const closed = await (await bill(tableA.qrToken, s.id)).json();
    expect(closed).toEqual({ status: 'CLOSED', sessionId: s.id, nfceUrl: 'https://sefaz/consulta?p=1' });
    const sB = await open(B.restaurantId, tableB, { status: 'CLOSED', closedAt: new Date() });
    expect(await (await bill(tableA.qrToken, sB.id)).json()).toEqual({ status: 'NONE' });
    expect(await (await bill(tableA.qrToken)).json()).toEqual({ status: 'NONE' });
  });

  it('a Starter restaurant does not show nor take payments at the table', async () => {
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'starter' } });
    try {
      expect((await bill(tableA.qrToken)).status).toBe(403);
      expect((await pay(tableA.qrToken, { mode: 'ALL', payerKey: KEY })).status).toBe(403);
    } finally {
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'business' } });
    }
  });

  it('pays a part by PIX, linked to the comanda, with the CPF and the share mode', async () => {
    const s = await open(A.restaurantId, tableA, { serviceChargeWaived: true });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 30, quantity: 2 } });
    const res = await pay(tableA.qrToken, { mode: 'EQUAL', people: 3, cpf: '529.982.247-25', payerKey: KEY });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, amount: 20, sessionId: s.id, qrCode: 'QR' });
    expect(await prisma.payment.findUnique({ where: { id: body.paymentId } })).toMatchObject({ orderSessionId: s.id, customerDocument: '52998224725', tableShareMode: 'EQUAL:3' });
  });

  it('refuses what it must, with a message for the customer', async () => {
    expect((await pay(tableA.qrToken, { mode: 'ALL', payerKey: KEY })).status).toBe(409); // no open comanda
    const s = await open(A.restaurantId, tableA);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price: 10, quantity: 1 } });
    const low = await pay(tableA.qrToken, { mode: 'AMOUNT', amountCents: 50, payerKey: KEY });
    expect(low.status).toBe(422);
    expect((await low.json()).error).toBe('O valor mínimo é R$ 1,00.');
    expect((await pay(tableA.qrToken, { mode: 'ALL', cpf: '111.111.111-11', payerKey: KEY })).status).toBe(422);
    expect((await pay(tableA.qrToken, { mode: 'ALL' })).status).toBe(422); // no phone key
    expect((await pay('nao-existe-0123456789', { mode: 'ALL', payerKey: KEY })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api/public-table-bill.test.ts` — Expected: FAIL (route modules not found).

- [ ] **Step 3: Implement `lib/comanda/public-bill.ts`**

```ts
import type { Bill } from './bill-service';

/** What of a bill may be shown to the people at the table (spec 2026-10-10 §5.4): no ids, no staff data */
export interface PublicOpenBill {
  status: 'OPEN';
  sessionId: string;
  label: string;
  items: Array<{ name: string; quantity: number; totalCents: number }>;
  subtotalCents: number;
  serviceCents: number;
  servicePercent: number;
  serviceApplies: boolean;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
}
export type PublicTableBill = PublicOpenBill | { status: 'CLOSED'; sessionId: string; nfceUrl: string | null } | { status: 'NONE' };

export function toPublicBill(bill: Bill): PublicOpenBill {
  return {
    status: 'OPEN',
    sessionId: bill.sessionId,
    label: bill.label,
    items: bill.items.map((i) => ({ name: i.name, quantity: i.quantity, totalCents: i.totalCents })),
    subtotalCents: bill.subtotalCents,
    serviceCents: bill.serviceCents,
    servicePercent: bill.percent,
    serviceApplies: bill.applies && !bill.waived,
    totalCents: bill.totalCents,
    paidCents: bill.paidCents,
    remainingCents: bill.remainingCents,
  };
}
```

- [ ] **Step 4: Implement `app/api/public/table/[qrToken]/bill/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadBill } from '@/lib/comanda/bill-service';
import { toPublicBill, type PublicTableBill } from '@/lib/comanda/public-bill';
import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentEnabled } from '@/lib/mercadopago-connect/table-payment-access';

export const dynamic = 'force-dynamic';

const OPEN = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;
const noStore = { 'Cache-Control': 'no-store' };

/**
 * GET: the open bill of THIS table for the people sitting at it (no login). `?session=<id>` is the comanda
 * the screen was paying: once it closes, the screen is told so (with the NFC-e link) instead of "no bill".
 */
export async function GET(req: NextRequest, { params }: { params: { qrToken: string } }) {
  const table = await prisma.table.findUnique({ where: { qrToken: params.qrToken }, select: { id: true, restaurantId: true } });
  if (!table) return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
  if (!(await tablePaymentEnabled(table.restaurantId))) {
    return NextResponse.json({ error: TABLE_PAYMENT_UNAVAILABLE }, { status: 403, headers: noStore });
  }

  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: [...OPEN] } },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });
  if (session) {
    const bill = await loadBill(prisma, table.restaurantId, session.id);
    if (bill && bill.items.length) return NextResponse.json(toPublicBill(bill) satisfies PublicTableBill, { headers: noStore });
  }

  const asked = new URL(req.url).searchParams.get('session');
  if (asked) {
    const closed = await prisma.orderSession.findFirst({
      where: { id: asked, tableId: table.id, restaurantId: table.restaurantId, status: 'CLOSED' },
      select: { id: true },
    });
    if (closed) {
      const note = await prisma.nFeDocument.findFirst({
        where: { orderSessionId: closed.id, status: 'authorized', config: { restaurantId: table.restaurantId } },
        orderBy: { createdAt: 'desc' },
        select: { qrCodeUrl: true },
      });
      const out: PublicTableBill = { status: 'CLOSED', sessionId: closed.id, nfceUrl: note?.qrCodeUrl ?? null };
      return NextResponse.json(out, { headers: noStore });
    }
  }
  const none: PublicTableBill = { status: 'NONE' };
  return NextResponse.json(none, { headers: noStore });
}
```

- [ ] **Step 5: Implement `app/api/public/table/[qrToken]/pay/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { normalizeCpf, isValidPayerKey } from '@/lib/comanda/table-share';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { createPixForTarget, normalizePayer } from '@/lib/mercadopago-connect/pix-service';
import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentEnabled } from '@/lib/mercadopago-connect/table-payment-access';

export const dynamic = 'force-dynamic';

/**
 * POST: one person pays their part of the table bill by PIX (spec 2026-10-10 §5.4). The browser sends only
 * the choice (mode, people or amount), the optional CPF and its phone key; the amount, the restaurant and
 * the comanda come from the server.
 */
export async function POST(req: NextRequest, { params }: { params: { qrToken: string } }) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!isValidPayerKey(body?.payerKey)) return NextResponse.json({ error: 'Recarregue a página e tente de novo.' }, { status: 422 });
    const cpf = normalizeCpf(body?.cpf);
    if (!cpf.ok) return NextResponse.json({ error: cpf.error }, { status: 422 });

    const table = await prisma.table.findUnique({ where: { qrToken: params.qrToken }, select: { restaurantId: true } });
    if (!table) return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
    if (!(await tablePaymentEnabled(table.restaurantId))) return NextResponse.json({ error: TABLE_PAYMENT_UNAVAILABLE }, { status: 403 });

    const resolved = await resolvePixTarget({
      qrToken: params.qrToken,
      share: { mode: body?.mode, people: body?.people, amountCents: body?.amountCents, cpf: cpf.cpf, payerKey: body.payerKey },
    });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    const result = await createPixForTarget(resolved.target, normalizePayer({ payerName: body?.payerName }));
    if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    return NextResponse.json({ success: true, ...result.pix, sessionId: resolved.target.sessionId });
  } catch (error) {
    console.error('[table pay] failed:', error);
    return NextResponse.json({ error: 'Não foi possível gerar o Pix. Tente de novo.' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api/public-table-bill.test.ts` — Expected: PASS. Then `npx tsc --noEmit -p .` — Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add lib/comanda/public-bill.ts "app/api/public/table/[qrToken]/bill/route.ts" "app/api/public/table/[qrToken]/pay/route.ts" __tests__/integration/api/public-table-bill.test.ts
git commit -m "Pay at the table: public routes to read the bill and pay a part

GET shows the open bill of that table only (items, service charge, paid,
left) and, for the comanda the screen was paying, that it closed with the
NFC-e link. POST charges one part by PIX with the CPF and the phone key.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The customer's screen (bill, split, CPF, PIX)

**Files:**
- Create: `components/menu/table-bill.tsx`
- Modify: `app/menu/[qrToken]/page.tsx` (remove the one-shot PIX screen; open the bill screen)

**Interfaces:**
- Consumes: Task 4 routes; `GET /api/pagamentos/mp/pix/status?paymentId=` (exists: `{ approved: boolean }`); `shareCents`, `reais`, `MAX_PEOPLE` (Task 2).
- Produces: `<TableBill qrToken: string; onClose: () => void />`.

- [ ] **Step 1: Create `components/menu/table-bill.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, Copy, Loader2, QrCode, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MAX_PEOPLE, reais, shareCents, type ShareMode } from '@/lib/comanda/table-share';
import type { PublicTableBill, PublicOpenBill } from '@/lib/comanda/public-bill';

const KEY_STORAGE = 'gastrux-payer-key';

/** The random key of this phone: kept in the browser so a reload keeps its PIX; in memory when storage is blocked */
function payerKey(): string {
  const make = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const kept = localStorage.getItem(KEY_STORAGE);
    if (kept && /^[A-Za-z0-9_-]{16,64}$/.test(kept)) return kept;
    const k = make();
    localStorage.setItem(KEY_STORAGE, k);
    return k;
  } catch {
    return make();
  }
}

type Pix = { paymentId: string; qrCode: string; qrCodeBase64: string; ticketUrl: string; cents: number };

/** Pay at the table (spec 2026-10-10 §5.1): the bill, the part, the CPF and the PIX of this phone */
export function TableBill({ qrToken, onClose }: { qrToken: string; onClose: () => void }) {
  const [bill, setBill] = useState<PublicTableBill | null>(null);
  const [mode, setMode] = useState<ShareMode>('ALL');
  const [people, setPeople] = useState(2);
  const [amountText, setAmountText] = useState('');
  const [cpf, setCpf] = useState('');
  const [busy, setBusy] = useState(false);
  const [pix, setPix] = useState<Pix | null>(null);
  const [paid, setPaid] = useState<{ cents: number } | null>(null);
  const keyRef = useRef<string>('');
  const sessionRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const url = `/api/public/table/${qrToken}/bill${sessionRef.current ? `?session=${encodeURIComponent(sessionRef.current)}` : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Não foi possível abrir a conta'); onClose(); return; }
      if (data.status === 'OPEN') sessionRef.current = data.sessionId;
      setBill(data);
    } catch { /* keep the last bill on a network blip */ }
  }, [qrToken, onClose]);

  useEffect(() => {
    keyRef.current = payerKey();
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load]);

  // The PIX of this phone: asks every 5 s until approved (the QR expires in 30 min)
  useEffect(() => {
    if (!pix) return;
    let stopped = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${encodeURIComponent(pix.paymentId)}`);
        const data = await res.json();
        if (!stopped && data.approved) {
          clearInterval(t);
          setPaid({ cents: pix.cents });
          setPix(null);
          load();
        }
      } catch { /* ignore */ }
    }, 5000);
    const end = setTimeout(() => clearInterval(t), 30 * 60_000);
    return () => { stopped = true; clearInterval(t); clearTimeout(end); };
  }, [pix, load]);

  const open = bill?.status === 'OPEN' ? (bill as PublicOpenBill) : null;
  const amountCents = Math.round(Number(amountText.replace(/\./g, '').replace(',', '.')) * 100);
  const preview = open ? shareCents({ mode, people, amountCents }, open) : null;

  async function payPix() {
    if (!preview?.ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/public/table/${qrToken}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, people, amountCents, cpf, payerKey: keyRef.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.qrCode) { toast.error(data.error || 'Não foi possível gerar o Pix'); load(); return; }
      setPaid(null);
      setPix({ paymentId: data.paymentId, qrCode: data.qrCode, qrCodeBase64: data.qrCodeBase64 || '', ticketUrl: data.ticketUrl || '', cents: Math.round(Number(data.amount) * 100) });
    } catch {
      toast.error('Sem conexão. Tente de novo.');
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-gray-50 p-4 flex justify-center">
      <Card className="p-5 max-w-md w-full h-fit space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{open?.label ?? 'Conta da mesa'}</h1>
          <Button variant="ghost" size="icon" aria-label="Voltar ao cardápio" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        {children}
      </Card>
    </div>
  );

  if (!bill) return shell(<div className="flex items-center gap-2 text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando a conta...</div>);

  if (bill.status === 'CLOSED') {
    return shell(
      <div className="text-center space-y-3">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
        <p className="text-2xl font-bold text-green-700">Conta paga! Obrigado.</p>
        {bill.nfceUrl && <a href={bill.nfceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">Ver a nota fiscal (NFC-e)</a>}
      </div>
    );
  }

  if (!open) return shell(<p className="text-gray-600">Esta mesa ainda não tem conta aberta. Para pagar, peça a conta ao garçom.</p>);

  if (pix) {
    return shell(
      <div className="text-center space-y-3">
        <QrCode className="w-8 h-8 text-blue-600 mx-auto" />
        <p className="text-sm text-gray-600">Pague com Pix</p>
        <p className="text-2xl font-bold text-blue-700">{reais(pix.cents)}</p>
        {pix.qrCodeBase64 ? (
          <img src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code Pix" className="w-48 h-48 mx-auto border rounded-lg p-2 bg-white" />
        ) : pix.ticketUrl ? (
          <a href={pix.ticketUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline text-sm">Abrir o QR Code no Mercado Pago</a>
        ) : null}
        <div className="flex gap-2">
          <input readOnly value={pix.qrCode} className="flex-1 text-xs px-3 py-2 border rounded-md bg-gray-50 truncate" aria-label="Código Pix copia e cola" />
          <Button size="sm" variant="outline" aria-label="Copiar o código Pix" onClick={() => navigator.clipboard.writeText(pix.qrCode).then(() => toast.success('Código Pix copiado!'), () => toast.error('Erro ao copiar'))}><Copy className="h-4 w-4" /></Button>
        </div>
        <p className="flex items-center justify-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Aguardando o pagamento...</p>
        <Button variant="outline" className="w-full" onClick={() => setPix(null)}>Escolher outro valor</Button>
      </div>
    );
  }

  return shell(
    <>
      {paid && (
        <div role="status" className="rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          Pagamento confirmado: {reais(paid.cents)}. Falta {reais(open.remainingCents)}.
        </div>
      )}

      <ul className="divide-y text-sm">
        {open.items.map((i, n) => (
          <li key={n} className="flex justify-between py-1.5"><span>{i.quantity}x {i.name}</span><span>{reais(i.totalCents)}</span></li>
        ))}
      </ul>
      <div className="text-sm space-y-1 border-t pt-2">
        <div className="flex justify-between"><span>Subtotal</span><span>{reais(open.subtotalCents)}</span></div>
        {open.serviceApplies && (
          <>
            <div className="flex justify-between"><span>Taxa de serviço ({open.servicePercent}%)</span><span>{reais(open.serviceCents)}</span></div>
            <p className="text-xs text-gray-500">A taxa de serviço é opcional. Para retirar, fale com o garçom.</p>
          </>
        )}
        <div className="flex justify-between font-bold text-base"><span>Total</span><span>{reais(open.totalCents)}</span></div>
        {open.paidCents > 0 && <div className="flex justify-between text-green-700"><span>Já pago</span><span>{reais(open.paidCents)}</span></div>}
        <div className="flex justify-between font-bold"><span>Falta pagar</span><span>{reais(open.remainingCents)}</span></div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quanto você vai pagar?</p>
        <div className="grid grid-cols-3 gap-2">
          {([['ALL', 'Tudo'], ['EQUAL', 'Partes iguais'], ['AMOUNT', 'Outro valor']] as const).map(([m, label]) => (
            <Button key={m} variant={mode === m ? 'default' : 'outline'} className="text-xs px-1" onClick={() => setMode(m)}>{label}</Button>
          ))}
        </div>
        {mode === 'EQUAL' && (
          <label className="flex items-center justify-between text-sm">
            <span>Dividir entre</span>
            <select value={people} onChange={(e) => setPeople(Number(e.target.value))} className="border rounded-md px-2 py-1">
              {Array.from({ length: MAX_PEOPLE - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n} pessoas</option>)}
            </select>
          </label>
        )}
        {mode === 'AMOUNT' && (
          <Input inputMode="decimal" placeholder="Valor, por exemplo 25,00" value={amountText} onChange={(e) => setAmountText(e.target.value)} aria-label="Valor que você vai pagar" />
        )}
        <Input inputMode="numeric" placeholder="CPF na nota (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} maxLength={14} aria-label="CPF na nota (opcional)" />
      </div>

      {preview && !preview.ok && (mode !== 'AMOUNT' || amountText.trim()) && <p className="text-sm text-red-600">{preview.error}</p>}
      <Button className="w-full h-12 text-base gap-2" disabled={busy || !preview?.ok} onClick={payPix}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
        {preview?.ok ? `Pagar ${reais(preview.cents)} com Pix` : 'Pagar com Pix'}
      </Button>
    </>
  );
}
```

- [ ] **Step 2: Wire it in `app/menu/[qrToken]/page.tsx`**

1. Add `import { TableBill } from '@/components/menu/table-bill';` and the state `const [showBill, setShowBill] = useState(false);`.
2. Delete what only served the one-shot PIX: the state `showPixPayment`, `pixLoading`, `pixData`, `pixPaid`, `pixPolling`, `pixServiceCents`, `orderTotal`; the refs `pixIntervalRef`, `pixTimeoutRef`, `currentPixPaymentIdRef`; `stopPixPolling` and its unmount `useEffect`; `generatePixPayment`; `startPixPolling`; `copyPixCode`; the whole `// Pix Payment Screen` block (`if (showPixPayment && pixData) { ... }`); the `setOrderTotal(cartTotal);` line in `submitOrder`. Remove the icons that become unused from the `lucide-react` import (`Loader2`, `CreditCard`, `Copy`, `CheckCircle`, `QrCode` stay only if still used; run `npx tsc --noEmit -p .` and `npx next lint --file "app/menu/[qrToken]/page.tsx"` to see what is unused).
3. Right after the `if (!menu) { ... }` block add:

```tsx
  // Pay at the table (stage 2): the bill of this table, its split and this phone's PIX
  if (showBill) return <TableBill qrToken={qrToken} onClose={() => setShowBill(false)} />;
```

4. `payCartWithPix` becomes "send the order, then open the bill":

```tsx
  const payCartWithPix = async () => {
    if (cart.length === 0) return;
    const submitted = await submitOrder();
    if (submitted) { setSuccess(false); setShowBill(true); }
  };
```

and its button label stays `Pagar com Pix agora` but the `pixLoading` references become `submitting` (`disabled={submitting || cart.length === 0}`, spinner when `submitting`).

5. In the success screen (`if (success) { ... }`) replace the `Pagar com Pix` button by:

```tsx
            {menu?.restaurant?.acceptsOnlinePayment ? (
              <Button variant="outline" className="w-full" onClick={() => { setSuccess(false); setShowBill(true); }}>
                Ver conta e pagar
              </Button>
            ) : (
              <p className="text-sm text-gray-500">Para pagar, peça a conta ao garçom.</p>
            )}
```

6. In the sticky header, before the cart button, add (only when the restaurant takes payments at the table):

```tsx
            {menu.restaurant.acceptsOnlinePayment && (
              <Button variant="outline" className="shrink-0" onClick={() => setShowBill(true)}>Conta</Button>
            )}
```

(wrap the two buttons in `<div className="flex items-center gap-2 shrink-0">` so the header layout keeps the title on the left).

- [ ] **Step 3: Type check, lint and the unit suite**

Run: `npx tsc --noEmit -p .` — Expected: no output.
Run: `npx next lint --file "app/menu/[qrToken]/page.tsx" --file components/menu/table-bill.tsx` — Expected: no errors.
Run: `npx jest -c jest.unit.config.js` — Expected: all pass.

- [ ] **Step 4: Look at it in a browser before committing**

Run `npm run dev`, open `http://localhost:3000/menu/<qrToken of a test table>` against the local DB (or skip to Task 6 homolog check if the local app has no data), at 390x844 (phone): "Conta" in the header, the bill, the three modes, the preview on the button, the CPF error from the server for `111.111.111-11`.

- [ ] **Step 5: Commit**

```bash
git add components/menu/table-bill.tsx "app/menu/[qrToken]/page.tsx"
git commit -m "Pay at the table: the customer's bill and payment screen

From the QR menu ('Conta' in the header, 'Ver conta e pagar' after an
order) the table sees its bill, including what the waiter launched, picks
Tudo, equal parts or another amount, types an optional CPF and pays by
PIX; it shows what is left and 'Conta paga' when the bill closes. The old
one-shot PIX screen is gone.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification, publish, deploy and validate

**Files:** none new.

- [ ] **Step 1: All suites, per folder**

```bash
npx tsc --noEmit -p .
npx jest -c jest.unit.config.js
npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender
npx jest -c jest.integration.config.js --runInBand __tests__/integration/caixa
npx jest -c jest.integration.config.js --runInBand __tests__/integration/bad-day
npx jest -c jest.integration.config.js --runInBand __tests__/integration/api
```

Expected: everything passes (record the counts).

- [ ] **Step 2: Final review** of the whole branch (`git diff 62e6ea5..HEAD`) by a fresh reviewer; fix what it finds, re-run Step 1.

- [ ] **Step 3: Publish**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes" git push origin HEAD:main
```

Tell the owner: **Deploy homolog, then app; no migration.**

- [ ] **Step 4: Homolog, in the browser (phone size 390x844)** — restaurant "Pizzaria Teste Homolog" (plan business): open the QR menu of a table with an open comanda launched from Vender; "Conta" shows the items, the service charge note, Total / Falta; the three modes change the amount on the button; `111.111.111-11` gives "CPF inválido."; "Pagar ... com Pix" shows the Mercado Pago refusal message (homolog has only test accounts: the PIX cannot be created there, 2026-10-04), not the proxy page. Also: set the homolog restaurant to `starter` in the console, reload the menu: no "Conta" button, the success screen says "peça a conta ao garçom"; set it back to `business`.

- [ ] **Step 5: Production, real money** — on the owner's restaurant (`cmutyjzbm0001qe0jx00zm4rb`, today `starter`): set `subscriptionTier` to `pro` in the app console (and back to `starter` at the end); caixa open; product "Teste R$ 1"; open a table in Vender with 3 x "Teste R$ 1" and remove the service charge in the bill dialog (R$ 3,00). On a phone, "Conta": Partes iguais, 3 pessoas → "Pagar R$ 1,00 com Pix", pay; again on a second phone (or after the first is confirmed, on the same phone) with CPF; the third with "Tudo". Check after each: "Pagamento confirmado: R$ 1,00. Falta R$ X."; after the third: "Conta paga! Obrigado.", the table is free, the bell says "Mesa N paga pelo celular", `/caixa` counts 1 sale and "PIX online R$ 3,00". Refund the three payments with **Estornar** in `/dashboard/pagamentos`; restore `starter`.
