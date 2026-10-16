# Contas de consumo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register monthly utility bills (value + consumption), add them to the DRE by reference month, and on Pro show month-over-month indicators and a bell alert when consumption is 20% above the 3-month average.

**Architecture:** Two new tables: `utility_accounts` (the bills a restaurant has) and `utility_bills` (one per account per reference month, upsert). Pure rules in `lib/utility-bills/rules.ts`; DB work in `lib/utility-bills/{service,alert}.ts`; month sales (Caixa criterion) in `lib/finance/month-sales.ts`; thin routes under `app/api/utility-bills/`; the DRE route adds a "Contas de consumo" line; screen `/dashboard/financeiro/contas`.

**Tech Stack:** Next.js 14 app router, Prisma 5 + PostgreSQL, Jest (unit `jest.unit.config.js`; integration with the real test DB `jest.integration.config.js`), Tailwind + `components/ui/*`.

**Spec:** `docs/superpowers/specs/2026-10-16-contas-de-consumo-design.md`

## Global Constraints

- Kinds and units (fixed): ENERGY kWh, WATER m³, PIPED_GAS m³, BOTTLED_GAS botijões; PHONE_INTERNET and OTHER have no consumption.
- One bill per account per reference month; entering the same account and month again corrects it, with `recordAudit` of the previous values.
- Reference month = `YYYY-MM`, stored as the first day of the month (`@db.Date`); never a future month (Brasília calendar); screen default = previous month.
- Amount > 0 (cents, integer). Consumption > 0, required when the kind has a unit, refused when it has none.
- Every route: `requireRestaurantRole(MANAGER_ROLES)` (OWNER, MANAGER) and scoped by `restaurantId`.
- Plans: register, history list and DRE line on every plan; indicators, chart and bell alert from Pro (`tier-guard` feature `utilityInsights: ['pro', 'business', 'enterprise']`).
- Alert: measure (consumption, or value when no unit) of month M strictly above 1.20 × average of the bills that exist in M−1..M−3; needs at least 2 of those months; one alert per account and month (`dedupeKey` `utility:<accountId>:<YYYY-MM>`), restaurant-wide (`userId` null).
- Month sales (for % of revenue): cash sale entries with a comanda (`salesSummary`), plus online table payments applied in the month (`splitTableOnline(...).perBill`), plus kitchen orders without a comanda and not cancelled (`Order.total`), all in the Brasília month.
- DRE: bills whose reference month is between the month of `startDate` and the month of `endDate`, inclusive; line "Contas de consumo" inside Despesas operacionais; note when the period is not whole months.
- Screen copy in Portuguese, no em dashes. Dates in America/Sao_Paulo.
- Additive migration; deploy needs `npx prisma migrate deploy` (homolog and app).

## Review Focus

1. **Bill entered late** (September bill typed in November) — compares with June to August, appears in September's DRE. Test in Task 4 and Task 5.
2. **Months missing in the window** (only July and August exist) — average over the 2 that exist; with only 1, no base and no alert. Test in Task 2.
3. **Correction of a bill after an alert** — no second alert for the same account and month. Test in Task 4.
4. **Consumption sent for an account with no unit, or missing where required** — 400, nothing written. Test in Task 4.
5. **Another restaurant's account id** in PUT or PATCH — 404, nothing written. Test in Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261016150000_utility_bills/migration.sql` | enum `UtilityKind`, models `UtilityAccount`, `UtilityBill` |
| `lib/tier-guard.ts`, `lib/api/tier-middleware.ts` | feature `utilityInsights` |
| `lib/utility-bills/rules.ts` | pure: kinds, months, parsing, indicators, alert rule and text |
| `lib/finance/month-sales.ts` | sales of a Brasília month (Caixa criterion) |
| `lib/utility-bills/service.ts` | accounts, upsert with audit, screen data |
| `lib/utility-bills/alert.ts` | Pro alert with dedupe |
| `app/api/utility-bills/route.ts` | GET screen, PUT bill |
| `app/api/utility-bills/accounts/route.ts`, `app/api/utility-bills/accounts/[id]/route.ts` | POST account, PATCH account |
| `app/api/financeiro/dre/route.ts`, `app/dashboard/financeiro/dre/page.tsx` | DRE line |
| `app/dashboard/financeiro/contas/page.tsx` | the screen |
| `lib/navigation/app-nav.ts` | menu link |
| tests | `__tests__/unit/utility-rules.test.ts`, `__tests__/integration/staff/utility-*.test.ts` |

---

### Task 1: Schema, migration and plan flag

**Files:**
- Modify: `prisma/schema.prisma` (Restaurant relations next to `dailyCounts DailyCount[]`; User relations next to `dailyCountsClosed`; new enum and models after `model DailyCountLine`)
- Create: `prisma/migrations/20261016150000_utility_bills/migration.sql`
- Modify: `lib/tier-guard.ts` (feature union + map), `lib/api/tier-middleware.ts` (`FeatureType` union + `featureNames`)

**Interfaces:**
- Produces: Prisma `utilityAccount`, `utilityBill`; `isTierFeatureEnabled(tier, 'utilityInsights')`.

- [ ] **Step 1: Schema**

Restaurant: `utilityAccounts UtilityAccount[]` and `utilityBills UtilityBill[]`. User: `utilityBillsCreated UtilityBill[] @relation("UtilityBillCreatedBy")` and `utilityBillsUpdated UtilityBill[] @relation("UtilityBillUpdatedBy")`. Then:

```prisma
enum UtilityKind {
  ENERGY
  WATER
  PIPED_GAS
  BOTTLED_GAS
  PHONE_INTERNET
  OTHER
}

/// A bill the restaurant pays every month (spec 2026-10-16 contas de consumo)
model UtilityAccount {
  id           String        @id @default(cuid())
  restaurantId String
  kind         UtilityKind
  name         String
  active       Boolean       @default(true)
  createdAt    DateTime      @default(now())
  restaurant   Restaurant    @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  bills        UtilityBill[]

  @@index([restaurantId])
  @@map("utility_accounts")
}

/// One bill per account and reference month; entering it again corrects it (audited)
model UtilityBill {
  id             String         @id @default(cuid())
  accountId      String
  restaurantId   String
  referenceMonth DateTime       @db.Date
  amountCents    Int
  consumption    Decimal?       @db.Decimal(12, 3)
  dueDate        DateTime?      @db.Date
  notes          String?
  createdById    String
  updatedById    String?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  account        UtilityAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  restaurant     Restaurant     @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  createdBy      User           @relation("UtilityBillCreatedBy", fields: [createdById], references: [id])
  updatedBy      User?          @relation("UtilityBillUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)

  @@unique([accountId, referenceMonth])
  @@index([restaurantId, referenceMonth])
  @@map("utility_bills")
}
```

- [ ] **Step 2: Migration**

`prisma/migrations/20261016150000_utility_bills/migration.sql`:

```sql
-- Contas de consumo (spec 2026-10-16)
CREATE TYPE "UtilityKind" AS ENUM ('ENERGY', 'WATER', 'PIPED_GAS', 'BOTTLED_GAS', 'PHONE_INTERNET', 'OTHER');

CREATE TABLE "utility_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "kind" "UtilityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "utility_accounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "utility_accounts_restaurantId_idx" ON "utility_accounts"("restaurantId");
ALTER TABLE "utility_accounts" ADD CONSTRAINT "utility_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "utility_bills" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "referenceMonth" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "consumption" DECIMAL(12,3),
    "dueDate" DATE,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "utility_bills_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "utility_bills_accountId_referenceMonth_key" ON "utility_bills"("accountId", "referenceMonth");
CREATE INDEX "utility_bills_restaurantId_referenceMonth_idx" ON "utility_bills"("restaurantId", "referenceMonth");
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "utility_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Run: `npx prisma format`, `npx prisma generate`, then `npm run test:db:migrate` (DB running: `npm run test:db:status`; if stopped, start it in the background with `npm run test:db:start`).
Expected: `Drift check: OK`.

- [ ] **Step 3: Plan flag**

`lib/tier-guard.ts`: add `'utilityInsights'` to the feature union and, after `dailyCountAlert`:

```ts
    // Owner decision 2026-10-16: utility bills and their DRE line on every plan; indicators and alert from Pro
    utilityInsights: ['pro', 'business', 'enterprise'],
```

`lib/api/tier-middleware.ts`: add `'utilityInsights'` to `FeatureType` and `utilityInsights: 'Indicadores das contas de consumo',` to `featureNames`.

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit -p .` → no errors.

```bash
git add prisma/schema.prisma prisma/migrations/20261016150000_utility_bills lib/tier-guard.ts lib/api/tier-middleware.ts
git commit -m "feat(utility-bills): schema, migration, Pro flag"
```

---

### Task 2: Pure rules (`lib/utility-bills/rules.ts`)

**Files:**
- Create: `lib/utility-bills/rules.ts`
- Test: `__tests__/unit/utility-rules.test.ts`

**Interfaces:**
- Produces:
  - `type UtilityKind = 'ENERGY' | 'WATER' | 'PIPED_GAS' | 'BOTTLED_GAS' | 'PHONE_INTERNET' | 'OTHER'`
  - `KIND_INFO: Record<UtilityKind, { label: string; unit: string | null }>`
  - `class UtilityError extends Error { status: number }`
  - `currentMonth(now?: Date): string` (Brasília, `YYYY-MM`)
  - `addMonths(ym: string, n: number): string`
  - `monthDate(ym: string): Date` (UTC midnight of day 1) and `monthOf(d: Date): string`
  - `monthLabel(ym: string): string` ("setembro de 2026")
  - `parseMonth(v: unknown, now?: Date): string` (400 bad format, 400 future)
  - `parseAmountCents(v: unknown): number` (accepts `1240`, `"1240.5"`, `"1.240,50"`; > 0)
  - `parseConsumption(v: unknown, kind: UtilityKind): number | null`
  - `type BillPoint = { amountCents: number; consumption: number | null }`
  - `measure(kind: UtilityKind, b: BillPoint): number`
  - `indicators(kind: UtilityKind, ym: string, bills: Record<string, BillPoint>, salesCents: number | null): Indicators`
  - `interface Indicators { measure: number; prev: { measurePct: number; amountPct: number } | null; avg3: { average: number; pct: number; months: number } | null; yearAgo: { measurePct: number } | null; unitPrice: { now: number; prev: number | null } | null; revenuePct: number | null; missing: string[] }`
  - `shouldAlert(ind: Indicators): boolean`
  - `alertText(name: string, kind: UtilityKind, ym: string, ind: Indicators): { title: string; message: string }`

- [ ] **Step 1: Write the failing test**

`__tests__/unit/utility-rules.test.ts`:

```ts
import {
  addMonths, alertText, currentMonth, indicators, monthDate, monthLabel, monthOf, parseAmountCents, parseConsumption,
  parseMonth, shouldAlert, UtilityError,
} from '../../lib/utility-bills/rules';

const now = new Date('2026-10-16T15:00:00Z');

describe('utility bills rules (lib/utility-bills/rules.ts)', () => {
  it('months: Brasília current month, arithmetic across years, storage date, label', () => {
    expect(currentMonth(new Date('2026-11-01T02:00:00Z'))).toBe('2026-10'); // 23:00 of Oct 31 in Brasília
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2025-12', 13)).toBe('2027-01');
    expect(monthDate('2026-09').toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(monthOf(new Date('2026-09-01T00:00:00Z'))).toBe('2026-09');
    expect(monthLabel('2026-09')).toBe('setembro de 2026');
  });

  it('a reference month is YYYY-MM and never in the future', () => {
    expect(parseMonth('2026-09', now)).toBe('2026-09');
    expect(parseMonth('2026-10', now)).toBe('2026-10');
    expect(() => parseMonth('2026-11', now)).toThrow('futuro');
    for (const bad of ['2026-13', '26-09', '', null, 202609]) expect(() => parseMonth(bad, now)).toThrow(UtilityError);
  });

  it('amounts in reais become cents; zero and negatives are refused', () => {
    expect(parseAmountCents(1240)).toBe(124000);
    expect(parseAmountCents('1240.5')).toBe(124050);
    expect(parseAmountCents('1.240,50')).toBe(124050);
    expect(parseAmountCents('0,99')).toBe(99);
    for (const bad of [0, -1, '', 'abc', null]) expect(() => parseAmountCents(bad)).toThrow(UtilityError);
  });

  it('consumption: required with a unit, refused without one', () => {
    expect(parseConsumption('1.380', 'ENERGY')).toBe(1380);
    expect(parseConsumption('12,5', 'WATER')).toBe(12.5);
    expect(parseConsumption(2, 'BOTTLED_GAS')).toBe(2);
    expect(() => parseConsumption(undefined, 'ENERGY')).toThrow('consumo');
    expect(() => parseConsumption(0, 'WATER')).toThrow(UtilityError);
    expect(parseConsumption(undefined, 'PHONE_INTERNET')).toBeNull();
    expect(parseConsumption('', 'OTHER')).toBeNull();
    expect(() => parseConsumption(10, 'PHONE_INTERNET')).toThrow('não tem consumo');
  });

  const e = (amount: number, kwh: number) => ({ amountCents: amount * 100, consumption: kwh });

  it('indicators: previous month, 3-month average, a year ago, price per unit, share of revenue', () => {
    const bills = { '2025-09': e(1000, 1320), '2026-06': e(1000, 1100), '2026-07': e(1050, 1100), '2026-08': e(1100, 1135), '2026-09': e(1240, 1380) };
    const ind = indicators('ENERGY', '2026-09', bills, 5904800);
    expect(ind.measure).toBe(1380);
    expect(Math.round(ind.prev!.measurePct)).toBe(22); // 1380 vs 1135
    expect(Math.round(ind.prev!.amountPct)).toBe(13);  // 1240 vs 1100
    expect(ind.avg3).toMatchObject({ months: 3 });
    expect(Math.round(ind.avg3!.average)).toBe(1112);
    expect(Math.round(ind.avg3!.pct)).toBe(24);
    expect(Math.round(ind.yearAgo!.measurePct)).toBe(5);
    expect(ind.unitPrice!.now).toBeCloseTo(0.8986, 3);
    expect(ind.unitPrice!.prev).toBeCloseTo(0.9692, 3);
    expect(ind.revenuePct).toBeCloseTo(2.1, 1);
    expect(ind.missing).toEqual([]);
    expect(shouldAlert(ind)).toBe(true);
  });

  it('missing months are skipped in the average; with fewer than 2 there is no base and no alert', () => {
    const two = indicators('ENERGY', '2026-09', { '2026-07': e(1000, 1000), '2026-08': e(1000, 1000), '2026-09': e(1300, 1300) }, null);
    expect(two.avg3).toMatchObject({ average: 1000, months: 2 });
    expect(two.missing).toEqual(['2026-06']);
    expect(two.revenuePct).toBeNull();
    expect(shouldAlert(two)).toBe(true);
    const one = indicators('ENERGY', '2026-09', { '2026-08': e(1000, 1000), '2026-09': e(5000, 5000) }, null);
    expect(one.avg3).toBeNull();
    expect(one.missing).toEqual(['2026-07', '2026-06']);
    expect(shouldAlert(one)).toBe(false);
    expect(indicators('ENERGY', '2026-09', { '2026-09': e(1, 1) }, null).prev).toBeNull();
  });

  it('exactly 20% above the average does not alert; just above does', () => {
    const base = { '2026-06': e(100, 100), '2026-07': e(100, 100), '2026-08': e(100, 100) };
    expect(shouldAlert(indicators('ENERGY', '2026-09', { ...base, '2026-09': e(120, 120) }, null))).toBe(false);
    expect(shouldAlert(indicators('ENERGY', '2026-09', { ...base, '2026-09': e(121, 120.1) }, null))).toBe(true);
  });

  it('accounts without consumption compare the value', () => {
    const p = (amount: number) => ({ amountCents: amount * 100, consumption: null });
    const ind = indicators('PHONE_INTERNET', '2026-09', { '2026-06': p(200), '2026-07': p(200), '2026-08': p(250), '2026-09': p(300) }, null);
    expect(ind.measure).toBe(30000);
    expect(ind.unitPrice).toBeNull();
    expect(Math.round(ind.avg3!.pct)).toBe(38);
    expect(alertText('Telefone/Internet', 'PHONE_INTERNET', '2026-09', ind)).toEqual({
      title: 'Telefone/Internet de setembro acima da média',
      message: 'Telefone/Internet de setembro: valor 38% acima da média (R$ 300,00).',
    });
  });

  it('alert text for consumption', () => {
    const ind = indicators('ENERGY', '2026-09', { '2026-06': e(1000, 1100), '2026-07': e(1050, 1100), '2026-08': e(1100, 1135), '2026-09': e(1240, 1380) }, null);
    expect(alertText('Energia', 'ENERGY', '2026-09', ind).message).toBe(
      'Energia de setembro: consumo 24% acima da média (1.380 kWh). Confira vazamento ou equipamento ligado.',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/utility-rules.test.ts`
Expected: FAIL, cannot find module `lib/utility-bills/rules`.

- [ ] **Step 3: Implement**

`lib/utility-bills/rules.ts`:

```ts
/**
 * Contas de consumo rules (spec 2026-10-16, 4.1 to 4.4), no database: months, parsing, indicators,
 * the 20% alert and its text.
 */

export type UtilityKind = 'ENERGY' | 'WATER' | 'PIPED_GAS' | 'BOTTLED_GAS' | 'PHONE_INTERNET' | 'OTHER';

export const KIND_INFO: Record<UtilityKind, { label: string; unit: string | null }> = {
  ENERGY: { label: 'Energia', unit: 'kWh' },
  WATER: { label: 'Água', unit: 'm³' },
  PIPED_GAS: { label: 'Gás encanado', unit: 'm³' },
  BOTTLED_GAS: { label: 'Gás de botijão', unit: 'botijões' },
  PHONE_INTERNET: { label: 'Telefone/Internet', unit: null },
  OTHER: { label: 'Outra conta', unit: null },
};

export class UtilityError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const YM = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const currentMonth = (now = new Date()) => new Date(now.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 7);

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export const monthDate = (ym: string) => new Date(`${ym}-01T00:00:00.000Z`);
export const monthOf = (d: Date) => d.toISOString().slice(0, 7);
export const monthLabel = (ym: string) =>
  monthDate(ym).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const monthName = (ym: string) => monthDate(ym).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'long' });

export function parseMonth(v: unknown, now = new Date()): string {
  if (typeof v !== 'string' || !YM.test(v)) throw new UtilityError('Mês de referência inválido');
  if (v > currentMonth(now)) throw new UtilityError('O mês de referência não pode ser futuro');
  return v;
}

/** A Brazilian or plain decimal: "1.240,50", "1240.5", 1240 */
function parseDecimal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string' || v.trim() === '') return NaN;
  const s = v.trim();
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
}

export function parseAmountCents(v: unknown): number {
  const n = parseDecimal(v);
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) throw new UtilityError('Valor inválido');
  return Math.round(n * 100);
}

export function parseConsumption(v: unknown, kind: UtilityKind): number | null {
  const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  if (!KIND_INFO[kind].unit) {
    if (!empty) throw new UtilityError('Esta conta não tem consumo');
    return null;
  }
  if (empty) throw new UtilityError(`Informe o consumo em ${KIND_INFO[kind].unit}`);
  // "1.380" means one thousand three hundred eighty on a Brazilian bill
  const n = typeof v === 'string' && /^\d{1,3}(\.\d{3})+$/.test(v.trim()) ? Number(v.trim().replace(/\./g, '')) : parseDecimal(v);
  if (!Number.isFinite(n) || n <= 0 || n > 100_000_000) throw new UtilityError('Consumo inválido');
  return Math.round(n * 1000) / 1000;
}

export type BillPoint = { amountCents: number; consumption: number | null };

export interface Indicators {
  measure: number;
  prev: { measurePct: number; amountPct: number } | null;
  avg3: { average: number; pct: number; months: number } | null;
  yearAgo: { measurePct: number } | null;
  unitPrice: { now: number; prev: number | null } | null;
  revenuePct: number | null;
  missing: string[];
}

export const measure = (kind: UtilityKind, b: BillPoint) => (KIND_INFO[kind].unit ? Number(b.consumption ?? 0) : b.amountCents);
const pct = (a: number, b: number) => ((a - b) / b) * 100;
const unitPriceOf = (kind: UtilityKind, b: BillPoint | undefined) =>
  b && KIND_INFO[kind].unit && b.consumption ? b.amountCents / 100 / b.consumption : null;

export function indicators(kind: UtilityKind, ym: string, bills: Record<string, BillPoint>, salesCents: number | null): Indicators {
  const cur = bills[ym];
  const m = measure(kind, cur);
  const prevBill = bills[addMonths(ym, -1)];
  const window = [1, 2, 3].map((i) => addMonths(ym, -i));
  const present = window.filter((k) => bills[k]);
  const average = present.length ? present.reduce((s, k) => s + measure(kind, bills[k]), 0) / present.length : 0;
  const yearAgoBill = bills[addMonths(ym, -12)];
  const now = unitPriceOf(kind, cur);
  return {
    measure: m,
    prev: prevBill && measure(kind, prevBill) > 0
      ? { measurePct: pct(m, measure(kind, prevBill)), amountPct: pct(cur.amountCents, prevBill.amountCents) }
      : null,
    avg3: present.length >= 2 && average > 0 ? { average, pct: pct(m, average), months: present.length } : null,
    yearAgo: yearAgoBill && measure(kind, yearAgoBill) > 0 ? { measurePct: pct(m, measure(kind, yearAgoBill)) } : null,
    unitPrice: now === null ? null : { now, prev: unitPriceOf(kind, prevBill) },
    revenuePct: salesCents && salesCents > 0 ? (cur.amountCents / salesCents) * 100 : null,
    missing: window.filter((k) => !bills[k]),
  };
}

export const shouldAlert = (ind: Indicators) => ind.avg3 !== null && ind.measure > ind.avg3.average * 1.2;

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

export function alertText(name: string, kind: UtilityKind, ym: string, ind: Indicators) {
  const month = monthName(ym);
  const p = Math.round(ind.avg3?.pct ?? 0);
  const unit = KIND_INFO[kind].unit;
  const message = unit
    ? `${name} de ${month}: consumo ${p}% acima da média (${ind.measure.toLocaleString('pt-BR')} ${unit}). Confira vazamento ou equipamento ligado.`
    : `${name} de ${month}: valor ${p}% acima da média (${brl(ind.measure)}).`;
  return { title: `${name} de ${month} acima da média`, message };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/utility-rules.test.ts` → PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/utility-bills/rules.ts __tests__/unit/utility-rules.test.ts
git commit -m "feat(utility-bills): pure rules for months, parsing, indicators and the 20% alert"
```

---

### Task 3: Month sales (`lib/finance/month-sales.ts`)

**Files:**
- Create: `lib/finance/month-sales.ts`
- Test: `__tests__/integration/staff/utility-month-sales.test.ts`

**Interfaces:**
- Consumes: `salesSummary` (`lib/caixa/rules.ts`), `TABLE_ONLINE_WHERE`, `TABLE_ONLINE_SELECT`, `splitTableOnline` (`lib/caixa/table-online.ts`), `brtDayStart` (`lib/staff/commission-rules.ts`), `addMonths` (Task 2).
- Produces: `monthSalesCents(restaurantId: string, ym: string): Promise<number>`.

- [ ] **Step 1: Write the failing test**

`__tests__/integration/staff/utility-month-sales.test.ts`:

```ts
// @ts-nocheck
/** Sales of a Brasília month, Caixa criterion (spec 2026-10-16 contas de consumo, 4.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { monthSalesCents } from '../../../lib/finance/month-sales';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('month sales', () => {
  let rid, otherRid, userId, shiftId, recipeId;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ums-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    userId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ums ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Ums2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    const register = await prisma.cashRegister.create({ data: { name: 'Caixa', restaurantId: rid, isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: register.id, openedById: userId, openingCents: 0 } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'X', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } })).id;
  });
  afterAll(async () => {
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: userId } }); } catch {}
  });

  const comanda = (status = 'CLOSED') => prisma.orderSession.create({ data: { restaurantId: rid, userId, status } });
  const receipt = (orderSessionId, amountCents, at) =>
    prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents, orderSessionId, createdById: userId, createdAt: at } });

  it('cash sales + online table payments + orders without a comanda, inside the Brasília month only', async () => {
    const a = await comanda();
    await receipt(a.id, 10000, new Date('2026-09-15T15:00:00Z'));
    await receipt(a.id, 5000, new Date('2026-10-01T02:00:00Z'));  // Sept 30, 23:00 in Brasília: September
    await receipt(a.id, 7000, new Date('2026-10-01T03:00:00Z'));  // Oct 1, 00:00 in Brasília: October
    const b = await comanda();
    await prisma.payment.create({ data: { restaurantId: rid, orderSessionId: b.id, amount: 30, amountRefunded: 10, method: 'PIX', status: 'APPROVED', appliedToBillAt: new Date('2026-09-20T15:00:00Z') } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `UMS${tag}1`, status: 'COMPLETED', total: 45, createdAt: new Date('2026-09-10T15:00:00Z'), items: { create: [{ recipeId, quantity: 1 }] } } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `UMS${tag}2`, status: 'CANCELLED', total: 99, createdAt: new Date('2026-09-10T15:00:00Z') } });
    await prisma.order.create({ data: { restaurantId: rid, orderNumber: `UMS${tag}3`, status: 'COMPLETED', total: 88, orderSessionId: a.id, createdAt: new Date('2026-09-10T15:00:00Z') } });
    await prisma.order.create({ data: { restaurantId: otherRid, orderNumber: `UMS${tag}4`, status: 'COMPLETED', total: 77, createdAt: new Date('2026-09-10T15:00:00Z') } });
    // 100 + 50 cash, 20 online after refund, 45 site delivery = R$ 215,00
    expect(await monthSalesCents(rid, '2026-09')).toBe(21500);
    expect(await monthSalesCents(rid, '2026-10')).toBe(7000);
  });
});
```

If `prisma.payment.create` or `cashSession.create` requires more fields, read the model (`awk '/^model Payment \{/,/^\}/' prisma/schema.prisma`, same for `CashSession`) and add the required ones with neutral values; keep the amounts above.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/utility-month-sales.test.ts`
Expected: FAIL, cannot find module `lib/finance/month-sales`.

- [ ] **Step 3: Implement**

`lib/finance/month-sales.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { salesSummary } from '@/lib/caixa/rules';
import { splitTableOnline, TABLE_ONLINE_SELECT, TABLE_ONLINE_WHERE } from '@/lib/caixa/table-online';
import { brtDayStart } from '@/lib/staff/commission-rules';
import { addMonths } from '@/lib/utility-bills/rules';

/**
 * Sales of a Brasília month, the Caixa criterion (spec 2026-10-16 contas de consumo, 4.5): cash sale
 * entries of comandas, online table payments applied to bills (after refunds), and kitchen orders
 * without a comanda (site delivery, integrations) not cancelled. Also meant for the DRE revenue fix.
 */
export async function monthSalesCents(restaurantId: string, ym: string): Promise<number> {
  const from = brtDayStart(`${ym}-01`);
  const to = brtDayStart(`${addMonths(ym, 1)}-01`);
  const [entries, online, orders] = await Promise.all([
    prisma.cashSessionEntry.findMany({
      where: { restaurantId, orderSessionId: { not: null }, createdAt: { gte: from, lt: to } },
      select: { type: true, method: true, amountCents: true, direction: true, orderSessionId: true },
    }),
    prisma.payment.findMany({
      where: { restaurantId, ...TABLE_ONLINE_WHERE, appliedToBillAt: { gte: from, lt: to } },
      select: TABLE_ONLINE_SELECT,
    }),
    prisma.order.aggregate({
      where: { restaurantId, orderSessionId: null, status: { not: 'CANCELLED' }, createdAt: { gte: from, lt: to } },
      _sum: { total: true },
    }),
  ]);
  const cashAndOnline = salesSummary(entries as any, splitTableOnline(online as any).perBill).totalCents;
  return cashAndOnline + Math.round(Number(orders._sum.total ?? 0) * 100);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/utility-month-sales.test.ts` → PASS.
Run: `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/finance/month-sales.ts __tests__/integration/staff/utility-month-sales.test.ts
git commit -m "feat(finance): sales of a month with the Caixa criterion"
```

---

### Task 4: Service, alert and routes

**Files:**
- Create: `lib/utility-bills/service.ts`, `lib/utility-bills/alert.ts`
- Create: `app/api/utility-bills/route.ts`, `app/api/utility-bills/accounts/route.ts`, `app/api/utility-bills/accounts/[id]/route.ts`
- Test: `__tests__/integration/staff/utility-bills.test.ts`

**Interfaces:**
- Consumes: Task 2 rules; Task 3 `monthSalesCents`; `requireRestaurantRole`, `MANAGER_ROLES`, `recordAudit`, `RestaurantMember`; `isTierFeatureEnabled`.
- Produces:
  - `createAccount(member, body: { kind?: unknown; name?: unknown }): Promise<{ id: string }>`
  - `updateAccount(member, id: string, body: { name?: unknown; active?: unknown }): Promise<{ ok: true }>`
  - `upsertBill(member, body: { accountId?: unknown; referenceMonth?: unknown; amount?: unknown; consumption?: unknown; dueDate?: unknown; notes?: unknown }, now?: Date): Promise<{ id: string; corrected: boolean; alerted: boolean }>`
  - `loadScreen(member, now?: Date): Promise<Screen>` with `Screen = { insights: boolean; defaultMonth: string; accounts: { id: string; kind: UtilityKind; name: string; unit: string | null; active: boolean; bills: { referenceMonth: string; amountCents: number; consumption: number | null; dueDate: string | null; notes: string | null }[]; latest: { referenceMonth: string; indicators: Indicators | null } | null }[] }` (bills of the last 14 months, newest first; `indicators` only when `insights`)
  - `alertIfAbove(restaurantId: string, accountId: string, ym: string): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

`__tests__/integration/staff/utility-bills.test.ts`:

```ts
// @ts-nocheck
/** Contas de consumo: accounts, bills, permissions, Pro indicators and alert (spec 2026-10-16) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as SCREEN, PUT as SAVE } from '../../../app/api/utility-bills/route';
import { POST as NEW_ACCOUNT } from '../../../app/api/utility-bills/accounts/route';
import { PATCH as EDIT_ACCOUNT } from '../../../app/api/utility-bills/accounts/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const req = (method, body?) => new NextRequest('http://x', { method, body: body ? JSON.stringify(body) : undefined });
const save = (body) => SAVE(req('PUT', body));
const account = async (body) => (await NEW_ACCOUNT(req('POST', body))).json();
const screen = async () => (await SCREEN(req('GET'))).json();
let seq = 0;

async function setup(tier) {
  const o = await prisma.user.create({ data: { email: `ub-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Ub ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const staff = {};
  for (const role of ['MANAGER', 'CASHIER', 'COOK']) {
    const u = await prisma.user.create({ data: { email: `ub-${role}-${seq++}-${tag}@gastrux.test`, name: role, password: 'x', role, currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    staff[role] = { id: u.id, email: u.email, role };
  }
  return { rid, owner: { id: o.id, email: o.email, role: 'OWNER' }, ...staff, userIds: [o.id, ...Object.values(staff).map((s: any) => s.id)] };
}

describe('contas de consumo', () => {
  let s, p;
  beforeAll(async () => { s = await setup('starter'); p = await setup('pro'); }, 60000);
  afterAll(async () => {
    for (const x of [s, p]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });

  it('only owner and manager: cashier and cook get 403 everywhere', async () => {
    for (const who of [s.CASHIER, s.COOK]) {
      as(who);
      expect((await SCREEN(req('GET'))).status).toBe(403);
      expect((await NEW_ACCOUNT(req('POST', { kind: 'ENERGY' }))).status).toBe(403);
      expect((await save({ accountId: 'x', referenceMonth: '2026-09', amount: 1 })).status).toBe(403);
    }
  });

  it('accounts: fixed kinds get their default name; OTHER needs a name; names are unique among active ones', async () => {
    as(s.MANAGER);
    const energy = await account({ kind: 'ENERGY' });
    expect((await prisma.utilityAccount.findUnique({ where: { id: energy.id } })).name).toBe('Energia');
    expect((await NEW_ACCOUNT(req('POST', { kind: 'OTHER' }))).status).toBe(400);
    expect((await NEW_ACCOUNT(req('POST', { kind: 'ENERGY' }))).status).toBe(409);
    expect((await NEW_ACCOUNT(req('POST', { kind: 'SOLAR' }))).status).toBe(400);
    const rent = await account({ kind: 'OTHER', name: 'Aluguel' });
    expect(rent.id).toBeTruthy();
  });

  it('bills: one per account and month; entering it again corrects it, audited', async () => {
    as(s.owner);
    const energy = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'ENERGY' } });
    const first = await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: '1.240,00', consumption: '1.380' })).json();
    expect(first.corrected).toBe(false);
    const again = await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: '1250', consumption: '1390' })).json();
    expect(again).toMatchObject({ id: first.id, corrected: true });
    const rows = await prisma.utilityBill.findMany({ where: { accountId: energy.id } });
    expect(rows.length).toBe(1);
    expect([rows[0].amountCents, Number(rows[0].consumption)]).toEqual([125000, 1390]);
    expect(await prisma.auditLog.count({ where: { restaurantId: s.rid, entityType: 'UtilityBill', entityId: first.id } })).toBe(1);
  });

  it('refuses bad input and accounts of another restaurant; nothing is written', async () => {
    as(s.owner);
    const energy = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'ENERGY' } });
    const rent = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'OTHER' } });
    const before = await prisma.utilityBill.count({ where: { restaurantId: s.rid } });
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 100 })).status).toBe(400);                 // consumption missing
    expect((await save({ accountId: rent.id, referenceMonth: '2026-08', amount: 100, consumption: 5 })).status).toBe(400);   // rent has no consumption
    expect((await save({ accountId: energy.id, referenceMonth: '2099-01', amount: 100, consumption: 5 })).status).toBe(400); // future
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 0, consumption: 5 })).status).toBe(400);
    as(p.owner);
    expect((await save({ accountId: energy.id, referenceMonth: '2026-08', amount: 100, consumption: 5 })).status).toBe(404);
    expect((await EDIT_ACCOUNT(req('PATCH', { active: false }), { params: { id: energy.id } })).status).toBe(404);
    expect(await prisma.utilityBill.count({ where: { restaurantId: s.rid } })).toBe(before);
  });

  it('a deactivated account takes no new bills but keeps its history', async () => {
    as(s.owner);
    const rent = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'OTHER' } });
    expect((await save({ accountId: rent.id, referenceMonth: '2026-08', amount: 3000 })).status).toBe(200);
    expect((await EDIT_ACCOUNT(req('PATCH', { active: false }), { params: { id: rent.id } })).status).toBe(200);
    expect((await save({ accountId: rent.id, referenceMonth: '2026-09', amount: 3000 })).status).toBe(409);
    const sc = await screen();
    expect(sc.accounts.find((a) => a.id === rent.id)).toMatchObject({ active: false });
    expect(sc.accounts.find((a) => a.id === rent.id).bills.length).toBe(1);
  });

  it('Starter gets the list without indicators and never an alert', async () => {
    as(s.owner);
    const energy = await prisma.utilityAccount.findFirst({ where: { restaurantId: s.rid, kind: 'ENERGY' } });
    for (const [m, kwh] of [['2026-06', 1000], ['2026-07', 1000], ['2026-08', 1000]]) await save({ accountId: energy.id, referenceMonth: m, amount: 1000, consumption: kwh });
    await save({ accountId: energy.id, referenceMonth: '2026-09', amount: 2000, consumption: 2000 });
    const sc = await screen();
    expect(sc.insights).toBe(false);
    expect(sc.accounts.find((a) => a.id === energy.id).latest).toMatchObject({ referenceMonth: '2026-09', indicators: null });
    expect(await prisma.notification.count({ where: { restaurantId: s.rid } })).toBe(0);
  });

  it('Pro: indicators on the screen; a late bill compares with the months before its own; one alert per account and month', async () => {
    as(p.owner);
    const energy = await account({ kind: 'ENERGY' });
    for (const [m, kwh] of [['2026-05', 5000], ['2026-06', 1000], ['2026-07', 1100], ['2026-08', 1135]]) {
      expect((await save({ accountId: energy.id, referenceMonth: m, amount: 1000, consumption: kwh })).status).toBe(200);
    }
    // September typed late: compares with June-August (avg 1078), not with May
    const late = await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: 1240, consumption: 1380 })).json();
    expect(late.alerted).toBe(true);
    const alerts = await prisma.notification.findMany({ where: { restaurantId: p.rid } });
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toMatchObject({ userId: null, actionUrl: '/dashboard/financeiro/contas' });
    expect(alerts[0].message).toContain('Energia de setembro: consumo 28% acima da média (1.380 kWh)');
    // Correcting the bill does not ring again
    expect((await (await save({ accountId: energy.id, referenceMonth: '2026-09', amount: 1240, consumption: 1400 })).json()).alerted).toBe(false);
    expect(await prisma.notification.count({ where: { restaurantId: p.rid } })).toBe(1);
    const sc = await screen();
    expect(sc.insights).toBe(true);
    const latest = sc.accounts.find((a) => a.id === energy.id).latest;
    expect(latest.referenceMonth).toBe('2026-09');
    expect(Math.round(latest.indicators.avg3.pct)).toBe(30);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/utility-bills.test.ts`
Expected: FAIL, cannot find module `app/api/utility-bills/route`.

- [ ] **Step 3: `lib/utility-bills/alert.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { addMonths, alertText, indicators, monthDate, monthOf, shouldAlert, type BillPoint, type UtilityKind } from './rules';

/** Pro: a bill 20% above the 3 months before its own reference month rings the managers' bell, once per account and month */
export async function alertIfAbove(restaurantId: string, accountId: string, ym: string): Promise<boolean> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  if (!isTierFeatureEnabled(restaurant?.subscriptionTier || 'starter', 'utilityInsights')) return false;
  const account = await prisma.utilityAccount.findFirst({ where: { id: accountId, restaurantId }, select: { kind: true, name: true } });
  if (!account) return false;
  const rows = await prisma.utilityBill.findMany({
    where: { accountId, referenceMonth: { gte: monthDate(addMonths(ym, -3)), lte: monthDate(ym) } },
    select: { referenceMonth: true, amountCents: true, consumption: true },
  });
  const bills: Record<string, BillPoint> = {};
  for (const r of rows) bills[monthOf(r.referenceMonth)] = { amountCents: r.amountCents, consumption: r.consumption === null ? null : Number(r.consumption) };
  if (!bills[ym]) return false;
  const ind = indicators(account.kind as UtilityKind, ym, bills, null);
  if (!shouldAlert(ind)) return false;
  const dedupeKey = `utility:${accountId}:${ym}`;
  const existing = await prisma.notification.findFirst({ where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
  if (existing) return false;
  const text = alertText(account.name, account.kind as UtilityKind, ym, ind);
  await prisma.notification.create({
    data: {
      restaurantId,
      type: 'SYSTEM_INFO',
      severity: 'HIGH',
      title: text.title,
      message: text.message,
      actionUrl: '/dashboard/financeiro/contas',
      actionLabel: 'Ver contas',
      data: { kind: 'utility_above_average', dedupeKey, accountId, month: ym },
    },
  });
  return true;
}
```

- [ ] **Step 4: `lib/utility-bills/service.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { monthSalesCents } from '@/lib/finance/month-sales';
import {
  addMonths, currentMonth, indicators, KIND_INFO, monthDate, monthOf, parseAmountCents, parseConsumption, parseMonth,
  UtilityError, type BillPoint, type Indicators, type UtilityKind,
} from './rules';
import { alertIfAbove } from './alert';

const KINDS = Object.keys(KIND_INFO) as UtilityKind[];

async function ownAccount(member: RestaurantMember, id: unknown) {
  if (typeof id !== 'string') throw new UtilityError('Conta não encontrada', 404);
  const account = await prisma.utilityAccount.findFirst({ where: { id, restaurantId: member.restaurantId } });
  if (!account) throw new UtilityError('Conta não encontrada', 404);
  return account;
}

async function assertNameFree(restaurantId: string, name: string, exceptId?: string) {
  const clash = await prisma.utilityAccount.findFirst({
    where: { restaurantId, active: true, name: { equals: name, mode: 'insensitive' }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new UtilityError(`Já existe a conta "${name}"`, 409);
}

export async function createAccount(member: RestaurantMember, body: { kind?: unknown; name?: unknown }) {
  if (typeof body.kind !== 'string' || !KINDS.includes(body.kind as UtilityKind)) throw new UtilityError('Tipo de conta inválido');
  const kind = body.kind as UtilityKind;
  const typed = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  if (kind === 'OTHER' && !typed) throw new UtilityError('Dê um nome para a conta (ex.: Aluguel)');
  const name = typed || KIND_INFO[kind].label;
  await assertNameFree(member.restaurantId, name);
  const account = await prisma.utilityAccount.create({ data: { restaurantId: member.restaurantId, kind, name }, select: { id: true } });
  return account;
}

export async function updateAccount(member: RestaurantMember, id: string, body: { name?: unknown; active?: unknown }) {
  const account = await ownAccount(member, id);
  const data: { name?: string; active?: boolean } = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim().slice(0, 60);
    await assertNameFree(member.restaurantId, data.name, account.id);
  }
  if (typeof body.active === 'boolean') {
    if (body.active && !account.active) await assertNameFree(member.restaurantId, data.name ?? account.name, account.id);
    data.active = body.active;
  }
  await prisma.utilityAccount.update({ where: { id: account.id }, data });
  return { ok: true as const };
}

export async function upsertBill(
  member: RestaurantMember,
  body: { accountId?: unknown; referenceMonth?: unknown; amount?: unknown; consumption?: unknown; dueDate?: unknown; notes?: unknown },
  now = new Date(),
) {
  const account = await ownAccount(member, body.accountId);
  if (!account.active) throw new UtilityError('Esta conta está desativada', 409);
  const ym = parseMonth(body.referenceMonth, now);
  const amountCents = parseAmountCents(body.amount);
  const consumption = parseConsumption(body.consumption, account.kind as UtilityKind);
  const dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? new Date(`${body.dueDate}T00:00:00.000Z`) : null;
  const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 300) : null;
  const key = { accountId_referenceMonth: { accountId: account.id, referenceMonth: monthDate(ym) } };
  const previous = await prisma.utilityBill.findUnique({ where: key });
  const bill = await prisma.utilityBill.upsert({
    where: key,
    create: { accountId: account.id, restaurantId: member.restaurantId, referenceMonth: monthDate(ym), amountCents, consumption, dueDate, notes, createdById: member.userId },
    update: { amountCents, consumption, dueDate, notes, updatedById: member.userId },
    select: { id: true },
  });
  if (previous) {
    await recordAudit(member, {
      action: 'UPDATE', entityType: 'UtilityBill', entityId: bill.id,
      changes: { month: ym, before: { amountCents: previous.amountCents, consumption: previous.consumption === null ? null : Number(previous.consumption) }, after: { amountCents, consumption } },
    });
  }
  let alerted = false;
  try {
    alerted = await alertIfAbove(member.restaurantId, account.id, ym);
  } catch (error) {
    console.error('[utility-bills] alert failed:', error); // the bill itself is saved
  }
  return { id: bill.id, corrected: !!previous, alerted };
}

export async function loadScreen(member: RestaurantMember, now = new Date()) {
  const { restaurantId } = member;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  const insights = isTierFeatureEnabled(restaurant?.subscriptionTier || 'starter', 'utilityInsights');
  const cur = currentMonth(now);
  const accounts = await prisma.utilityAccount.findMany({
    where: { restaurantId },
    orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    include: { bills: { where: { referenceMonth: { gte: monthDate(addMonths(cur, -14)) } }, orderBy: { referenceMonth: 'desc' } } },
  });
  const salesCache = new Map<string, number>();
  const out = [];
  for (const a of accounts) {
    const kind = a.kind as UtilityKind;
    const bills = a.bills.map((b) => ({
      referenceMonth: monthOf(b.referenceMonth), amountCents: b.amountCents, consumption: b.consumption === null ? null : Number(b.consumption),
      dueDate: b.dueDate ? b.dueDate.toISOString().slice(0, 10) : null, notes: b.notes,
    }));
    let latest: { referenceMonth: string; indicators: Indicators | null } | null = null;
    if (bills.length) {
      const ym = bills[0].referenceMonth;
      let ind: Indicators | null = null;
      if (insights) {
        const points: Record<string, BillPoint> = Object.fromEntries(bills.map((b) => [b.referenceMonth, { amountCents: b.amountCents, consumption: b.consumption }]));
        if (!salesCache.has(ym)) salesCache.set(ym, await monthSalesCents(restaurantId, ym));
        ind = indicators(kind, ym, points, salesCache.get(ym)!);
      }
      latest = { referenceMonth: ym, indicators: ind };
    }
    out.push({ id: a.id, kind, name: a.name, unit: KIND_INFO[kind].unit, active: a.active, bills, latest });
  }
  return { insights, defaultMonth: addMonths(cur, -1), accounts: out };
}
```

- [ ] **Step 5: Routes**

`app/api/utility-bills/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { UtilityError } from '@/lib/utility-bills/rules';
import { loadScreen, upsertBill } from '@/lib/utility-bills/service';

export const dynamic = 'force-dynamic';
const DENIED = 'Contas de consumo são do dono e do gerente';

/** GET /api/utility-bills - accounts, last 14 months and (Pro) indicators */
export async function GET() {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await loadScreen(auth.member), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[utility-bills] screen failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as contas' }, { status: 500 });
  }
}

/** PUT /api/utility-bills { accountId, referenceMonth: 'YYYY-MM', amount, consumption?, dueDate?, notes? } - enter or correct */
export async function PUT(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, DENIED);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await upsertBill(auth.member, await request.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof UtilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-bills] save failed:', error);
    return NextResponse.json({ error: 'Não foi possível salvar a conta' }, { status: 500 });
  }
}
```

`app/api/utility-bills/accounts/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { UtilityError } from '@/lib/utility-bills/rules';
import { createAccount } from '@/lib/utility-bills/service';

export const dynamic = 'force-dynamic';

/** POST /api/utility-bills/accounts { kind, name? } */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Contas de consumo são do dono e do gerente');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await createAccount(auth.member, await request.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof UtilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-bills] account failed:', error);
    return NextResponse.json({ error: 'Não foi possível criar a conta' }, { status: 500 });
  }
}
```

`app/api/utility-bills/accounts/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { UtilityError } from '@/lib/utility-bills/rules';
import { updateAccount } from '@/lib/utility-bills/service';

export const dynamic = 'force-dynamic';

/** PATCH /api/utility-bills/accounts/[id] { name?, active? } */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Contas de consumo são do dono e do gerente');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await updateAccount(auth.member, params.id, await request.json().catch(() => ({}))));
  } catch (error) {
    if (error instanceof UtilityError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[utility-bills] account update failed:', error);
    return NextResponse.json({ error: 'Não foi possível alterar a conta' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/utility-bills.test.ts` → PASS (7 tests).
Run: `npx tsc --noEmit -p .` → no errors.

Note on the Pro test numbers: June 1000, July 1100, August 1135 → average 1078.3; 1380 is +28%; after the correction to 1400, +30%.

- [ ] **Step 7: Commit**

```bash
git add lib/utility-bills/service.ts lib/utility-bills/alert.ts app/api/utility-bills __tests__/integration/staff/utility-bills.test.ts
git commit -m "feat(utility-bills): accounts, bills with correction, Pro indicators and alert"
```

---

### Task 5: The DRE line

**Files:**
- Modify: `app/api/financeiro/dre/route.ts` (after `despesasPessoal` ~line 101; response `despesasOperacionais` ~line 152)
- Modify: `app/dashboard/financeiro/dre/page.tsx` (type ~line 29; lines ~294-297)
- Test: `__tests__/integration/staff/utility-dre.test.ts`

**Interfaces:**
- Consumes: `monthDate` (Task 2), `prisma.utilityBill`.
- Produces: DRE JSON `dre.despesasOperacionais.contasConsumo: number` (reais) and `dre.contasConsumoMesInteiro: boolean`.

- [ ] **Step 1: Write the failing test**

`__tests__/integration/staff/utility-dre.test.ts`:

```ts
// @ts-nocheck
/** The DRE line "Contas de consumo" by reference month (spec 2026-10-16, 4.6) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as DRE } from '../../../app/api/financeiro/dre/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('DRE: contas de consumo', () => {
  let rid, owner, otherRid;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `udre-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Udre ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Udre2 ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    const energy = await prisma.utilityAccount.create({ data: { restaurantId: rid, kind: 'ENERGY', name: 'Energia' } });
    const rent = await prisma.utilityAccount.create({ data: { restaurantId: rid, kind: 'OTHER', name: 'Aluguel' } });
    const other = await prisma.utilityAccount.create({ data: { restaurantId: otherRid, kind: 'ENERGY', name: 'Energia' } });
    const bill = (account, restaurantId, ym, amountCents, createdAt = new Date()) =>
      prisma.utilityBill.create({ data: { accountId: account.id, restaurantId, referenceMonth: new Date(`${ym}-01T00:00:00Z`), amountCents, consumption: account.kind === 'ENERGY' ? 100 : null, createdById: o.id, createdAt } });
    await bill(energy, rid, '2026-09', 124000, new Date('2026-11-05T12:00:00Z')); // typed in November for September
    await bill(rent, rid, '2026-09', 300000);
    await bill(energy, rid, '2026-08', 110000);
    await bill(other, otherRid, '2026-09', 999900);
  });
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: owner.id } }); } catch {}
  });

  const dre = async (start, end) => {
    const s = { user: owner, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
    return (await DRE(new NextRequest(`http://x/api/financeiro/dre?startDate=${start}&endDate=${end}`))).json();
  };

  it('September shows the September bills, typed late or not; not August, not other restaurants', async () => {
    const body = await dre('2026-09-01', '2026-09-30');
    expect(body.dre.despesasOperacionais.contasConsumo).toBe(4240);
    expect(body.dre.contasConsumoMesInteiro).toBe(false);
  });

  it('a period spanning August and September takes both; a partial month is flagged', async () => {
    expect((await dre('2026-08-01', '2026-09-30')).dre.despesasOperacionais.contasConsumo).toBe(5340);
    const partial = await dre('2026-09-10', '2026-09-20');
    expect(partial.dre.despesasOperacionais.contasConsumo).toBe(4240);
    expect(partial.dre.contasConsumoMesInteiro).toBe(true);
  });

  it('the line enters the operating expenses total', async () => {
    const body = await dre('2026-09-01', '2026-09-30');
    const d = body.dre.despesasOperacionais;
    expect(d.total).toBeCloseTo(d.operacional + d.pessoal + d.taxasGateway + d.contasConsumo, 2);
  });
});
```

Check the DRE JSON nesting first (`grep -n "NextResponse.json" app/api/financeiro/dre/route.ts`); if the payload root is not `{ dre: … }`, adjust the test's access path to the real one before running.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/utility-dre.test.ts`
Expected: FAIL (`contasConsumo` undefined).

- [ ] **Step 3: Route**

In `app/api/financeiro/dre/route.ts`, add the import `import { monthDate } from '@/lib/utility-bills/rules';` and, right after `const despesasPessoal = …;`:

```ts
    // 5b. CONTAS DE CONSUMO - by reference month, whole months (spec 2026-10-16 contas de consumo, 4.6)
    const startMonth = startDate.slice(0, 7);
    const endMonth = endDate.slice(0, 7);
    const utility = await prisma.utilityBill.aggregate({
      where: { restaurantId, referenceMonth: { gte: monthDate(startMonth), lte: monthDate(endMonth) } },
      _sum: { amountCents: true },
    });
    const contasConsumo = (utility._sum.amountCents ?? 0) / 100;
    const lastDay = new Date(Date.UTC(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)), 0)).getUTCDate();
    const contasConsumoMesInteiro = contasConsumo > 0 && (!startDate.endsWith('-01') || Number(endDate.slice(8, 10)) !== lastDay);
```

Change `const despesasTotais = despesasOperacionais + despesasPessoal;` to `const despesasTotais = despesasOperacionais + despesasPessoal + contasConsumo;`. In the response `despesasOperacionais` object add `contasConsumo,`, and next to it (same level as `despesasOperacionais`) add `contasConsumoMesInteiro,`.

- [ ] **Step 4: Page**

In `app/dashboard/financeiro/dre/page.tsx`: type `despesasOperacionais: { operacional: number; pessoal: number; taxasGateway: number; contasConsumo: number; total: number };` and `contasConsumoMesInteiro?: boolean;` on the same object; after the "Folha de Pagamento" line:

```tsx
                <DRELine label="Contas de consumo" value={d.despesasOperacionais.contasConsumo ?? 0} negative />
                {d.contasConsumoMesInteiro && <p className="text-xs text-muted-foreground pl-4">Contas de consumo entram pelo mês inteiro.</p>}
```

- [ ] **Step 5: Run the test and the type check**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/utility-dre.test.ts` → PASS (3 tests). `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/financeiro/dre/route.ts app/dashboard/financeiro/dre/page.tsx __tests__/integration/staff/utility-dre.test.ts
git commit -m "feat(utility-bills): DRE line Contas de consumo by reference month"
```

---

### Task 6: The screen and the menu link

**Files:**
- Create: `app/dashboard/financeiro/contas/page.tsx`
- Modify: `lib/navigation/app-nav.ts` (group `relatorios`, after `Financeiro`)
- Test: `__tests__/unit/app-nav.test.ts`

**Interfaces:**
- Consumes: `GET/PUT /api/utility-bills`, `POST /api/utility-bills/accounts`, `PATCH /api/utility-bills/accounts/[id]` (Task 4); `KIND_INFO`, `monthLabel`, `addMonths`, `Indicators` (Task 2; `rules.ts` has no server imports).

- [ ] **Step 1: Failing nav test**

Add to `__tests__/unit/app-nav.test.ts`:

```ts
  it('utility bills sit in Relatórios for owner and manager only', () => {
    const link = NAV_GROUPS.find((g) => g.id === 'relatorios')?.links.find((l) => l.href === '/dashboard/financeiro/contas');
    expect(link?.label).toBe('Contas de consumo');
    expect(hrefs(navFor('MANAGER', false))).toContain('/dashboard/financeiro/contas');
    expect(hrefs(navFor('CASHIER', false))).not.toContain('/dashboard/financeiro/contas');
    expect(hrefs(navFor('COOK', false))).not.toContain('/dashboard/financeiro/contas');
  });
```

Run: `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts` → FAIL.

- [ ] **Step 2: Menu link**

In `lib/navigation/app-nav.ts`, group `relatorios`, after `{ label: 'Financeiro', … }`:

```ts
      // Spec 2026-10-16 contas de consumo: bills on every plan, indicators from Pro
      { label: 'Contas de consumo', href: '/dashboard/financeiro/contas', roles: MANAGERS },
```

- [ ] **Step 3: The screen**

`app/dashboard/financeiro/contas/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KIND_INFO, addMonths, monthLabel, type Indicators, type UtilityKind } from '@/lib/utility-bills/rules';

interface Bill { referenceMonth: string; amountCents: number; consumption: number | null; dueDate: string | null; notes: string | null }
interface Account { id: string; kind: UtilityKind; name: string; unit: string | null; active: boolean; bills: Bill[]; latest: { referenceMonth: string; indicators: Indicators | null } | null }
interface Screen { insights: boolean; defaultMonth: string; accounts: Account[] }

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const signed = (p: number) => `${p > 0 ? '+' : ''}${Math.round(p)}%`;
const tone = (p: number, alert = false) => (alert ? 'text-red-600 font-semibold' : p > 0 ? 'text-amber-600' : 'text-emerald-600');
const FIXED: UtilityKind[] = ['ENERGY', 'WATER', 'PIPED_GAS', 'PHONE_INTERNET'];

/** Contas de consumo (spec 2026-10-16): enter bills, history, Pro indicators */
export default function UtilityBillsPage() {
  const [data, setData] = useState<Screen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ accountId: string; referenceMonth: string; amount: string; consumption: string; dueDate: string; notes: string } | null>(null);
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/utility-bills', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error || 'Não foi possível carregar as contas');
      setError(null);
      setData(body);
    } catch {
      setError('Sem conexão. Tente de novo.');
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (url: string, method: string, body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.error || 'Não foi possível salvar'); return null; }
      setError(null);
      await load();
      return out;
    } catch {
      setError('Sem conexão: nada foi salvo. Tente de novo.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="max-w-3xl mx-auto p-4 text-muted-foreground">{error ?? 'Carregando…'}</div>;

  const active = data.accounts.filter((a) => a.active);
  const missingFixed = FIXED.filter((k) => !data.accounts.some((a) => a.kind === k && a.active));
  const startForm = (a: Account, ym = data.defaultMonth) => {
    const b = a.bills.find((x) => x.referenceMonth === ym);
    setError(null);
    setForm({ accountId: a.id, referenceMonth: ym, amount: b ? (b.amountCents / 100).toFixed(2).replace('.', ',') : '', consumption: b?.consumption != null ? String(b.consumption).replace('.', ',') : '', dueDate: b?.dueDate ?? '', notes: b?.notes ?? '' });
  };
  const formAccount = form ? data.accounts.find((a) => a.id === form.accountId) : null;
  const correcting = !!(form && formAccount?.bills.some((b) => b.referenceMonth === form.referenceMonth));

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Contas de consumo</h1>
        <p className="text-sm text-muted-foreground">Energia, água, gás, telefone e outras contas do mês. Entram na DRE pelo mês de referência.</p>
      </div>
      {error && !form && <Card className="p-3 text-red-600 text-sm">{error}</Card>}

      {(missingFixed.length > 0 || active.length === 0) && (
        <Card className="p-3 space-y-2">
          <div className="text-sm font-medium">{active.length === 0 ? 'Quais contas o restaurante tem?' : 'Adicionar conta'}</div>
          <div className="flex gap-2 flex-wrap">
            {missingFixed.map((k) => <Button key={k} size="sm" variant="outline" disabled={busy} onClick={() => call('/api/utility-bills/accounts', 'POST', { kind: k })}>+ {KIND_INFO[k].label}</Button>)}
            <Button size="sm" variant="outline" disabled={busy} onClick={() => call('/api/utility-bills/accounts', 'POST', { kind: 'BOTTLED_GAS', name: 'Gás P13' })}>+ Gás P13</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => call('/api/utility-bills/accounts', 'POST', { kind: 'BOTTLED_GAS', name: 'Gás P45' })}>+ Gás P45</Button>
          </div>
          <div className="flex gap-2">
            <input className="flex-1 border rounded p-2 bg-background text-sm" placeholder="Outra conta (ex.: Aluguel, Condomínio)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button size="sm" disabled={busy || !newName.trim()} onClick={async () => { if (await call('/api/utility-bills/accounts', 'POST', { kind: 'OTHER', name: newName })) setNewName(''); }}>Adicionar</Button>
          </div>
        </Card>
      )}

      {!data.insights && active.length > 0 && (
        <Card className="p-3 text-sm">
          Comparação com o mês anterior e a média de 3 meses, preço por kWh/m³, % do faturamento e aviso de consumo alto: no plano Pro. <Link href="/pricing" className="font-medium text-primary hover:underline">Ver planos</Link>
        </Card>
      )}

      {active.map((a) => {
        const last = a.bills[0];
        const ind = a.latest?.indicators;
        const alert = !!(ind?.avg3 && ind.measure > ind.avg3.average * 1.2);
        const max = Math.max(1, ...a.bills.map((b) => (a.unit ? b.consumption ?? 0 : b.amountCents)));
        return (
          <Card key={a.id} className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="font-semibold">{a.name}{last && <span className="text-muted-foreground font-normal"> · {monthLabel(last.referenceMonth)}</span>}</div>
              <Button size="sm" disabled={busy} onClick={() => startForm(a)}>Lançar conta</Button>
            </div>
            {last ? (
              <div className="text-lg font-bold">{brl(last.amountCents)}{a.unit && last.consumption != null && <span className="text-base font-normal"> · {num(last.consumption)} {a.unit}</span>}</div>
            ) : <div className="text-sm text-muted-foreground">Nenhuma conta lançada.</div>}
            {ind && (
              <ul className="text-sm space-y-0.5">
                {ind.prev && <li>vs mês anterior: <span className={tone(ind.prev.measurePct)}>{signed(ind.prev.measurePct)} {a.unit ? 'consumo' : 'valor'}</span>{a.unit && <> · {signed(ind.prev.amountPct)} valor</>}</li>}
                {ind.avg3 ? <li>vs média de {ind.avg3.months} meses: <span className={tone(ind.avg3.pct, alert)}>{signed(ind.avg3.pct)}</span></li> : <li className="text-muted-foreground">Média: sem base ainda (precisa de 2 meses)</li>}
                {ind.yearAgo && <li>vs mesmo mês do ano passado: <span className={tone(ind.yearAgo.measurePct)}>{signed(ind.yearAgo.measurePct)}</span></li>}
                {ind.unitPrice && <li>Preço: {ind.unitPrice.now.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })}/{a.unit}{ind.unitPrice.prev != null && <> (era {ind.unitPrice.prev.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })})</>}</li>}
                {ind.revenuePct != null && <li>{ind.revenuePct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do faturamento do mês</li>}
                {ind.missing.length > 0 && <li className="text-muted-foreground">Sem conta lançada: {ind.missing.map(monthLabel).join(', ')}</li>}
              </ul>
            )}
            {a.bills.length > 0 && (
              <button className="text-xs text-primary hover:underline" onClick={() => setOpen(open === a.id ? null : a.id)}>{open === a.id ? 'Esconder histórico' : 'Ver histórico'}</button>
            )}
            {open === a.id && (
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th>Mês</th><th className="text-right">Valor</th>{a.unit && <th className="text-right">{a.unit}</th>}{data.insights && <th className="w-1/3"></th>}<th></th></tr></thead>
                <tbody>{a.bills.slice(0, 12).map((b) => {
                  const v = a.unit ? b.consumption ?? 0 : b.amountCents;
                  return (
                    <tr key={b.referenceMonth}>
                      <td>{monthLabel(b.referenceMonth)}</td>
                      <td className="text-right">{brl(b.amountCents)}</td>
                      {a.unit && <td className="text-right">{b.consumption != null ? num(b.consumption) : ''}</td>}
                      {data.insights && <td className="pl-2"><div className="h-2 rounded bg-primary/70" style={{ width: `${Math.round((v / max) * 100)}%` }} /></td>}
                      <td className="text-right"><button className="text-primary hover:underline" onClick={() => startForm(a, b.referenceMonth)}>Corrigir</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            )}
            <button className="text-xs text-muted-foreground hover:underline" disabled={busy} onClick={() => call(`/api/utility-bills/accounts/${a.id}`, 'PATCH', { active: false })}>Desativar conta</button>
          </Card>
        );
      })}

      {data.accounts.some((a) => !a.active) && (
        <p className="text-xs text-muted-foreground">
          Desativadas: {data.accounts.filter((a) => !a.active).map((a) => (
            <button key={a.id} className="underline mr-2" disabled={busy} onClick={() => call(`/api/utility-bills/accounts/${a.id}`, 'PATCH', { active: true })}>{a.name} (reativar)</button>
          ))}
        </p>
      )}

      {form && formAccount && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-end sm:items-center justify-center p-4">
          <Card className="w-full max-w-md p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
            <h2 className="text-lg font-semibold">{correcting ? 'Corrigir' : 'Lançar'} {formAccount.name}</h2>
            <label className="block text-sm">Mês de referência
              <select className="w-full border rounded p-2 bg-background mt-1" value={form.referenceMonth} onChange={(e) => { const ym = e.target.value; startForm(formAccount, ym); }}>
                {Array.from({ length: 13 }, (_, i) => addMonths(data.defaultMonth, 1 - i)).map((ym) => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
            </label>
            <label className="block text-sm">Valor (R$)
              <input className="w-full border rounded p-2 bg-background mt-1" inputMode="decimal" placeholder="1.240,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </label>
            {formAccount.unit && (
              <label className="block text-sm">Consumo ({formAccount.unit})
                <input className="w-full border rounded p-2 bg-background mt-1" inputMode="decimal" placeholder={formAccount.kind === 'BOTTLED_GAS' ? 'botijões no mês' : 'como está na conta'} value={form.consumption} onChange={(e) => setForm({ ...form, consumption: e.target.value })} />
              </label>
            )}
            <label className="block text-sm">Vencimento (opcional)
              <input type="date" className="w-full border rounded p-2 bg-background mt-1" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </label>
            <label className="block text-sm">Observação (opcional)
              <input className="w-full border rounded p-2 bg-background mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end sticky bottom-0 bg-card pt-2">
              <Button variant="outline" onClick={() => { setForm(null); setError(null); }}>Cancelar</Button>
              <Button disabled={busy} onClick={async () => { if (await call('/api/utility-bills', 'PUT', { ...form, consumption: form.consumption || undefined, dueDate: form.dueDate || undefined })) setForm(null); }}>{correcting ? 'Corrigir' : 'Salvar'}</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
```

The month select lists the current month and the 12 before it (`addMonths(defaultMonth, 1 - i)`, `defaultMonth` = previous month), so no future month is offered.

- [ ] **Step 4: Run the tests and the type check**

Run: `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts` → PASS. `npx tsc --noEmit -p .` → no errors. `npm run build` in the background (it takes about 15 minutes; it can be stopped for low memory, ask before restarting) → completes, route `/dashboard/financeiro/contas` listed.

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/financeiro/contas lib/navigation/app-nav.ts __tests__/unit/app-nav.test.ts
git commit -m "feat(utility-bills): screen with accounts, bills, history and Pro indicators; menu link"
```

---

### Task 7: Verification, publish, deploy and browser check

- [ ] **Step 1: All suites, one group at a time:** unit; integration `staff`, `api`, `vender`, `caixa`, `bad-day`; `npx tsc --noEmit -p .`.
- [ ] **Step 2: Final review:** fresh reviewer on the most capable model over the whole branch, with the spec, this plan's Review Focus and the ledger rulings; fix Critical/Important with a failing test first.
- [ ] **Step 3: Publish to main** (`GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"`, fetch, rebase onto origin/main, push HEAD:main).
- [ ] **Step 4: Owner runbook:** Deploy homolog and app, then `npx prisma migrate deploy` in each console (applies `20261016150000_utility_bills`). Without it the screen errors.
- [ ] **Step 5: Homolog browser check (390x844 and 1280x660):** add Energia, Água, Aluguel; enter 4 months of Energia (the 4th 25% above) → indicators and bell alert (homolog restaurant is on a paid plan); correct a month → "Corrigir", no second alert; DRE of the month shows "Contas de consumo"; deactivate Aluguel → leaves the list, reactivate works.
- [ ] **Step 6: Docs and memory:** Claude Doc manual (business rules + deploy note) and the backlog memory.
