# Contagem de espetos (contagem do dia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per night and per tracked item (espetos), show opening + mounted − sold − loss = expected, and at close record the real count and the difference.

**Architecture:** New tables `daily_counts` (a night, close to close; one OPEN per restaurant by partial unique index), `daily_count_entries` (OPENING / MOUNTED / LOSS taps) and `daily_count_lines` (frozen close snapshot). "Sold" is computed live from non-cancelled kitchen `OrderItem`s in the night's interval. A close locks the night (`FOR UPDATE`), writes the lines, opens the next night and copies each counted leftover as its OPENING entry. Pure arithmetic lives in `lib/daily-count/compute.ts`; DB work in `lib/daily-count/{sold,service,close,history}.ts`; thin routes under `app/api/daily-count/`; screen `/contagem-do-dia`.

**Tech Stack:** Next.js 14 app router, Prisma 5 + PostgreSQL, Jest (unit: `jest.unit.config.js`; integration with the real test DB: `jest.integration.config.js`), Tailwind + `components/ui/*`.

**Spec:** `docs/superpowers/specs/2026-10-16-contagem-espetos-design.md`

## Global Constraints

- All plans (Starter included) use the count; only the bell alert on a difference is Pro+ (`tier-guard` feature `dailyCountAlert: ['pro', 'business', 'enterprise']`).
- Entries: roles OWNER, MANAGER, ADMIN, CASHIER, COOK. Close: `MANAGER_ROLES` (OWNER, MANAGER) only.
- Undo: the author deletes their own entry within 2 minutes; afterwards only `MANAGER_ROLES`, with `recordAudit`.
- Quantities are integers > 0 (entries) and integers ≥ 0 (counted).
- Sold = `OrderItem.quantity` with `OrderItem.status ≠ CANCELLED`, `Order.status ≠ CANCELLED`, `Order.restaurantId = restaurant`, `OrderItem.createdAt ∈ [openedAt, closedAt)`.
- Screen title: "Contagem de espetos" when the owner's `User.businessType === 'espetaria'`, else "Contagem do dia".
- Night open more than 20 h → banner "Contagem aberta desde <dia>, <hora>. Feche para conferir."
- Fixed text on screen: "Pedidos do iFood e do Keeta só entram na contagem se forem lançados no Gastrux (venda de balcão)."
- Dates/times shown in America/Sao_Paulo.
- Screen copy in Portuguese, no em dashes (owner rule 2026-10-12: dashes read as AI).
- Migration is additive only; deploy needs `npx prisma migrate deploy` after Deploy (homolog and app).
- Every query is scoped by `restaurantId` (multi-tenant isolation).

## Review Focus

1. **Night crossing midnight** — sales at 23:50 and 00:30 both count in the same night (no calendar split). Test in Task 3.
2. **Entry arriving while a close runs** — lands in the new night, never lost or counted twice. Test in Task 4.
3. **Leftover counted 0** — an item marked for the count starts the next night with opening 0 (still listed). Test in Task 4.
4. **Recipe from another restaurant** in POST entries or in close counts — refused 404/400, nothing written. Test in Task 3 and Task 4.
5. **Loss bigger than expected / expected negative** — shown as is (negative), not clamped; close still works. Test in Task 2 (unit) and Task 4.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` | `Recipe.dailyCount`, models `DailyCount`, `DailyCountEntry`, `DailyCountLine`, enums |
| `prisma/migrations/20261016120000_daily_count/migration.sql` | additive migration + partial unique index |
| `lib/tier-guard.ts`, `lib/api/tier-middleware.ts` | feature `dailyCountAlert` |
| `lib/onboarding/starter-templates.ts`, `lib/onboarding/seed-template.ts` | template `dailyCount` flag, seeded |
| `lib/daily-count/compute.ts` | pure: totals, rows, close rows, validation, `DailyCountError` |
| `lib/daily-count/sold.ts` | sold per recipe in an interval |
| `lib/daily-count/service.ts` | open night, board, add/delete entry |
| `lib/daily-count/close.ts` | close transaction + Pro alert |
| `lib/daily-count/history.ts` | closed nights + 4-week summary |
| `app/api/daily-count/route.ts` | GET board |
| `app/api/daily-count/entries/route.ts` | POST entry |
| `app/api/daily-count/entries/[id]/route.ts` | DELETE entry |
| `app/api/daily-count/close/route.ts` | POST close |
| `app/api/daily-count/history/route.ts` | GET history |
| `app/api/recipes/route.ts`, `app/api/recipes/[id]/route.ts` | accept `dailyCount` |
| `components/recipes/daily-count-field.tsx` | checkbox on recipe forms |
| `app/receitas/nova/page.tsx`, `app/receitas/[id]/editar/page.tsx` | use the checkbox |
| `app/contagem-do-dia/page.tsx` | the screen |
| `lib/navigation/app-nav.ts` | menu link |
| tests | `__tests__/unit/daily-count-compute.test.ts`, `__tests__/integration/staff/daily-count-*.test.ts` |

---

### Task 1: Schema, migration, plan flag and template flag

**Files:**
- Modify: `prisma/schema.prisma` (Recipe ~line 314; User ~line 99 relations; Restaurant ~line 2976 relations; new models after `FoodLabel` ~line 4574; enums near `enum OrderItemStatus`)
- Create: `prisma/migrations/20261016120000_daily_count/migration.sql`
- Modify: `lib/tier-guard.ts:83-105`, `lib/api/tier-middleware.ts` (featureNames)
- Modify: `lib/onboarding/starter-templates.ts` (interface `TemplateRecipe` + espetaria recipes), `lib/onboarding/seed-template.ts:52-68`
- Test: `__tests__/unit/starter-templates.test.ts`, `__tests__/integration/api/signup-demo.test.ts`

**Interfaces:**
- Produces: Prisma models `dailyCount`, `dailyCountEntry`, `dailyCountLine`; `Recipe.dailyCount: boolean`; `isTierFeatureEnabled(tier, 'dailyCountAlert')`; `TemplateRecipe.dailyCount?: boolean`.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/unit/starter-templates.test.ts`, inside the top `describe`, after the fallback test:

```ts
  it('espetaria counts its espetos and pão de alho in the daily count, nothing else', () => {
    const t = templateFor('espetaria');
    const counted = t.recipes.filter((r) => r.dailyCount).map((r) => r.key).sort();
    expect(counted).toEqual(['ALC', 'COR', 'FRG', 'KAF', 'LIN', 'PAO', 'QJC']);
    for (const r of t.recipes) expect([r.key, !!r.dailyCount]).toEqual([r.key, r.menuCategory === 'Espetos']);
    for (const other of STARTER_TEMPLATES.filter((x) => x.slug !== 'espetaria')) {
      expect([other.slug, other.recipes.some((r) => r.dailyCount)]).toEqual([other.slug, false]);
    }
  });
```

Add to `__tests__/integration/api/signup-demo.test.ts`, after the test `'every business type template goes in without errors'` (same `describe`, same helpers `newAccount`, `answer`, `answers`, `made`):

```ts
  it('the espetaria template marks its espetos for the daily count', async () => {
    const a = await newAccount(); made.push(a);
    await answer(a.userId, { ...answers, businessType: 'espetaria', startWith: 'template' });
    const rows = await prisma.recipe.findMany({ where: { restaurantId: a.restaurantId }, select: { name: true, dailyCount: true } });
    expect(rows.filter((r) => r.dailyCount).map((r) => r.name).sort()).toEqual([
      'Espeto de alcatra', 'Espeto de coração', 'Espeto de frango', 'Espeto de kafta', 'Espeto de linguiça', 'Espeto de queijo coalho', 'Pão de alho',
    ]);
    expect(rows.find((r) => r.name === 'Vinagrete')?.dailyCount).toBe(false);
  });
```

- [ ] **Step 2: Run the unit test to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/starter-templates.test.ts`
Expected: FAIL in "espetaria counts its espetos…" (`counted` is `[]`).

- [ ] **Step 3: Schema**

In `model Recipe`, after the `shelfLifeFrozenDays`/`foodLabels` block:

```prisma
  /// Counted in the daily count (spec 2026-10-16 contagem de espetos): mounted, sold, loss, leftover per night
  dailyCount        Boolean           @default(false)
  dailyCountEntries DailyCountEntry[]
  dailyCountLines   DailyCountLine[]
```

In `model User`, next to `printedFoodLabels`:

```prisma
  dailyCountsClosed DailyCount[]      @relation("DailyCountClosedBy")
  dailyCountEntries DailyCountEntry[] @relation("DailyCountEntryUser")
```

In `model Restaurant`, next to its `foodLabels FoodLabel[]`:

```prisma
  dailyCounts DailyCount[]
```

Enums (next to `enum OrderItemStatus`):

```prisma
enum DailyCountStatus {
  OPEN
  CLOSED
}

enum DailyCountEntryKind {
  OPENING
  MOUNTED
  LOSS
}
```

Models (after `model FoodLabel`):

```prisma
/// A night of the daily count, from the previous close to this one (spec 2026-10-16 contagem de espetos).
/// One OPEN night per restaurant, enforced by a partial unique index in migration 20261016120000_daily_count.
model DailyCount {
  id           String            @id @default(cuid())
  restaurantId String
  status       DailyCountStatus  @default(OPEN)
  openedAt     DateTime          @default(now())
  closedAt     DateTime?
  closedById   String?
  createdAt    DateTime          @default(now())
  restaurant   Restaurant        @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  closedBy     User?             @relation("DailyCountClosedBy", fields: [closedById], references: [id], onDelete: SetNull)
  entries      DailyCountEntry[]
  lines        DailyCountLine[]

  @@index([restaurantId, status])
  @@index([restaurantId, closedAt])
  @@map("daily_counts")
}

/// One tap: the opening stock (first night, or the leftover copied by the close), mounted, or a loss
model DailyCountEntry {
  id           String              @id @default(cuid())
  countId      String
  restaurantId String
  recipeId     String
  kind         DailyCountEntryKind
  quantity     Int
  reason       String?
  userId       String
  createdAt    DateTime            @default(now())
  count        DailyCount          @relation(fields: [countId], references: [id], onDelete: Cascade)
  recipe       Recipe              @relation(fields: [recipeId], references: [id], onDelete: Cascade)
  user         User                @relation("DailyCountEntryUser", fields: [userId], references: [id])

  @@index([countId])
  @@index([restaurantId])
  @@map("daily_count_entries")
}

/// The close, frozen per item: later cancellations never change it
model DailyCountLine {
  id         String     @id @default(cuid())
  countId    String
  recipeId   String?
  recipeName String
  opening    Int
  mounted    Int
  sold       Int
  loss       Int
  expected   Int
  counted    Int
  difference Int
  unitCost   Float      @default(0)
  count      DailyCount @relation(fields: [countId], references: [id], onDelete: Cascade)
  recipe     Recipe?    @relation(fields: [recipeId], references: [id], onDelete: SetNull)

  @@unique([countId, recipeId])
  @@map("daily_count_lines")
}
```

- [ ] **Step 4: Migration**

Create `prisma/migrations/20261016120000_daily_count/migration.sql`:

```sql
-- Contagem de espetos / contagem do dia (spec 2026-10-16)
CREATE TYPE "DailyCountStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "DailyCountEntryKind" AS ENUM ('OPENING', 'MOUNTED', 'LOSS');

ALTER TABLE "recipes" ADD COLUMN "dailyCount" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "daily_counts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "status" "DailyCountStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_counts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "daily_counts_restaurantId_status_idx" ON "daily_counts"("restaurantId", "status");
CREATE INDEX "daily_counts_restaurantId_closedAt_idx" ON "daily_counts"("restaurantId", "closedAt");
ALTER TABLE "daily_counts" ADD CONSTRAINT "daily_counts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_counts" ADD CONSTRAINT "daily_counts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- One open night per restaurant (Prisma cannot express a partial index)
CREATE UNIQUE INDEX "daily_counts_one_open_per_restaurant" ON "daily_counts"("restaurantId") WHERE "status" = 'OPEN';

CREATE TABLE "daily_count_entries" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "kind" "DailyCountEntryKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "daily_count_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "daily_count_entries_countId_idx" ON "daily_count_entries"("countId");
CREATE INDEX "daily_count_entries_restaurantId_idx" ON "daily_count_entries"("restaurantId");
ALTER TABLE "daily_count_entries" ADD CONSTRAINT "daily_count_entries_countId_fkey" FOREIGN KEY ("countId") REFERENCES "daily_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_count_entries" ADD CONSTRAINT "daily_count_entries_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_count_entries" ADD CONSTRAINT "daily_count_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "daily_count_lines" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeName" TEXT NOT NULL,
    "opening" INTEGER NOT NULL,
    "mounted" INTEGER NOT NULL,
    "sold" INTEGER NOT NULL,
    "loss" INTEGER NOT NULL,
    "expected" INTEGER NOT NULL,
    "counted" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    CONSTRAINT "daily_count_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daily_count_lines_countId_recipeId_key" ON "daily_count_lines"("countId", "recipeId");
ALTER TABLE "daily_count_lines" ADD CONSTRAINT "daily_count_lines_countId_fkey" FOREIGN KEY ("countId") REFERENCES "daily_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_count_lines" ADD CONSTRAINT "daily_count_lines_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

Run: `npx prisma generate` then `npm run test:db:migrate` (test DB must be running: `npm run test:db:status`, else `npm run test:db:start`).
Expected: `Drift check: OK`. If DRIFT, align the SQL with what `prisma migrate diff` prints (index names, column order of FKs) and rerun.

- [ ] **Step 5: Plan flag**

In `lib/tier-guard.ts`, add `'dailyCountAlert'` to the `feature` union type of `isTierFeatureEnabled`, and in `featureMap` after `labelExpiry`:

```ts
    // Owner decision 2026-10-16: the daily count (espetos) on every plan; the bell alert on a difference from Pro
    dailyCountAlert: ['pro', 'business', 'enterprise'],
```

In `lib/api/tier-middleware.ts` `featureNames`, add `dailyCountAlert: 'Aviso de diferença na contagem do dia',`. If `FeatureType` there is a separate union, add `'dailyCountAlert'` to it too (`grep -n "FeatureType" lib/api/tier-middleware.ts lib/tier-guard.ts`).

- [ ] **Step 6: Template flag and seed**

In `lib/onboarding/starter-templates.ts`, interface `TemplateRecipe`, after `items`:

```ts
  /** Counted in the daily count (contagem de espetos); seeded into Recipe.dailyCount */
  dailyCount?: boolean;
```

In the `espetaria` template, add `dailyCount: true,` to the 7 recipes of `menuCategory: 'Espetos'` (ALC, FRG, LIN, COR, KAF, QJC, PAO), e.g.:

```ts
      { key: 'ALC', name: 'Espeto de alcatra', description: '120 g', menuCategory: 'Espetos', price: 14, prepMinutes: 12, dailyCount: true,
```

In `lib/onboarding/seed-template.ts`, in `tx.recipe.create({ data: { … } })`, after `sellingPrice: r.price,`:

```ts
          dailyCount: r.dailyCount === true,
```

- [ ] **Step 7: Run tests**

Run: `npx jest --config jest.unit.config.js __tests__/unit/starter-templates.test.ts` → PASS.
Run: `npx jest --config jest.integration.config.js __tests__/integration/api/signup-demo.test.ts` → PASS (10 tests).
Run: `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261016120000_daily_count lib/tier-guard.ts lib/api/tier-middleware.ts lib/onboarding/starter-templates.ts lib/onboarding/seed-template.ts __tests__/unit/starter-templates.test.ts __tests__/integration/api/signup-demo.test.ts
git commit -m "feat(daily-count): schema, migration, Pro alert flag, espetaria template marks espetos"
```

---

### Task 2: Pure arithmetic (`lib/daily-count/compute.ts`)

**Files:**
- Create: `lib/daily-count/compute.ts`
- Test: `__tests__/unit/daily-count-compute.test.ts`

**Interfaces:**
- Produces:
  - `class DailyCountError extends Error { status: number }` (constructor `(message: string, status = 400)`)
  - `type EntryKind = 'OPENING' | 'MOUNTED' | 'LOSS'`
  - `entryTotals(entries: { recipeId: string; kind: EntryKind; quantity: number }[]): Record<string, { opening: number; mounted: number; loss: number }>`
  - `interface CountRow { recipeId: string; name: string; opening: number; mounted: number; sold: number; loss: number; expected: number }`
  - `buildRows(items: { recipeId: string; name: string }[], totals: ReturnType<typeof entryTotals>, sold: Record<string, number>): CountRow[]` (sorted by name, pt-BR)
  - `interface ClosedRow extends CountRow { counted: number; difference: number }`
  - `closeRows(rows: CountRow[], counts: { recipeId: string; counted: unknown }[]): ClosedRow[]` (throws `DailyCountError` 400)
  - `parseQuantity(value: unknown): number` (integer > 0, else throws 400)
  - `LOSS_REASONS = ['Caiu', 'Queimou', 'Venceu', 'Outro'] as const`; `lossReason(reason: unknown, note: unknown): string` (throws 400)

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/daily-count-compute.test.ts`:

```ts
import { entryTotals, buildRows, closeRows, parseQuantity, lossReason, DailyCountError } from '../../lib/daily-count/compute';

describe('daily count arithmetic (lib/daily-count/compute.ts)', () => {
  const items = [{ recipeId: 'k', name: 'Espeto de kafta' }, { recipeId: 'f', name: 'Espeto de frango' }];

  it('opening + mounted − sold − loss = expected, per item, sorted by name', () => {
    const totals = entryTotals([
      { recipeId: 'f', kind: 'OPENING', quantity: 8 },
      { recipeId: 'f', kind: 'MOUNTED', quantity: 20 },
      { recipeId: 'f', kind: 'MOUNTED', quantity: 20 },
      { recipeId: 'f', kind: 'LOSS', quantity: 2 },
      { recipeId: 'k', kind: 'MOUNTED', quantity: 10 },
    ]);
    const rows = buildRows(items, totals, { f: 38 });
    expect(rows).toEqual([
      { recipeId: 'f', name: 'Espeto de frango', opening: 8, mounted: 40, sold: 38, loss: 2, expected: 8 },
      { recipeId: 'k', name: 'Espeto de kafta', opening: 0, mounted: 10, sold: 0, loss: 0, expected: 10 },
    ]);
  });

  it('no entries and no sales gives zeros', () => {
    expect(buildRows([items[0]], {}, {})).toEqual([{ recipeId: 'k', name: 'Espeto de kafta', opening: 0, mounted: 0, sold: 0, loss: 0, expected: 0 }]);
  });

  it('expected can be negative (loss or sales beyond what was mounted): shown as is, never clamped', () => {
    const rows = buildRows([items[1]], entryTotals([{ recipeId: 'f', kind: 'MOUNTED', quantity: 5 }, { recipeId: 'f', kind: 'LOSS', quantity: 3 }]), { f: 4 });
    expect(rows[0].expected).toBe(-2);
    expect(closeRows(rows, [{ recipeId: 'f', counted: 0 }])[0]).toMatchObject({ counted: 0, difference: 2 });
  });

  it('close: difference = counted − expected; every row needs a count', () => {
    const rows = buildRows(items, entryTotals([{ recipeId: 'f', kind: 'MOUNTED', quantity: 50 }, { recipeId: 'k', kind: 'MOUNTED', quantity: 10 }]), { f: 38 });
    const closed = closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: '12' }]);
    expect(closed.map((r) => [r.recipeId, r.expected, r.counted, r.difference])).toEqual([['f', 12, 8, -4], ['k', 10, 12, 2]]);
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }])).toThrow(DailyCountError);
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: -1 }])).toThrow('Contagem inválida');
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: 1.5 }])).toThrow('Contagem inválida');
    expect(() => closeRows(rows, [{ recipeId: 'f', counted: 8 }, { recipeId: 'k', counted: 1 }, { recipeId: 'x', counted: 1 }])).toThrow('não está na contagem');
  });

  it('quantities are whole numbers above zero', () => {
    expect(parseQuantity(10)).toBe(10);
    expect(parseQuantity('3')).toBe(3);
    for (const bad of [0, -1, 1.5, 'abc', null, undefined, 100001]) expect(() => parseQuantity(bad)).toThrow(DailyCountError);
  });

  it('a loss needs a known reason; "Outro" needs a note', () => {
    expect(lossReason('Queimou', undefined)).toBe('Queimou');
    expect(lossReason('Outro', ' cliente devolveu ')).toBe('Outro: cliente devolveu');
    expect(() => lossReason('Outro', '  ')).toThrow('Diga o motivo');
    expect(() => lossReason('Sumiu', undefined)).toThrow('Motivo inválido');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/daily-count-compute.test.ts`
Expected: FAIL, "Cannot find module '../../lib/daily-count/compute'".

- [ ] **Step 3: Implement**

Create `lib/daily-count/compute.ts`:

```ts
/**
 * The daily count arithmetic (spec 2026-10-16 contagem de espetos, 4.3 to 4.5), no database:
 * opening + mounted − sold − loss = expected; at the close, difference = counted − expected.
 */

export class DailyCountError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type EntryKind = 'OPENING' | 'MOUNTED' | 'LOSS';
export type Totals = Record<string, { opening: number; mounted: number; loss: number }>;

export interface CountRow {
  recipeId: string;
  name: string;
  opening: number;
  mounted: number;
  sold: number;
  loss: number;
  expected: number;
}

export interface ClosedRow extends CountRow {
  counted: number;
  difference: number;
}

const FIELD: Record<EntryKind, 'opening' | 'mounted' | 'loss'> = { OPENING: 'opening', MOUNTED: 'mounted', LOSS: 'loss' };

export function entryTotals(entries: { recipeId: string; kind: EntryKind; quantity: number }[]): Totals {
  const out: Totals = {};
  for (const e of entries) {
    const t = (out[e.recipeId] ??= { opening: 0, mounted: 0, loss: 0 });
    t[FIELD[e.kind]] += e.quantity;
  }
  return out;
}

export function buildRows(items: { recipeId: string; name: string }[], totals: Totals, sold: Record<string, number>): CountRow[] {
  return items
    .map(({ recipeId, name }) => {
      const t = totals[recipeId] ?? { opening: 0, mounted: 0, loss: 0 };
      const s = sold[recipeId] ?? 0;
      return { recipeId, name, opening: t.opening, mounted: t.mounted, sold: s, loss: t.loss, expected: t.opening + t.mounted - s - t.loss };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

const MAX = 100000;

/** Whole number above zero (a tap or a typed quantity) */
export function parseQuantity(value: unknown): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > MAX) throw new DailyCountError('Quantidade inválida');
  return n;
}

export function closeRows(rows: CountRow[], counts: { recipeId: string; counted: unknown }[]): ClosedRow[] {
  const byId = new Map<string, number>();
  for (const c of counts) {
    if (!rows.some((r) => r.recipeId === c.recipeId)) throw new DailyCountError('Um item enviado não está na contagem desta noite');
    const n = typeof c.counted === 'string' && c.counted.trim() !== '' ? Number(c.counted) : c.counted;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX) throw new DailyCountError('Contagem inválida');
    byId.set(c.recipeId, n);
  }
  const missing = rows.filter((r) => !byId.has(r.recipeId));
  if (missing.length) throw new DailyCountError(`Conte todos os itens: falta ${missing.map((r) => r.name).join(', ')}`);
  return rows.map((r) => {
    const counted = byId.get(r.recipeId)!;
    return { ...r, counted, difference: counted - r.expected };
  });
}

export const LOSS_REASONS = ['Caiu', 'Queimou', 'Venceu', 'Outro'] as const;

export function lossReason(reason: unknown, note: unknown): string {
  if (typeof reason !== 'string' || !(LOSS_REASONS as readonly string[]).includes(reason)) throw new DailyCountError('Motivo inválido');
  if (reason !== 'Outro') return reason;
  const text = typeof note === 'string' ? note.trim() : '';
  if (!text) throw new DailyCountError('Diga o motivo da perda');
  return `Outro: ${text.slice(0, 200)}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/daily-count-compute.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/daily-count/compute.ts __tests__/unit/daily-count-compute.test.ts
git commit -m "feat(daily-count): pure arithmetic for rows and close"
```

---

### Task 3: Sold, the open night, the board and entries (service + GET/POST/DELETE routes)

**Files:**
- Create: `lib/daily-count/sold.ts`, `lib/daily-count/service.ts`
- Create: `app/api/daily-count/route.ts`, `app/api/daily-count/entries/route.ts`, `app/api/daily-count/entries/[id]/route.ts`
- Test: `__tests__/integration/staff/daily-count-entries.test.ts`

**Interfaces:**
- Consumes: Task 2 (`entryTotals`, `buildRows`, `parseQuantity`, `lossReason`, `DailyCountError`, `CountRow`); `requireRestaurantRole`, `MANAGER_ROLES`, `recordAudit`, `RestaurantMember` from `@/lib/auth/restaurant-role`.
- Produces:
  - `soldByRecipe(db, restaurantId: string, recipeIds: string[], from: Date, to: Date): Promise<Record<string, number>>` (`db` = `prisma` or a transaction client)
  - `ENTRY_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'CASHIER', 'COOK']`
  - `openNight(db, restaurantId: string): Promise<{ id: string; openedAt: Date }>` (find OPEN or create; on unique violation P2002 find again)
  - `nightItems(db, restaurantId: string, countId: string): Promise<{ recipeId: string; name: string }[]>` (active `dailyCount` recipes ∪ recipes with entries in this night)
  - `nightRows(db, restaurantId: string, night: { id: string; openedAt: Date }, to: Date): Promise<CountRow[]>`
  - `loadBoard(member: RestaurantMember, now?: Date): Promise<Board>` where `Board = { countId: string; openedAt: string; title: string; firstUse: boolean; openTooLong: boolean; canClose: boolean; rows: CountRow[]; entries: { id: string; recipeId: string; kind: EntryKind; quantity: number; reason: string | null; userName: string | null; createdAt: string; canDelete: boolean }[] }`
  - `addEntry(member, body: { recipeId?: unknown; kind?: unknown; quantity?: unknown; reason?: unknown; note?: unknown }): Promise<{ id: string; countId: string }>`
  - `deleteEntry(member, entryId: string, now?: Date): Promise<{ ok: true }>`
  - `UNDO_MS = 2 * 60 * 1000`

- [ ] **Step 1: Write the failing integration test**

Create `__tests__/integration/staff/daily-count-entries.test.ts`:

```ts
// @ts-nocheck
/** Daily count: sold, entries, board (spec 2026-10-16 contagem de espetos, 4.2 to 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as BOARD } from '../../../app/api/daily-count/route';
import { POST as ADD } from '../../../app/api/daily-count/entries/route';
import { DELETE as REMOVE } from '../../../app/api/daily-count/entries/[id]/route';
import { soldByRecipe } from '../../../lib/daily-count/sold';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const add = (body) => ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }));
const board = async () => (await BOARD(new NextRequest('http://x'))).json();
const row = (b, id) => b.rows.find((r) => r.recipeId === id);
let seq = 0;

describe('daily count: sold, entries, board', () => {
  let rid: string, otherRid: string, frango: string, kafta: string, vinagrete: string, otherRecipe: string, owner: any, cook: any, cashier: any;
  const userIds: string[] = [];
  const recipe = (restaurantId, name, dailyCount) =>
    prisma.recipe.create({ data: { restaurantId, code: `R${tag}${seq++}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount } });
  const member = async (restaurantId, role, name) => {
    const u = await prisma.user.create({ data: { email: `dc-${role}-${seq++}-${tag}@gastrux.test`, name, password: 'x', role, currentRestaurantId: restaurantId } });
    await prisma.restaurantUser.create({ data: { restaurantId, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
    userIds.push(u.id);
    return { id: u.id, email: u.email, role };
  };
  const sell = (restaurantId, recipeId, quantity, at: Date, opts: any = {}) =>
    prisma.order.create({ data: { restaurantId, orderNumber: `DC${tag}${seq++}`, status: opts.orderStatus ?? 'COMPLETED', createdAt: at,
      items: { create: [{ recipeId, quantity, status: opts.itemStatus ?? 'COMPLETED', createdAt: at }] } } });

  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `dc-o-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', businessType: 'espetaria' } });
    userIds.push(o.id);
    rid = (await prisma.restaurant.create({ data: { name: `Dc ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    cook = await member(rid, 'COOK', 'Zé da brasa');
    cashier = await member(rid, 'CASHIER', 'Bia');
    const oo = await prisma.user.create({ data: { email: `dc-x-${tag}@gastrux.test`, name: 'X', password: 'x', role: 'OWNER' } });
    userIds.push(oo.id);
    otherRid = (await prisma.restaurant.create({ data: { name: `Dc2 ${tag}`, ownerId: oo.id, status: 'ACTIVE' } })).id;
    frango = (await recipe(rid, 'Espeto de frango', true)).id;
    kafta = (await recipe(rid, 'Espeto de kafta', true)).id;
    vinagrete = (await recipe(rid, 'Vinagrete', false)).id;
    otherRecipe = (await recipe(otherRid, 'Espeto alheio', true)).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.order.deleteMany({ where: { restaurantId: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); } catch {}
  });

  it('sold counts non-cancelled items of non-cancelled orders of this restaurant in the interval, across midnight', async () => {
    const from = new Date('2026-10-15T21:00:00Z'); // 18:00 BRT
    const to = new Date('2026-10-16T06:00:00Z');   // 03:00 BRT
    await sell(rid, frango, 3, new Date('2026-10-16T02:50:00Z')); // 23:50 BRT
    await sell(rid, frango, 2, new Date('2026-10-16T03:30:00Z')); // 00:30 BRT, next calendar day
    await sell(rid, frango, 5, new Date('2026-10-16T03:31:00Z'), { itemStatus: 'CANCELLED' });
    await sell(rid, frango, 7, new Date('2026-10-16T03:32:00Z'), { orderStatus: 'CANCELLED' });
    await sell(rid, frango, 9, new Date('2026-10-15T20:59:00Z')); // before the night
    await sell(rid, frango, 11, to);                               // the end is exclusive
    await sell(otherRid, otherRecipe, 4, new Date('2026-10-16T03:00:00Z'));
    expect(await soldByRecipe(prisma, rid, [frango, kafta, otherRecipe], from, to)).toEqual({ [frango]: 5 });
  });

  it('first use: the board opens a night, lists the counted items with the espetaria title and asks for the opening', async () => {
    as(cook);
    const b = await board();
    expect(b.title).toBe('Contagem de espetos');
    expect(b.firstUse).toBe(true);
    expect(b.canClose).toBe(false);
    expect(b.rows.map((r) => r.name)).toEqual(['Espeto de frango', 'Espeto de kafta']);
    expect(await prisma.dailyCount.count({ where: { restaurantId: rid, status: 'OPEN' } })).toBe(1);
    // Asking again reuses the same night
    expect((await board()).countId).toBe(b.countId);
    expect(await prisma.dailyCount.count({ where: { restaurantId: rid } })).toBe(1);
  });

  it('cook and cashier tap opening, mounted and loss; the board adds them up with the sales of the night', async () => {
    as(cook);
    expect((await add({ recipeId: frango, kind: 'OPENING', quantity: 8 })).status).toBe(200);
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: 20 })).status).toBe(200);
    as(cashier);
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: '20' })).status).toBe(200);
    expect((await add({ recipeId: frango, kind: 'LOSS', quantity: 2, reason: 'Queimou' })).status).toBe(200);
    const night = await prisma.dailyCount.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await sell(rid, frango, 4, new Date()); // after the night opened, before the board reads "now"
    as(owner);
    const b = await board();
    expect(row(b, frango)).toMatchObject({ opening: 8, mounted: 40, sold: 4, loss: 2, expected: 42 });
    expect(b.canClose).toBe(true);
    expect(b.entries.find((e) => e.kind === 'LOSS')).toMatchObject({ reason: 'Queimou', userName: 'Bia' });
  });

  it('refuses bad input and recipes of another restaurant; nothing is written', async () => {
    as(cook);
    const before = await prisma.dailyCountEntry.count({ where: { restaurantId: rid } });
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: 0 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'MOUNTED', quantity: 1.5 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'SOLD', quantity: 1 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'LOSS', quantity: 1 })).status).toBe(400);
    expect((await add({ recipeId: frango, kind: 'LOSS', quantity: 1, reason: 'Outro', note: ' ' })).status).toBe(400);
    expect((await add({ recipeId: otherRecipe, kind: 'MOUNTED', quantity: 1 })).status).toBe(404);
    expect(await prisma.dailyCountEntry.count({ where: { restaurantId: rid } })).toBe(before);
  });

  it('an item not marked for the count joins the night once it has an entry', async () => {
    as(cook);
    expect((await add({ recipeId: vinagrete, kind: 'MOUNTED', quantity: 3 })).status).toBe(200);
    expect(row(await board(), vinagrete)).toMatchObject({ mounted: 3, expected: 3 });
  });

  it('opening by hand only on the first night: refused once a night was closed', async () => {
    const night = await prisma.dailyCount.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await prisma.dailyCount.create({ data: { restaurantId: rid, status: 'CLOSED', openedAt: new Date(night.openedAt.getTime() - 864e5), closedAt: new Date(night.openedAt.getTime() - 1) } });
    as(cook);
    const res = await add({ recipeId: kafta, kind: 'OPENING', quantity: 5 });
    expect(res.status).toBe(409);
    expect((await board()).firstUse).toBe(false);
  });

  it('undo: the author within 2 minutes; later only a manager, with audit', async () => {
    as(cook);
    const fresh = await (await add({ recipeId: kafta, kind: 'MOUNTED', quantity: 10 })).json();
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: fresh.id } })).status).toBe(200);
    const old = await (await add({ recipeId: kafta, kind: 'MOUNTED', quantity: 10 })).json();
    await prisma.dailyCountEntry.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - 3 * 60 * 1000) } });
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: old.id } })).status).toBe(403);
    as(cashier);
    const others = await (await add({ recipeId: kafta, kind: 'MOUNTED', quantity: 1 })).json();
    as(cook);
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: others.id } })).status).toBe(403);
    as(owner);
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: old.id } })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { restaurantId: rid, entityType: 'DailyCountEntry', entityId: old.id } })).toBe(1);
  });

  it('another restaurant cannot see or delete these entries', async () => {
    const outsider = await member(otherRid, 'MANAGER', 'Fora');
    const anyEntry = await prisma.dailyCountEntry.findFirst({ where: { restaurantId: rid } });
    as(outsider);
    expect((await REMOVE(new NextRequest('http://x', { method: 'DELETE' }), { params: { id: anyEntry.id } })).status).toBe(404);
    const b = await board();
    expect(b.title).toBe('Contagem do dia');
    expect(b.rows.map((r) => r.name)).toEqual(['Espeto alheio']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/daily-count-entries.test.ts`
Expected: FAIL, cannot find module `app/api/daily-count/route`.

- [ ] **Step 3: `lib/daily-count/sold.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Sold per recipe in [from, to): every kitchen item (comanda send, counter sale, QR, WhatsApp, site
 * delivery) not cancelled, of an order not cancelled, of this restaurant (spec 2026-10-16, 4.4).
 */
export async function soldByRecipe(db: Db, restaurantId: string, recipeIds: string[], from: Date, to: Date): Promise<Record<string, number>> {
  if (recipeIds.length === 0) return {};
  const rows = await db.orderItem.groupBy({
    by: ['recipeId'],
    where: {
      recipeId: { in: recipeIds },
      status: { not: 'CANCELLED' },
      createdAt: { gte: from, lt: to },
      order: { restaurantId, status: { not: 'CANCELLED' } },
    },
    _sum: { quantity: true },
  });
  const out: Record<string, number> = {};
  for (const r of rows) if (r._sum.quantity) out[r.recipeId] = r._sum.quantity;
  return out;
}
```

- [ ] **Step 4: `lib/daily-count/service.ts`**

```ts
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { MANAGER_ROLES, recordAudit, type RestaurantMember, type RestaurantRole } from '@/lib/auth/restaurant-role';
import { buildRows, entryTotals, lossReason, parseQuantity, DailyCountError, type CountRow, type EntryKind } from './compute';
import { soldByRecipe } from './sold';

type Db = PrismaClient | Prisma.TransactionClient;

export const ENTRY_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'CASHIER', 'COOK'];
export const UNDO_MS = 2 * 60 * 1000;
const TOO_LONG_MS = 20 * 60 * 60 * 1000;
const KINDS: EntryKind[] = ['OPENING', 'MOUNTED', 'LOSS'];

/** The open night of the restaurant, created on first use (one OPEN per restaurant, partial unique index) */
export async function openNight(db: Db, restaurantId: string): Promise<{ id: string; openedAt: Date }> {
  const select = { id: true, openedAt: true } as const;
  const found = await db.dailyCount.findFirst({ where: { restaurantId, status: 'OPEN' }, select });
  if (found) return found;
  try {
    return await db.dailyCount.create({ data: { restaurantId }, select });
  } catch (e) {
    // Two first taps at once: the other one created it
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await db.dailyCount.findFirst({ where: { restaurantId, status: 'OPEN' }, select });
      if (again) return again;
    }
    throw e;
  }
}

/** Items of a night: active recipes marked for the count, plus any recipe with an entry in this night */
export async function nightItems(db: Db, restaurantId: string, countId: string): Promise<{ recipeId: string; name: string }[]> {
  const withEntries = await db.dailyCountEntry.findMany({ where: { countId, restaurantId }, select: { recipeId: true }, distinct: ['recipeId'] });
  const recipes = await db.recipe.findMany({
    where: { restaurantId, OR: [{ dailyCount: true, active: true }, { id: { in: withEntries.map((e) => e.recipeId) } }] },
    select: { id: true, name: true },
  });
  return recipes.map((r) => ({ recipeId: r.id, name: r.name }));
}

export async function nightRows(db: Db, restaurantId: string, night: { id: string; openedAt: Date }, to: Date): Promise<CountRow[]> {
  const items = await nightItems(db, restaurantId, night.id);
  const entries = await db.dailyCountEntry.findMany({ where: { countId: night.id, restaurantId }, select: { recipeId: true, kind: true, quantity: true } });
  const sold = await soldByRecipe(db, restaurantId, items.map((i) => i.recipeId), night.openedAt, to);
  return buildRows(items, entryTotals(entries as any), sold);
}

async function titleFor(restaurantId: string): Promise<string> {
  const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { owner: { select: { businessType: true } } } });
  return r?.owner?.businessType === 'espetaria' ? 'Contagem de espetos' : 'Contagem do dia';
}

const canDelete = (member: RestaurantMember, e: { userId: string; createdAt: Date }, now: Date) =>
  MANAGER_ROLES.includes(member.role) || (e.userId === member.userId && now.getTime() - e.createdAt.getTime() <= UNDO_MS);

export async function loadBoard(member: RestaurantMember, now = new Date()) {
  const { restaurantId } = member;
  const night = await openNight(prisma, restaurantId);
  const [rows, entries, closedBefore, title] = await Promise.all([
    nightRows(prisma, restaurantId, night, now),
    prisma.dailyCountEntry.findMany({ where: { countId: night.id, restaurantId }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { name: true } } } }),
    prisma.dailyCount.count({ where: { restaurantId, status: 'CLOSED' } }),
    titleFor(restaurantId),
  ]);
  return {
    countId: night.id,
    openedAt: night.openedAt.toISOString(),
    title,
    firstUse: closedBefore === 0,
    openTooLong: now.getTime() - night.openedAt.getTime() > TOO_LONG_MS,
    canClose: MANAGER_ROLES.includes(member.role),
    rows,
    entries: entries.map((e) => ({
      id: e.id, recipeId: e.recipeId, kind: e.kind as EntryKind, quantity: e.quantity, reason: e.reason,
      userName: e.user?.name ?? null, createdAt: e.createdAt.toISOString(), canDelete: canDelete(member, e, now),
    })),
  };
}

export async function addEntry(member: RestaurantMember, body: { recipeId?: unknown; kind?: unknown; quantity?: unknown; reason?: unknown; note?: unknown }) {
  const { restaurantId } = member;
  if (typeof body.kind !== 'string' || !KINDS.includes(body.kind as EntryKind)) throw new DailyCountError('Tipo de lançamento inválido');
  const kind = body.kind as EntryKind;
  const quantity = parseQuantity(body.quantity);
  const reason = kind === 'LOSS' ? lossReason(body.reason, body.note) : null;
  if (typeof body.recipeId !== 'string') throw new DailyCountError('Item não encontrado', 404);
  const recipe = await prisma.recipe.findFirst({ where: { id: body.recipeId, restaurantId }, select: { id: true } });
  if (!recipe) throw new DailyCountError('Item não encontrado', 404);
  if (kind === 'OPENING' && (await prisma.dailyCount.count({ where: { restaurantId, status: 'CLOSED' } })) > 0) {
    throw new DailyCountError('O início da noite vem da contagem do fechamento anterior', 409);
  }
  return prisma.$transaction(async (tx) => {
    const night = await openNight(tx, restaurantId);
    // Wait for a close in progress: the tap then lands in the new night (lib/daily-count/close.ts)
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "daily_counts" WHERE "id" = ${night.id} FOR UPDATE`;
    const target = locked[0]?.status === 'OPEN' ? night : await openNight(tx, restaurantId);
    const entry = await tx.dailyCountEntry.create({
      data: { countId: target.id, restaurantId, recipeId: recipe.id, kind, quantity, reason, userId: member.userId },
      select: { id: true, countId: true },
    });
    return entry;
  }, { timeout: 20_000, maxWait: 10_000 });
}

export async function deleteEntry(member: RestaurantMember, entryId: string, now = new Date()) {
  const entry = await prisma.dailyCountEntry.findFirst({
    where: { id: entryId, restaurantId: member.restaurantId },
    include: { count: { select: { status: true } } },
  });
  if (!entry) throw new DailyCountError('Lançamento não encontrado', 404);
  if (entry.count.status !== 'OPEN') throw new DailyCountError('Esta contagem já foi fechada', 409);
  if (!canDelete(member, entry, now)) throw new DailyCountError('Só o gerente apaga este lançamento', 403);
  await prisma.dailyCountEntry.delete({ where: { id: entry.id } });
  if (entry.userId !== member.userId || now.getTime() - entry.createdAt.getTime() > UNDO_MS) {
    await recordAudit(member, { action: 'DELETE', entityType: 'DailyCountEntry', entityId: entry.id, changes: { kind: entry.kind, quantity: entry.quantity, recipeId: entry.recipeId, by: entry.userId } });
  }
  return { ok: true as const };
}
```

Note: the test "undo … later only a manager, with audit" expects exactly one audit row for the old entry deleted by the owner; the cook's own deletion within 2 minutes writes none.

- [ ] **Step 5: Routes**

`app/api/daily-count/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { ENTRY_ROLES, loadBoard } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** GET /api/daily-count - the open night with live rows (spec 2026-10-16 contagem de espetos) */
export async function GET() {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await loadBoard(auth.member), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[daily-count] board failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a contagem' }, { status: 500 });
  }
}
```

`app/api/daily-count/entries/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DailyCountError } from '@/lib/daily-count/compute';
import { ENTRY_ROLES, addEntry } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** POST /api/daily-count/entries { recipeId, kind: OPENING|MOUNTED|LOSS, quantity, reason?, note? } */
async function handlePOST(request: Request) {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await addEntry(auth.member, body));
  } catch (error) {
    if (error instanceof DailyCountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[daily-count] entry failed:', error);
    return NextResponse.json({ error: 'Não foi possível lançar' }, { status: 500 });
  }
}

export const POST = idempotent(handlePOST);
```

`app/api/daily-count/entries/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DailyCountError } from '@/lib/daily-count/compute';
import { ENTRY_ROLES, deleteEntry } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** DELETE /api/daily-count/entries/[id] - the author within 2 minutes, a manager any time (audited) */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await deleteEntry(auth.member, params.id));
  } catch (error) {
    if (error instanceof DailyCountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[daily-count] delete failed:', error);
    return NextResponse.json({ error: 'Não foi possível apagar' }, { status: 500 });
  }
}
```

Check `idempotent` works with a single-argument handler: `sed -n '1,80p' lib/api/idempotency.ts`. If its signature requires `(request, ctx)`, write `async function handlePOST(request: Request, _ctx?: unknown)`.

- [ ] **Step 6: Run the test**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/daily-count-entries.test.ts`
Expected: PASS (8 tests). Run `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/daily-count/sold.ts lib/daily-count/service.ts app/api/daily-count __tests__/integration/staff/daily-count-entries.test.ts
git commit -m "feat(daily-count): open night, live board, entries with undo"
```

---

### Task 4: Close, Pro alert and history

**Files:**
- Create: `lib/daily-count/close.ts`, `lib/daily-count/history.ts`
- Create: `app/api/daily-count/close/route.ts`, `app/api/daily-count/history/route.ts`
- Test: `__tests__/integration/staff/daily-count-close.test.ts`

**Interfaces:**
- Consumes: Task 2 `closeRows`, `ClosedRow`, `DailyCountError`; Task 3 `openNight`, `nightRows`, `ENTRY_ROLES`; `isTierFeatureEnabled` from `@/lib/tier-guard`.
- Produces:
  - `closeNight(member: RestaurantMember, counts: { recipeId: string; counted: unknown }[], now?: Date): Promise<{ closedId: string; nextId: string; lines: ClosedRow[] }>`
  - `differenceAlertText(lines: { recipeName: string; difference: number; unitCost: number }[]): { title: string; message: string; missingValue: number } | null`
  - `loadHistory(restaurantId: string, weeks: number, now?: Date): Promise<{ nights: { id: string; openedAt: string; closedAt: string; closedBy: string | null; sold: number; loss: number; difference: number; differenceValue: number; lines: { recipeName: string; opening: number; mounted: number; sold: number; loss: number; expected: number; counted: number; difference: number }[] }[]; byItem: { recipeName: string; sold: number; loss: number; difference: number }[] }>`

- [ ] **Step 1: Write the failing integration test**

Create `__tests__/integration/staff/daily-count-close.test.ts`:

```ts
// @ts-nocheck
/** Daily count: close, next night, Pro alert, history (spec 2026-10-16 contagem de espetos, 4.5 to 4.7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as BOARD } from '../../../app/api/daily-count/route';
import { POST as ADD } from '../../../app/api/daily-count/entries/route';
import { POST as CLOSE } from '../../../app/api/daily-count/close/route';
import { GET as HISTORY } from '../../../app/api/daily-count/history/route';
import { differenceAlertText } from '../../../lib/daily-count/close';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const add = (body) => ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) }));
const close = (counts) => CLOSE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ counts }) }));
const board = async () => (await BOARD(new NextRequest('http://x'))).json();
let seq = 0;

async function setup(tier: string) {
  const o = await prisma.user.create({ data: { email: `dcc-o-${seq++}-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER', businessType: 'espetaria' } });
  const rid = (await prisma.restaurant.create({ data: { name: `Dcc ${seq++} ${tag}`, ownerId: o.id, status: 'ACTIVE', subscriptionTier: tier } })).id;
  await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
  const c = await prisma.user.create({ data: { email: `dcc-c-${seq++}-${tag}@gastrux.test`, name: 'Zé', password: 'x', role: 'COOK', currentRestaurantId: rid } });
  await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
  const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: 'Carnes' } });
  const meat = await prisma.ingredient.create({ data: { restaurantId: rid, code: `F${seq++}${tag}`, name: 'Frango', categoryId: cat.id, standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 20 } });
  const recipe = (name, dailyCount, qty) => prisma.recipe.create({ data: { restaurantId: rid, code: `R${seq++}${tag}`, name, baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 10, dailyCount,
    ingredients: { create: [{ ingredientId: meat.id, quantity: qty, unit: 'kg' }] } } });
  const frango = (await recipe('Espeto de frango', true, 0.12)).id; // unit cost 2.40
  const kafta = (await recipe('Espeto de kafta', true, 0.1)).id;    // unit cost 2.00
  return { rid, owner: { id: o.id, email: o.email, role: 'OWNER' }, cook: { id: c.id, email: c.email, role: 'COOK' }, frango, kafta, userIds: [o.id, c.id] };
}
const sell = (rid, recipeId, quantity, at = new Date()) =>
  prisma.order.create({ data: { restaurantId: rid, orderNumber: `DCC${tag}${seq++}`, status: 'COMPLETED', createdAt: at, items: { create: [{ recipeId, quantity, status: 'COMPLETED', createdAt: at }] } } });

describe('daily count: close', () => {
  let s, p;
  beforeAll(async () => { s = await setup('starter'); p = await setup('pro'); }, 60000);
  afterAll(async () => {
    for (const x of [s, p]) {
      try { await prisma.notification.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.order.deleteMany({ where: { restaurantId: x.rid } }); } catch {}
      try { await prisma.restaurant.deleteMany({ where: { id: x.rid } }); } catch {}
      try { await prisma.user.deleteMany({ where: { id: { in: x.userIds } } }); } catch {}
    }
  });

  it('the cook cannot close', async () => {
    as(s.cook);
    await board();
    expect((await close([{ recipeId: s.frango, counted: 0 }, { recipeId: s.kafta, counted: 0 }])).status).toBe(403);
  });

  it('close freezes the lines with cost, opens the next night with the leftover as opening, Starter gets no alert', async () => {
    as(s.cook);
    await add({ recipeId: s.frango, kind: 'OPENING', quantity: 8 });
    await add({ recipeId: s.frango, kind: 'MOUNTED', quantity: 40 });
    await add({ recipeId: s.kafta, kind: 'MOUNTED', quantity: 10 });
    await add({ recipeId: s.kafta, kind: 'LOSS', quantity: 12, reason: 'Caiu' }); // more than mounted: expected −2
    await sell(s.rid, s.frango, 38);
    as(s.owner);
    const res = await close([{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: '0' }]);
    expect(res.status).toBe(200);
    const body = await res.json();
    const lines = await prisma.dailyCountLine.findMany({ where: { countId: body.closedId }, orderBy: { recipeName: 'asc' } });
    expect(lines.map((l) => [l.recipeName, l.opening, l.mounted, l.sold, l.loss, l.expected, l.counted, l.difference, Math.round(l.unitCost * 100)])).toEqual([
      ['Espeto de frango', 8, 40, 38, 0, 10, 6, -4, 240],
      ['Espeto de kafta', 0, 10, 0, 12, -2, 0, 2, 200],
    ]);
    const closed = await prisma.dailyCount.findUnique({ where: { id: body.closedId } });
    expect(closed).toMatchObject({ status: 'CLOSED', closedById: s.owner.id });
    const next = await prisma.dailyCount.findUnique({ where: { id: body.nextId }, include: { entries: true } });
    expect(next.status).toBe('OPEN');
    expect(next.openedAt.getTime()).toBe(closed.closedAt.getTime());
    expect(next.entries.map((e) => [e.recipeId, e.kind, e.quantity])).toEqual([[s.frango, 'OPENING', 6]]);
    expect(await prisma.notification.count({ where: { restaurantId: s.rid } })).toBe(0);
    // A sale cancelled after the close never changes the frozen lines
    await prisma.orderItem.updateMany({ where: { order: { restaurantId: s.rid } }, data: { status: 'CANCELLED' } });
    expect((await prisma.dailyCountLine.findFirst({ where: { countId: body.closedId, recipeName: 'Espeto de frango' } })).sold).toBe(38);
    // Next night: frango starts at 6, kafta (flag on, leftover 0) stays with 0
    const b = await board();
    expect(b.rows.map((r) => [r.name, r.opening])).toEqual([['Espeto de frango', 6], ['Espeto de kafta', 0]]);
  });

  it('every item needs a count; an unknown item is refused; nothing changes', async () => {
    as(s.owner);
    const open = await prisma.dailyCount.findFirst({ where: { restaurantId: s.rid, status: 'OPEN' } });
    expect((await close([{ recipeId: s.frango, counted: 6 }])).status).toBe(400);
    expect((await close([{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }, { recipeId: p.frango, counted: 1 }])).status).toBe(400);
    expect((await prisma.dailyCount.findUnique({ where: { id: open.id } })).status).toBe('OPEN');
  });

  it('two closes at once: one wins, the other gets 409; exactly one new night', async () => {
    as(s.owner);
    const before = await prisma.dailyCount.count({ where: { restaurantId: s.rid } });
    const counts = [{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }];
    const [a, b] = await Promise.all([close(counts), close(counts)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await prisma.dailyCount.count({ where: { restaurantId: s.rid } })).toBe(before + 1);
    expect(await prisma.dailyCount.count({ where: { restaurantId: s.rid, status: 'OPEN' } })).toBe(1);
  });

  it('an entry sent while a close runs lands in the new night, never lost', async () => {
    as(s.owner);
    const counts = [{ recipeId: s.frango, counted: 6 }, { recipeId: s.kafta, counted: 0 }];
    const [closeRes, addRes] = await Promise.all([close(counts), add({ recipeId: s.kafta, kind: 'MOUNTED', quantity: 5 })]);
    expect(closeRes.status).toBe(200);
    expect(addRes.status).toBe(200);
    const entry = await prisma.dailyCountEntry.findUnique({ where: { id: (await addRes.json()).id }, include: { count: true } });
    const { nextId, closedId } = await closeRes.json();
    // Either it was in time for the closed night (then its line counts it) or it went to the new one
    if (entry.countId === closedId) {
      expect((await prisma.dailyCountLine.findFirst({ where: { countId: closedId, recipeId: s.kafta } })).mounted).toBe(5);
    } else {
      expect(entry.countId).toBe(nextId);
    }
  });

  it('Pro: a difference becomes one bell alert for the managers with the missing value', async () => {
    as(p.cook);
    await board();
    await add({ recipeId: p.frango, kind: 'MOUNTED', quantity: 20 });
    await add({ recipeId: p.kafta, kind: 'MOUNTED', quantity: 10 });
    await sell(p.rid, p.frango, 10);
    as(p.owner);
    expect((await close([{ recipeId: p.frango, counted: 6 }, { recipeId: p.kafta, counted: 10 }])).status).toBe(200);
    const alerts = await prisma.notification.findMany({ where: { restaurantId: p.rid } });
    expect(alerts.length).toBe(1);
    expect(alerts[0]).toMatchObject({ userId: null, severity: 'HIGH', actionUrl: '/contagem-do-dia?tab=historico' });
    expect(alerts[0].message).toContain('Espeto de frango: faltam 4');
    expect(alerts[0].message).toContain('R$ 9,60');
    // No difference: no alert
    expect((await close([{ recipeId: p.frango, counted: 6 }, { recipeId: p.kafta, counted: 10 }])).status).toBe(200);
    expect(await prisma.notification.count({ where: { restaurantId: p.rid } })).toBe(1);
  });

  it('history lists closed nights newest first and sums per item', async () => {
    as(s.owner);
    const res = await HISTORY(new NextRequest('http://x/api/daily-count/history?weeks=4'));
    expect(res.status).toBe(200);
    const h = await res.json();
    expect(h.nights.length).toBeGreaterThanOrEqual(3);
    expect(new Date(h.nights[0].closedAt).getTime()).toBeGreaterThanOrEqual(new Date(h.nights[1].closedAt).getTime());
    const first = h.nights[h.nights.length - 1];
    expect(first).toMatchObject({ sold: 38, loss: 12, difference: -2 });
    expect(first.differenceValue).toBeCloseTo(-5.6, 2); // −4 × 2.40 + 2 × 2.00
    expect(h.byItem.find((i) => i.recipeName === 'Espeto de frango').sold).toBeGreaterThanOrEqual(38);
    as(s.cook);
    expect((await HISTORY(new NextRequest('http://x/api/daily-count/history'))).status).toBe(200);
  });

  it('alert text lists missing items with their value, and extra items apart', () => {
    expect(differenceAlertText([{ recipeName: 'Espeto de frango', difference: 0, unitCost: 2 }])).toBeNull();
    const t = differenceAlertText([
      { recipeName: 'Espeto de frango', difference: -4, unitCost: 2.4 },
      { recipeName: 'Espeto de kafta', difference: -2, unitCost: 4.4 },
      { recipeName: 'Pão de alho', difference: 3, unitCost: 2.5 },
    ]);
    expect(t.title).toBe('Contagem com diferença');
    expect(t.message).toBe('Espeto de frango: faltam 4 · Espeto de kafta: faltam 2 (R$ 18,40). A mais: Pão de alho: 3.');
    expect(t.missingValue).toBeCloseTo(18.4, 2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/daily-count-close.test.ts`
Expected: FAIL, cannot find module `app/api/daily-count/close/route`.

- [ ] **Step 3: `lib/daily-count/close.ts`**

```ts
import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { closeRows, DailyCountError, type ClosedRow } from './compute';
import { nightRows } from './service';

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

/** One portion's cost from the ingredients' reference costs (same rule as the label discard, lib/labels/settle.ts) */
async function unitCosts(restaurantId: string, recipeIds: string[]): Promise<Record<string, number>> {
  const recipes = await prisma.recipe.findMany({
    where: { restaurantId, id: { in: recipeIds } },
    select: { id: true, baseYield: true, ingredients: { select: { quantity: true, ingredient: { select: { referenceCost: true } } } } },
  });
  const out: Record<string, number> = {};
  for (const r of recipes) {
    const total = r.ingredients.reduce((s, ri) => s + ri.quantity * (ri.ingredient?.referenceCost ?? 0), 0);
    out[r.id] = r.baseYield > 0 ? total / r.baseYield : 0;
  }
  return out;
}

export function differenceAlertText(lines: { recipeName: string; difference: number; unitCost: number }[]) {
  const missing = lines.filter((l) => l.difference < 0);
  const extra = lines.filter((l) => l.difference > 0);
  if (missing.length === 0 && extra.length === 0) return null;
  const missingValue = missing.reduce((s, l) => s + -l.difference * l.unitCost, 0);
  const parts: string[] = [];
  if (missing.length) parts.push(`${missing.map((l) => `${l.recipeName}: faltam ${-l.difference}`).join(' · ')} (${brl(missingValue)}).`);
  if (extra.length) parts.push(`A mais: ${extra.map((l) => `${l.recipeName}: ${l.difference}`).join(' · ')}.`);
  return { title: 'Contagem com diferença', message: parts.join(' '), missingValue };
}

/**
 * Closes the open night (spec 2026-10-16, 4.5): lock, frozen lines, next night opened at the same
 * instant with each counted leftover as its OPENING entry. A second close at once gets 409.
 */
export async function closeNight(member: RestaurantMember, counts: { recipeId: string; counted: unknown }[], now = new Date()) {
  const { restaurantId } = member;
  if (!Array.isArray(counts)) throw new DailyCountError('Envie a contagem de cada item');
  const result = await prisma.$transaction(async (tx) => {
    const open = await tx.dailyCount.findFirst({ where: { restaurantId, status: 'OPEN' }, select: { id: true, openedAt: true } });
    if (!open) throw new DailyCountError('Não há contagem aberta', 409);
    const locked = await tx.$queryRaw<{ status: string }[]>`SELECT "status"::text AS "status" FROM "daily_counts" WHERE "id" = ${open.id} FOR UPDATE`;
    if (locked[0]?.status !== 'OPEN') throw new DailyCountError('Esta contagem acabou de ser fechada', 409);
    const closedAt = new Date(Math.max(now.getTime(), Date.now()));
    const rows = await nightRows(tx, restaurantId, open, closedAt);
    const closed: ClosedRow[] = closeRows(rows, counts);
    const costs = await unitCosts(restaurantId, closed.map((r) => r.recipeId));
    await tx.dailyCountLine.createMany({
      data: closed.map((r) => ({
        countId: open.id, recipeId: r.recipeId, recipeName: r.name, opening: r.opening, mounted: r.mounted, sold: r.sold,
        loss: r.loss, expected: r.expected, counted: r.counted, difference: r.difference, unitCost: costs[r.recipeId] ?? 0,
      })),
    });
    await tx.dailyCount.update({ where: { id: open.id }, data: { status: 'CLOSED', closedAt, closedById: member.userId } });
    const next = await tx.dailyCount.create({ data: { restaurantId, openedAt: closedAt }, select: { id: true } });
    const leftovers = closed.filter((r) => r.counted > 0);
    if (leftovers.length) {
      await tx.dailyCountEntry.createMany({
        data: leftovers.map((r) => ({ countId: next.id, restaurantId, recipeId: r.recipeId, kind: 'OPENING' as const, quantity: r.counted, userId: member.userId })),
      });
    }
    return { closedId: open.id, nextId: next.id, lines: closed, costs };
  }, { timeout: 30_000, maxWait: 10_000 });

  // Pro+: the difference rings the managers' bell (restaurant-wide alert, userId null)
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true } });
  if (isTierFeatureEnabled(restaurant?.subscriptionTier || 'starter', 'dailyCountAlert')) {
    const text = differenceAlertText(result.lines.map((l) => ({ recipeName: l.name, difference: l.difference, unitCost: result.costs[l.recipeId] ?? 0 })));
    if (text) {
      try {
        await prisma.notification.create({
          data: {
            restaurantId,
            type: 'SYSTEM_INFO',
            severity: result.lines.some((l) => l.difference < 0) ? 'HIGH' : 'MEDIUM',
            title: text.title,
            message: text.message,
            actionUrl: '/contagem-do-dia?tab=historico',
            actionLabel: 'Ver contagem',
            data: { kind: 'daily_count_difference', countId: result.closedId, missingValue: text.missingValue },
          },
        });
      } catch (error) {
        console.error('[daily-count] alert failed:', error); // the close itself already happened
      }
    }
  }
  return { closedId: result.closedId, nextId: result.nextId, lines: result.lines };
}
```

If the concurrent-close test shows a P2002 (unique "one open") instead of 409 for the loser, wrap the transaction call: catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` and throw `new DailyCountError('Esta contagem acabou de ser fechada', 409)`.

- [ ] **Step 4: `lib/daily-count/history.ts`**

```ts
import { prisma } from '@/lib/prisma';

/** Closed nights of the last N weeks, newest first, and the totals per item (spec 2026-10-16, 4.7) */
export async function loadHistory(restaurantId: string, weeks: number, now = new Date()) {
  const since = new Date(now.getTime() - Math.min(Math.max(weeks, 1), 12) * 7 * 864e5);
  const nights = await prisma.dailyCount.findMany({
    where: { restaurantId, status: 'CLOSED', closedAt: { gte: since } },
    orderBy: { closedAt: 'desc' },
    include: { lines: { orderBy: { recipeName: 'asc' } }, closedBy: { select: { name: true } } },
  });
  const byItem = new Map<string, { recipeName: string; sold: number; loss: number; difference: number }>();
  for (const n of nights) {
    for (const l of n.lines) {
      const it = byItem.get(l.recipeName) ?? { recipeName: l.recipeName, sold: 0, loss: 0, difference: 0 };
      it.sold += l.sold; it.loss += l.loss; it.difference += l.difference;
      byItem.set(l.recipeName, it);
    }
  }
  return {
    nights: nights.map((n) => ({
      id: n.id,
      openedAt: n.openedAt.toISOString(),
      closedAt: n.closedAt!.toISOString(),
      closedBy: n.closedBy?.name ?? null,
      sold: n.lines.reduce((s, l) => s + l.sold, 0),
      loss: n.lines.reduce((s, l) => s + l.loss, 0),
      difference: n.lines.reduce((s, l) => s + l.difference, 0),
      differenceValue: n.lines.reduce((s, l) => s + l.difference * l.unitCost, 0),
      lines: n.lines.map((l) => ({ recipeName: l.recipeName, opening: l.opening, mounted: l.mounted, sold: l.sold, loss: l.loss, expected: l.expected, counted: l.counted, difference: l.difference })),
    })),
    byItem: [...byItem.values()].sort((a, b) => b.sold - a.sold),
  };
}
```

- [ ] **Step 5: Routes**

`app/api/daily-count/close/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { DailyCountError } from '@/lib/daily-count/compute';
import { closeNight } from '@/lib/daily-count/close';

export const dynamic = 'force-dynamic';

/** POST /api/daily-count/close { counts: [{ recipeId, counted }] } - owner and manager */
export async function POST(request: Request) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Só o dono ou o gerente fecha a contagem');
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    return NextResponse.json(await closeNight(auth.member, body.counts));
  } catch (error) {
    if (error instanceof DailyCountError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[daily-count] close failed:', error);
    return NextResponse.json({ error: 'Não foi possível fechar a contagem' }, { status: 500 });
  }
}
```

`app/api/daily-count/history/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { loadHistory } from '@/lib/daily-count/history';
import { ENTRY_ROLES } from '@/lib/daily-count/service';

export const dynamic = 'force-dynamic';

/** GET /api/daily-count/history?weeks=4 */
export async function GET(request: NextRequest) {
  const auth = await requireRestaurantRole(ENTRY_ROLES, 'Sem acesso à contagem do dia');
  if (!auth.ok) return auth.response;
  const weeks = Number(new URL(request.url).searchParams.get('weeks') || 4) || 4;
  try {
    return NextResponse.json(await loadHistory(auth.member.restaurantId, weeks), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[daily-count] history failed:', error);
    return NextResponse.json({ error: 'Não foi possível carregar o histórico' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/daily-count-close.test.ts __tests__/integration/staff/daily-count-entries.test.ts`
Expected: PASS. Run `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/daily-count/close.ts lib/daily-count/history.ts app/api/daily-count/close app/api/daily-count/history __tests__/integration/staff/daily-count-close.test.ts
git commit -m "feat(daily-count): close with frozen lines, next night, Pro alert, history"
```

---

### Task 5: "Contar na contagem do dia" on the recipe forms

**Files:**
- Modify: `app/api/recipes/route.ts:83-90` (create), `app/api/recipes/[id]/route.ts` (PUT data)
- Create: `components/recipes/daily-count-field.tsx`
- Modify: `app/receitas/nova/page.tsx` (form state ~line 20, field before `<ShelfLifeFields` ~line 157), `app/receitas/[id]/editar/page.tsx` (state ~line 25, load ~line 56, field before `<ShelfLifeFields` ~line 211)
- Test: `__tests__/integration/staff/daily-count-recipe-flag.test.ts`

**Interfaces:**
- Consumes: `Recipe.dailyCount` (Task 1).
- Produces: `DailyCountField({ checked: boolean; onChange: (v: boolean) => void })`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/integration/staff/daily-count-recipe-flag.test.ts`:

```ts
// @ts-nocheck
/** The recipe flag "Contar na contagem do dia" (spec 2026-10-16, 4.1) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT } from '../../../app/api/recipes/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};

describe('recipe flag dailyCount', () => {
  let rid, owner, recipe;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `dcf-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Dcf ${tag}`, ownerId: o.id, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: o.id }, data: { currentRestaurantId: rid } });
    owner = { id: o.id, email: o.email, role: 'OWNER' };
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Coxinha', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: rid } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: owner.id } }); } catch {}
  });

  it('turns on and off; leaving it out keeps it', async () => {
    as(owner);
    const base = { name: 'Coxinha', baseYield: 1, yieldUnit: 'un', portionSize: 1, portionUnit: 'un', prepTimeMinutes: 0, yieldLossFactor: 0 };
    const put = (body) => PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: { id: recipe.id } });
    expect((await put({ ...base, dailyCount: true })).status).toBe(200);
    expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).dailyCount).toBe(true);
    expect((await put(base)).status).toBe(200);
    expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).dailyCount).toBe(true);
    expect((await put({ ...base, dailyCount: false })).status).toBe(200);
    expect((await prisma.recipe.findUnique({ where: { id: recipe.id } })).dailyCount).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/daily-count-recipe-flag.test.ts`
Expected: FAIL (`dailyCount` stays `false` after the first PUT).

- [ ] **Step 3: Routes accept the flag**

In `app/api/recipes/[id]/route.ts`, in `prisma.recipe.update({ data: { …shelfLife,` add right after `...shelfLife,`:

```ts
        ...(typeof body.dailyCount === 'boolean' ? { dailyCount: body.dailyCount } : {}),
```

In `app/api/recipes/route.ts`, in `prisma.recipe.create({ data: { …shelfLife,` add right after `...shelfLife,`:

```ts
      dailyCount: body.dailyCount === true,
```

- [ ] **Step 4: The checkbox**

Create `components/recipes/daily-count-field.tsx`:

```tsx
'use client';

/** "Contar na contagem do dia" (spec 2026-10-16 contagem de espetos, 4.1) */
export function DailyCountField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block font-medium">Contar na contagem do dia</span>
        <span className="block text-sm text-muted-foreground">
          Para o que é preparado antes de vender (espetos, salgados): montados, vendidos, perdas e o que sobrou em cada noite.
        </span>
      </span>
    </label>
  );
}
```

In `app/receitas/nova/page.tsx`: import `import { DailyCountField } from '@/components/recipes/daily-count-field';`, add `dailyCount: false,` to the initial `formData`, and before `<ShelfLifeFields …/>`:

```tsx
          <DailyCountField checked={!!formData.dailyCount} onChange={(v) => setFormData({ ...formData, dailyCount: v })} />
```

In `app/receitas/[id]/editar/page.tsx`: same import; add `dailyCount: false,` to the initial `formData`; in the load where `...shelfLifeToForm(recipe),` is set, add `dailyCount: !!recipe.dailyCount,`; same `<DailyCountField …/>` before `<ShelfLifeFields …/>`. Both forms already send `formData` whole (`body: JSON.stringify(formData)`).

- [ ] **Step 5: Run the test and the type check**

Run: `npx jest --config jest.integration.config.js __tests__/integration/staff/daily-count-recipe-flag.test.ts` → PASS.
Run: `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/recipes components/recipes/daily-count-field.tsx app/receitas/nova/page.tsx "app/receitas/[id]/editar/page.tsx" __tests__/integration/staff/daily-count-recipe-flag.test.ts
git commit -m "feat(daily-count): recipe flag on the forms and routes"
```

---

### Task 6: The screen `/contagem-do-dia` and the menu link

**Files:**
- Create: `app/contagem-do-dia/page.tsx`
- Modify: `lib/navigation/app-nav.ts:38-46` (group `vender`)
- Modify: `__tests__/unit/app-nav.test.ts:46` (cashier's exact list)
- Test: `__tests__/unit/app-nav.test.ts`

**Interfaces:**
- Consumes: `GET /api/daily-count` (Board, Task 3), `POST /api/daily-count/entries`, `DELETE /api/daily-count/entries/[id]`, `POST /api/daily-count/close`, `GET /api/daily-count/history` (Task 4), `LOSS_REASONS` (Task 2).

- [ ] **Step 1: Write the failing nav test**

In `__tests__/unit/app-nav.test.ts`, change the cashier expectation (line ~46) to:

```ts
    expect(hrefs(navFor('CASHIER', false))).toEqual(['/dashboard', '/vender', '/admin/integrations/orders', '/contagem-do-dia', '/caixa']);
```

and add a test inside the top `describe`:

```ts
  it('the daily count is in Vender for every role that taps it', () => {
    for (const role of ['OWNER', 'MANAGER', 'CASHIER', 'COOK']) expect(hrefs(navFor(role, false))).toContain('/contagem-do-dia');
    const link = NAV_GROUPS.find((g) => g.id === 'vender')?.links.find((l) => l.href === '/contagem-do-dia');
    expect(link?.label).toBe('Contagem do dia');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts`
Expected: FAIL (link missing; the "every link has a page" test will also fail until Step 4 creates the page).

- [ ] **Step 3: Menu link**

In `lib/navigation/app-nav.ts`, group `vender`, after `{ label: 'Pedidos de delivery', … }` and before `Cozinha (KDS)`:

```ts
      // Spec 2026-10-16 contagem de espetos: mounted, sold, loss and leftover per night (every plan)
      { label: 'Contagem do dia', href: '/contagem-do-dia', roles: [...FRONT, 'COOK'] },
```

- [ ] **Step 4: The screen**

Create `app/contagem-do-dia/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LOSS_REASONS } from '@/lib/daily-count/compute';

interface Row { recipeId: string; name: string; opening: number; mounted: number; sold: number; loss: number; expected: number }
interface Entry { id: string; recipeId: string; kind: 'OPENING' | 'MOUNTED' | 'LOSS'; quantity: number; reason: string | null; userName: string | null; createdAt: string; canDelete: boolean }
interface Board { countId: string; openedAt: string; title: string; firstUse: boolean; openTooLong: boolean; canClose: boolean; rows: Row[]; entries: Entry[] }
interface HistoryNight { id: string; openedAt: string; closedAt: string; closedBy: string | null; sold: number; loss: number; difference: number; differenceValue: number;
  lines: { recipeName: string; opening: number; mounted: number; sold: number; loss: number; expected: number; counted: number; difference: number }[] }
interface History { nights: HistoryNight[]; byItem: { recipeName: string; sold: number; loss: number; difference: number }[] }

const TZ = 'America/Sao_Paulo';
const when = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const hour = (d: string) => new Date(d).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const KIND_LABEL = { OPENING: 'Início', MOUNTED: 'Montados', LOSS: 'Perda' };
const diffClass = (d: number) => (d < 0 ? 'text-red-600 font-semibold' : d > 0 ? 'text-amber-600 font-semibold' : 'text-muted-foreground');

/** Contagem do dia / de espetos (spec 2026-10-16): taps during the night, close with the real count, history */
export default function DailyCountPage() {
  const params = useSearchParams();
  const [tab, setTab] = useState<'noite' | 'historico'>(params.get('tab') === 'historico' ? 'historico' : 'noite');
  const [board, setBoard] = useState<Board | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lossFor, setLossFor] = useState<Row | null>(null);
  const [closing, setClosing] = useState<Record<string, string> | null>(null);
  const [openingFor, setOpeningFor] = useState<Record<string, string> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/daily-count', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || 'Não foi possível carregar a contagem');
    setError(null);
    setBoard(body);
  }, []);
  const loadHistory = useCallback(async () => {
    const res = await fetch('/api/daily-count/history?weeks=4', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || 'Não foi possível carregar o histórico');
    setHistory(body);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // sold updates during the night
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (tab === 'historico') loadHistory();
  }, [tab, loadHistory]);

  const post = async (url: string, body: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) { setError(out.error || 'Não foi possível salvar'); return false; }
      setError(null);
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  };
  const tap = (row: Row, quantity: number) => post('/api/daily-count/entries', { recipeId: row.recipeId, kind: 'MOUNTED', quantity });
  const typed = (row: Row) => {
    const v = window.prompt(`Quantos ${row.name} foram montados?`);
    if (v && Number(v) > 0) tap(row, Number(v));
  };
  const undo = async (e: Entry) => {
    setBusy(true);
    const res = await fetch(`/api/daily-count/entries/${e.id}`, { method: 'DELETE' });
    const out = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(out.error || 'Não foi possível apagar');
    load();
  };

  if (error && !board) return <div className="max-w-3xl mx-auto p-4"><Card className="p-6 text-red-600">{error}</Card></div>;
  if (!board) return <div className="max-w-3xl mx-auto p-4 text-muted-foreground">Carregando…</div>;

  const totals = board.rows.reduce((t, r) => ({ sold: t.sold + r.sold, loss: t.loss + r.loss }), { sold: 0, loss: 0 });

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{board.title}</h1>
          <p className="text-sm text-muted-foreground">Noite aberta em {when(board.openedAt)} · {totals.sold} vendidos · {totals.loss} perdas</p>
        </div>
        <div className="flex gap-2">
          <Button variant={tab === 'noite' ? 'default' : 'outline'} onClick={() => setTab('noite')}>Esta noite</Button>
          <Button variant={tab === 'historico' ? 'default' : 'outline'} onClick={() => setTab('historico')}>Histórico</Button>
        </div>
      </div>

      {error && <Card className="p-3 text-red-600 text-sm">{error}</Card>}

      {tab === 'noite' && (
        <>
          {board.openTooLong && (
            <Card className="p-3 border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-sm">
              Contagem aberta desde {when(board.openedAt)}. Feche para conferir.
            </Card>
          )}
          {board.firstUse && board.rows.length > 0 && (
            <Card className="p-3 text-sm flex items-center justify-between gap-2 flex-wrap">
              <span>Primeira contagem: quantos você já tem de cada na geladeira?</span>
              <Button size="sm" variant="outline" onClick={() => setOpeningFor(Object.fromEntries(board.rows.map((r) => [r.recipeId, ''])))}>Lançar o início</Button>
            </Card>
          )}
          {board.rows.length === 0 ? (
            <Card className="p-6 text-sm">
              Nenhum item na contagem. Marque "Contar na contagem do dia" na ficha técnica dos itens (espetos, salgados) em Fichas técnicas.
            </Card>
          ) : (
            <div className="space-y-2">
              {board.rows.map((r) => (
                <Card key={r.recipeId} className="p-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold">{r.name}</div>
                    <div className="text-sm">Deveria ter <span className={`text-lg font-bold ${r.expected < 0 ? 'text-red-600' : ''}`}>{r.expected}</span></div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-center text-xs text-muted-foreground mt-1">
                    <div>Início<div className="text-base text-foreground">{r.opening}</div></div>
                    <div>Montados<div className="text-base text-foreground">{r.mounted}</div></div>
                    <div>Vendidos<div className="text-base text-foreground">{r.sold}</div></div>
                    <div>Perda<div className="text-base text-foreground">{r.loss}</div></div>
                  </div>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <Button size="sm" disabled={busy} onClick={() => tap(r, 1)}>+1</Button>
                    <Button size="sm" disabled={busy} variant="outline" onClick={() => tap(r, 10)}>+10</Button>
                    <Button size="sm" disabled={busy} variant="outline" onClick={() => tap(r, 20)}>+20</Button>
                    <Button size="sm" disabled={busy} variant="outline" onClick={() => typed(r)}>Outro valor</Button>
                    <Button size="sm" disabled={busy} variant="outline" className="text-red-600" onClick={() => setLossFor(r)}>Perda</Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground">Pedidos do iFood e do Keeta só entram na contagem se forem lançados no Gastrux (venda de balcão).</p>

          {board.canClose && board.rows.length > 0 && (
            <Button className="w-full" disabled={busy} onClick={() => setClosing(Object.fromEntries(board.rows.map((r) => [r.recipeId, ''])))}>Fechar contagem</Button>
          )}

          {board.entries.length > 0 && (
            <Card className="p-3">
              <div className="font-semibold mb-2 text-sm">Lançamentos desta noite</div>
              <ul className="space-y-1 text-sm">
                {board.entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2">
                    <span>
                      {hour(e.createdAt)} · {KIND_LABEL[e.kind]} {e.quantity} · {board.rows.find((r) => r.recipeId === e.recipeId)?.name ?? ''}
                      {e.reason ? ` (${e.reason})` : ''} · {e.userName ?? ''}
                    </span>
                    {e.canDelete && <button className="text-xs text-red-600 hover:underline" disabled={busy} onClick={() => undo(e)}>Desfazer</button>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {tab === 'historico' && (
        <div className="space-y-3">
          {!history ? <p className="text-muted-foreground">Carregando…</p> : history.nights.length === 0 ? (
            <Card className="p-6 text-sm">Nenhuma contagem fechada nas últimas 4 semanas.</Card>
          ) : (
            <>
              <Card className="p-3">
                <div className="font-semibold mb-2">Últimas 4 semanas, por item</div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th>Item</th><th className="text-right">Vendidos</th><th className="text-right">Perdas</th><th className="text-right">Diferença</th></tr></thead>
                  <tbody>{history.byItem.map((i) => (
                    <tr key={i.recipeName}><td>{i.recipeName}</td><td className="text-right">{i.sold}</td><td className="text-right">{i.loss}</td><td className={`text-right ${diffClass(i.difference)}`}>{i.difference}</td></tr>
                  ))}</tbody>
                </table>
              </Card>
              {history.nights.map((n) => (
                <Card key={n.id} className="p-3">
                  <div className="flex justify-between gap-2 flex-wrap text-sm">
                    <span className="font-semibold">{when(n.openedAt)} até {when(n.closedAt)}</span>
                    <span className={diffClass(n.difference)}>Diferença {n.difference} ({brl(n.differenceValue)})</span>
                  </div>
                  <table className="w-full text-xs mt-2">
                    <thead><tr className="text-left text-muted-foreground"><th>Item</th><th className="text-right">Início</th><th className="text-right">Mont.</th><th className="text-right">Vend.</th><th className="text-right">Perda</th><th className="text-right">Devia</th><th className="text-right">Contou</th><th className="text-right">Dif.</th></tr></thead>
                    <tbody>{n.lines.map((l) => (
                      <tr key={l.recipeName}><td>{l.recipeName}</td><td className="text-right">{l.opening}</td><td className="text-right">{l.mounted}</td><td className="text-right">{l.sold}</td><td className="text-right">{l.loss}</td><td className="text-right">{l.expected}</td><td className="text-right">{l.counted}</td><td className={`text-right ${diffClass(l.difference)}`}>{l.difference}</td></tr>
                    ))}</tbody>
                  </table>
                  {n.closedBy && <p className="text-xs text-muted-foreground mt-1">Fechada por {n.closedBy}</p>}
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {lossFor && <LossDialog row={lossFor} busy={busy} onCancel={() => setLossFor(null)}
        onSave={async (quantity, reason, note) => { if (await post('/api/daily-count/entries', { recipeId: lossFor.recipeId, kind: 'LOSS', quantity, reason, note })) setLossFor(null); }} />}

      {openingFor && (
        <CountDialog title="Início: quantos você já tem de cada?" rows={board.rows} values={openingFor} onChange={setOpeningFor} busy={busy}
          confirm="Salvar início" onCancel={() => setOpeningFor(null)}
          onConfirm={async () => {
            for (const r of board.rows) {
              const q = Number(openingFor[r.recipeId]);
              if (q > 0 && !(await post('/api/daily-count/entries', { recipeId: r.recipeId, kind: 'OPENING', quantity: q }))) return;
            }
            setOpeningFor(null);
          }} />
      )}

      {closing && (
        <CountDialog title="Fechar contagem: quantos sobraram de cada?" rows={board.rows} values={closing} onChange={setClosing} busy={busy}
          confirm="Fechar contagem" showExpected onCancel={() => setClosing(null)}
          onConfirm={async () => {
            if (await post('/api/daily-count/close', { counts: board.rows.map((r) => ({ recipeId: r.recipeId, counted: closing[r.recipeId] })) })) {
              setClosing(null);
              setTab('historico');
            }
          }} />
      )}
    </div>
  );
}

function LossDialog({ row, busy, onCancel, onSave }: { row: Row; busy: boolean; onCancel: () => void; onSave: (q: number, reason: string, note: string) => void }) {
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<string>('Queimou');
  const [note, setNote] = useState('');
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <Card className="w-full max-w-md p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Perda: {row.name}</h2>
        <input className="w-full border rounded p-2 bg-background" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Quantidade" />
        <div className="flex gap-2 flex-wrap">
          {LOSS_REASONS.map((r) => <Button key={r} size="sm" variant={reason === r ? 'default' : 'outline'} onClick={() => setReason(r)}>{r}</Button>)}
        </div>
        {reason === 'Outro' && <input className="w-full border rounded p-2 bg-background" placeholder="Qual o motivo?" value={note} onChange={(e) => setNote(e.target.value)} />}
        <div className="flex gap-2 justify-end sticky bottom-0 bg-card pt-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={busy} onClick={() => onSave(Number(quantity), reason, note)}>Lançar perda</Button>
        </div>
      </Card>
    </div>
  );
}

function CountDialog({ title, rows, values, onChange, busy, confirm, showExpected, onCancel, onConfirm }: {
  title: string; rows: Row[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; busy: boolean;
  confirm: string; showExpected?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <Card className="w-full max-w-md p-4 space-y-3 max-h-[90dvh] overflow-y-auto">
        <h2 className="text-lg font-semibold">{title}</h2>
        {rows.map((r) => {
          const v = values[r.recipeId];
          const diff = v !== '' && v !== undefined ? Number(v) - r.expected : null;
          return (
            <div key={r.recipeId} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{r.name}{showExpected && <span className="text-muted-foreground"> · deveria ter {r.expected}</span>}</span>
              <input className="w-20 border rounded p-2 bg-background text-right" inputMode="numeric" value={v ?? ''} onChange={(e) => onChange({ ...values, [r.recipeId]: e.target.value })} aria-label={r.name} />
              {showExpected && diff !== null && !Number.isNaN(diff) && (
                <span className={`w-24 text-xs ${diffClass(diff)}`}>{diff < 0 ? `faltam ${-diff}` : diff > 0 ? `${diff} a mais` : 'certo'}</span>
              )}
            </div>
          );
        })}
        <div className="flex gap-2 justify-end sticky bottom-0 bg-card pt-2">
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button disabled={busy} onClick={onConfirm}>{confirm}</Button>
        </div>
      </Card>
    </div>
  );
}
```

Check that `Button` accepts `size="sm"` and `variant="outline"`: `grep -n "size\|variant" components/ui/button.tsx | head`. If `crypto.randomUUID` is unavailable on an old tablet browser, the offline queue already has a helper: `git grep -n "Idempotency-Key" -- lib components | head -3`, and use the same key generator.

`useSearchParams` in a client page needs a Suspense boundary in Next 14 builds. If `npm run build` warns "useSearchParams() should be wrapped in a suspense boundary", rename the component to `DailyCountScreen` and export:

```tsx
import { Suspense } from 'react';
export default function DailyCountPage() {
  return <Suspense fallback={null}><DailyCountScreen /></Suspense>;
}
```

- [ ] **Step 5: Run the tests and the build**

Run: `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts` → PASS.
Run: `npx tsc --noEmit -p .` → no errors.
Run: `npm run build` → completes (catches the Suspense rule and client/server import mistakes: `lib/daily-count/compute.ts` has no server imports, so the page may import `LOSS_REASONS` from it).

- [ ] **Step 6: Commit**

```bash
git add app/contagem-do-dia lib/navigation/app-nav.ts __tests__/unit/app-nav.test.ts
git commit -m "feat(daily-count): screen with taps, loss, opening, close and history; menu link"
```

---

### Task 7: Full verification, publish, deploy and browser check

**Files:** none new (manual updates: the Claude Doc manual, memory).

- [ ] **Step 1: All suites**

Run each group separately (groups together interfere, known pre-existing):
- `npx jest --config jest.unit.config.js` → all pass
- `npx jest --config jest.integration.config.js __tests__/integration/staff` → all pass
- `npx jest --config jest.integration.config.js __tests__/integration/api` → all pass
- `npx jest --config jest.integration.config.js __tests__/integration/vender` → all pass
- `npx jest --config jest.integration.config.js __tests__/integration/caixa` → all pass
- `npx jest --config jest.integration.config.js __tests__/integration/bad-day` → all pass
- `npx tsc --noEmit -p .` → 0 errors

- [ ] **Step 2: Final review**

Whole-branch review by a fresh reviewer against the spec; fix Important findings with a test each.

- [ ] **Step 3: Publish to main**

```bash
export GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"
git fetch origin && git rebase origin/main && git push origin HEAD:main
```

- [ ] **Step 4: Owner deploy runbook (send to the owner)**

For each service, homolog first, then app: (a) Deploy; (b) in the service console `npx prisma migrate deploy` (applies `20261016120000_daily_count`). Remind: without (b) the screen errors with "relation daily_counts does not exist".

- [ ] **Step 5: Homolog browser check (Playwright, phone size 390x844 and tablet 1280x660)**

On the homolog test restaurant: mark two recipes "Contar na contagem do dia"; open `/contagem-do-dia`; first use → Lançar o início; +10 on one; send a comanda with 2 of it to the kitchen → Vendidos 2 after refresh; Perda "Queimou" 1; Desfazer within 2 min; Fechar contagem with one item short → red "faltam"; Histórico shows the night; next night starts with the counted leftover; as a COOK user, no "Fechar contagem" button.

- [ ] **Step 6: Docs and memory**

Update the Claude Doc manual (business rules + deploy note) and the backlog memory with the commit range and what was verified.
