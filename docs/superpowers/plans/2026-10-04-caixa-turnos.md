# Caixa com turnos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Gastrux a real cash register: named registers with one open shift each, every on-the-spot sale recorded per payment method (with change), sangria/suprimento/despesa with printed receipts, blind close with difference alerts, and a shift history.

**Architecture:** New `CashSession` (shift) and `CashSessionEntry` (ledger line) models; `CashRegister` becomes the named point of sale. All money rules live in pure functions in `lib/caixa/rules.ts` (cents only); database operations in `lib/caixa/sessions.ts` and `lib/caixa/sale.ts`; routes are thin. Comanda close and quick sale call `lib/caixa/sale.ts` inside their own transaction.

**Tech Stack:** Next.js 14 App Router, Prisma 6 + PostgreSQL, Jest 30 (unit: `jest.unit.config.js`, integration: `jest.integration.config.js` against the local test DB `127.0.0.1:55432/gastrux_test`), Tailwind + shadcn/ui, `sonner` toasts, browser printing via `lib/print/print-frame.ts`.

**Spec:** `docs/superpowers/specs/2026-10-04-caixa-turnos-design.md`

## Global Constraints

- All money in integer **cents**; UI input in reais with at most 2 decimals; zero, negative or more decimals = `400`.
- Payment method strings accepted by the API: `dinheiro`, `pix`, `cartao de credito`, `cartao de debito`, `outros` (also the enum names `CASH`, `PIX`, `CREDIT`, `DEBIT`, `OTHER`).
- Counted / expected / difference JSON keys: `dinheiro`, `pix`, `credito`, `debito`, `outros`.
- Difference alert when `|difference| > max(2000 cents, 2% of expected)` in any method.
- Forgotten shift alert after **16 h** open.
- Expense categories: `compras`, `entregador`, `outros`.
- Roles: open, close, receive, sangria, suprimento = `OWNER`, `MANAGER`, `CASHIER`, `ADMIN`; expense, adjustment, forced sangria, register management, full history = `OWNER`, `MANAGER`, `ADMIN`.
- Every query scoped by `restaurantId`; another restaurant's record = `404`.
- Write routes wrapped with `idempotent()` from `lib/api/idempotency.ts`.
- One `OPEN` shift per register, enforced by a partial unique index.
- Comments and identifiers in English, user-facing text in Portuguese (repository convention).
- Files with CRLF endings stay CRLF (edit with the Edit tool or preserve `\r\n` in scripts).
- Run integration tests with `npx jest --config jest.integration.config.js --testPathPatterns <pattern>`; the test DB must be running (`npm run test:db:status`, `npm run test:db:start`) and `.env.test` present.

## Review Focus

1. **A comanda closed twice from two devices at the same time** — only one close records receipts; the second gets `409` or the original response (idempotency covers the same key; different keys must hit the `status: OPEN` guard inside the transaction). Test in Task 10.
2. **Shift closed while a sale is in flight** (online, not offline) — the sale must be refused with `409 CASH_SESSION_REQUIRED`, never silently recorded as late; only replays carrying `Idempotency-Key` may land late. Test in Task 10.
3. **Cashier polling `GET /current` during the shift must never be shown the expected cash or a running cash balance** (they still see their own entries and sales). The view returns `expected: null` and no balance field for cashiers. Test in Task 4.
4. **Device remembers a register that was deactivated or belongs to another restaurant** (shared tablet, login change) — the UI must fall back to the default register instead of showing an error loop. Test in Task 7 (unit test of `pickRegister`).
5. **Rounding with quantities and modifiers** (e.g. 3 × R$ 10,33 + R$ 0,50 modifier) — the cash total must equal the comanda total the receipt and NFC-e use (`lib/comanda/line-total.ts`). Test in Task 10.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `CashSession`, `CashSessionEntry`, enums; `CashRegister` cleanup |
| `prisma/migrations/20261005120000_cash_sessions/migration.sql` | tables, enums, partial unique index, default registers |
| `lib/caixa/payment-methods.ts` | method enum, string ↔ enum, JSON keys, labels |
| `lib/caixa/rules.ts` | pure money rules (cents, settlement, expected, difference, alerts, cash count) |
| `lib/caixa/roles.ts` | `CASHIER_PLUS`, `MANAGER_PLUS` |
| `lib/caixa/alerts.ts` | notifications: difference, late entry, sale without shift, forgotten shift |
| `lib/caixa/sessions.ts` | registers, open, view, entries, close, adjust, history |
| `lib/caixa/sale.ts` | record / reverse sale entries inside a caller's transaction; comanda total |
| `app/api/caixa/registers/route.ts`, `registers/[id]/route.ts` | register list / create / update |
| `app/api/caixa/sessions/route.ts` | open (POST), history (GET) |
| `app/api/caixa/sessions/current/route.ts` | current shift view |
| `app/api/caixa/sessions/[id]/route.ts` | shift detail |
| `app/api/caixa/sessions/[id]/entries/route.ts` | sangria / suprimento / despesa / ajuste |
| `app/api/caixa/sessions/[id]/close/route.ts` | blind close |
| `app/api/print/cash-entry/[id]/route.ts`, `app/api/print/cash-session/[id]/route.ts` | print data |
| `app/imprimir/caixa/lancamento/[id]/page.tsx`, `app/imprimir/caixa/fechamento/[id]/page.tsx` | 80 mm receipts |
| `lib/caixa/device-register.ts` | which register this device uses (localStorage) |
| `components/caixa/*` | money input, entry dialog, close dialog, cash counter, payment panel, open-shift card |
| `app/caixa/page.tsx`, `app/caixa/historico/page.tsx`, `app/caixa/historico/[id]/page.tsx` | screens |
| `app/api/comanda/sessions/[id]/route.ts`, `app/api/comanda/quick-sale/route.ts` | sales with payments |
| `app/comanda/[sessionId]/page.tsx`, `components/comanda/counter-sale.tsx` | payment panel in the UI |

Removed: `app/api/caixa/route.ts`, `app/api/caixa/[id]/route.ts`, `app/api/caixa/reconciliacao/route.ts`, `app/api/caixa/movimentos/route.ts`.

---

# Etapa 1 — Base

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (models `CashRegister` at ~1814, `CashMovement`, `CashTransaction`; enums at the end)
- Create: `prisma/migrations/20261005120000_cash_sessions/migration.sql`
- Test: `__tests__/integration/caixa/schema.test.ts`

**Interfaces:**
- Produces: Prisma models `cashSession`, `cashSessionEntry`; enums `CashSessionStatus { OPEN CLOSED }`, `CashEntryType { RECEIPT CHANGE WITHDRAWAL SUPPLY EXPENSE REFUND ADJUSTMENT }`, `CashMethod { CASH PIX CREDIT DEBIT OTHER }`, `CashDirection { IN OUT }`; `CashRegister.isDefault Boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/caixa/schema.test.ts
// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash sessions schema', () => {
  let A: any;
  let B: any;
  let register: any;
  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA;
    B = s.restaurantB;
    register = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: 'Caixa teste', isDefault: true } });
  });
  afterAll(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
  });

  it('allows only one OPEN shift per register (partial unique index)', async () => {
    const base = { restaurantId: A.restaurantId, cashRegisterId: register.id, openedById: A.ownerId, openingFloatCents: 0 };
    const first = await prisma.cashSession.create({ data: { ...base, status: 'OPEN' } });
    await expect(prisma.cashSession.create({ data: { ...base, status: 'OPEN' } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.cashSession.update({ where: { id: first.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    await expect(prisma.cashSession.create({ data: { ...base, status: 'OPEN' } })).resolves.toBeTruthy();
  });

  it('stores ledger lines in cents with method and direction', async () => {
    const session = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' } });
    const entry = await prisma.cashSessionEntry.create({
      data: { restaurantId: A.restaurantId, cashSessionId: session.id, type: 'ADJUSTMENT', method: 'CASH', amountCents: 150, direction: 'IN', createdById: A.ownerId },
    });
    expect(entry).toMatchObject({ amountCents: 150, direction: 'IN', afterClose: false });
  });
});
```


- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns caixa/schema`
Expected: FAIL — `prisma.cashSession` is undefined / `isDefault` unknown argument.

- [ ] **Step 3: Edit the schema**

In `prisma/schema.prisma`, replace `model CashRegister { ... }` with:

```prisma
model CashRegister {
  id           String        @id @default(cuid())
  name         String
  description  String?
  active       Boolean       @default(true)
  isDefault    Boolean       @default(false)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  restaurantId String?
  // Legacy shift fields, unused since the cash sessions (2026-10-05); dropped once the legacy tables are empty
  openingBalance  Decimal   @default(0)
  expectedBalance Decimal   @default(0)
  actualBalance   Decimal   @default(0)
  openedAt        DateTime?
  closedAt        DateTime?
  movements    CashMovement[]
  transactions CashTransaction[]
  sessions     CashSession[]

  @@index([restaurantId])
  @@map("cash_registers")
}

model CashSession {
  id                String            @id @default(cuid())
  restaurantId      String
  cashRegisterId    String
  status            CashSessionStatus @default(OPEN)
  openedById        String
  openedAt          DateTime          @default(now())
  openingFloatCents Int               @default(0)
  closedById        String?
  closedAt          DateTime?
  countedCents      Json?
  expectedCents     Json?
  differenceCents   Json?
  closingNotes      String?
  lateEntries       Int               @default(0)
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  cashRegister      CashRegister      @relation(fields: [cashRegisterId], references: [id])
  entries           CashSessionEntry[]

  @@index([restaurantId])
  @@index([cashRegisterId])
  @@index([openedAt])
  @@map("cash_sessions")
}

model CashSessionEntry {
  id             String         @id @default(cuid())
  restaurantId   String
  cashSessionId  String
  type           CashEntryType
  method         CashMethod
  amountCents    Int
  direction      CashDirection?
  category       String?
  description    String?
  orderSessionId String?
  createdById    String
  afterClose     Boolean        @default(false)
  createdAt      DateTime       @default(now())
  cashSession    CashSession    @relation(fields: [cashSessionId], references: [id], onDelete: Cascade)

  @@index([cashSessionId])
  @@index([restaurantId])
  @@index([orderSessionId])
  @@map("cash_session_entries")
}
```

Add at the end of the enums:

```prisma
enum CashSessionStatus {
  OPEN
  CLOSED
}

enum CashEntryType {
  RECEIPT
  CHANGE
  WITHDRAWAL
  SUPPLY
  EXPENSE
  REFUND
  ADJUSTMENT
}

enum CashMethod {
  CASH
  PIX
  CREDIT
  DEBIT
  OTHER
}

enum CashDirection {
  IN
  OUT
}
```

(The legacy `CashMovement` / `CashTransaction` models stay untouched; the spec drops the legacy columns only when those tables are empty, which is a manual step after production confirms it.)

- [ ] **Step 4: Write the migration**

Generate the SQL skeleton against the test DB, then add the hand-written parts:

Run: `npx dotenv -e .env.test -- prisma migrate dev --create-only --name cash_sessions` and rename the folder to `20261005120000_cash_sessions` if the timestamp differs. Then make `migration.sql`:

```sql
-- Cash sessions (spec docs/superpowers/specs/2026-10-04-caixa-turnos-design.md)
-- BEFORE deploying, run in production and keep the numbers in the deploy notes:
--   SELECT count(*) FROM cash_movements;      -- expected 0 (no screen ever created rows)
--   SELECT count(*) FROM cash_transactions;   -- expected 0
--   SELECT count(*) FROM cash_registers;      -- registers that will be kept and named

CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "CashEntryType" AS ENUM ('RECEIPT', 'CHANGE', 'WITHDRAWAL', 'SUPPLY', 'EXPENSE', 'REFUND', 'ADJUSTMENT');
CREATE TYPE "CashMethod" AS ENUM ('CASH', 'PIX', 'CREDIT', 'DEBIT', 'OTHER');
CREATE TYPE "CashDirection" AS ENUM ('IN', 'OUT');

ALTER TABLE "cash_registers" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "cash_sessions" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "cashRegisterId" TEXT NOT NULL,
  "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
  "openedById" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingFloatCents" INTEGER NOT NULL DEFAULT 0,
  "closedById" TEXT,
  "closedAt" TIMESTAMP(3),
  "countedCents" JSONB,
  "expectedCents" JSONB,
  "differenceCents" JSONB,
  "closingNotes" TEXT,
  "lateEntries" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cash_sessions_restaurantId_idx" ON "cash_sessions"("restaurantId");
CREATE INDEX "cash_sessions_cashRegisterId_idx" ON "cash_sessions"("cashRegisterId");
CREATE INDEX "cash_sessions_openedAt_idx" ON "cash_sessions"("openedAt");
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_cashRegisterId_fkey" FOREIGN KEY ("cashRegisterId") REFERENCES "cash_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- One open shift per register (Prisma cannot express a partial index)
CREATE UNIQUE INDEX "cash_sessions_one_open_per_register" ON "cash_sessions"("cashRegisterId") WHERE "status" = 'OPEN';

CREATE TABLE "cash_session_entries" (
  "id" TEXT NOT NULL,
  "restaurantId" TEXT NOT NULL,
  "cashSessionId" TEXT NOT NULL,
  "type" "CashEntryType" NOT NULL,
  "method" "CashMethod" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "direction" "CashDirection",
  "category" TEXT,
  "description" TEXT,
  "orderSessionId" TEXT,
  "createdById" TEXT NOT NULL,
  "afterClose" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cash_session_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_session_entries_amount_positive" CHECK ("amountCents" > 0)
);
CREATE INDEX "cash_session_entries_cashSessionId_idx" ON "cash_session_entries"("cashSessionId");
CREATE INDEX "cash_session_entries_restaurantId_idx" ON "cash_session_entries"("restaurantId");
CREATE INDEX "cash_session_entries_orderSessionId_idx" ON "cash_session_entries"("orderSessionId");
ALTER TABLE "cash_session_entries" ADD CONSTRAINT "cash_session_entries_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Registers without a restaurant cannot be used (no screen ever created them)
UPDATE "cash_registers" SET "active" = false WHERE "restaurantId" IS NULL;
-- The oldest active register of each restaurant becomes its default
UPDATE "cash_registers" r SET "isDefault" = true
FROM (SELECT DISTINCT ON ("restaurantId") "id" FROM "cash_registers" WHERE "restaurantId" IS NOT NULL AND "active" = true ORDER BY "restaurantId", "createdAt") d
WHERE r."id" = d."id";
-- Every restaurant without one gets "Caixa principal"
INSERT INTO "cash_registers" ("id", "name", "active", "isDefault", "restaurantId", "createdAt", "updatedAt")
SELECT 'cr_' || md5(random()::text || r."id"), 'Caixa principal', true, true, r."id", now(), now()
FROM "restaurants" r
WHERE NOT EXISTS (SELECT 1 FROM "cash_registers" c WHERE c."restaurantId" = r."id" AND c."active" = true);
```

Check the restaurant table name with `grep -n "@@map(\"restaurants\")" prisma/schema.prisma` before running; use the mapped name.

- [ ] **Step 5: Apply to the test DB and regenerate the client**

Run: `npx dotenv -e .env.test -- prisma migrate deploy` then `npx prisma generate`
Expected: "1 migration applied"; client regenerated.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest --config jest.integration.config.js --testPathPatterns caixa/schema`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261005120000_cash_sessions __tests__/integration/caixa/schema.test.ts
git commit -m "Caixa: cash sessions and ledger entries (schema + migration)"
```

---

### Task 2: Pure rules and payment methods

**Files:**
- Create: `lib/caixa/payment-methods.ts`, `lib/caixa/rules.ts`, `lib/caixa/roles.ts`
- Test: `__tests__/unit/caixa-rules.test.ts`

**Interfaces:**
- Produces (exact):

```ts
// lib/caixa/payment-methods.ts
export type CashMethod = 'CASH' | 'PIX' | 'CREDIT' | 'DEBIT' | 'OTHER';
export type MethodKey = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros';
export type ByMethod = Record<CashMethod, number>;
export type Keyed = Record<MethodKey, number>;
export const CASH_METHODS: CashMethod[];
export const METHOD_KEY: Record<CashMethod, MethodKey>;
export const METHOD_LABEL: Record<CashMethod, string>;
export function toCashMethod(input: unknown): CashMethod | null;
export function toNfcePaymentMethod(method: CashMethod): string;
export function emptyByMethod(): ByMethod;
export function toKeyed(values: ByMethod): Keyed;
export function fromKeyed(values: Partial<Record<MethodKey, unknown>>, parse: (v: unknown) => number): ByMethod;

// lib/caixa/rules.ts
export class CashRuleError extends Error { status: number; code?: string }
export function parseAmountCents(value: unknown, field?: string): number;      // > 0
export function parseCountedCents(value: unknown, field?: string): number;     // >= 0
export interface PaymentInput { method: unknown; amount: unknown }
export interface SettledPayment { receipts: ByMethod; changeCents: number; paidCents: number; primaryMethod: CashMethod }
export function settlePayments(totalCents: number, payments: PaymentInput[]): SettledPayment;
export type EntryType = 'RECEIPT' | 'CHANGE' | 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE' | 'REFUND' | 'ADJUSTMENT';
export interface EntryLike { type: EntryType; method: CashMethod; amountCents: number; direction?: 'IN' | 'OUT' | null; orderSessionId?: string | null }
export function entryEffect(entry: EntryLike): number;
export function expectedByMethod(openingFloatCents: number, entries: EntryLike[]): ByMethod;
export function differenceByMethod(counted: ByMethod, expected: ByMethod): ByMethod;
export const ALERT_MIN_CENTS = 2000;
export const ALERT_RATIO = 0.02;
export const FORGOTTEN_SHIFT_HOURS = 16;
export const EXPENSE_CATEGORIES: readonly ['compras', 'entregador', 'outros'];
export function exceedsAlert(expectedCents: number, differenceCents: number): boolean;
export function methodsOverAlert(expected: ByMethod, difference: ByMethod): CashMethod[];
export const DENOMINATIONS_CENTS: number[];
export function countCash(counts: Record<string, number>): number;
export interface SalesSummary { byMethod: ByMethod; salesCount: number; totalCents: number; averageTicketCents: number }
export function salesSummary(entries: EntryLike[]): SalesSummary;

// lib/caixa/roles.ts
export const CASHIER_PLUS: RestaurantRole[]; // ['OWNER','MANAGER','CASHIER','ADMIN']
export const MANAGER_PLUS: RestaurantRole[]; // ['OWNER','MANAGER','ADMIN']
export function isManager(role: RestaurantRole): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/unit/caixa-rules.test.ts
import {
  settlePayments, expectedByMethod, differenceByMethod, methodsOverAlert, exceedsAlert,
  parseAmountCents, parseCountedCents, countCash, salesSummary, entryEffect, CashRuleError,
} from '../../lib/caixa/rules';
import { toCashMethod, toNfcePaymentMethod, toKeyed, fromKeyed, emptyByMethod } from '../../lib/caixa/payment-methods';

describe('payment methods', () => {
  it.each([
    ['dinheiro', 'CASH'], ['pix', 'PIX'], ['cartao de credito', 'CREDIT'], ['cartao de debito', 'DEBIT'],
    ['outros', 'OTHER'], ['CREDIT', 'CREDIT'], [' Dinheiro ', 'CASH'],
  ])('%s -> %s', (input, expected) => expect(toCashMethod(input)).toBe(expected));
  it('unknown method is null', () => expect(toCashMethod('cheque')).toBeNull());
  it('maps back to the NFC-e strings', () => expect(toNfcePaymentMethod('DEBIT')).toBe('cartao de debito'));
  it('round-trips keyed JSON', () => {
    const v = { ...emptyByMethod(), CASH: 100, PIX: 5 };
    expect(fromKeyed(toKeyed(v), Number)).toEqual(v);
  });
});

describe('amounts', () => {
  it.each([[10, 1000], ['10,5', 1050], ['0.01', 1], [12.34, 1234]])('%p -> %p cents', (v, c) => expect(parseAmountCents(v)).toBe(c));
  it.each([[0], [-1], ['abc'], [1.234], [''], [null]])('refuses %p', (v) => expect(() => parseAmountCents(v)).toThrow(CashRuleError));
  it('counted may be zero but not negative', () => {
    expect(parseCountedCents(0)).toBe(0);
    expect(() => parseCountedCents(-0.01)).toThrow(CashRuleError);
  });
});

describe('settlePayments', () => {
  it('two methods covering the total, no change', () => {
    const s = settlePayments(8000, [{ method: 'dinheiro', amount: 50 }, { method: 'cartao de credito', amount: 30 }]);
    expect(s.receipts).toMatchObject({ CASH: 5000, CREDIT: 3000 });
    expect(s.changeCents).toBe(0);
    expect(s.primaryMethod).toBe('CASH');
  });
  it('cash over the total becomes change; receipts keep what was handed over', () => {
    const s = settlePayments(3750, [{ method: 'dinheiro', amount: 50 }]);
    expect(s.receipts.CASH).toBe(5000);
    expect(s.changeCents).toBe(1250);
  });
  it('same method twice is summed', () => {
    expect(settlePayments(2000, [{ method: 'pix', amount: 10 }, { method: 'pix', amount: 10 }]).receipts.PIX).toBe(2000);
  });
  it('refuses when payments do not cover the total', () => {
    expect(() => settlePayments(8000, [{ method: 'pix', amount: 79.99 }])).toThrow(/Faltam R\$ 0,01/);
  });
  it('refuses card/PIX over the total (change only from cash)', () => {
    expect(() => settlePayments(1000, [{ method: 'cartao de debito', amount: 11 }])).toThrow(CashRuleError);
  });
  it('change larger than the cash handed over is impossible', () => {
    // 10 cash + 20 card for a 15 bill: card alone exceeds, refused
    expect(() => settlePayments(1500, [{ method: 'dinheiro', amount: 10 }, { method: 'cartao de credito', amount: 20 }])).toThrow(CashRuleError);
  });
  it('refuses an empty list, unknown method and zero amount', () => {
    expect(() => settlePayments(1000, [])).toThrow(CashRuleError);
    expect(() => settlePayments(1000, [{ method: 'cheque', amount: 10 }])).toThrow(CashRuleError);
    expect(() => settlePayments(1000, [{ method: 'pix', amount: 0 }])).toThrow(CashRuleError);
  });
  it('a zero total needs no payment', () => {
    expect(settlePayments(0, []).paidCents).toBe(0);
  });
});

describe('expected and difference', () => {
  const entries = [
    { type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
    { type: 'CHANGE', method: 'CASH', amountCents: 1250, orderSessionId: 's1' },
    { type: 'RECEIPT', method: 'CREDIT', amountCents: 3000, orderSessionId: 's2' },
    { type: 'SUPPLY', method: 'CASH', amountCents: 2000 },
    { type: 'WITHDRAWAL', method: 'CASH', amountCents: 500 },
    { type: 'EXPENSE', method: 'CASH', amountCents: 300 },
    { type: 'REFUND', method: 'CREDIT', amountCents: 1000, orderSessionId: 's2' },
    { type: 'ADJUSTMENT', method: 'CASH', amountCents: 100, direction: 'OUT' },
  ] as const;
  it('computes expected per method from the opening float', () => {
    const e = expectedByMethod(10000, entries as any);
    expect(e.CASH).toBe(10000 + 5000 - 1250 + 2000 - 500 - 300 - 100);
    expect(e.CREDIT).toBe(2000);
    expect(e.PIX).toBe(0);
  });
  it('adjustment requires a direction', () => {
    expect(() => entryEffect({ type: 'ADJUSTMENT', method: 'CASH', amountCents: 1 })).toThrow(CashRuleError);
  });
  it('difference = counted - expected', () => {
    const d = differenceByMethod({ ...emptyByMethod(), CASH: 900 }, { ...emptyByMethod(), CASH: 1000 });
    expect(d.CASH).toBe(-100);
  });
  it('alert threshold is max(R$20, 2%)', () => {
    expect(exceedsAlert(50000, 2000)).toBe(false);   // 2% of 500 = 10 -> threshold 20
    expect(exceedsAlert(50000, -2001)).toBe(true);
    expect(exceedsAlert(200000, 3999)).toBe(false);  // 2% of 2000 = 40
    expect(exceedsAlert(200000, 4001)).toBe(true);
    expect(methodsOverAlert({ ...emptyByMethod(), CASH: 10000, PIX: 0 }, { ...emptyByMethod(), CASH: -2500, PIX: 0 })).toEqual(['CASH']);
  });
});

describe('cash count and sales summary', () => {
  it('counts notes and coins', () => {
    expect(countCash({ '10000': 2, '500': 3, '25': 4 })).toBe(20000 + 1500 + 100);
    expect(() => countCash({ '300': 1 })).toThrow(CashRuleError);
    expect(() => countCash({ '100': -1 })).toThrow(CashRuleError);
  });
  it('sales summary counts sales by comanda and nets refunds', () => {
    const s = salesSummary([
      { type: 'RECEIPT', method: 'CASH', amountCents: 5000, orderSessionId: 's1' },
      { type: 'CHANGE', method: 'CASH', amountCents: 1250, orderSessionId: 's1' },
      { type: 'RECEIPT', method: 'PIX', amountCents: 2000, orderSessionId: 's2' },
      { type: 'RECEIPT', method: 'CREDIT', amountCents: 1000, orderSessionId: 's2' },
    ]);
    expect(s.byMethod).toMatchObject({ CASH: 3750, PIX: 2000, CREDIT: 1000 });
    expect(s.salesCount).toBe(2);
    expect(s.totalCents).toBe(6750);
    expect(s.averageTicketCents).toBe(3375);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.unit.config.js __tests__/unit/caixa-rules.test.ts`
Expected: FAIL — cannot find module `../../lib/caixa/rules`.

- [ ] **Step 3: Implement `lib/caixa/payment-methods.ts`**

```ts
/**
 * Payment methods of the cash register (spec §4.2). The API and the NFC-e use the Portuguese strings
 * ("dinheiro", "cartao de credito"...); the database uses the CashMethod enum; counted / expected
 * amounts are stored as JSON keyed by "dinheiro", "pix", "credito", "debito", "outros".
 */
export type CashMethod = 'CASH' | 'PIX' | 'CREDIT' | 'DEBIT' | 'OTHER';
export type MethodKey = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros';
export type ByMethod = Record<CashMethod, number>;
export type Keyed = Record<MethodKey, number>;

export const CASH_METHODS: CashMethod[] = ['CASH', 'PIX', 'CREDIT', 'DEBIT', 'OTHER'];

export const METHOD_KEY: Record<CashMethod, MethodKey> = {
  CASH: 'dinheiro', PIX: 'pix', CREDIT: 'credito', DEBIT: 'debito', OTHER: 'outros',
};

export const METHOD_LABEL: Record<CashMethod, string> = {
  CASH: 'Dinheiro', PIX: 'PIX', CREDIT: 'Cartão de crédito', DEBIT: 'Cartão de débito', OTHER: 'Outros',
};

const NFCE: Record<CashMethod, string> = {
  CASH: 'dinheiro', PIX: 'pix', CREDIT: 'cartao de credito', DEBIT: 'cartao de debito', OTHER: 'outros',
};

const ALIASES: Record<string, CashMethod> = {
  dinheiro: 'CASH', cash: 'CASH',
  pix: 'PIX',
  'cartao de credito': 'CREDIT', credito: 'CREDIT', credit: 'CREDIT',
  'cartao de debito': 'DEBIT', debito: 'DEBIT', debit: 'DEBIT',
  outros: 'OTHER', other: 'OTHER',
};

export function toCashMethod(input: unknown): CashMethod | null {
  const key = String(input ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ALIASES[key] ?? null;
}

export function toNfcePaymentMethod(method: CashMethod): string {
  return NFCE[method];
}

export function emptyByMethod(): ByMethod {
  return { CASH: 0, PIX: 0, CREDIT: 0, DEBIT: 0, OTHER: 0 };
}

export function toKeyed(values: ByMethod): Keyed {
  return Object.fromEntries(CASH_METHODS.map((m) => [METHOD_KEY[m], values[m] ?? 0])) as Keyed;
}

export function fromKeyed(values: Partial<Record<MethodKey, unknown>>, parse: (v: unknown) => number): ByMethod {
  const out = emptyByMethod();
  for (const m of CASH_METHODS) out[m] = parse(values?.[METHOD_KEY[m]] ?? 0);
  return out;
}
```

- [ ] **Step 4: Implement `lib/caixa/rules.ts`**

```ts
import { CASH_METHODS, emptyByMethod, toCashMethod, type ByMethod, type CashMethod } from './payment-methods';

/**
 * Money rules of the cash register (spec §5), pure and in integer cents.
 */

export class CashRuleError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: string) {
    super(message);
  }
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function toCents(value: unknown, field: string, allowZero: boolean): number {
  const text = typeof value === 'number' ? String(value) : String(value ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new CashRuleError(`${field}: informe um valor em reais com até 2 casas decimais`);
  const cents = Math.round(Number(text) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || (!allowZero && cents === 0)) {
    throw new CashRuleError(`${field}: informe um valor maior que zero`);
  }
  return cents;
}

export const parseAmountCents = (value: unknown, field = 'Valor') => toCents(value, field, false);
export const parseCountedCents = (value: unknown, field = 'Valor contado') => toCents(value, field, true);

export interface PaymentInput { method: unknown; amount: unknown }
export interface SettledPayment { receipts: ByMethod; changeCents: number; paidCents: number; primaryMethod: CashMethod }

/**
 * Payments of one sale (spec rule 3): they must cover the total; only cash may exceed it, and the
 * excess is the change. Receipts keep what was handed over (the change leaves the drawer as its own line).
 */
export function settlePayments(totalCents: number, payments: PaymentInput[]): SettledPayment {
  const receipts = emptyByMethod();
  if (!Array.isArray(payments)) throw new CashRuleError('Informe as formas de pagamento');
  for (const [i, p] of payments.entries()) {
    const method = toCashMethod(p?.method);
    if (!method) throw new CashRuleError(`Pagamento ${i + 1}: forma de pagamento inválida`);
    receipts[method] += parseAmountCents(p?.amount, `Pagamento ${i + 1}`);
  }
  const paidCents = CASH_METHODS.reduce((sum, m) => sum + receipts[m], 0);
  if (totalCents > 0 && paidCents === 0) throw new CashRuleError('Informe as formas de pagamento');
  if (paidCents < totalCents) throw new CashRuleError(`Faltam ${brl(totalCents - paidCents)} para fechar a conta`);
  const nonCash = paidCents - receipts.CASH;
  if (nonCash > totalCents) throw new CashRuleError('Cartão, PIX e outros não podem passar do total: troco só em dinheiro');
  const changeCents = paidCents - totalCents;
  const primaryMethod = CASH_METHODS.reduce((best, m) => (receipts[m] > receipts[best] ? m : best), 'CASH' as CashMethod);
  return { receipts, changeCents, paidCents, primaryMethod };
}

export type EntryType = 'RECEIPT' | 'CHANGE' | 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE' | 'REFUND' | 'ADJUSTMENT';
export interface EntryLike {
  type: EntryType;
  method: CashMethod;
  amountCents: number;
  direction?: 'IN' | 'OUT' | null;
  orderSessionId?: string | null;
}

/** Signed effect of a ledger line on its method's expected amount (spec rule 4). */
export function entryEffect(entry: EntryLike): number {
  switch (entry.type) {
    case 'RECEIPT':
    case 'SUPPLY':
      return entry.amountCents;
    case 'CHANGE':
    case 'WITHDRAWAL':
    case 'EXPENSE':
    case 'REFUND':
      return -entry.amountCents;
    case 'ADJUSTMENT':
      if (entry.direction === 'IN') return entry.amountCents;
      if (entry.direction === 'OUT') return -entry.amountCents;
      throw new CashRuleError('Ajuste sem direção (entrada ou saída)');
  }
}

export function expectedByMethod(openingFloatCents: number, entries: EntryLike[]): ByMethod {
  const out = emptyByMethod();
  out.CASH = openingFloatCents;
  for (const e of entries) out[e.method] += entryEffect(e);
  return out;
}

export function differenceByMethod(counted: ByMethod, expected: ByMethod): ByMethod {
  const out = emptyByMethod();
  for (const m of CASH_METHODS) out[m] = (counted[m] ?? 0) - (expected[m] ?? 0);
  return out;
}

export const ALERT_MIN_CENTS = 2000;
export const ALERT_RATIO = 0.02;
export const FORGOTTEN_SHIFT_HOURS = 16;
export const EXPENSE_CATEGORIES = ['compras', 'entregador', 'outros'] as const;

export function exceedsAlert(expectedCents: number, differenceCents: number): boolean {
  const threshold = Math.max(ALERT_MIN_CENTS, Math.round(Math.abs(expectedCents) * ALERT_RATIO));
  return Math.abs(differenceCents) > threshold;
}

export function methodsOverAlert(expected: ByMethod, difference: ByMethod): CashMethod[] {
  return CASH_METHODS.filter((m) => exceedsAlert(expected[m] ?? 0, difference[m] ?? 0));
}

export const DENOMINATIONS_CENTS = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 25, 10, 5];

/** Optional note-and-coin calculator of the blind close. Keys are denominations in cents. */
export function countCash(counts: Record<string, number>): number {
  let total = 0;
  for (const [key, qty] of Object.entries(counts ?? {})) {
    const denom = Number(key);
    if (!DENOMINATIONS_CENTS.includes(denom)) throw new CashRuleError(`Cédula ou moeda inválida: ${key}`);
    if (!Number.isInteger(qty) || qty < 0) throw new CashRuleError('Quantidade inválida');
    total += denom * qty;
  }
  return total;
}

export interface SalesSummary { byMethod: ByMethod; salesCount: number; totalCents: number; averageTicketCents: number }

/** What the shift sold: receipts minus change and refunds of sales, per method; a sale is a comanda. */
export function salesSummary(entries: EntryLike[]): SalesSummary {
  const byMethod = emptyByMethod();
  const sales = new Set<string>();
  for (const e of entries) {
    if (!e.orderSessionId) continue;
    if (e.type === 'RECEIPT') {
      byMethod[e.method] += e.amountCents;
      sales.add(e.orderSessionId);
    } else if (e.type === 'CHANGE' || e.type === 'REFUND') {
      byMethod[e.method] -= e.amountCents;
    }
  }
  const totalCents = CASH_METHODS.reduce((s, m) => s + byMethod[m], 0);
  const salesCount = sales.size;
  return { byMethod, salesCount, totalCents, averageTicketCents: salesCount ? Math.round(totalCents / salesCount) : 0 };
}
```

- [ ] **Step 5: Implement `lib/caixa/roles.ts`**

```ts
import type { RestaurantRole } from '@/lib/auth/restaurant-role';

/** Who may do what at the cash register (spec rule 9). */
export const CASHIER_PLUS: RestaurantRole[] = ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'];
export const MANAGER_PLUS: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN'];
export const isManager = (role: RestaurantRole) => MANAGER_PLUS.includes(role);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest --config jest.unit.config.js __tests__/unit/caixa-rules.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/caixa/payment-methods.ts lib/caixa/rules.ts lib/caixa/roles.ts __tests__/unit/caixa-rules.test.ts
git commit -m "Caixa: payment methods and money rules in cents"
```

---

### Task 3: Shift service (registers, open, view, entries, close, adjust) and alerts

**Files:**
- Create: `lib/caixa/alerts.ts`, `lib/caixa/sessions.ts`
- Test: `__tests__/integration/caixa/sessions.test.ts`

**Interfaces:**
- Consumes: Task 2 exports; `RestaurantMember`, `recordAudit` from `lib/auth/restaurant-role.ts`; `summarizeReceipts` from `lib/payments/receipts-summary.ts`.
- Produces:

```ts
// lib/caixa/sessions.ts
export async function listRegisters(restaurantId: string): Promise<Array<{ id: string; name: string; isDefault: boolean; openSession: { id: string; openedAt: Date; openedByName: string | null } | null }>>;
export async function ensureDefaultRegister(restaurantId: string): Promise<{ id: string; name: string }>;
export async function openSession(member: RestaurantMember, input: { cashRegisterId: string; openingFloat: unknown }): Promise<{ session: CashSession; alreadyOpen: boolean }>;
export async function addEntry(member: RestaurantMember, sessionId: string, input: { type: 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE' | 'ADJUSTMENT'; amount: unknown; method?: unknown; category?: unknown; description?: unknown; direction?: unknown; force?: boolean }): Promise<{ entry: CashSessionEntry; warning?: string }>;
export async function closeSession(member: RestaurantMember, sessionId: string, input: { counted: Partial<Record<MethodKey, unknown>>; notes?: unknown }): Promise<CloseResult>;
export interface CloseResult { sessionId: string; alreadyClosed: boolean; counted: Keyed; expected: Keyed; difference: Keyed; alertMethods: CashMethod[] }
export async function getSessionView(member: RestaurantMember, sessionId: string): Promise<SessionView | null>;
export async function currentSessionView(member: RestaurantMember, cashRegisterId: string): Promise<SessionView | null>;
export interface SessionView {
  session: { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; openingFloatCents: number; lateEntries: number; closingNotes: string | null };
  register: { id: string; name: string };
  openedByName: string | null; closedByName: string | null;
  entries: Array<{ id: string; type: EntryType; method: CashMethod; amountCents: number; direction: 'IN' | 'OUT' | null; category: string | null; description: string | null; orderSessionId: string | null; createdByName: string | null; afterClose: boolean; createdAt: string }>;
  sales: SalesSummary;
  online: { revenue: number; paidCount: number };
  expected: Keyed | null;     // null for a cashier while the shift is open (blind close)
  counted: Keyed | null; difference: Keyed | null;
  hoursOpen: number;
}
export async function recalcClosedSession(tx: Prisma.TransactionClient, sessionId: string): Promise<{ expected: ByMethod; difference: ByMethod } | null>;
export async function listSessions(restaurantId: string, filter: { from?: Date; to?: Date; cashRegisterId?: string }): Promise<Array<{ id: string; registerName: string; openedAt: string; closedAt: string | null; openedByName: string | null; closedByName: string | null; salesCents: number; differenceCents: Keyed | null; status: 'OPEN' | 'CLOSED'; lateEntries: number }>>;

// lib/caixa/alerts.ts
export async function alertCashDifference(restaurantId: string, sessionId: string, registerName: string, methods: CashMethod[], difference: ByMethod): Promise<void>;
export async function alertLateEntry(restaurantId: string, sessionId: string, orderSessionId: string | null): Promise<void>;
export async function alertSaleWithoutShift(restaurantId: string, orderSessionId: string): Promise<void>;
export async function alertForgottenShifts(now?: Date): Promise<{ alerted: number }>;
```

- [ ] **Step 1: Write the failing integration tests**

```ts
// __tests__/integration/caixa/sessions.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { openSession, addEntry, closeSession, getSessionView, ensureDefaultRegister, listSessions } from '../../../lib/caixa/sessions';
import { CashRuleError } from '../../../lib/caixa/rules';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash shift service', () => {
  let A, B, register, cashier, owner, cashierB;
  const tag = crypto.randomBytes(3).toString('hex');
  const users: string[] = [];

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    register = await ensureDefaultRegister(A.restaurantId);
    const mkUser = async (restaurantId, role) => {
      const u = await prisma.user.create({ data: { email: `${role}-${tag}-${restaurantId.slice(-4)}@caixa.test`, name: role, password: 'x', role, active: true } });
      users.push(u.id);
      await prisma.restaurantUser.create({ data: { restaurantId, userId: u.id, role, isActive: true } });
      return { userId: u.id, restaurantId, role };
    };
    cashier = await mkUser(A.restaurantId, 'CASHIER');
    cashierB = await mkUser(B.restaurantId, 'CASHIER');
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await cleanupMultiTenantData(ids);
  });

  beforeEach(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
  });

  it('ensureDefaultRegister is idempotent and creates "Caixa principal"', async () => {
    const again = await ensureDefaultRegister(A.restaurantId);
    expect(again.id).toBe(register.id);
    expect(again.name).toBe('Caixa principal');
  });

  it('opens one shift; a second open returns the existing one (alreadyOpen)', async () => {
    const [a, b] = await Promise.all([
      openSession(cashier, { cashRegisterId: register.id, openingFloat: '100' }),
      openSession(owner, { cashRegisterId: register.id, openingFloat: 50 }),
    ]);
    expect([a.alreadyOpen, b.alreadyOpen].sort()).toEqual([false, true]);
    expect(a.session.id).toBe(b.session.id);
    expect(await prisma.cashSession.count({ where: { cashRegisterId: register.id, status: 'OPEN' } })).toBe(1);
  });

  it("another restaurant's register is not found", async () => {
    await expect(openSession(cashierB, { cashRegisterId: register.id, openingFloat: 0 })).rejects.toMatchObject({ status: 404 });
  });

  it('sangria and suprimento by a cashier; expense and adjustment only for a manager', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    await addEntry(cashier, session.id, { type: 'SUPPLY', amount: 50, description: 'troco' });
    await addEntry(cashier, session.id, { type: 'WITHDRAWAL', amount: 30, description: 'depósito' });
    await expect(addEntry(cashier, session.id, { type: 'EXPENSE', amount: 10, category: 'compras' })).rejects.toMatchObject({ status: 403 });
    await addEntry(owner, session.id, { type: 'EXPENSE', amount: 10, category: 'compras', description: 'temperos' });
    await expect(addEntry(owner, session.id, { type: 'EXPENSE', amount: 10, category: 'luz' })).rejects.toThrow(CashRuleError);
    const view = await getSessionView(owner, session.id);
    expect(view.expected.dinheiro).toBe(10000 + 5000 - 3000 - 1000);
  });

  it('a cashier cannot take out more cash than expected; a manager can with force', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 10 });
    await expect(addEntry(cashier, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'x' })).rejects.toMatchObject({ status: 409 });
    await expect(addEntry(owner, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'x' })).rejects.toMatchObject({ status: 409 });
    const { entry } = await addEntry(owner, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'cofre', force: true });
    expect(entry.amountCents).toBe(2000);
    expect(await prisma.auditLog.count({ where: { restaurantId: A.restaurantId, entityId: entry.id } })).toBe(1);
  });

  it('blind close: the cashier view hides expected while open; close returns expected, difference and alerts over the limit', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    const open = await getSessionView(cashier, session.id);
    expect(open.expected).toBeNull();
    const result = await closeSession(cashier, session.id, { counted: { dinheiro: '70', pix: 0 }, notes: 'faltou' });
    expect(result.expected.dinheiro).toBe(10000);
    expect(result.difference.dinheiro).toBe(-3000);
    expect(result.alertMethods).toEqual(['CASH']);
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    const closedView = await getSessionView(cashier, session.id);
    expect(closedView.expected.dinheiro).toBe(10000);
  });

  it('a second close returns the stored result without changing it', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 0 });
    await closeSession(cashier, session.id, { counted: { dinheiro: 0 } });
    const again = await closeSession(owner, session.id, { counted: { dinheiro: 999 } });
    expect(again.alreadyClosed).toBe(true);
    expect(again.counted.dinheiro).toBe(0);
  });

  it('entries on a closed shift: only a manager adjustment, which recalculates the difference', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 100 });
    await closeSession(cashier, session.id, { counted: { dinheiro: 90 } });
    await expect(addEntry(cashier, session.id, { type: 'SUPPLY', amount: 5, description: 'x' })).rejects.toMatchObject({ status: 409 });
    await expect(addEntry(owner, session.id, { type: 'ADJUSTMENT', amount: 10, method: 'dinheiro', description: 'nota achada' })).rejects.toThrow(/direção/);
    await addEntry(owner, session.id, { type: 'ADJUSTMENT', amount: 10, method: 'dinheiro', direction: 'OUT', description: 'pago motoboy sem registro' });
    const s = await prisma.cashSession.findUnique({ where: { id: session.id } });
    expect(s.differenceCents.dinheiro).toBe(0);
  });

  it('history lists closed shifts with sales and difference, scoped to the restaurant', async () => {
    const { session } = await openSession(cashier, { cashRegisterId: register.id, openingFloat: 0 });
    await closeSession(cashier, session.id, { counted: {} });
    const list = await listSessions(A.restaurantId, {});
    expect(list.map((r) => r.id)).toContain(session.id);
    expect(await listSessions(B.restaurantId, {})).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.integration.config.js --testPathPatterns caixa/sessions`
Expected: FAIL — cannot find module `lib/caixa/sessions`.

- [ ] **Step 3: Implement `lib/caixa/alerts.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { METHOD_LABEL, type ByMethod, type CashMethod } from './payment-methods';
import { FORGOTTEN_SHIFT_HOURS } from './rules';

/** Cash register alerts for the manager (spec rules 6, 8, 15). One unread alert per dedupe key; never throws. */
async function notifyOnce(restaurantId: string, dedupeKey: string, title: string, message: string, severity: 'HIGH' | 'CRITICAL' = 'HIGH', extra: Record<string, unknown> = {}) {
  try {
    const existing = await prisma.notification.findFirst({
      where: { restaurantId, read: false, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: { restaurantId, type: 'SYSTEM_ERROR', severity, title, message, actionUrl: '/caixa/historico', actionLabel: 'Ver caixas', data: { kind: 'cash', dedupeKey, ...extra } },
    });
  } catch (error) {
    console.error('Could not store the cash register alert:', error);
  }
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export async function alertCashDifference(restaurantId: string, sessionId: string, registerName: string, methods: CashMethod[], difference: ByMethod) {
  if (methods.length === 0) return;
  const detail = methods.map((m) => `${METHOD_LABEL[m]}: ${difference[m] > 0 ? 'sobra' : 'falta'} de ${brl(Math.abs(difference[m]))}`).join('; ');
  await notifyOnce(restaurantId, `cash-diff:${sessionId}`, `Diferença no fechamento do ${registerName}`, detail, 'HIGH', { cashSessionId: sessionId });
}

export async function alertLateEntry(restaurantId: string, sessionId: string, orderSessionId: string | null) {
  await notifyOnce(restaurantId, `cash-late:${sessionId}:${orderSessionId ?? 'x'}`, 'Venda lançada após o fechamento do caixa',
    'Uma venda feita sem internet chegou depois do fechamento do turno. O turno foi recalculado: confira a diferença.', 'HIGH', { cashSessionId: sessionId, orderSessionId });
}

export async function alertSaleWithoutShift(restaurantId: string, orderSessionId: string) {
  await notifyOnce(restaurantId, `cash-none:${orderSessionId}`, 'Venda recebida sem caixa',
    'Uma venda feita sem internet chegou e o restaurante não tinha caixa aberto. Ela não entrou em nenhum turno.', 'HIGH', { orderSessionId });
}

/** Called by the 2-minute cron (POST /api/kds/stale-check): shifts open for more than 16 hours. */
export async function alertForgottenShifts(now = new Date()): Promise<{ alerted: number }> {
  const limit = new Date(now.getTime() - FORGOTTEN_SHIFT_HOURS * 3600_000);
  const shifts = await prisma.cashSession.findMany({
    where: { status: 'OPEN', openedAt: { lt: limit } },
    select: { id: true, restaurantId: true, openedAt: true, cashRegister: { select: { name: true } } },
    take: 200,
  });
  for (const s of shifts) {
    await notifyOnce(s.restaurantId, `cash-forgotten:${s.id}`, `${s.cashRegister.name} aberto há mais de ${FORGOTTEN_SHIFT_HOURS} horas`,
      `O turno foi aberto em ${s.openedAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Feche o caixa para conferir o dia.`, 'HIGH', { cashSessionId: s.id });
  }
  return { alerted: shifts.length };
}

```

- [ ] **Step 4: Implement `lib/caixa/sessions.ts`**

```ts
import { Prisma, type CashSession, type CashSessionEntry } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { summarizeReceipts } from '@/lib/payments/receipts-summary';
import { fromKeyed, toCashMethod, toKeyed, type ByMethod, type CashMethod, type Keyed, type MethodKey } from './payment-methods';
import {
  CashRuleError, EXPENSE_CATEGORIES, differenceByMethod, expectedByMethod, methodsOverAlert, parseAmountCents,
  parseCountedCents, salesSummary, type EntryLike, type EntryType, type SalesSummary,
} from './rules';
import { isManager } from './roles';
import { alertCashDifference } from './alerts';

/**
 * Cash register shifts (spec docs/superpowers/specs/2026-10-04-caixa-turnos-design.md §4-§5).
 * Every function is scoped to the member's restaurant; another restaurant's record is a 404.
 */

const notFound = () => new CashRuleError('Caixa não encontrado', 404);

export async function ensureDefaultRegister(restaurantId: string) {
  const existing = await prisma.cashRegister.findFirst({
    where: { restaurantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, isDefault: true },
  });
  if (existing) {
    if (!existing.isDefault) await prisma.cashRegister.update({ where: { id: existing.id }, data: { isDefault: true } });
    return { id: existing.id, name: existing.name };
  }
  const created = await prisma.cashRegister.create({ data: { restaurantId, name: 'Caixa principal', isDefault: true }, select: { id: true, name: true } });
  return created;
}

async function userNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

export async function listRegisters(restaurantId: string) {
  await ensureDefaultRegister(restaurantId);
  const registers = await prisma.cashRegister.findMany({
    where: { restaurantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { sessions: { where: { status: 'OPEN' }, select: { id: true, openedAt: true, openedById: true } } },
  });
  const names = await userNames(registers.flatMap((r) => r.sessions.map((s) => s.openedById)));
  return registers.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.isDefault,
    openSession: r.sessions[0]
      ? { id: r.sessions[0].id, openedAt: r.sessions[0].openedAt, openedByName: names.get(r.sessions[0].openedById) ?? null }
      : null,
  }));
}

export async function openSession(member: RestaurantMember, input: { cashRegisterId: string; openingFloat: unknown }) {
  const register = await prisma.cashRegister.findFirst({ where: { id: String(input.cashRegisterId ?? ''), restaurantId: member.restaurantId } });
  if (!register) throw notFound();
  if (!register.active) throw new CashRuleError('Este caixa está desativado', 409);
  const openingFloatCents = input.openingFloat === undefined || input.openingFloat === '' ? 0 : parseCountedCents(input.openingFloat, 'Troco inicial');
  try {
    const session = await prisma.cashSession.create({
      data: { restaurantId: member.restaurantId, cashRegisterId: register.id, openedById: member.userId, openingFloatCents },
    });
    await recordAudit(member, { action: 'CREATE', entityType: 'CashSession', entityId: session.id, changes: { register: register.name, openingFloatCents } });
    return { session, alreadyOpen: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const session = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' } });
    if (!session) throw error;
    return { session, alreadyOpen: true };
  }
}

async function loadSession(member: RestaurantMember, sessionId: string) {
  const session = await prisma.cashSession.findFirst({
    where: { id: String(sessionId ?? ''), restaurantId: member.restaurantId },
    include: { cashRegister: { select: { id: true, name: true } }, entries: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) throw notFound();
  return session;
}

const asLike = (e: CashSessionEntry): EntryLike => ({
  type: e.type as EntryType, method: e.method as CashMethod, amountCents: e.amountCents, direction: e.direction as any, orderSessionId: e.orderSessionId,
});

/** Recomputes expected and difference of a closed shift after a late or adjustment line. */
export async function recalcClosedSession(tx: Prisma.TransactionClient, sessionId: string) {
  const s = await tx.cashSession.findUnique({ where: { id: sessionId }, include: { entries: true } });
  if (!s || s.status !== 'CLOSED' || !s.countedCents) return null;
  const expected = expectedByMethod(s.openingFloatCents, s.entries.map(asLike));
  const counted = fromKeyed(s.countedCents as any, (v) => Number(v) || 0);
  const difference = differenceByMethod(counted, expected);
  await tx.cashSession.update({ where: { id: sessionId }, data: { expectedCents: toKeyed(expected), differenceCents: toKeyed(difference) } });
  return { expected, difference };
}

type ManualType = 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE' | 'ADJUSTMENT';
const MANUAL: ManualType[] = ['WITHDRAWAL', 'SUPPLY', 'EXPENSE', 'ADJUSTMENT'];
const NEEDS_REASON: Record<ManualType, number> = { WITHDRAWAL: 1, SUPPLY: 0, EXPENSE: 1, ADJUSTMENT: 3 };

export async function addEntry(
  member: RestaurantMember,
  sessionId: string,
  input: { type: ManualType; amount: unknown; method?: unknown; category?: unknown; description?: unknown; direction?: unknown; force?: boolean }
) {
  if (!MANUAL.includes(input.type)) throw new CashRuleError('Tipo de lançamento inválido');
  const managerOnly = input.type === 'EXPENSE' || input.type === 'ADJUSTMENT';
  if (managerOnly && !isManager(member.role)) throw new CashRuleError('Despesa e ajuste exigem um gerente', 403);
  const amountCents = parseAmountCents(input.amount);
  const description = String(input.description ?? '').trim().slice(0, 200) || null;
  const method: CashMethod = input.type === 'ADJUSTMENT' ? toCashMethod(input.method) ?? (() => { throw new CashRuleError('Forma de pagamento inválida'); })() : 'CASH';
  let category: string | null = null;
  if (input.type === 'EXPENSE') {
    category = String(input.category ?? '');
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) throw new CashRuleError('Categoria de despesa inválida');
  }
  let direction: 'IN' | 'OUT' | null = null;
  if (input.type === 'ADJUSTMENT') {
    if (input.direction !== 'IN' && input.direction !== 'OUT') throw new CashRuleError('Ajuste sem direção (entrada ou saída)');
    direction = input.direction;
  }
  if ((description?.length ?? 0) < NEEDS_REASON[input.type]) throw new CashRuleError('Informe o motivo do lançamento');

  const session = await loadSession(member, sessionId);
  if (session.status === 'CLOSED' && input.type !== 'ADJUSTMENT') throw new CashRuleError('Este caixa já foi fechado', 409);

  let warning: string | undefined;
  if (input.type === 'WITHDRAWAL' || input.type === 'EXPENSE') {
    const cash = expectedByMethod(session.openingFloatCents, session.entries.map(asLike)).CASH;
    if (amountCents > cash) {
      if (!isManager(member.role) || !input.force) {
        throw new CashRuleError('O caixa não tem esse valor em dinheiro. Um gerente pode confirmar mesmo assim.', 409, 'CASH_NOT_ENOUGH');
      }
      warning = 'Retirada maior que o dinheiro esperado no caixa';
    }
  }

  const entry = await prisma.$transaction(async (tx) => {
    const created = await tx.cashSessionEntry.create({
      data: { restaurantId: member.restaurantId, cashSessionId: session.id, type: input.type, method, amountCents, direction, category, description, createdById: member.userId },
    });
    if (session.status === 'CLOSED') await recalcClosedSession(tx, session.id);
    return created;
  });
  if (input.type === 'EXPENSE' || input.type === 'ADJUSTMENT' || warning) {
    await recordAudit(member, { action: 'CREATE', entityType: 'CashSessionEntry', entityId: entry.id, changes: { type: input.type, amountCents, method, direction, description, forced: Boolean(warning) } });
  }
  return { entry, warning };
}

export interface CloseResult { sessionId: string; alreadyClosed: boolean; counted: Keyed; expected: Keyed; difference: Keyed; alertMethods: CashMethod[] }

export async function closeSession(member: RestaurantMember, sessionId: string, input: { counted: Partial<Record<MethodKey, unknown>>; notes?: unknown }): Promise<CloseResult> {
  const counted = fromKeyed(input.counted ?? {}, (v) => (v === undefined || v === '' ? 0 : parseCountedCents(v)));
  const notes = String(input.notes ?? '').trim().slice(0, 500) || null;
  const session = await loadSession(member, sessionId);

  if (session.status === 'CLOSED') {
    return {
      sessionId: session.id, alreadyClosed: true,
      counted: session.countedCents as Keyed, expected: session.expectedCents as Keyed, difference: session.differenceCents as Keyed, alertMethods: [],
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const entries = await tx.cashSessionEntry.findMany({ where: { cashSessionId: session.id } });
    const expected = expectedByMethod(session.openingFloatCents, entries.map(asLike));
    const difference = differenceByMethod(counted, expected);
    // Only the first close of the shift writes (two devices closing at once)
    const updated = await tx.cashSession.updateMany({
      where: { id: session.id, status: 'OPEN' },
      data: {
        status: 'CLOSED', closedAt: new Date(), closedById: member.userId, closingNotes: notes,
        countedCents: toKeyed(counted), expectedCents: toKeyed(expected), differenceCents: toKeyed(difference),
      },
    });
    return { written: updated.count === 1, expected, difference };
  });

  if (!result.written) return closeSession(member, sessionId, input);

  const alertMethods = methodsOverAlert(result.expected, result.difference);
  await alertCashDifference(member.restaurantId, session.id, session.cashRegister.name, alertMethods, result.difference);
  await recordAudit(member, { action: 'STATUS_CHANGE', entityType: 'CashSession', entityId: session.id, changes: { to: 'CLOSED', counted: toKeyed(counted), difference: toKeyed(result.difference) } });
  return { sessionId: session.id, alreadyClosed: false, counted: toKeyed(counted), expected: toKeyed(result.expected), difference: toKeyed(result.difference), alertMethods };
}

export interface SessionView {
  session: { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; openingFloatCents: number; lateEntries: number; closingNotes: string | null };
  register: { id: string; name: string };
  openedByName: string | null;
  closedByName: string | null;
  entries: Array<{ id: string; type: EntryType; method: CashMethod; amountCents: number; direction: 'IN' | 'OUT' | null; category: string | null; description: string | null; orderSessionId: string | null; createdByName: string | null; afterClose: boolean; createdAt: string }>;
  sales: SalesSummary;
  online: { revenue: number; paidCount: number };
  expected: Keyed | null;
  counted: Keyed | null;
  difference: Keyed | null;
  hoursOpen: number;
}

async function onlineDuring(restaurantId: string, from: Date, to: Date) {
  const groups = await prisma.payment.groupBy({
    by: ['status'],
    where: { restaurantId, createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { amount: true, amountRefunded: true },
  });
  const s = summarizeReceipts(groups.map((g: any) => ({ status: g.status, count: g._count._all, amount: g._sum.amount, amountRefunded: g._sum.amountRefunded })));
  return { revenue: s.revenue, paidCount: s.paidCount };
}

export async function getSessionView(member: RestaurantMember, sessionId: string): Promise<SessionView | null> {
  let session;
  try { session = await loadSession(member, sessionId); } catch (e) { if (e instanceof CashRuleError && e.status === 404) return null; throw e; }
  const names = await userNames([session.openedById, session.closedById, ...session.entries.map((e) => e.createdById)]);
  const likes = session.entries.map(asLike);
  const open = session.status === 'OPEN';
  // Blind close (spec rule 5): a cashier never sees the expected amounts of an open shift
  const showExpected = !open || isManager(member.role);
  const end = session.closedAt ?? new Date();
  return {
    session: { id: session.id, status: session.status, openedAt: session.openedAt.toISOString(), closedAt: session.closedAt?.toISOString() ?? null, openingFloatCents: session.openingFloatCents, lateEntries: session.lateEntries, closingNotes: session.closingNotes },
    register: session.cashRegister,
    openedByName: names.get(session.openedById) ?? null,
    closedByName: session.closedById ? names.get(session.closedById) ?? null : null,
    entries: session.entries.slice().reverse().map((e) => ({
      id: e.id, type: e.type as EntryType, method: e.method as CashMethod, amountCents: e.amountCents, direction: e.direction as any,
      category: e.category, description: e.description, orderSessionId: e.orderSessionId, createdByName: names.get(e.createdById) ?? null,
      afterClose: e.afterClose, createdAt: e.createdAt.toISOString(),
    })),
    sales: salesSummary(likes),
    online: await onlineDuring(member.restaurantId, session.openedAt, end),
    expected: showExpected ? (open ? toKeyed(expectedByMethod(session.openingFloatCents, likes)) : (session.expectedCents as Keyed)) : null,
    counted: (session.countedCents as Keyed) ?? null,
    difference: (session.differenceCents as Keyed) ?? null,
    hoursOpen: Math.floor((end.getTime() - session.openedAt.getTime()) / 3600_000),
  };
}

export async function currentSessionView(member: RestaurantMember, cashRegisterId: string) {
  const register = await prisma.cashRegister.findFirst({ where: { id: String(cashRegisterId ?? ''), restaurantId: member.restaurantId } });
  if (!register) throw notFound();
  const open = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' }, select: { id: true } });
  return open ? getSessionView(member, open.id) : null;
}

export async function listSessions(restaurantId: string, filter: { from?: Date; to?: Date; cashRegisterId?: string }) {
  const sessions = await prisma.cashSession.findMany({
    where: {
      restaurantId,
      ...(filter.cashRegisterId ? { cashRegisterId: filter.cashRegisterId } : {}),
      ...(filter.from || filter.to ? { openedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    },
    orderBy: { openedAt: 'desc' },
    take: 200,
    include: { cashRegister: { select: { name: true } }, entries: true },
  });
  const names = await userNames(sessions.flatMap((s) => [s.openedById, s.closedById]));
  return sessions.map((s) => ({
    id: s.id,
    registerName: s.cashRegister.name,
    status: s.status,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    openedByName: names.get(s.openedById) ?? null,
    closedByName: s.closedById ? names.get(s.closedById) ?? null : null,
    salesCents: salesSummary(s.entries.map(asLike)).totalCents,
    differenceCents: (s.differenceCents as Keyed) ?? null,
    lateEntries: s.lateEntries,
  }));
}

export type { CashSession, CashSessionEntry, ByMethod };
```


- [ ] **Step 5: Run the tests**

Run: `npx jest --config jest.integration.config.js --testPathPatterns caixa/`
Expected: PASS (schema + sessions).

- [ ] **Step 6: Commit**

```bash
git add lib/caixa/alerts.ts lib/caixa/sessions.ts __tests__/integration/caixa/sessions.test.ts
git commit -m "Caixa: shift service (open, entries, blind close, adjust, history) and alerts"
```

---

### Task 4: Cash register API routes (and removal of the old ones)

**Files:**
- Create: `app/api/caixa/registers/route.ts`, `app/api/caixa/registers/[id]/route.ts`, `app/api/caixa/sessions/route.ts`, `app/api/caixa/sessions/current/route.ts`, `app/api/caixa/sessions/[id]/route.ts`, `app/api/caixa/sessions/[id]/entries/route.ts`, `app/api/caixa/sessions/[id]/close/route.ts`, `lib/caixa/http.ts`
- Delete: `app/api/caixa/route.ts`, `app/api/caixa/[id]/route.ts`, `app/api/caixa/reconciliacao/route.ts`, `app/api/caixa/movimentos/route.ts`
- Modify: `public/sw.js:38` (keep `/api/caixa` in the GET allowlist; no change needed unless the list has exact paths — verify)
- Test: `__tests__/integration/caixa/routes.test.ts`

**Interfaces:**
- Consumes: Task 3 service functions; `requireRestaurantRole`; `idempotent`.
- Produces: HTTP contract (all JSON):
  - `GET /api/caixa/registers` → `{ registers: ReturnType<listRegisters> }`
  - `POST /api/caixa/registers` `{ name }` → `201 { register }` (manager)
  - `PATCH /api/caixa/registers/[id]` `{ name?, active? }` → `{ register }` (manager; deactivate with open shift = 409)
  - `POST /api/caixa/sessions` `{ cashRegisterId, openingFloat }` → `201 { session, alreadyOpen }` (`200` when alreadyOpen)
  - `GET /api/caixa/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&cashRegisterId=` → `{ sessions }` (manager)
  - `GET /api/caixa/sessions/current?cashRegisterId=` → `{ view: SessionView | null }`
  - `GET /api/caixa/sessions/[id]` → `{ view }` (manager; a cashier only for an OPEN shift)
  - `POST /api/caixa/sessions/[id]/entries` `{ type, amount, method?, category?, description?, direction?, force? }` → `201 { entry, warning? }`
  - `POST /api/caixa/sessions/[id]/close` `{ counted, notes? }` → `{ result: CloseResult }`
  - Errors: `{ error, code? }` with the `CashRuleError.status`.

- [ ] **Step 1: Write the failing route tests**

```ts
// __tests__/integration/caixa/routes.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { GET as listRegisters, POST as createRegister } from '../../../app/api/caixa/registers/route';
import { POST as openShift, GET as history } from '../../../app/api/caixa/sessions/route';
import { GET as current } from '../../../app/api/caixa/sessions/current/route';
import { GET as detail } from '../../../app/api/caixa/sessions/[id]/route';
import { POST as entries } from '../../../app/api/caixa/sessions/[id]/entries/route';
import { POST as close } from '../../../app/api/caixa/sessions/[id]/close/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('cash register routes', () => {
  let A, B, cashierId;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const req = (url, method = 'GET', body?) => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }) as any;
  const json = async (res) => ({ status: res.status, body: await res.json() });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    const u = await prisma.user.create({ data: { email: `cx-${tag}@routes.test`, name: 'Caixa', password: 'x', role: 'CASHIER', active: true } });
    cashierId = u.id;
    await prisma.restaurantUser.create({ data: { restaurantId: A.restaurantId, userId: u.id, role: 'CASHIER', isActive: true } });
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.restaurantUser.deleteMany({ where: { userId: cashierId } });
    await prisma.user.deleteMany({ where: { id: cashierId } });
    await cleanupMultiTenantData(ids);
  });

  it('full cashier flow: list -> open -> sangria -> current hides expected -> close', async () => {
    as(cashierId, A.restaurantId);
    const { body: { registers } } = await json(await listRegisters(req('http://x/api/caixa/registers')));
    expect(registers[0]).toMatchObject({ name: 'Caixa principal', openSession: null });
    const reg = registers[0].id;

    const opened = await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: reg, openingFloat: '100,00' })));
    expect(opened.status).toBe(201);
    const id = opened.body.session.id;

    const again = await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: reg, openingFloat: 0 })));
    expect(again.status).toBe(200);
    expect(again.body.alreadyOpen).toBe(true);

    expect((await json(await entries(req(`http://x/api/caixa/sessions/${id}/entries`, 'POST', { type: 'WITHDRAWAL', amount: 20, description: 'cofre' }), { params: { id } }))).status).toBe(201);
    expect((await json(await entries(req(`http://x/api/caixa/sessions/${id}/entries`, 'POST', { type: 'EXPENSE', amount: 5, category: 'compras', description: 'x' }), { params: { id } }))).status).toBe(403);

    const cur = await json(await current(req(`http://x/api/caixa/sessions/current?cashRegisterId=${reg}`)));
    expect(cur.body.view.expected).toBeNull();
    expect(cur.body.view).not.toHaveProperty('balance'); // no running cash balance for the cashier

    const closed = await json(await close(req(`http://x/api/caixa/sessions/${id}/close`, 'POST', { counted: { dinheiro: '80' } }), { params: { id } }));
    expect(closed.body.result.difference.dinheiro).toBe(0);
  });

  it('history and register creation are for managers; other restaurants get 404', async () => {
    as(cashierId, A.restaurantId);
    expect((await history(req('http://x/api/caixa/sessions'))).status).toBe(403);
    expect((await createRegister(req('http://x/api/caixa/registers', 'POST', { name: 'Caixa 2' }))).status).toBe(403);
    as(A.ownerId, A.restaurantId);
    const created = await json(await createRegister(req('http://x/api/caixa/registers', 'POST', { name: 'Caixa Balcão' })));
    expect(created.status).toBe(201);
    const { body } = await json(await history(req('http://x/api/caixa/sessions')));
    expect(body.sessions.length).toBeGreaterThan(0);
    as(B.ownerId, B.restaurantId);
    expect((await detail(req(`http://x/api/caixa/sessions/${body.sessions[0].id}`), { params: { id: body.sessions[0].id } })).status).toBe(404);
  });

  it('invalid values are 400 with a Portuguese message', async () => {
    as(A.ownerId, A.restaurantId);
    const { body: { registers } } = await json(await listRegisters(req('http://x/api/caixa/registers')));
    const res = await json(await openShift(req('http://x/api/caixa/sessions', 'POST', { cashRegisterId: registers[0].id, openingFloat: '-5' })));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Troco inicial/);
  });
});
```

Note: a cashier still sees the entries and sales (they need them), so the balance can be summed by hand; the spec promises only that the expected figure and the running balance are not *shown*.

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.integration.config.js --testPathPatterns caixa/routes`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/caixa/http.ts`**

```ts
import { NextResponse } from 'next/server';
import { CashRuleError } from './rules';

/** Maps a cash rule error to its HTTP answer; anything else is a logged 500. */
export function cashErrorResponse(error: unknown, context: string) {
  if (error instanceof CashRuleError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
  }
  console.error(`[caixa] ${context}:`, error);
  return NextResponse.json({ error: 'Erro interno no caixa' }, { status: 500 });
}
```

- [ ] **Step 4: Implement the routes**

`app/api/caixa/registers/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { idempotent } from '@/lib/api/idempotency';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { listRegisters } from '@/lib/caixa/sessions';
import { CASHIER_PLUS, MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** GET /api/caixa/registers - the restaurant's active registers and the open shift of each. */
export async function GET() {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ registers: await listRegisters(auth.member.restaurantId) });
  } catch (error) {
    return cashErrorResponse(error, 'list registers');
  }
}

/** POST /api/caixa/registers { name } - a new named register (manager). */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'Criar caixa exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? '').trim().slice(0, 40);
  if (name.length < 2) return NextResponse.json({ error: 'Informe o nome do caixa' }, { status: 400 });
  const register = await prisma.cashRegister.create({ data: { restaurantId: auth.member.restaurantId, name } });
  await recordAudit(auth.member, { action: 'CREATE', entityType: 'CashRegister', entityId: register.id, changes: { name } });
  return NextResponse.json({ register }, { status: 201 });
}

export const POST = idempotent(handlePOST);
```

`app/api/caixa/registers/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recordAudit, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { MANAGER_PLUS } from '@/lib/caixa/roles';

export const dynamic = 'force-dynamic';

/** PATCH /api/caixa/registers/[id] { name?, active? } - rename or deactivate (never with an open shift). */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'Alterar caixa exige um gerente');
  if (!auth.ok) return auth.response;
  const register = await prisma.cashRegister.findFirst({ where: { id: params.id, restaurantId: auth.member.restaurantId } });
  if (!register) return NextResponse.json({ error: 'Caixa não encontrado' }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const data: { name?: string; active?: boolean } = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (name.length < 2) return NextResponse.json({ error: 'Informe o nome do caixa' }, { status: 400 });
    data.name = name;
  }
  if (body?.active === false) {
    if (register.isDefault) return NextResponse.json({ error: 'O caixa principal não pode ser desativado' }, { status: 409 });
    const open = await prisma.cashSession.count({ where: { cashRegisterId: register.id, status: 'OPEN' } });
    if (open) return NextResponse.json({ error: 'Feche o turno antes de desativar este caixa' }, { status: 409 });
    data.active = false;
  } else if (body?.active === true) {
    data.active = true;
  }
  const updated = await prisma.cashRegister.update({ where: { id: register.id }, data });
  await recordAudit(auth.member, { action: 'UPDATE', entityType: 'CashRegister', entityId: register.id, changes: data });
  return NextResponse.json({ register: updated });
}
```

`app/api/caixa/sessions/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { listSessions, openSession } from '@/lib/caixa/sessions';
import { CASHIER_PLUS, MANAGER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions { cashRegisterId, openingFloat } - opens the shift (or returns the open one). */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const { session, alreadyOpen } = await openSession(auth.member, { cashRegisterId: body?.cashRegisterId, openingFloat: body?.openingFloat });
    return NextResponse.json({ session, alreadyOpen }, { status: alreadyOpen ? 200 : 201 });
  } catch (error) {
    return cashErrorResponse(error, 'open shift');
  }
}
export const POST = idempotent(handlePOST);

const day = (value: string | null, end: boolean) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}-03:00`);
};

/** GET /api/caixa/sessions?from&to&cashRegisterId - shift history (manager). */
export async function GET(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_PLUS, 'O histórico de caixas é do gerente');
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const sessions = await listSessions(auth.member.restaurantId, {
    from: day(url.searchParams.get('from'), false),
    to: day(url.searchParams.get('to'), true),
    cashRegisterId: url.searchParams.get('cashRegisterId') || undefined,
  });
  return NextResponse.json({ sessions });
}
```

`app/api/caixa/sessions/current/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { currentSessionView } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** GET /api/caixa/sessions/current?cashRegisterId= - the open shift of a register, or null. */
export async function GET(request: Request) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const id = new URL(request.url).searchParams.get('cashRegisterId') ?? '';
    return NextResponse.json({ view: await currentSessionView(auth.member, id) });
  } catch (error) {
    return cashErrorResponse(error, 'current shift');
  }
}
```

`app/api/caixa/sessions/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { getSessionView } from '@/lib/caixa/sessions';
import { CASHIER_PLUS, isManager } from '@/lib/caixa/roles';

export const dynamic = 'force-dynamic';

/** GET /api/caixa/sessions/[id] - shift detail: managers any shift, a cashier only an open one. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  const view = await getSessionView(auth.member, params.id);
  if (!view) return NextResponse.json({ error: 'Caixa não encontrado' }, { status: 404 });
  if (!isManager(auth.member.role) && view.session.status !== 'OPEN') {
    return NextResponse.json({ error: 'O histórico de caixas é do gerente' }, { status: 403 });
  }
  return NextResponse.json({ view });
}
```

`app/api/caixa/sessions/[id]/entries/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { addEntry } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions/[id]/entries - sangria, suprimento, despesa or ajuste (rules 9, 11). */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const result = await addEntry(auth.member, params.id, {
      type: body?.type, amount: body?.amount, method: body?.method, category: body?.category,
      description: body?.description, direction: body?.direction, force: body?.force === true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return cashErrorResponse(error, 'add entry');
  }
}
export const POST = idempotent(handlePOST);
```

`app/api/caixa/sessions/[id]/close/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { closeSession } from '@/lib/caixa/sessions';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { cashErrorResponse } from '@/lib/caixa/http';

export const dynamic = 'force-dynamic';

/** POST /api/caixa/sessions/[id]/close { counted, notes } - blind close (rule 5). */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json({ result: await closeSession(auth.member, params.id, { counted: body?.counted ?? {}, notes: body?.notes }) });
  } catch (error) {
    return cashErrorResponse(error, 'close shift');
  }
}
export const POST = idempotent(handlePOST);
```

- [ ] **Step 5: Delete the old routes and fix references**

Run: `git rm app/api/caixa/route.ts "app/api/caixa/[id]/route.ts" app/api/caixa/reconciliacao/route.ts app/api/caixa/movimentos/route.ts`
Then: `grep -rn "api/caixa/\(movimentos\|reconciliacao\)\|'/api/caixa'" app components lib __tests__` — update or delete every hit (tests of the old routes in `__tests__/integration/bad-day/new-operator-mistakes.test.ts` and the offline suite that posted to `movimentos`: change them to post to `/api/caixa/sessions/[id]/entries` with an open shift, keeping their intent — cross-tenant refused, idempotent replay not duplicated).

- [ ] **Step 6: Run the cash and bad-day suites**

Run: `npx jest --config jest.integration.config.js --testPathPatterns "caixa/|bad-day/new-operator|bad-day/offline"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A app/api/caixa lib/caixa/http.ts __tests__
git commit -m "Caixa: API for registers, shifts, entries and blind close; old caixa routes removed"
```

---

### Task 5: Forgotten-shift alert on the existing cron

**Files:**
- Modify: `app/api/kds/stale-check/route.ts`
- Test: `__tests__/integration/caixa/forgotten-shift.test.ts`

**Interfaces:**
- Consumes: `alertForgottenShifts(now?: Date): Promise<{ alerted: number }>` (Task 3).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/caixa/forgotten-shift.test.ts
// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { ensureDefaultRegister } from '../../../lib/caixa/sessions';
import { POST as staleCheck } from '../../../app/api/kds/stale-check/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('forgotten shift alert', () => {
  let A, B;
  beforeAll(async () => { const s = await createMultiRestaurantScenario(); A = s.restaurantA; B = s.restaurantB; process.env.CRON_SECRET = 'test-cron'; });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });

  it('alerts once for a shift open more than 16 h, never for a recent one', async () => {
    const reg = await ensureDefaultRegister(A.restaurantId);
    await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: A.ownerId, openedAt: new Date(Date.now() - 17 * 3600_000) } });
    const regB = await ensureDefaultRegister(B.restaurantId);
    await prisma.cashSession.create({ data: { restaurantId: B.restaurantId, cashRegisterId: regB.id, openedById: B.ownerId, openedAt: new Date(Date.now() - 3600_000) } });
    const call = () => staleCheck(new Request('http://x/api/kds/stale-check', { method: 'POST', headers: { authorization: 'Bearer test-cron' } }) as any);
    expect((await call()).status).toBe(200);
    await call();
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId, title: { contains: 'aberto há mais de 16 horas' } } })).toBe(1);
    expect(await prisma.notification.count({ where: { restaurantId: B.restaurantId, title: { contains: 'aberto há mais de' } } })).toBe(0);
  });
});
```

(Check `lib/mercadopago-connect/cron-auth.ts` for the exact header it reads; adapt the request header if it is not `authorization: Bearer`.)

- [ ] **Step 2: Run to verify failure**

Run: `npx jest --config jest.integration.config.js --testPathPatterns caixa/forgotten`
Expected: FAIL — notification count 0.

- [ ] **Step 3: Call the check from the cron route**

In `app/api/kds/stale-check/route.ts`, import `alertForgottenShifts` from `@/lib/caixa/alerts` and replace the `return NextResponse.json(await alertStaleKitchenOrders());` line with:

```ts
    const kitchen = await alertStaleKitchenOrders();
    // The same 2-minute cron also watches cash shifts left open (spec rule 15)
    const cash = await alertForgottenShifts();
    return NextResponse.json({ ...kitchen, forgottenCashShifts: cash.alerted });
```

Update the route's doc comment to mention the cash check.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest --config jest.integration.config.js --testPathPatterns "caixa/forgotten|kitchen-screen-down"`
Expected: PASS (the kitchen suite still passes with the extra field).

- [ ] **Step 5: Commit, merge-check and publish Etapa 1**

```bash
git add app/api/kds/stale-check/route.ts __tests__/integration/caixa/forgotten-shift.test.ts
git commit -m "Caixa: alert for shifts left open more than 16 hours (existing 2-minute cron)"
npm run test:unit && npx tsc --noEmit -p . 2>&1 | grep -E "lib/caixa|app/api/caixa" ; npx jest --config jest.integration.config.js --testPathPatterns "caixa/|bad-day/"
```

Expected: all green, no type errors in the new files. Then publish per the repository practice (fetch `main`, confirm fast-forward, push `fix/delivery-public:main` over HTTPS) and tell the owner: Deploy + run the count SQL from the migration header + `npx prisma migrate deploy` in the Easypanel console.

---

# Etapa 2 — Telas

### Task 6: Print data routes and 80 mm pages

**Files:**
- Create: `app/api/print/cash-entry/[id]/route.ts`, `app/api/print/cash-session/[id]/route.ts`, `app/imprimir/caixa/lancamento/[id]/page.tsx`, `app/imprimir/caixa/fechamento/[id]/page.tsx`, `lib/caixa/print.ts`, `lib/caixa/labels.ts` (client-safe labels, no prisma import)
- Test: `__tests__/integration/caixa/print.test.ts`

**Interfaces:**
- Produces:

```ts
// lib/caixa/print.ts
export interface CashEntryTicket { restaurantName: string; registerName: string; typeLabel: string; amountCents: number; methodLabel: string; category: string | null; description: string | null; createdByName: string | null; createdAt: string; entryId: string }
export interface CashCloseTicket { restaurantName: string; registerName: string; openedAt: string; closedAt: string | null; openedByName: string | null; closedByName: string | null; openingFloatCents: number; rows: Array<{ label: string; expected: number; counted: number; difference: number }>; sales: { totalCents: number; salesCount: number }; notes: string | null; lateEntries: number }
export async function buildCashEntryTicket(restaurantId: string, entryId: string): Promise<CashEntryTicket | null>;
export async function buildCashCloseTicket(restaurantId: string, sessionId: string): Promise<CashCloseTicket | null>; // null also when the shift is still OPEN
// lib/caixa/labels.ts
export const ENTRY_TYPE_LABEL: Record<EntryType, string>; // RECEIPT 'Recebimento', CHANGE 'Troco', WITHDRAWAL 'Sangria', SUPPLY 'Suprimento', EXPENSE 'Despesa', REFUND 'Estorno', ADJUSTMENT 'Ajuste'
```

- [ ] **Step 1: Failing test** — `__tests__/integration/caixa/print.test.ts` (same mocks as Task 4): open a shift, post a sangria via `addEntry`, then `GET /api/print/cash-entry/[id]` returns `{ typeLabel: 'Sangria', amountCents: 2000, registerName: 'Caixa principal' }`; `GET /api/print/cash-session/[id]` while open → `404`; after `closeSession` → rows with `label: 'Dinheiro'`, `expected`, `counted`, `difference`; restaurant B → `404` on both.

```ts
// core of the test body
const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 100 });
const { entry } = await addEntry(owner, session.id, { type: 'WITHDRAWAL', amount: 20, description: 'cofre' });
as(A.ownerId, A.restaurantId);
const t = await (await entryTicket(req(`http://x/api/print/cash-entry/${entry.id}`), { params: { id: entry.id } })).json();
expect(t).toMatchObject({ typeLabel: 'Sangria', amountCents: 2000, registerName: 'Caixa principal', description: 'cofre' });
expect((await closeTicket(req('http://x'), { params: { id: session.id } })).status).toBe(404);
await closeSession(owner, session.id, { counted: { dinheiro: 80 } });
const c = await (await closeTicket(req('http://x'), { params: { id: session.id } })).json();
expect(c.rows.find((r) => r.label === 'Dinheiro')).toEqual({ label: 'Dinheiro', expected: 8000, counted: 8000, difference: 0 });
as(B.ownerId, B.restaurantId);
expect((await entryTicket(req('http://x'), { params: { id: entry.id } })).status).toBe(404);
```

- [ ] **Step 2: Run** `npx jest --config jest.integration.config.js --testPathPatterns caixa/print` → FAIL (modules missing).

- [ ] **Step 3: Implement `lib/caixa/labels.ts` and `lib/caixa/print.ts`**

```ts
// lib/caixa/labels.ts
import type { EntryType } from './rules';

/** Names of the ledger line types, shared by the screens and the receipts. */
export const ENTRY_TYPE_LABEL: Record<EntryType, string> = {
  RECEIPT: 'Recebimento', CHANGE: 'Troco', WITHDRAWAL: 'Sangria', SUPPLY: 'Suprimento', EXPENSE: 'Despesa', REFUND: 'Estorno', ADJUSTMENT: 'Ajuste',
};
```

```ts
// lib/caixa/print.ts
import { prisma } from '@/lib/prisma';
import { CASH_METHODS, METHOD_KEY, METHOD_LABEL, type CashMethod } from './payment-methods';
import { salesSummary, type EntryType } from './rules';
import { ENTRY_TYPE_LABEL } from './labels';

async function nameOf(userId: string | null) {
  if (!userId) return null;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  return u ? u.name || u.email : null;
}

export async function buildCashEntryTicket(restaurantId: string, entryId: string) {
  const e = await prisma.cashSessionEntry.findFirst({
    where: { id: entryId, restaurantId },
    include: { cashSession: { include: { cashRegister: { select: { name: true } } } } },
  });
  if (!e) return null;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
  return {
    restaurantName: restaurant?.name ?? '',
    registerName: e.cashSession.cashRegister.name,
    typeLabel: ENTRY_TYPE_LABEL[e.type as EntryType],
    amountCents: e.amountCents,
    methodLabel: METHOD_LABEL[e.method as CashMethod],
    category: e.category,
    description: e.description,
    createdByName: await nameOf(e.createdById),
    createdAt: e.createdAt.toISOString(),
    entryId: e.id,
  };
}

export async function buildCashCloseTicket(restaurantId: string, sessionId: string) {
  const s = await prisma.cashSession.findFirst({
    where: { id: sessionId, restaurantId, status: 'CLOSED' },
    include: { cashRegister: { select: { name: true } }, entries: true },
  });
  if (!s) return null;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } });
  const expected = (s.expectedCents ?? {}) as Record<string, number>;
  const counted = (s.countedCents ?? {}) as Record<string, number>;
  const difference = (s.differenceCents ?? {}) as Record<string, number>;
  const sales = salesSummary(s.entries.map((e) => ({ type: e.type as EntryType, method: e.method as CashMethod, amountCents: e.amountCents, direction: e.direction as any, orderSessionId: e.orderSessionId })));
  return {
    restaurantName: restaurant?.name ?? '',
    registerName: s.cashRegister.name,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    openedByName: await nameOf(s.openedById),
    closedByName: await nameOf(s.closedById),
    openingFloatCents: s.openingFloatCents,
    rows: CASH_METHODS.map((m) => ({ label: METHOD_LABEL[m], expected: expected[METHOD_KEY[m]] ?? 0, counted: counted[METHOD_KEY[m]] ?? 0, difference: difference[METHOD_KEY[m]] ?? 0 }))
      .filter((r) => r.expected || r.counted || r.label === 'Dinheiro'),
    sales: { totalCents: sales.totalCents, salesCount: sales.salesCount },
    notes: s.closingNotes,
    lateEntries: s.lateEntries,
  };
}
```

- [ ] **Step 4: Routes** (mirror `app/api/print/receipt/[sessionId]/route.ts`)

```ts
// app/api/print/cash-entry/[id]/route.ts
import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { buildCashEntryTicket } from '@/lib/caixa/print';

export const dynamic = 'force-dynamic';

/** GET /api/print/cash-entry/[id] - the receipt of a sangria / suprimento / despesa / ajuste of THIS restaurant. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  const ticket = await buildCashEntryTicket(auth.member.restaurantId, params.id);
  if (!ticket) return NextResponse.json({ error: 'Lançamento não encontrado' }, { status: 404 });
  return NextResponse.json(ticket);
}
```

```ts
// app/api/print/cash-session/[id]/route.ts
import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { buildCashCloseTicket } from '@/lib/caixa/print';

export const dynamic = 'force-dynamic';

/** GET /api/print/cash-session/[id] - the closing report of a CLOSED shift of THIS restaurant. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Sem acesso ao caixa');
  if (!auth.ok) return auth.response;
  const ticket = await buildCashCloseTicket(auth.member.restaurantId, params.id);
  if (!ticket) return NextResponse.json({ error: 'Fechamento não encontrado' }, { status: 404 });
  return NextResponse.json(ticket);
}
```

- [ ] **Step 5: Print pages** (same pattern as `app/imprimir/cupom/[sessionId]/page.tsx`: `?auto=1` prints itself via `printWhenReady`, `../../../print.css` relative path — verify the depth)

```tsx
// app/imprimir/caixa/lancamento/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CashEntryTicket } from '@/lib/caixa/print';
import { printWhenReady } from '@/lib/print/print-frame';
import '../../../print.css';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** 80 mm receipt of a cash register entry (sangria, suprimento, despesa, ajuste), with a signature line. */
export default function CashEntryTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [auto, setAuto] = useState(false);
  const [t, setT] = useState<CashEntryTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get('auto') === '1';
    setAuto(isAuto);
    fetch(`/api/print/cash-entry/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar o lançamento');
        setT(data);
        if (isAuto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!t) return <p className="p-4">Carregando...</p>;
  return (
    <div className="p-4">
      {!auto && (
        <div className="no-print mb-4">
          <button type="button" className="border rounded px-3 py-1" onClick={() => window.print()}>Imprimir</button>
        </div>
      )}
      <div className="ticket">
        <p className="center bold">{t.restaurantName}</p>
        <p className="center">{t.registerName}</p>
        <hr />
        <p className="center bold big">{t.typeLabel.toUpperCase()}</p>
        <p className="center bold big">{money(t.amountCents)}</p>
        <p>Forma: {t.methodLabel}</p>
        {t.category && <p>Categoria: {t.category}</p>}
        {t.description && <p>Motivo: {t.description}</p>}
        <p>Por: {t.createdByName ?? '-'}</p>
        <p>{when(t.createdAt)}</p>
        <hr />
        <p className="signature">Assinatura</p>
        <p className="small">Lançamento {t.entryId.slice(-8)}</p>
      </div>
    </div>
  );
}
```

```tsx
// app/imprimir/caixa/fechamento/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { CashCloseTicket } from '@/lib/caixa/print';
import { printWhenReady } from '@/lib/print/print-frame';
import '../../../print.css';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-');

/** 80 mm closing report of a cash shift: expected x counted x difference per method. */
export default function CashCloseTicketPage() {
  const { id } = useParams<{ id: string }>();
  const [auto, setAuto] = useState(false);
  const [t, setT] = useState<CashCloseTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const isAuto = new URLSearchParams(window.location.search).get('auto') === '1';
    setAuto(isAuto);
    fetch(`/api/print/cash-session/${id}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar o fechamento');
        setT(data);
        if (isAuto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!t) return <p className="p-4">Carregando...</p>;
  return (
    <div className="p-4">
      {!auto && (
        <div className="no-print mb-4">
          <button type="button" className="border rounded px-3 py-1" onClick={() => window.print()}>Imprimir</button>
        </div>
      )}
      <div className="ticket">
        <p className="center bold">{t.restaurantName}</p>
        <p className="center bold">FECHAMENTO DE CAIXA</p>
        <p className="center">{t.registerName}</p>
        <hr />
        <p>Abertura: {when(t.openedAt)} ({t.openedByName ?? '-'})</p>
        <p>Fechamento: {when(t.closedAt)} ({t.closedByName ?? '-'})</p>
        <p>Troco inicial: {money(t.openingFloatCents)}</p>
        <p>Vendas: {t.sales.salesCount} · {money(t.sales.totalCents)}</p>
        <hr />
        <table className="w-full">
          <thead><tr><th className="left">Forma</th><th>Esperado</th><th>Contado</th><th>Dif.</th></tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.label}><td>{r.label}</td><td className="right">{money(r.expected)}</td><td className="right">{money(r.counted)}</td><td className="right">{money(r.difference)}</td></tr>
            ))}
          </tbody>
        </table>
        {t.lateEntries > 0 && <p className="bold">{t.lateEntries} venda(s) lançada(s) após o fechamento</p>}
        {t.notes && <p>Obs.: {t.notes}</p>}
        <hr />
        <p className="signature">Operador</p>
        <p className="signature">Gerente</p>
      </div>
    </div>
  );
}
```

Add to `app/imprimir/print.css` any of `.big`, `.signature`, `.left`, `.right`, `.small` not yet defined:

```css
.ticket .big { font-size: 1.25rem; }
.ticket .signature { margin-top: 2.5rem; border-top: 1px solid #000; text-align: center; }
.ticket .left { text-align: left; }
.ticket .right { text-align: right; }
.ticket .small { font-size: 0.7rem; }
```

- [ ] **Step 6: Run** `npx jest --config jest.integration.config.js --testPathPatterns caixa/print` → PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/caixa/labels.ts lib/caixa/print.ts app/api/print/cash-entry app/api/print/cash-session app/imprimir/caixa app/imprimir/print.css __tests__/integration/caixa/print.test.ts
git commit -m "Caixa: 80 mm receipts for entries and for the closing report"
```

---

### Task 7: Device register choice and the `/caixa` screen (open, summary, entries, dialogs)

**Files:**
- Create: `lib/caixa/device-register.ts`, `components/caixa/money.ts`, `components/caixa/entry-dialog.tsx`, `components/caixa/open-shift-card.tsx`, `app/caixa/page.tsx`
- Test: `__tests__/unit/caixa-device-register.test.ts`

**Interfaces:**
- Produces:

```ts
// lib/caixa/device-register.ts
export const DEVICE_REGISTER_KEY = 'gastrux:caixa:register';
export interface RegisterOption { id: string; name: string; isDefault: boolean }
export function pickRegister(registers: RegisterOption[], remembered: string | null): RegisterOption | null; // remembered if still listed, else default, else first, else null
export function readRemembered(): string | null;   // try/catch around localStorage
export function remember(id: string): void;         // try/catch
// components/caixa/money.ts
export const brl: (cents: number) => string;
export function reaisToCents(text: string): number | null; // null when invalid (UI side, same rules as parseAmountCents)
// components/caixa/entry-dialog.tsx
export function EntryDialog(props: { sessionId: string; type: 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE'; open: boolean; onClose: () => void; onDone: () => void }): JSX.Element;
// components/caixa/open-shift-card.tsx
export function OpenShiftCard(props: { registerId: string; registerName: string; onOpened: (sessionId: string) => void }): JSX.Element;
```

- [ ] **Step 1: Failing unit test**

```ts
// __tests__/unit/caixa-device-register.test.ts
import { pickRegister } from '../../lib/caixa/device-register';
import { reaisToCents } from '../../components/caixa/money';

const regs = [
  { id: 'a', name: 'Caixa principal', isDefault: true },
  { id: 'b', name: 'Caixa Balcão', isDefault: false },
];

describe('pickRegister', () => {
  it('keeps the remembered register when it is still listed', () => expect(pickRegister(regs, 'b')?.id).toBe('b'));
  it('falls back to the default when the remembered one was deactivated or is from another restaurant', () => expect(pickRegister(regs, 'zzz')?.id).toBe('a'));
  it('falls back to the first when there is no default', () => expect(pickRegister([regs[1]], null)?.id).toBe('b'));
  it('null when there are no registers', () => expect(pickRegister([], 'a')).toBeNull());
});

describe('reaisToCents', () => {
  it.each([['10', 1000], ['10,50', 1050], ['0,01', 1], ['1.234,56', 123456]])('%s', (t, c) => expect(reaisToCents(t)).toBe(c));
  it.each([['abc'], ['1,234'], ['-1'], ['']])('invalid %s', (t) => expect(reaisToCents(t)).toBeNull());
});
```

- [ ] **Step 2: Run** `npx jest --config jest.unit.config.js __tests__/unit/caixa-device-register.test.ts` → FAIL.

- [ ] **Step 3: Implement the helpers**

```ts
// lib/caixa/device-register.ts
/** Which cash register this device uses (spec §8.1). Stored per device; any failure falls back to the default. */
export const DEVICE_REGISTER_KEY = 'gastrux:caixa:register';

export interface RegisterOption { id: string; name: string; isDefault: boolean }

export function pickRegister(registers: RegisterOption[], remembered: string | null): RegisterOption | null {
  if (!registers.length) return null;
  return registers.find((r) => r.id === remembered) ?? registers.find((r) => r.isDefault) ?? registers[0];
}

export function readRemembered(): string | null {
  try { return window.localStorage.getItem(DEVICE_REGISTER_KEY); } catch { return null; }
}

export function remember(id: string) {
  try { window.localStorage.setItem(DEVICE_REGISTER_KEY, id); } catch { /* private window: the default is used */ }
}
```

```ts
// components/caixa/money.ts
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** "1.234,56" or "10.5" -> cents; null when it is not a positive amount with up to 2 decimals. */
export function reaisToCents(text: string): number | null {
  let t = String(text ?? '').trim();
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const cents = Math.round(Number(t) * 100);
  return cents > 0 ? cents : null;
}
```

- [ ] **Step 4: Run** the unit test → PASS.

- [ ] **Step 5: `EntryDialog`**

```tsx
// components/caixa/entry-dialog.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useOutbox } from '@/components/offline/outbox-provider';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { reaisToCents, brl } from './money';

const TITLE = { WITHDRAWAL: 'Sangria', SUPPLY: 'Suprimento', EXPENSE: 'Despesa' } as const;
const HELP = {
  WITHDRAWAL: 'Retirada de dinheiro da gaveta (depósito, cofre).',
  SUPPLY: 'Dinheiro colocado na gaveta (troco extra).',
  EXPENSE: 'Conta paga com o dinheiro do caixa.',
} as const;

/** Sangria / suprimento / despesa: value, reason (category for an expense), receipt printed on confirm. */
export function EntryDialog({ sessionId, type, open, onClose, onDone }: { sessionId: string; type: 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE'; open: boolean; onClose: () => void; onDone: () => void }) {
  const { send } = useOutbox();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('compras');
  const [saving, setSaving] = useState(false);
  const [needsForce, setNeedsForce] = useState(false);
  if (!open) return null;

  const submit = async (force = false) => {
    const cents = reaisToCents(amount);
    if (!cents) { toast.error('Informe um valor válido'); return; }
    if (type !== 'SUPPLY' && !description.trim()) { toast.error('Informe o motivo'); return; }
    setSaving(true);
    try {
      const result = await send({
        method: 'POST',
        url: `/api/caixa/sessions/${sessionId}/entries`,
        label: `${TITLE[type]} ${brl(cents)}`,
        scope: 'cash-entry',
        queueable: false,
        body: { type, amount: (cents / 100).toFixed(2), description: description.trim() || undefined, category: type === 'EXPENSE' ? category : undefined, force },
      });
      if (result.queued) return;
      const data = await result.response.json().catch(() => ({}));
      if (result.response.status === 409 && data.code === 'CASH_NOT_ENOUGH') { setNeedsForce(true); toast.warning(data.error); return; }
      if (!result.response.ok) { toast.error(data.error || 'Erro ao lançar'); return; }
      if (data.warning) toast.warning(data.warning);
      toast.success(`${TITLE[type]} lançada`, { action: { label: 'Imprimir de novo', onClick: () => printInHiddenFrame(`/imprimir/caixa/lancamento/${data.entry.id}`) }, duration: 10000 });
      printInHiddenFrame(`/imprimir/caixa/lancamento/${data.entry.id}`);
      setAmount(''); setDescription(''); setNeedsForce(false);
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="entry-title">
      <Card className="max-w-sm w-full p-6 space-y-3">
        <h2 id="entry-title" className="text-xl font-bold">{TITLE[type]}</h2>
        <p className="text-sm text-gray-600">{HELP[type]}</p>
        <label htmlFor="entry-amount" className="text-sm font-semibold block">Valor (R$)</label>
        <Input id="entry-amount" inputMode="decimal" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" disabled={saving} />
        {type === 'EXPENSE' && (
          <>
            <label htmlFor="entry-category" className="text-sm font-semibold block">Categoria</label>
            <select id="entry-category" className="w-full border rounded-md h-10 px-3 bg-background" value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
              <option value="compras">Compras</option>
              <option value="entregador">Entregador</option>
              <option value="outros">Outros</option>
            </select>
          </>
        )}
        <label htmlFor="entry-description" className="text-sm font-semibold block">{type === 'SUPPLY' ? 'Observação (opcional)' : 'Motivo'}</label>
        <Input id="entry-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} disabled={saving} />
        {needsForce && <p className="text-sm text-amber-700">O caixa não tem esse valor em dinheiro. Só um gerente pode confirmar mesmo assim.</p>}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Voltar</Button>
          {needsForce ? (
            <Button onClick={() => submit(true)} disabled={saving} className="bg-amber-600">Confirmar mesmo assim</Button>
          ) : (
            <Button onClick={() => submit(false)} disabled={saving}>{saving ? 'Lançando...' : 'Confirmar'}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}
```

(Check `useOutbox().send` accepts `queueable: false` and returns `{ queued: false, response }` online, as in `components/comanda/counter-sale.tsx`; offline it throws `OfflineUnavailableError` — catch it and `toast.error(e.message)`.)

- [ ] **Step 6: `OpenShiftCard`**

```tsx
// components/caixa/open-shift-card.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { reaisToCents } from './money';

/** "Caixa X está fechado" + Troco inicial + Abrir caixa. Also used inside the payment panel (Task 12). */
export function OpenShiftCard({ registerId, registerName, onOpened }: { registerId: string; registerName: string; onOpened: (sessionId: string) => void }) {
  const [float, setFloat] = useState('');
  const [saving, setSaving] = useState(false);
  const open = async () => {
    const cents = float.trim() ? reaisToCents(float) : 0;
    if (cents === null) { toast.error('Troco inicial inválido'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/caixa/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ cashRegisterId: registerId, openingFloat: (cents / 100).toFixed(2) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Erro ao abrir o caixa'); return; }
      if (data.alreadyOpen) toast.info('Este caixa já estava aberto');
      else toast.success(`${registerName} aberto`);
      onOpened(data.session.id);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="p-6 max-w-md mx-auto text-center space-y-4">
      <h2 className="text-xl font-bold">{registerName} está fechado</h2>
      <div className="text-left">
        <label htmlFor="opening-float" className="text-sm font-semibold block mb-1">Troco inicial (R$)</label>
        <Input id="opening-float" inputMode="decimal" placeholder="0,00" value={float} onChange={(e) => setFloat(e.target.value)} disabled={saving} />
      </div>
      <Button size="lg" className="w-full" onClick={open} disabled={saving}>{saving ? 'Abrindo...' : 'Abrir caixa'}</Button>
    </Card>
  );
}
```

- [ ] **Step 7: `/caixa` page**

```tsx
// app/caixa/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { pickRegister, readRemembered, remember, type RegisterOption } from '@/lib/caixa/device-register';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { EntryDialog } from '@/components/caixa/entry-dialog';
import { CloseShiftDialog } from '@/components/caixa/close-shift-dialog';
import { brl } from '@/components/caixa/money';
import { CASH_METHODS, METHOD_KEY, METHOD_LABEL } from '@/lib/caixa/payment-methods';
import { ENTRY_TYPE_LABEL } from '@/lib/caixa/labels';
import type { SessionView } from '@/lib/caixa/sessions';

const MANAGER = ['OWNER', 'MANAGER', 'ADMIN'];
const time = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

/** Cash register screen (spec §8.1): open the shift, see what came in, sangria/suprimento/despesa, close. */
export default function CaixaPage() {
  const { data: auth } = useSession();
  const [registers, setRegisters] = useState<RegisterOption[]>([]);
  const [register, setRegister] = useState<RegisterOption | null>(null);
  const [view, setView] = useState<SessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<null | 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE'>(null);
  const [closing, setClosing] = useState(false);
  const [role, setRole] = useState<string>('CASHIER');

  const loadView = useCallback(async (reg: RegisterOption) => {
    const res = await fetch(`/api/caixa/sessions/current?cashRegisterId=${reg.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao carregar o caixa'); return; }
    setView(data.view);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/caixa/registers');
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { toast.error(data.error || 'Sem acesso ao caixa'); return; }
        setRegisters(data.registers);
        const chosen = pickRegister(data.registers, readRemembered());
        setRegister(chosen);
        if (chosen) { remember(chosen.id); await loadView(chosen); }
        const me = await fetch('/api/conta/profile').then((r) => r.json()).catch(() => null);
        if (me?.restaurantRole) setRole(me.restaurantRole);
      } finally {
        setLoading(false);
      }
    })();
  }, [loadView]);

  const isManager = MANAGER.includes(role);
  if (loading) return <p className="p-6">Carregando caixa...</p>;
  if (!register) return <p className="p-6">Nenhum caixa disponível.</p>;

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Caixa</h1>
        <div className="flex items-center gap-2">
          {registers.length > 1 && (
            <label className="text-sm flex items-center gap-2">
              Este aparelho usa:
              <select className="border rounded-md h-9 px-2 bg-background" value={register.id}
                onChange={async (e) => { const r = registers.find((x) => x.id === e.target.value)!; setRegister(r); remember(r.id); await loadView(r); }}>
                {registers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
          )}
          {isManager && <Link href="/caixa/historico" className="text-sm underline">Histórico</Link>}
        </div>
      </div>

      {!view ? (
        <OpenShiftCard registerId={register.id} registerName={register.name} onOpened={() => loadView(register)} />
      ) : (
        <>
          {view.hoursOpen >= 16 && (
            <div className="rounded-md bg-amber-100 text-amber-900 p-3 text-sm">Turno aberto há {view.hoursOpen} horas: feche o caixa antes de continuar o dia.</div>
          )}
          <Card className="p-4">
            <p className="text-sm text-gray-600">{view.register.name} · aberto por {view.openedByName ?? '-'} às {time(view.session.openedAt)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <Button size="lg" variant="outline" onClick={() => setDialog('WITHDRAWAL')}>Sangria</Button>
              <Button size="lg" variant="outline" onClick={() => setDialog('SUPPLY')}>Suprimento</Button>
              {isManager && <Button size="lg" variant="outline" onClick={() => setDialog('EXPENSE')}>Despesa</Button>}
              <Button size="lg" className="bg-red-600 hover:bg-red-700" onClick={() => setClosing(true)}>Fechar caixa</Button>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-2">Vendas do turno</h2>
            <p className="text-sm text-gray-600 mb-2">{view.sales.salesCount} venda(s) · ticket médio {brl(view.sales.averageTicketCents)}</p>
            <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
              {CASH_METHODS.map((m) => (
                <li key={m} className="rounded border p-2"><span className="block text-gray-500">{METHOD_LABEL[m]}</span><strong>{brl(view.sales.byMethod[m])}</strong></li>
              ))}
            </ul>
            {view.expected && (
              <p className="text-sm mt-3">Dinheiro esperado na gaveta: <strong>{brl(view.expected[METHOD_KEY.CASH])}</strong> <span className="text-gray-500">(visível só para gerente)</span></p>
            )}
            <p className="text-xs text-gray-500 mt-2">Recebido online no período (não entra na gaveta): {view.online.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold mb-2">Lançamentos</h2>
            {view.entries.length === 0 ? <p className="text-sm text-gray-500">Nenhum lançamento ainda.</p> : (
              <ul className="divide-y text-sm">
                {view.entries.map((e) => (
                  <li key={e.id} className="py-2 flex flex-wrap justify-between gap-2">
                    <span>{time(e.createdAt)} · {ENTRY_TYPE_LABEL[e.type]} · {METHOD_LABEL[e.method]}{e.description ? ` · ${e.description}` : ''}{e.afterClose ? ' · após o fechamento' : ''}</span>
                    <span className="flex items-center gap-3">
                      {e.orderSessionId && <Link className="underline" href={`/comanda/${e.orderSessionId}`}>venda</Link>}
                      <span className="text-gray-500">{e.createdByName}</span>
                      <strong className={['CHANGE', 'WITHDRAWAL', 'EXPENSE', 'REFUND'].includes(e.type) || e.direction === 'OUT' ? 'text-red-700' : ''}>{brl(e.amountCents)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {dialog && <EntryDialog sessionId={view.session.id} type={dialog} open onClose={() => setDialog(null)} onDone={() => loadView(register)} />}
          {closing && <CloseShiftDialog sessionId={view.session.id} registerName={view.register.name} onClose={() => setClosing(false)} onClosed={() => loadView(register)} />}
        </>
      )}
    </main>
  );
}
```

Two support pieces the page needs:
- The role: check whether `/api/conta/profile` already returns the restaurant role (`grep -n "restaurantRole\|role" app/api/conta/profile/route.ts`). If not, add `restaurantRole: member.role` to its GET response using `getRestaurantMember()`; keep the existing fields. The server still enforces every permission; the role only hides buttons.
- `CloseShiftDialog` is built in Task 8; until then, keep the import and create a stub file in this task that renders `null`, replaced in Task 8 (this keeps the page compiling and each commit green).

- [ ] **Step 8: Type-check and run unit tests**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "app/caixa|components/caixa|lib/caixa"` (expect no output) and `npm run test:unit`.

- [ ] **Step 9: Commit**

```bash
git add lib/caixa/device-register.ts components/caixa app/caixa/page.tsx app/api/conta/profile/route.ts __tests__/unit/caixa-device-register.test.ts
git commit -m "Caixa: screen to open the shift, see sales and entries, sangria/suprimento/despesa with receipt"
```

---

### Task 8: Blind close dialog with the cash counter

**Files:**
- Create: `components/caixa/cash-counter.tsx`; replace the stub `components/caixa/close-shift-dialog.tsx`
- Test: `__tests__/unit/caixa-close-dialog.test.tsx` (React Testing Library — check `jest.unit.config.js` has `testEnvironment: 'jsdom'` for `.tsx`; if not, test only the pure helper `buildCountedPayload` exported from the dialog file)

**Interfaces:**
- Produces:

```ts
export function CashCounter(props: { onTotal: (cents: number) => void }): JSX.Element;
export function buildCountedPayload(fields: Record<'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros', string>): { counted: Record<string, string>; invalid: string[] };
export function CloseShiftDialog(props: { sessionId: string; registerName: string; onClose: () => void; onClosed: () => void }): JSX.Element;
```

- [ ] **Step 1: Failing test (pure helper)**

```ts
// __tests__/unit/caixa-close-dialog.test.ts
import { buildCountedPayload } from '../../components/caixa/close-shift-dialog';

describe('buildCountedPayload', () => {
  it('empty fields count as zero; values are normalized to "0.00"', () => {
    expect(buildCountedPayload({ dinheiro: '1.234,50', pix: '', credito: '10', debito: '0', outros: '' })).toEqual({
      counted: { dinheiro: '1234.50', pix: '0.00', credito: '10.00', debito: '0.00', outros: '0.00' },
      invalid: [],
    });
  });
  it('flags invalid fields by label', () => {
    expect(buildCountedPayload({ dinheiro: 'abc', pix: '', credito: '', debito: '', outros: '' }).invalid).toEqual(['Dinheiro']);
  });
});
```

- [ ] **Step 2: Run** `npx jest --config jest.unit.config.js __tests__/unit/caixa-close-dialog.test.ts` → FAIL.

- [ ] **Step 3: Implement `CashCounter`**

```tsx
// components/caixa/cash-counter.tsx
'use client';

import { useState } from 'react';
import { DENOMINATIONS_CENTS } from '@/lib/caixa/rules';
import { brl } from './money';

/** Optional note-and-coin calculator: quantities per denomination -> total in cents. */
export function CashCounter({ onTotal }: { onTotal: (cents: number) => void }) {
  const [qty, setQty] = useState<Record<number, string>>({});
  const total = DENOMINATIONS_CENTS.reduce((s, d) => s + d * (parseInt(qty[d] || '0', 10) || 0), 0);
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-sm">
        {DENOMINATIONS_CENTS.map((d) => (
          <label key={d} className="flex items-center gap-1">
            <span className="w-16 text-right">{brl(d)}</span> ×
            <input aria-label={`Quantidade de ${brl(d)}`} inputMode="numeric" className="w-14 border rounded px-1 h-8" value={qty[d] ?? ''}
              onChange={(e) => setQty((p) => ({ ...p, [d]: e.target.value.replace(/\D/g, '') }))} />
          </label>
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">Total contado: <strong>{brl(total)}</strong></span>
        <button type="button" className="text-sm underline" onClick={() => onTotal(total)}>Usar este valor</button>
      </div>
    </div>
  );
}
```

(`lib/caixa/rules.ts` has no server-only imports, so the client imports it directly.)

- [ ] **Step 4: Implement `CloseShiftDialog`**

```tsx
// components/caixa/close-shift-dialog.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { exceedsAlert } from '@/lib/caixa/rules';
import { CashCounter } from './cash-counter';
import { brl } from './money';

type Key = 'dinheiro' | 'pix' | 'credito' | 'debito' | 'outros';
const FIELDS: Array<{ key: Key; label: string }> = [
  { key: 'dinheiro', label: 'Dinheiro' }, { key: 'pix', label: 'PIX' }, { key: 'credito', label: 'Cartão de crédito' },
  { key: 'debito', label: 'Cartão de débito' }, { key: 'outros', label: 'Outros' },
];

export function buildCountedPayload(fields: Record<Key, string>) {
  const counted: Record<string, string> = {};
  const invalid: string[] = [];
  for (const { key, label } of FIELDS) {
    let t = (fields[key] ?? '').trim();
    if (!t) { counted[key] = '0.00'; continue; }
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) { invalid.push(label); continue; }
    counted[key] = (Math.round(Number(t) * 100) / 100).toFixed(2);
  }
  return { counted, invalid };
}

/** Blind close in 3 steps (spec §8.2): count without seeing the expected, confirm, then see the difference. */
export function CloseShiftDialog({ sessionId, registerName, onClose, onClosed }: { sessionId: string; registerName: string; onClose: () => void; onClosed: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fields, setFields] = useState<Record<Key, string>>({ dinheiro: '', pix: '', credito: '', debito: '', outros: '' });
  const [notes, setNotes] = useState('');
  const [showCounter, setShowCounter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  const confirm = async () => {
    const { counted, invalid } = buildCountedPayload(fields);
    if (invalid.length) { toast.error(`Valor inválido: ${invalid.join(', ')}`); setStep(1); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/caixa/sessions/${sessionId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `close-${sessionId}` },
        body: JSON.stringify({ counted, notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Erro ao fechar o caixa'); return; }
      setResult(data.result);
      setStep(3);
      onClosed();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="close-title">
      <Card className="max-w-lg w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto">
        <h2 id="close-title" className="text-xl font-bold">Fechar {registerName}</h2>
        {step === 1 && (
          <>
            <p className="text-sm text-gray-600">Conte o dinheiro da gaveta e confira no relatório da maquininha o total de cada forma. O valor esperado aparece só depois de confirmar.</p>
            {FIELDS.map(({ key, label }) => (
              <div key={key}>
                <label htmlFor={`count-${key}`} className="text-sm font-semibold block mb-1">{label} (R$)</label>
                <Input id={`count-${key}`} inputMode="decimal" placeholder="0,00" value={fields[key]} onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value }))} />
                {key === 'dinheiro' && (
                  <button type="button" className="text-xs underline mt-1" onClick={() => setShowCounter((v) => !v)}>{showCounter ? 'Esconder' : 'Contar cédulas e moedas'}</button>
                )}
                {key === 'dinheiro' && showCounter && <CashCounter onTotal={(c) => setFields((p) => ({ ...p, dinheiro: (c / 100).toFixed(2).replace('.', ',') }))} />}
              </div>
            ))}
            <label htmlFor="close-notes" className="text-sm font-semibold block">Observação (opcional)</label>
            <Input id="close-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={onClose}>Voltar</Button>
              <Button onClick={() => setStep(2)}>Continuar</Button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <p>Depois de confirmar, os valores não podem ser alterados.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>Corrigir</Button>
              <Button className="bg-red-600" onClick={confirm} disabled={saving}>{saving ? 'Fechando...' : 'Confirmar fechamento'}</Button>
            </div>
          </>
        )}
        {step === 3 && result && (
          <>
            <table className="w-full text-sm">
              <thead><tr className="text-left"><th>Forma</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th></tr></thead>
              <tbody>
                {FIELDS.map(({ key, label }) => {
                  const exp = result.expected[key] ?? 0; const cnt = result.counted[key] ?? 0; const diff = result.difference[key] ?? 0;
                  if (!exp && !cnt && key !== 'dinheiro') return null;
                  const color = diff === 0 ? 'text-green-700' : exceedsAlert(exp, diff) ? 'text-red-700 font-bold' : 'text-amber-700';
                  return <tr key={key}><td>{label}</td><td className="text-right">{brl(exp)}</td><td className="text-right">{brl(cnt)}</td><td className={`text-right ${color}`}>{brl(diff)}</td></tr>;
                })}
              </tbody>
            </table>
            {result.alreadyClosed && <p className="text-sm text-amber-700">Este caixa já tinha sido fechado; estes são os valores do primeiro fechamento.</p>}
            {result.alertMethods?.length > 0 && <p className="text-sm text-red-700">Diferença acima do limite: o dono foi avisado.</p>}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => printInHiddenFrame(`/imprimir/caixa/fechamento/${sessionId}`)}>Imprimir fechamento</Button>
              <Button onClick={onClose}>Concluir</Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Run** the unit test → PASS; `npx tsc --noEmit -p . 2>&1 | grep -E "components/caixa"` → no output.

- [ ] **Step 6: Commit**

```bash
git add components/caixa/cash-counter.tsx components/caixa/close-shift-dialog.tsx __tests__/unit/caixa-close-dialog.test.ts
git commit -m "Caixa: blind close in 3 steps with note-and-coin counter and closing report"
```

---

### Task 9: Shift history, detail and menu entries

**Files:**
- Create: `app/caixa/historico/page.tsx`, `app/caixa/historico/[id]/page.tsx`
- Modify: `app/dashboard/page.tsx` (modules list ~line 79: add `{ id: 'caixa', title: 'Caixa', href: '/caixa', ... }` copying the shape of the `comanda` module), `components/admin/admin-sidebar.tsx` (add `{ label: 'Caixa', href: '/caixa', icon: <Wallet className="w-4 h-4" /> }` near the top-level operation items), `app/comanda/page.tsx` and `components/comanda/counter-sale.tsx` header (a small "Caixa" link)
- Test: manual in the browser in Task 13; route coverage already in Task 4.

**Interfaces:**
- Consumes: `GET /api/caixa/sessions`, `GET /api/caixa/sessions/[id]`, `SessionView`, `brl`, `ENTRY_TYPE_LABEL`, `METHOD_LABEL`, `exceedsAlert`.

- [ ] **Step 1: History list**

```tsx
// app/caixa/historico/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';

const KEYS = ['dinheiro', 'pix', 'credito', 'debito', 'outros'] as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'aberto');
const isoDay = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Shift history for the manager (spec §8.4). */
export default function CaixaHistoricoPage() {
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 30 * 86400_000)));
  const [to, setTo] = useState(isoDay(new Date()));
  const [rows, setRows] = useState<any[] | null>(null);

  const load = async () => {
    const res = await fetch(`/api/caixa/sessions?from=${from}&to=${to}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao carregar o histórico'); setRows([]); return; }
    setRows(data.sessions);
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDiff = (d: Record<string, number> | null) => (d ? KEYS.reduce((s, k) => s + (d[k] ?? 0), 0) : null);

  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Histórico de caixas</h1><Link href="/caixa" className="underline text-sm">Voltar ao caixa</Link></div>
      <Card className="p-3 flex flex-wrap gap-2 items-end">
        <label className="text-sm">De<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Até<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <Button onClick={load}>Filtrar</Button>
      </Card>
      {rows === null ? <p>Carregando...</p> : rows.length === 0 ? <p className="text-gray-500">Nenhum turno no período.</p> : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const diff = totalDiff(r.differenceCents);
            const color = diff === null ? '' : diff === 0 ? 'text-green-700' : Math.abs(diff) > 2000 ? 'text-red-700 font-bold' : 'text-amber-700';
            return (
              <li key={r.id}>
                <Link href={`/caixa/historico/${r.id}`}>
                  <Card className="p-3 flex flex-wrap justify-between gap-2 hover:bg-gray-50">
                    <span><strong>{r.registerName}</strong> · {when(r.openedAt)} → {when(r.closedAt)} · {r.openedByName ?? '-'}{r.closedByName ? ` / ${r.closedByName}` : ''}{r.lateEntries ? ` · ${r.lateEntries} após o fechamento` : ''}</span>
                    <span className="flex gap-4"><span>Vendas {brl(r.salesCents)}</span>{diff !== null && <span className={color}>Diferença {brl(diff)}</span>}</span>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
```

(The list color uses a flat R$ 20 heuristic on the summed difference; the exact per-method rule is shown on the detail page. Keep it, and say so in a comment.)

- [ ] **Step 2: Detail page**

```tsx
// app/caixa/historico/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { ENTRY_TYPE_LABEL } from '@/lib/caixa/labels';
import { METHOD_LABEL } from '@/lib/caixa/payment-methods';
import { exceedsAlert } from '@/lib/caixa/rules';
import type { SessionView } from '@/lib/caixa/sessions';

const ROWS = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'], ['outros', 'Outros']] as const;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '-');

export default function CaixaTurnoPage() {
  const { id } = useParams<{ id: string }>();
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/caixa/sessions/${id}`).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setView(d.view); }).catch((e) => setError(e.message || 'Erro'));
  }, [id]);
  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!view) return <p className="p-6">Carregando...</p>;
  return (
    <main className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{view.register.name}</h1>
        <div className="flex gap-2">
          {view.session.status === 'CLOSED' && <Button variant="outline" onClick={() => printInHiddenFrame(`/imprimir/caixa/fechamento/${id}`)}>Imprimir</Button>}
          <Link href="/caixa/historico" className="underline text-sm self-center">Voltar</Link>
        </div>
      </div>
      <Card className="p-4 text-sm space-y-1">
        <p>Aberto em {when(view.session.openedAt)} por {view.openedByName ?? '-'} · troco inicial {brl(view.session.openingFloatCents)}</p>
        <p>Fechado em {when(view.session.closedAt)} por {view.closedByName ?? '-'}</p>
        {view.session.closingNotes && <p>Obs.: {view.session.closingNotes}</p>}
        {view.session.lateEntries > 0 && <p className="text-amber-700">{view.session.lateEntries} venda(s) lançada(s) após o fechamento</p>}
      </Card>
      {view.expected && view.counted && view.difference && (
        <Card className="p-4">
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th>Forma</th><th className="text-right">Esperado</th><th className="text-right">Contado</th><th className="text-right">Diferença</th></tr></thead>
            <tbody>{ROWS.map(([k, label]) => {
              const exp = view.expected![k] ?? 0; const cnt = view.counted![k] ?? 0; const diff = view.difference![k] ?? 0;
              const color = diff === 0 ? 'text-green-700' : exceedsAlert(exp, diff) ? 'text-red-700 font-bold' : 'text-amber-700';
              return <tr key={k}><td>{label}</td><td className="text-right">{brl(exp)}</td><td className="text-right">{brl(cnt)}</td><td className={`text-right ${color}`}>{brl(diff)}</td></tr>;
            })}</tbody>
          </table>
        </Card>
      )}
      <Card className="p-4">
        <h2 className="font-semibold mb-2">Lançamentos</h2>
        <ul className="divide-y text-sm">
          {view.entries.map((e) => (
            <li key={e.id} className="py-2 flex justify-between gap-2">
              <span>{when(e.createdAt)} · {ENTRY_TYPE_LABEL[e.type]} · {METHOD_LABEL[e.method]}{e.description ? ` · ${e.description}` : ''}{e.afterClose ? ' · após o fechamento' : ''}</span>
              <span>{e.createdByName} · <strong>{brl(e.amountCents)}</strong></span>
            </li>
          ))}
        </ul>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Menu entries** — add the `caixa` module to `app/dashboard/page.tsx` (same object shape as `comanda`, icon `Wallet` from `lucide-react`, description "Abrir, sangria e fechamento do caixa"), the sidebar item in `components/admin/admin-sidebar.tsx`, and a "Caixa" link next to the title of `app/comanda/page.tsx`.

- [ ] **Step 4: Type-check, unit suite, publish Etapa 2**

Run: `npx tsc --noEmit -p . 2>&1 | grep -E "app/caixa|components/caixa|lib/caixa|admin-sidebar|dashboard/page"` (no output), `npm run test:unit`, `npx jest --config jest.integration.config.js --testPathPatterns "caixa/"`.

```bash
git add app/caixa/historico app/dashboard/page.tsx components/admin/admin-sidebar.tsx app/comanda/page.tsx
git commit -m "Caixa: shift history and detail; Caixa in the dashboard, sidebar and comanda"
```

Then run the browser check of Task 13 Steps 1-4 for the screens (open, sangria with receipt, close, history) before publishing Etapa 2 to `main`.

---

# Etapa 3 — Vendas

### Task 10: Sale recording service and comanda close with payments (+ reopen reversal)

**Files:**
- Create: `lib/caixa/sale.ts`
- Modify: `app/api/comanda/sessions/[id]/route.ts` (handlePUT, lines ~55-125)
- Test: `__tests__/integration/caixa/comanda-close.test.ts`

**Interfaces:**
- Consumes: `settlePayments`, `CashRuleError` (Task 2); `recalcClosedSession`, `ensureDefaultRegister` (Task 3); `alertLateEntry`, `alertSaleWithoutShift` (Task 3); `lineTotalCents` from `lib/comanda/line-total.ts`; `toNfcePaymentMethod`.
- Produces:

```ts
// lib/caixa/sale.ts
export async function comandaTotalCents(tx: Prisma.TransactionClient, orderSessionId: string): Promise<number>;
export interface SaleTarget { cashSessionId: string; late: boolean }
/** Resolves the shift that receives a sale. */
export async function resolveSaleShift(tx: Prisma.TransactionClient, input: { restaurantId: string; cashSessionId?: string | null; replay: boolean; legacy: boolean }): Promise<SaleTarget | null>; // null only for a legacy replay with no shift ever (sale without caixa)
export async function recordSaleEntries(tx: Prisma.TransactionClient, input: { restaurantId: string; target: SaleTarget; orderSessionId: string; settled: SettledPayment; createdById: string }): Promise<void>;
export async function reverseSaleEntries(tx: Prisma.TransactionClient, input: { restaurantId: string; orderSessionId: string; cashSessionId: string; createdById: string; reason: string }): Promise<number>; // lines written
export function readPayments(body: any): { payments: PaymentInput[]; legacy: boolean } | null; // legacy = body.paymentMethod without payments; null when neither
```

Rules encoded:
- `resolveSaleShift`: with `cashSessionId` → the shift must belong to the restaurant; `OPEN` → `{late:false}`; `CLOSED` → `{late:true}` only if `replay` (request has `Idempotency-Key` from the offline queue AND the client says `offline: true` in the body — see below), else throw `CashRuleError('Abra o caixa para receber', 409, 'CASH_SESSION_REQUIRED')`. Without `cashSessionId` and `legacy` → the default register's OPEN shift; else if `replay`, its most recent shift (late); else if replay and none ever → `null`; else 409.
- `replay` detection: the outbox already sends `Idempotency-Key`; online requests also send it. To tell an offline replay apart, the comanda page / counter sale add `queuedAt` (ISO time the sale was made) to the body when the send was queued; the outbox stores the body as given, so set it before calling `send`. `replay = Boolean(body.queuedAt)`.

- [ ] **Step 1: Failing tests**

```ts
// __tests__/integration/caixa/comanda-close.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/whatsapp/get-restaurant', () => ({ getCurrentRestaurantId: jest.fn() }));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { getServerSession } from 'next-auth';
import { getCurrentRestaurantId } from '../../../lib/whatsapp/get-restaurant';
import { PUT as updateComanda, DELETE as deleteComanda } from '../../../app/api/comanda/sessions/[id]/route';
import { openSession, closeSession, ensureDefaultRegister } from '../../../lib/caixa/sessions';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('closing a comanda records the payments in the shift', () => {
  let A, B, reg, owner, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  const as = (userId, restaurantId) => {
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: userId, email: `${userId}@x.test` } });
    (getCurrentRestaurantId as jest.Mock).mockResolvedValue(restaurantId);
  };
  const put = (id, body, key?) => updateComanda(new Request(`http://x/api/comanda/sessions/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: JSON.stringify(body),
  }) as any, { params: { id } });
  const comanda = async (lines: Array<[number, number, number?]>) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', tableNumber: 3 } });
    for (const [price, qty, modifier] of lines) {
      const item = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, price, quantity: qty } });
      if (modifier) {
        const m = await prisma.itemModifier.create({ data: { name: `Extra ${tag}`, priceAdjustment: modifier, restaurantId: A.restaurantId } });
        await prisma.orderSessionItemModifier.create({ data: { orderSessionItemId: item.id, modifierId: m.id, priceAdjustment: modifier } });
      }
    }
    return s;
  };
  const entriesOf = (orderSessionId) => prisma.cashSessionEntry.findMany({ where: { orderSessionId }, orderBy: { createdAt: 'asc' } });

  beforeAll(async () => {
    const s = await createMultiRestaurantScenario();
    A = s.restaurantA; B = s.restaurantB;
    reg = await ensureDefaultRegister(A.restaurantId);
    owner = { userId: A.ownerId, restaurantId: A.restaurantId, role: 'OWNER' };
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
  });
  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.notification.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await cleanupMultiTenantData(ids);
  });
  beforeEach(async () => {
    await prisma.cashSessionEntry.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    as(A.ownerId, A.restaurantId);
  });

  it('two methods with change: one receipt per method and one change line', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 2]]); // 60,00
    const res = await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }, { method: 'cartao de credito', amount: 20 }] });
    expect(res.status).toBe(200);
    const lines = (await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents]);
    expect(lines).toEqual(expect.arrayContaining([['RECEIPT', 'CASH', 5000], ['RECEIPT', 'CREDIT', 2000], ['CHANGE', 'CASH', 1000]]));
    expect(lines).toHaveLength(3);
  });

  it('total with quantities and modifiers matches the comanda total (Review Focus 5)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[10.33, 3, 0.5]]); // 3 x (10,33 + 0,50) = 32,49
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: '32.48' }] })).status).toBe(400);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: '32.49' }] })).status).toBe(200);
  });

  it('refused with 409 CASH_SESSION_REQUIRED when no shift is open; the comanda stays open', async () => {
    const s = await comanda([[30, 1]]);
    const res = await put(s.id, { status: 'CLOSED', payments: [{ method: 'pix', amount: 30 }] });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
    expect((await prisma.orderSession.findUnique({ where: { id: s.id } })).status).toBe('OPEN');
  });

  it('an ONLINE sale against a shift closed meanwhile is refused (Review Focus 2)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    await closeSession(owner, session.id, { counted: {} });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] }, crypto.randomUUID())).status).toBe(409);
  });

  it('an OFFLINE replay lands late in the closed shift, recalculates and alerts', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    await closeSession(owner, session.id, { counted: {} });
    const s = await comanda([[30, 1]]);
    const res = await put(s.id, { status: 'CLOSED', cashSessionId: session.id, queuedAt: new Date().toISOString(), payments: [{ method: 'dinheiro', amount: 30 }] }, crypto.randomUUID());
    expect(res.status).toBe(200);
    const shift = await prisma.cashSession.findUnique({ where: { id: session.id } });
    expect(shift.lateEntries).toBe(1);
    expect(shift.expectedCents.dinheiro).toBe(3000);
    expect((await entriesOf(s.id))[0].afterClose).toBe(true);
    expect(await prisma.notification.count({ where: { restaurantId: A.restaurantId, title: { contains: 'após o fechamento' } } })).toBe(1);
  });

  it('a replay with the same Idempotency-Key does not record twice', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    const key = crypto.randomUUID();
    const body = { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    await put(s.id, body, key);
    await put(s.id, body, key);
    expect(await entriesOf(s.id)).toHaveLength(1);
  });

  it('two different devices closing the same comanda: only one records (Review Focus 1)', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    const body = { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] };
    const results = await Promise.all([put(s.id, body, crypto.randomUUID()), put(s.id, body, crypto.randomUUID())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await entriesOf(s.id)).toHaveLength(1);
  });

  it('legacy body (single paymentMethod) records one receipt in the default register shift', async () => {
    await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', paymentMethod: 'cartao de debito' })).status).toBe(200);
    expect((await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents])).toEqual([['RECEIPT', 'DEBIT', 3000]]);
  });

  it('reopening a closed comanda reverses its receipts and change in the open shift', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }] });
    expect((await put(s.id, { status: 'OPEN', cashSessionId: session.id, reason: 'cliente pediu mais' })).status).toBe(200);
    const types = (await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents, e.direction]);
    expect(types).toEqual(expect.arrayContaining([['REFUND', 'CASH', 5000, null], ['ADJUSTMENT', 'CASH', 2000, 'IN']]));
  });

  it('cancelling a CLOSED paid comanda (DELETE) reverses its payments; without a shift id it is refused', async () => {
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] });
    const del = (body) => deleteComanda(new Request(`http://x/api/comanda/sessions/${s.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as any, { params: { id: s.id } });
    expect((await del({ reason: 'cliente desistiu' })).status).toBe(409);
    expect((await del({ reason: 'cliente desistiu', cashSessionId: session.id })).status).toBe(200);
    expect((await entriesOf(s.id)).map((e) => [e.type, e.method, e.amountCents])).toEqual(expect.arrayContaining([['REFUND', 'PIX', 3000]]));
  });

  it("another restaurant's shift is refused", async () => {
    const regB = await ensureDefaultRegister(B.restaurantId);
    const { session } = await openSession({ userId: B.ownerId, restaurantId: B.restaurantId, role: 'OWNER' }, { cashRegisterId: regB.id, openingFloat: 0 });
    const s = await comanda([[30, 1]]);
    expect((await put(s.id, { status: 'CLOSED', cashSessionId: session.id, payments: [{ method: 'pix', amount: 30 }] })).status).toBe(409);
  });
});
```

Notes for the implementer: check the real field names of `OrderSessionItemModifier` (`orderSessionItemId`? `itemId`?) and `ItemModifier` required fields with `grep -n "model OrderSessionItemModifier" -A10 prisma/schema.prisma` before running; adjust the fixture, not the assertion. The reversal test expects `REFUND CASH 5000` (the cash handed over) and `ADJUSTMENT IN 2000` (the change given back counts again) — net effect −3000, the sale value.

- [ ] **Step 2: Run** `npx jest --config jest.integration.config.js --testPathPatterns caixa/comanda-close` → FAIL.

- [ ] **Step 3: Implement `lib/caixa/sale.ts`**

```ts
import type { Prisma } from '@prisma/client';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { CASH_METHODS, toCashMethod } from './payment-methods';
import { CashRuleError, type PaymentInput, type SettledPayment } from './rules';
import { ensureDefaultRegister, recalcClosedSession } from './sessions';
import { alertLateEntry } from './alerts';

/** Sales paid on the spot enter the cash shift (spec §6). Every function runs inside the caller's transaction. */

const REQUIRED = () => new CashRuleError('Abra o caixa para receber', 409, 'CASH_SESSION_REQUIRED');

export async function comandaTotalCents(tx: Prisma.TransactionClient, orderSessionId: string) {
  const items = await tx.orderSessionItem.findMany({
    where: { sessionId: orderSessionId },
    select: { price: true, quantity: true, modifiers: { select: { priceAdjustment: true } } },
  });
  return items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0);
}

export function readPayments(body: any): { payments: PaymentInput[]; legacy: boolean } | null {
  if (Array.isArray(body?.payments)) return { payments: body.payments, legacy: false };
  if (body?.paymentMethod) return { payments: [{ method: body.paymentMethod, amount: null }], legacy: true };
  return null;
}

export interface SaleTarget { cashSessionId: string; late: boolean }

export async function resolveSaleShift(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; cashSessionId?: string | null; replay: boolean; legacy: boolean }
): Promise<SaleTarget | null> {
  const { restaurantId, replay } = input;
  if (input.cashSessionId) {
    const s = await tx.cashSession.findFirst({ where: { id: String(input.cashSessionId), restaurantId }, select: { id: true, status: true } });
    if (!s) throw REQUIRED();
    if (s.status === 'OPEN') return { cashSessionId: s.id, late: false };
    if (replay) return { cashSessionId: s.id, late: true };
    throw REQUIRED();
  }
  if (!input.legacy) throw REQUIRED();
  const register = await ensureDefaultRegister(restaurantId);
  const open = await tx.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' }, select: { id: true } });
  if (open) return { cashSessionId: open.id, late: false };
  if (!replay) throw REQUIRED();
  const last = await tx.cashSession.findFirst({ where: { cashRegisterId: register.id }, orderBy: { openedAt: 'desc' }, select: { id: true } });
  return last ? { cashSessionId: last.id, late: true } : null;
}

export async function recordSaleEntries(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; target: SaleTarget; orderSessionId: string; settled: SettledPayment; createdById: string }
) {
  const { restaurantId, target, orderSessionId, settled, createdById } = input;
  const base = { restaurantId, cashSessionId: target.cashSessionId, orderSessionId, createdById, afterClose: target.late };
  const rows = CASH_METHODS.filter((m) => settled.receipts[m] > 0).map((m) => ({ ...base, type: 'RECEIPT' as const, method: m, amountCents: settled.receipts[m] }));
  if (settled.changeCents > 0) rows.push({ ...base, type: 'CHANGE' as const, method: 'CASH', amountCents: settled.changeCents });
  if (rows.length) await tx.cashSessionEntry.createMany({ data: rows });
  if (target.late) {
    await tx.cashSession.update({ where: { id: target.cashSessionId }, data: { lateEntries: { increment: 1 } } });
    await recalcClosedSession(tx, target.cashSessionId);
  }
}

export async function reverseSaleEntries(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; orderSessionId: string; cashSessionId: string; createdById: string; reason: string }
) {
  const shift = await tx.cashSession.findFirst({ where: { id: input.cashSessionId, restaurantId: input.restaurantId, status: 'OPEN' }, select: { id: true } });
  if (!shift) throw REQUIRED();
  const lines = await tx.cashSessionEntry.findMany({ where: { orderSessionId: input.orderSessionId, restaurantId: input.restaurantId } });
  // Net what is still in the drawer for this comanda per method (an earlier reopen already reversed some)
  const net: Record<string, { receipt: number; change: number }> = {};
  for (const l of lines) {
    const n = (net[l.method] ??= { receipt: 0, change: 0 });
    if (l.type === 'RECEIPT') n.receipt += l.amountCents;
    if (l.type === 'REFUND') n.receipt -= l.amountCents;
    if (l.type === 'CHANGE') n.change += l.amountCents;
    if (l.type === 'ADJUSTMENT' && l.direction === 'IN') n.change -= l.amountCents;
  }
  const description = `Reabertura da comanda: ${input.reason}`.slice(0, 200);
  const base = { restaurantId: input.restaurantId, cashSessionId: shift.id, orderSessionId: input.orderSessionId, createdById: input.createdById, description };
  const rows: Prisma.CashSessionEntryCreateManyInput[] = [];
  for (const [method, n] of Object.entries(net)) {
    if (n.receipt > 0) rows.push({ ...base, type: 'REFUND', method: method as any, amountCents: n.receipt });
    if (n.change > 0) rows.push({ ...base, type: 'ADJUSTMENT', method: method as any, amountCents: n.change, direction: 'IN' });
  }
  if (rows.length) await tx.cashSessionEntry.createMany({ data: rows });
  return rows.length;
}

export { toCashMethod };
```

After the transaction that used `recordSaleEntries` with `target.late`, the route calls `alertLateEntry(restaurantId, target.cashSessionId, orderSessionId)` (alerts never run inside the transaction).

- [ ] **Step 4: Change `handlePUT` in `app/api/comanda/sessions/[id]/route.ts`**

Replace the block from `const { notes, customerName, status, customerCPF, paymentMethod } = await request.json();` down to the end of the `if (closing) { ... }` block with:

```ts
    const body = await request.json().catch(() => ({}));
    const { notes, customerName, status, customerCPF } = body ?? {};
    const replay = Boolean(body?.queuedAt);

    // A cancelled comanda stays cancelled; a closed one is only closed once (the note is issued once)
    if (status !== undefined && ownedSession.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Comanda cancelada não pode mudar de status' }, { status: 409 });
    }
    // Cancelling goes through DELETE (manager + reason + trace), never through a status update
    if (status === 'CANCELLED') {
      return NextResponse.json({ error: 'Para cancelar a comanda use o cancelamento (exige gerente e motivo)' }, { status: 400 });
    }

    const reopening = status !== undefined && status !== 'CLOSED' && ownedSession.status === 'CLOSED';
    const closing = status === 'CLOSED' && ownedSession.status !== 'CLOSED';
    let member: RestaurantMember | null = null;

    if (reopening) {
      const auth = await requireRestaurantRole(MANAGER_ROLES, 'Reabrir uma conta fechada exige um gerente');
      if (!auth.ok) return auth.response;
      member = auth.member;
    }
    if (closing) {
      const auth = await requireRestaurantRole(CASHIER_PLUS, 'Fechar a conta exige o caixa');
      if (!auth.ok) return auth.response;
      member = auth.member;
    }

    let saleTarget: SaleTarget | null = null;
    let primaryMethod: string | undefined;
    let changeCents = 0;
    let updated;
    try {
      updated = await prisma.$transaction(async (tx) => {
        if (closing) {
          const read = readPayments(body);
          if (!read) throw new CashRuleError('Informe as formas de pagamento');
          const total = await comandaTotalCents(tx, params.id);
          const payments = read.legacy ? [{ method: read.payments[0].method, amount: (total / 100).toFixed(2) }] : read.payments;
          const settled = settlePayments(total, payments);
          saleTarget = await resolveSaleShift(tx, { restaurantId, cashSessionId: body?.cashSessionId, replay, legacy: read.legacy });
          // Only one close writes: a second device sees the comanda already closed
          const guard = await tx.orderSession.updateMany({ where: { id: params.id, status: { not: 'CLOSED' } }, data: { status: 'CLOSED', closedAt: new Date() } });
          if (guard.count === 0) throw new CashRuleError('Esta conta já foi fechada', 409, 'ALREADY_CLOSED');
          if (saleTarget) await recordSaleEntries(tx, { restaurantId, target: saleTarget, orderSessionId: params.id, settled, createdById: member!.userId });
          primaryMethod = toNfcePaymentMethod(settled.primaryMethod);
          changeCents = settled.changeCents;
        }
        if (reopening) {
          const reason = String(body?.reason ?? '').trim();
          if (reason.length < 3) throw new CashRuleError('Informe o motivo da reabertura');
          await reverseSaleEntries(tx, { restaurantId, orderSessionId: params.id, cashSessionId: String(body?.cashSessionId ?? ''), createdById: member!.userId, reason });
        }
        return tx.orderSession.update({
          where: { id: params.id },
          data: {
            notes: notes !== undefined ? notes : undefined,
            customerName: customerName !== undefined ? customerName : undefined,
            ...(status !== undefined && !closing ? { status } : {}),
          },
          include: { items: { include: { recipe: { select: { name: true, sellingPrice: true } } } } },
        });
      });
    } catch (error) {
      if (error instanceof CashRuleError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
      throw error;
    }

    if (reopening) {
      await recordAudit(member!, { action: 'STATUS_CHANGE', entityType: 'OrderSession', entityId: params.id, changes: { from: 'CLOSED', to: status, reason: body?.reason } });
    }

    if (closing) {
      const target = saleTarget as SaleTarget | null;
      if (target?.late) await alertLateEntry(restaurantId, target.cashSessionId, params.id);
      if (!target) await alertSaleWithoutShift(restaurantId, params.id);
      // Closing the bill issues the NFC-e when the restaurant enabled it (NFeConfig.autoIssueOnSale).
      // Never fails the close: a problem comes back as a message and leaves an alert for the manager.
      const nfce = await autoEmitNFCe({
        restaurantId,
        orderSessionId: params.id,
        customerCPF,
        customerName: customerName || updated.customerName,
        paymentMethod: primaryMethod,
        onlyIfEnabled: true,
      });
      return NextResponse.json({ ...updated, changeCents, nfce });
    }

    return NextResponse.json(updated);
```

Also change `DELETE` (cancel) in the same file: when the comanda is `CLOSED` and has cash lines, require `body.cashSessionId` and, inside one `prisma.$transaction`, call `reverseSaleEntries(tx, { restaurantId: member.restaurantId, orderSessionId: params.id, cashSessionId: body.cashSessionId, createdById: member.userId, reason })` before setting `status: 'CANCELLED'`; a `CashRuleError` becomes its HTTP status (409 `CASH_SESSION_REQUIRED` without a shift). A comanda without cash lines cancels as today. The comanda page passes the device's open shift id in the cancel request.

Imports to add at the top: `type RestaurantMember` from `@/lib/auth/restaurant-role`; `CASHIER_PLUS` from `@/lib/caixa/roles`; `CashRuleError, settlePayments` from `@/lib/caixa/rules`; `comandaTotalCents, readPayments, recordSaleEntries, resolveSaleShift, reverseSaleEntries, type SaleTarget` from `@/lib/caixa/sale`; `toNfcePaymentMethod` from `@/lib/caixa/payment-methods`; `alertLateEntry, alertSaleWithoutShift` from `@/lib/caixa/alerts`. Remove the old reopening audit block (moved below the transaction).

Behaviour changes to check against other suites: closing now needs `CASHIER_PLUS` (a `COOK` can no longer close a bill — intended), needs payments, and needs an open shift. Run the existing comanda/fiscal/printing/offline suites and update their fixtures to open a shift and send `payments` (or the legacy `paymentMethod` with an open default shift). Do not weaken assertions.

- [ ] **Step 5: Run** `npx jest --config jest.integration.config.js --testPathPatterns "caixa/comanda-close|bad-day/|fiscal-"` → PASS (after updating fixtures as described).

- [ ] **Step 6: Commit**

```bash
git add lib/caixa/sale.ts "app/api/comanda/sessions/[id]/route.ts" __tests__
git commit -m "Caixa: closing a comanda records each payment and the change in the shift; reopening reverses them"
```

---

### Task 11: Quick sale (balcão) with payments

**Files:**
- Modify: `app/api/comanda/quick-sale/route.ts`
- Test: `__tests__/integration/caixa/quick-sale.test.ts`

**Interfaces:**
- Consumes: everything from Task 10's `lib/caixa/sale.ts`.
- Body: `{ clientId, items, customerCPF?, customerName?, sendToKitchen?, cashSessionId?, payments?, paymentMethod? (legacy), queuedAt? }`; response adds `changeCents`.

- [ ] **Step 1: Failing tests** — same mocks as Task 10. Cases:
  - open shift + `payments: [{ method: 'dinheiro', amount: 50 }]` for a 30,00 sale → `201`, entries `RECEIPT CASH 5000`, `CHANGE CASH 2000`, comanda `CLOSED`;
  - no shift, online → `409 CASH_SESSION_REQUIRED` and **no** `orderSession` created (the whole sale is refused; check `prisma.orderSession.findUnique({ where: { id: clientId } })` is null);
  - replay of the same `clientId` → `alreadyRecorded: true`, still one set of entries;
  - legacy `paymentMethod: 'pix'` with the default shift open → one `RECEIPT PIX`.

```ts
const sale = (body, key = crypto.randomUUID()) => quickSale(new Request('http://x/api/comanda/quick-sale', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body),
}) as any);
// menu item fixture: create a MenuItem for `burger` at R$ 30 in restaurant A (copy from __tests__/integration/bad-day/offline or printing suites)
it('records payments and change', async () => {
  const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
  const clientId = `bal-${crypto.randomUUID()}`;
  const res = await sale({ clientId, items: [{ menuItemId: menuItem.id, quantity: 1 }], cashSessionId: session.id, payments: [{ method: 'dinheiro', amount: 50 }] });
  expect(res.status).toBe(201);
  expect((await res.json()).changeCents).toBe(2000);
  const lines = await prisma.cashSessionEntry.findMany({ where: { orderSessionId: clientId } });
  expect(lines.map((l) => [l.type, l.amountCents]).sort()).toEqual([['CHANGE', 2000], ['RECEIPT', 5000]]);
});
it('refuses the whole sale without an open shift', async () => {
  const clientId = `bal-${crypto.randomUUID()}`;
  const res = await sale({ clientId, items: [{ menuItemId: menuItem.id, quantity: 1 }], payments: [{ method: 'pix', amount: 30 }] });
  expect(res.status).toBe(409);
  expect(await prisma.orderSession.findUnique({ where: { id: clientId } })).toBeNull();
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement.** In `handlePOST`, after the `existing` checks, replace the creation transaction and the close with one transaction:

```ts
  const read = readPayments(body);
  if (!read) return NextResponse.json({ error: 'Informe as formas de pagamento' }, { status: 400 });
  const replay = Boolean(body?.queuedAt);
  let target: SaleTarget | null = null;
  let changeCents = 0;
  let primaryMethod: string | undefined;
  try {
    await prisma.$transaction(async (tx) => {
      target = await resolveSaleShift(tx, { restaurantId: member.restaurantId, cashSessionId: body?.cashSessionId, replay, legacy: read.legacy });
      await tx.orderSession.create({
        data: { id: clientId, restaurantId: member.restaurantId, userId: member.userId, status: 'OPEN', customerName: customerName || 'Balcão' },
      });
      for (const item of items) await addComandaItem(tx, member.restaurantId, clientId, item);
      const total = await comandaTotalCents(tx, clientId);
      const payments = read.legacy ? [{ method: read.payments[0].method, amount: (total / 100).toFixed(2) }] : read.payments;
      const settled = settlePayments(total, payments);
      if (target) await recordSaleEntries(tx, { restaurantId: member.restaurantId, target, orderSessionId: clientId, settled, createdById: member.userId });
      changeCents = settled.changeCents;
      primaryMethod = toNfcePaymentMethod(settled.primaryMethod);
    });
  } catch (error) {
    if (error instanceof AddItemError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof CashRuleError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status });
    throw error;
  }
```

Keep the kitchen send; then close the session (`status: 'CLOSED', closedAt`), call `alertLateEntry` / `alertSaleWithoutShift` as in Task 10, pass `paymentMethod: primaryMethod` to `autoEmitNFCe`, and return `{ session, kitchen, nfce, changeCents }` with `201`. Update the route doc comment with the new body.

- [ ] **Step 4: Run** `npx jest --config jest.integration.config.js --testPathPatterns "caixa/quick-sale|bad-day/offline|printing"` → PASS (update other suites' fixtures to open a shift).

- [ ] **Step 5: Commit**

```bash
git add app/api/comanda/quick-sale/route.ts __tests__
git commit -m "Caixa: counter sale records payments and change in the shift"
```

---

### Task 12: Payment panel in the comanda close and the counter sale

**Files:**
- Create: `components/caixa/payment-panel.tsx`, `lib/caixa/use-device-shift.ts`
- Modify: `app/comanda/[sessionId]/page.tsx` (close modal ~lines 645-700, `handleCloseBill` ~170-200), `components/comanda/counter-sale.tsx` (`finish` ~55-95 and its payment `select`)
- Test: `__tests__/unit/caixa-payment-panel.test.ts` (pure helper)

**Interfaces:**
- Produces:

```ts
// lib/caixa/use-device-shift.ts  ('use client')
export function useDeviceShift(): { loading: boolean; register: RegisterOption | null; shiftId: string | null; refresh: () => Promise<void> };
// components/caixa/payment-panel.tsx
export interface PanelPayment { method: 'dinheiro' | 'pix' | 'cartao de credito' | 'cartao de debito'; amount: string }
export function panelState(totalCents: number, payments: PanelPayment[]): { paidCents: number; remainingCents: number; changeCents: number; valid: boolean; error: string | null };
export function PaymentPanel(props: { totalCents: number; payments: PanelPayment[]; onChange: (p: PanelPayment[]) => void; disabled?: boolean }): JSX.Element;
```

- [ ] **Step 1: Failing unit test**

```ts
// __tests__/unit/caixa-payment-panel.test.ts
import { panelState } from '../../components/caixa/payment-panel';

describe('panelState', () => {
  it('remaining while underpaid', () => expect(panelState(8000, [{ method: 'pix', amount: '50' }])).toMatchObject({ remainingCents: 3000, valid: false }));
  it('change from cash', () => expect(panelState(3750, [{ method: 'dinheiro', amount: '50' }])).toMatchObject({ changeCents: 1250, valid: true }));
  it('card over the total is invalid', () => expect(panelState(1000, [{ method: 'cartao de debito', amount: '11' }]).valid).toBe(false));
  it('mixed exact', () => expect(panelState(8000, [{ method: 'dinheiro', amount: '50' }, { method: 'cartao de credito', amount: '30' }])).toMatchObject({ remainingCents: 0, changeCents: 0, valid: true }));
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `PaymentPanel`**

```tsx
// components/caixa/payment-panel.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { brl, reaisToCents } from './money';

export interface PanelPayment { method: 'dinheiro' | 'pix' | 'cartao de credito' | 'cartao de debito'; amount: string }
const QUICK: Array<{ method: PanelPayment['method']; label: string }> = [
  { method: 'dinheiro', label: 'Dinheiro' }, { method: 'pix', label: 'PIX' },
  { method: 'cartao de credito', label: 'Crédito' }, { method: 'cartao de debito', label: 'Débito' },
];

/** Same rules as lib/caixa/rules.ts settlePayments, for live feedback (the server decides). */
export function panelState(totalCents: number, payments: PanelPayment[]) {
  let paid = 0; let cash = 0;
  for (const p of payments) {
    const c = reaisToCents(p.amount);
    if (c === null) return { paidCents: paid, remainingCents: Math.max(0, totalCents - paid), changeCents: 0, valid: false, error: 'Valor inválido' };
    paid += c; if (p.method === 'dinheiro') cash += c;
  }
  if (paid - cash > totalCents) return { paidCents: paid, remainingCents: 0, changeCents: 0, valid: false, error: 'Cartão e PIX não podem passar do total' };
  const remaining = Math.max(0, totalCents - paid);
  return { paidCents: paid, remainingCents: remaining, changeCents: Math.max(0, paid - totalCents), valid: remaining === 0 && (payments.length > 0 || totalCents === 0), error: null };
}

/** Payment of a sale (spec §8.3): quick method buttons, several methods, change from cash. */
export function PaymentPanel({ totalCents, payments, onChange, disabled }: { totalCents: number; payments: PanelPayment[]; onChange: (p: PanelPayment[]) => void; disabled?: boolean }) {
  const state = panelState(totalCents, payments);
  const fill = (method: PanelPayment['method']) => {
    const rest = state.remainingCents || (payments.length ? 0 : totalCents);
    onChange([...payments, { method, amount: (rest / 100).toFixed(2).replace('.', ',') }]);
  };
  return (
    <div className="space-y-3">
      <p className="text-2xl font-bold text-center">{brl(totalCents)}</p>
      {payments.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-24 text-sm">{QUICK.find((q) => q.method === p.method)?.label}</span>
          <Input aria-label={`Valor em ${p.method}`} inputMode="decimal" value={p.amount} disabled={disabled}
            onChange={(e) => onChange(payments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
          <button type="button" className="text-red-600 text-sm" onClick={() => onChange(payments.filter((_, j) => j !== i))} disabled={disabled} aria-label="Remover forma">✕</button>
        </div>
      ))}
      {(state.remainingCents > 0 || payments.length === 0) && (
        <div>
          <p className="text-sm mb-1">{payments.length ? `Falta ${brl(state.remainingCents)}: adicionar outra forma` : 'Forma de pagamento'}</p>
          <div className="grid grid-cols-4 gap-2">
            {QUICK.map((q) => <Button key={q.method} type="button" variant="outline" onClick={() => fill(q.method)} disabled={disabled}>{q.label}</Button>)}
          </div>
        </div>
      )}
      {state.changeCents > 0 && <p className="text-lg font-semibold text-green-700">Troco: {brl(state.changeCents)}</p>}
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Implement `useDeviceShift`**

```ts
// lib/caixa/use-device-shift.ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { pickRegister, readRemembered, remember, type RegisterOption } from './device-register';

/** The register this device uses and its open shift, for the payment panel (spec §8.3). */
export function useDeviceShift() {
  const [loading, setLoading] = useState(true);
  const [register, setRegister] = useState<RegisterOption | null>(null);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/caixa/registers');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const reg = pickRegister(data.registers, readRemembered());
      setRegister(reg);
      if (reg) remember(reg.id);
      const listed = data.registers.find((r: any) => r.id === reg?.id);
      setShiftId(listed?.openSession?.id ?? null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { loading, register, shiftId, refresh };
}
```

Offline: `/api/caixa/registers` is a GET under `/api/caixa`, cached by the service worker with the stale marker, so the last known shift id is available offline and travels with the queued sale.

- [ ] **Step 5: Wire into the comanda close modal**

In `app/comanda/[sessionId]/page.tsx`:
- Replace `closePayment` state with `const [payments, setPayments] = useState<PanelPayment[]>([]);` and add `const shift = useDeviceShift();`.
- In the modal, replace the "Forma de pagamento" `<select>` block with:

```tsx
                {shift.loading ? <p className="text-sm">Carregando caixa...</p> : !shift.shiftId && shift.register ? (
                  <div className="rounded-md bg-amber-50 p-3 space-y-2">
                    <p className="text-sm font-semibold">Abra o caixa para receber</p>
                    <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => shift.refresh()} />
                  </div>
                ) : (
                  <PaymentPanel totalCents={Math.round(totalPrice * 100)} payments={payments} onChange={setPayments} disabled={closingBill} />
                )}
```

- Disable the "Fechar conta" button unless `shift.shiftId && panelState(Math.round(totalPrice * 100), payments).valid`.
- In `handleCloseBill`, send:

```ts
        {
          status: 'CLOSED',
          customerCPF: closeCpf.replace(/\D/g, '') || undefined,
          cashSessionId: shift.shiftId,
          payments: payments.map((p) => ({ method: p.method, amount: p.amount.replace(/\./g, '').replace(',', '.') })),
          ...(navigator.onLine ? {} : { queuedAt: new Date().toISOString() }),
        },
```

and on success show `data.changeCents > 0 ? toast.success(\`Troco: ${brl(data.changeCents)}\`) : null` before the existing receipt toast; on `409` with `code === 'CASH_SESSION_REQUIRED'` call `shift.refresh()` and show the message. Reset `payments` when the modal closes.

`totalPrice` must be the server's rule (unit price with modifiers × quantity). Confirm the page computes it with `lib/comanda/line-total.ts`; if it does not, switch it to `lineTotal` so the panel's total equals the server's (Review Focus 5).

- [ ] **Step 6: Wire into the counter sale**

In `components/comanda/counter-sale.tsx`:
- Replace the `payment` select with `<PaymentPanel totalCents={Math.round(total * 100)} payments={payments} onChange={setPayments} disabled={saving} />` and the same "Abra o caixa" fallback with `OpenShiftCard`.
- In `finish`, refuse (toast) when `!shift.shiftId` or `!panelState(...).valid`; send `cashSessionId: shift.shiftId`, `payments` (normalized as above) and `queuedAt` when offline instead of `paymentMethod`; show the change toast; reset `payments` after a sale.

- [ ] **Step 7: Run** `npx jest --config jest.unit.config.js __tests__/unit/caixa-payment-panel.test.ts` → PASS; `npx tsc --noEmit -p . 2>&1 | grep -E "comanda|caixa"` → no output.

- [ ] **Step 8: Commit**

```bash
git add components/caixa/payment-panel.tsx lib/caixa/use-device-shift.ts "app/comanda/[sessionId]/page.tsx" components/comanda/counter-sale.tsx __tests__/unit/caixa-payment-panel.test.ts
git commit -m "Caixa: payment panel with several methods and change in the comanda close and counter sale"
```

---

### Task 13: Browser check, full suites and publication

**Files:**
- Modify: the Playwright seed script used for the printing browser test (session scratchpad; recreate it if gone: user `demo-caixa@gastrux.test` / `Demo@12345`, restaurant "Lanchonete Demo", tier business, one menu item R$ 30)
- No product files unless the check finds bugs (fix with a test first).

- [ ] **Step 1: Start the app against the test DB**

Run: `npx dotenv -e .env.test -- next dev -p 3100` (background). Note the PID; `next dev` leaves a child node on the port, stop it by PID at the end.

- [ ] **Step 2: Cash screens (desktop 1280×800)** with Playwright MCP:
  1. Log in, open `/caixa` → "Caixa principal está fechado". Type 100 → Abrir caixa → screen shows the four buttons and "aberto por".
  2. Sangria R$ 20 "cofre" → toast "Sangria lançada" and the receipt page `/imprimir/caixa/lancamento/<id>` renders with SANGRIA and R$ 20,00.
  3. Despesa button absent for a cashier user; present for the owner.
  4. Counter sale on `/comanda` of R$ 30 with Dinheiro 50 → toast "Troco: R$ 20,00"; `/caixa` lists the receipt and the change.
  5. Fechar caixa: count dinheiro 110 → Continuar → Confirmar → table shows expected 110,00 (100 + 50 − 20 − 20), difference 0, green. Imprimir fechamento renders.
  6. `/caixa/historico` lists the shift; detail shows the table and the entries.

- [ ] **Step 3: Comanda close with two methods** — open a shift, a table comanda of R$ 60, close with Dinheiro 50 + Crédito 20 → change R$ 10; closing again from another tab → "Esta conta já foi fechada".

- [ ] **Step 4: Mobile (390×844)** — repeat steps 2.1, 2.2 and 2.5: no horizontal scroll, dialogs fit, buttons reachable.

- [ ] **Step 5: Full suites**

Run: `npm run test:unit` and `npx jest --config jest.integration.config.js --testPathPatterns "caixa/|bad-day/|fiscal-|integration/api/(mp-|delivery-|security-fixes)"` and `npx tsc --noEmit -p . 2>&1 | grep -E "lib/caixa|app/api/caixa|app/caixa|components/caixa|comanda" `.
Expected: all green; no type errors in touched files.

- [ ] **Step 6: Publish**

```bash
git fetch -q https://github.com/andreyluis2003/Gastrux.git main
git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main
git ls-remote https://github.com/andreyluis2003/Gastrux.git main
```

Tell the owner, in order: (1) run the three `SELECT count(*)` lines from the migration header in production and report the numbers; (2) click Deploy on `app` and `homolog`; (3) run `npx prisma migrate deploy` in each service console; (4) open `/caixa` and open the shift before the first sale of the day (sales are refused without it).
