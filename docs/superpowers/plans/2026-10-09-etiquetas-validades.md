# Etiquetas de manipulação e controle de validades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A cozinha imprime etiquetas de manipulação (preparos e insumos abertos) em impressora térmica pelo navegador, com validade calculada por item e conservação; cada etiqueta fica registrada, com tela de validades, aviso da manhã e descarte no Desperdício (controle do Pro para cima).

**Architecture:** Regras puras em `lib/labels/rules.ts` (validade, conservações), serviço com banco em `lib/labels/service.ts` (criar, listar) e `lib/labels/settle.ts` (usado/descartado → `WasteLog`), aviso diário em `lib/labels/morning-alert.ts`; rotas finas em `app/api/labels/**`; página de impressão `app/imprimir/etiquetas/page.tsx` (mesmo modelo do cupom, `printInHiddenFrame`); telas em `app/etiquetas/**`. Um registro `FoodLabel` por etiqueta física.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, Tailwind, shadcn/ui, sonner, `qrcode` (já instalado), Jest.

**Spec:** `docs/superpowers/specs/2026-10-09-etiquetas-validades-design.md`

## Global Constraints

- Repositório `C:\Users\andre\gastrux-fix-delivery`, branch `fix/delivery-public`; publicar com `git fetch -q https://github.com/andreyluis2003/Gastrux.git main && git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Interface em português do Brasil; código e comentários em inglês, comentário explica o porquê.
- **Tem migração** (`20261009150000_food_labels`): o dono roda `npx prisma migrate deploy` **depois** do deploy (homolog primeiro).
- Quem pode: `OWNER`, `MANAGER`, `ADMIN`, `COOK` (o `CASHIER` recebe 403 e não vê o menu). Papel **no restaurante** (`requireRestaurantRole`), nunca o papel global.
- Planos: imprimir, reimprimir, histórico e dias de validade em **todos**; Validades, baixa (Usado/Descartado), descarte no Desperdício e aviso da manhã exigem o recurso `labelExpiry` (`pro`, `business`, `enterprise`).
- Validade: **0 dias = 23:59 do dia do preparo em Brasília**; N ≥ 1 dias = preparo + N × 24 h; validade no passado é recusada; quantidade sem conversão de unidade (unidade do item: `Recipe.yieldUnit`, `Ingredient.standardUnit`).
- Padrões: preparo ambiente 0, refrigerado 3, congelado 30; insumo refrigerado 3 (ambiente e congelado vazios).
- Etiquetas iguais: 1 a 20 por impressão, um registro (e um QR) cada.
- Tamanhos: `60x40` (padrão) e `40x25`.
- Testes: unitários `npx jest --config jest.unit.config.js <arquivo>`; integração uma suíte por vez `npx jest --config jest.integration.config.js --testPathPatterns <padrão>` (pouca memória; banco de teste em 127.0.0.1:55432, `npm run test:db:start` se estiver desligado).

## Review Focus

1. **Etiqueta impressa às 23:30 de um preparo "consumir no dia"** → validade 23:59 do mesmo dia em Brasília, nunca do dia seguinte em UTC. Teste na Task 1.
2. **Cozinheiro de outro restaurante abrindo o QR de uma etiqueta** → 404, nada vazado. Teste na Task 3.
3. **Descarte de preparo com quantidade em ficha de rendimento 0 ou sem insumos** → etiqueta descartada, nenhum `WasteLog` com custo infinito ou NaN. Teste na Task 3.
4. **Duplo toque em Imprimir** → um conjunto de etiquetas (chave de repetição). Teste na Task 2.
5. **Restaurante Starter tentando dar baixa pela rota** → 403 com o nome do recurso, e a etiqueta continua ativa. Teste na Task 3.

---

### Task 1: Dados, regras de validade e plano

**Files:**
- Create: `prisma/migrations/20261009150000_food_labels/migration.sql`
- Modify: `prisma/schema.prisma` (models `Recipe`, `Ingredient`, `Restaurant`, `IngredientBatch`, `User`, new `FoodLabel` + enums)
- Create: `lib/labels/rules.ts`
- Modify: `lib/tier-guard.ts`, `lib/api/tier-middleware.ts`, `app/api/tier/check/route.ts`
- Test: `__tests__/unit/label-rules.test.ts`, `__tests__/unit/plan-matrix.test.ts`

**Interfaces:**
- Produces: enums `LabelItemType` (`RECIPE`, `INGREDIENT`), `LabelStorage` (`AMBIENT`, `CHILLED`, `FROZEN`), `LabelStatus` (`ACTIVE`, `USED`, `DISCARDED`); model `FoodLabel`; columns `shelfLifeAmbientDays`, `shelfLifeChilledDays`, `shelfLifeFrozenDays` (Int?) on `Recipe` and `Ingredient`; `Restaurant.labelSize` (String, default `'60x40'`).
- Produces (`lib/labels/rules.ts`): `type Storage = 'AMBIENT' | 'CHILLED' | 'FROZEN'`; `interface ShelfLife { shelfLifeAmbientDays: number | null; shelfLifeChilledDays: number | null; shelfLifeFrozenDays: number | null }`; `computeExpiry(preparedAt: Date, days: number): Date`; `daysFor(item: ShelfLife, storage: Storage): number | null`; `storagesOf(item: ShelfLife): Storage[]`; `parseShelfLifeDays(value: unknown): number | null` (throws `Error('Validade em dias: número inteiro de 0 a 365')`); `STORAGE_LABEL: Record<Storage, string>` (`Ambiente`, `Refrigerado`, `Congelado`); `LABEL_SIZES = ['60x40', '40x25'] as const`.
- Produces: tier feature `labelExpiry`.

- [ ] **Step 1: Write the failing unit tests**

`__tests__/unit/label-rules.test.ts`:
```ts
import { computeExpiry, daysFor, storagesOf, parseShelfLifeDays } from '../../lib/labels/rules';

const item = (a: number | null, c: number | null, f: number | null) => ({ shelfLifeAmbientDays: a, shelfLifeChilledDays: c, shelfLifeFrozenDays: f });

describe('label rules (lib/labels/rules.ts)', () => {
  it('0 days = 23:59 of the same Brasília day, even late at night', () => {
    // 23:30 BRT on 2026-10-12 = 02:30 UTC on 2026-10-13
    const prepared = new Date('2026-10-13T02:30:00.000Z');
    expect(computeExpiry(prepared, 0).toISOString()).toBe('2026-10-13T02:59:00.000Z');
  });

  it('0 days early in the morning is still that day', () => {
    const prepared = new Date('2026-10-12T09:00:00.000Z'); // 06:00 BRT
    expect(computeExpiry(prepared, 0).toISOString()).toBe('2026-10-13T02:59:00.000Z');
  });

  it('N days = N x 24 h after the preparation, across months', () => {
    expect(computeExpiry(new Date('2026-10-30T17:30:00.000Z'), 3).toISOString()).toBe('2026-11-02T17:30:00.000Z');
  });

  it('only the storages with days are offered', () => {
    expect(storagesOf(item(null, 3, null))).toEqual(['CHILLED']);
    expect(storagesOf(item(0, 3, 30))).toEqual(['AMBIENT', 'CHILLED', 'FROZEN']);
    expect(storagesOf(item(null, null, null))).toEqual([]);
    expect(daysFor(item(0, 3, 30), 'FROZEN')).toBe(30);
    expect(daysFor(item(null, 3, null), 'AMBIENT')).toBeNull();
  });

  it('shelf life input: empty = not applicable, integers 0 to 365', () => {
    expect(parseShelfLifeDays('')).toBeNull();
    expect(parseShelfLifeDays(null)).toBeNull();
    expect(parseShelfLifeDays('3')).toBe(3);
    expect(parseShelfLifeDays(0)).toBe(0);
    expect(() => parseShelfLifeDays(-1)).toThrow('Validade em dias');
    expect(() => parseShelfLifeDays(2.5)).toThrow('Validade em dias');
    expect(() => parseShelfLifeDays(400)).toThrow('Validade em dias');
  });
});
```

Add to `__tests__/unit/plan-matrix.test.ts`, inside the `describe`:
```ts
  it('label printing on every plan; the expiry control (labelExpiry) from Pro', () => {
    expect(['starter', 'pro', 'business', 'enterprise'].map((t) => on(t, 'labelExpiry'))).toEqual([false, true, true, true]);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest --config jest.unit.config.js __tests__/unit/label-rules.test.ts __tests__/unit/plan-matrix.test.ts`
Expected: FAIL (`Cannot find module '../../lib/labels/rules'`; `labelExpiry` false on pro).

- [ ] **Step 3: Schema and migration**

In `prisma/schema.prisma`, add to `model Recipe` (after `active`):
```prisma
  /// Days a label of this preparation is valid per storage (spec 2026-10-09 etiquetas); null = not applicable
  shelfLifeAmbientDays Int?      @default(0)
  shelfLifeChilledDays Int?      @default(3)
  shelfLifeFrozenDays  Int?      @default(30)
  foodLabels           FoodLabel[]
```
to `model Ingredient`:
```prisma
  /// Days an opened ingredient is valid per storage (spec 2026-10-09 etiquetas); null = not applicable
  shelfLifeAmbientDays Int?
  shelfLifeChilledDays Int?      @default(3)
  shelfLifeFrozenDays  Int?
  foodLabels           FoodLabel[]
```
to `model Restaurant`:
```prisma
  /// Thermal label size printed by the browser: '60x40' or '40x25'
  labelSize            String    @default("60x40")
  foodLabels           FoodLabel[]
```
to `model IngredientBatch`: `  foodLabels        FoodLabel[]`; to `model User`: `  printedFoodLabels FoodLabel[] @relation("FoodLabelPrintedBy")` and `  settledFoodLabels FoodLabel[] @relation("FoodLabelSettledBy")`.

New model and enums (end of file):
```prisma
enum LabelItemType {
  RECIPE
  INGREDIENT
}

enum LabelStorage {
  AMBIENT
  CHILLED
  FROZEN
}

enum LabelStatus {
  ACTIVE
  USED
  DISCARDED
}

/// One physical food label (RDC 216): what, prepared/opened when, valid until, who (spec 2026-10-09)
model FoodLabel {
  id            String          @id @default(cuid())
  restaurantId  String
  itemType      LabelItemType
  recipeId      String?
  ingredientId  String?
  /// The item's name when printed: stays right if the item is renamed or deleted
  itemName      String
  storage       LabelStorage
  preparedAt    DateTime
  expiresAt     DateTime
  quantity      Float?
  unit          Unit?
  batchId       String?
  printedById   String
  status        LabelStatus     @default(ACTIVE)
  settledAt     DateTime?
  settledById   String?
  createdAt     DateTime        @default(now())
  restaurant    Restaurant      @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  recipe        Recipe?         @relation(fields: [recipeId], references: [id], onDelete: SetNull)
  ingredient    Ingredient?     @relation(fields: [ingredientId], references: [id], onDelete: SetNull)
  batch         IngredientBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)
  printedBy     User            @relation("FoodLabelPrintedBy", fields: [printedById], references: [id])
  settledBy     User?           @relation("FoodLabelSettledBy", fields: [settledById], references: [id])

  @@index([restaurantId, status, expiresAt])
  @@index([restaurantId, createdAt])
  @@map("food_labels")
}
```

`prisma/migrations/20261009150000_food_labels/migration.sql`:
```sql
-- Etiquetas de manipulação e controle de validades (spec 2026-10-09)
CREATE TYPE "LabelItemType" AS ENUM ('RECIPE', 'INGREDIENT');
CREATE TYPE "LabelStorage" AS ENUM ('AMBIENT', 'CHILLED', 'FROZEN');
CREATE TYPE "LabelStatus" AS ENUM ('ACTIVE', 'USED', 'DISCARDED');

-- Shelf life per storage; the defaults also fill the existing rows (preparation 0/3/30, opened ingredient -/3/-)
ALTER TABLE "recipes" ADD COLUMN "shelfLifeAmbientDays" INTEGER DEFAULT 0;
ALTER TABLE "recipes" ADD COLUMN "shelfLifeChilledDays" INTEGER DEFAULT 3;
ALTER TABLE "recipes" ADD COLUMN "shelfLifeFrozenDays" INTEGER DEFAULT 30;
ALTER TABLE "ingredients" ADD COLUMN "shelfLifeAmbientDays" INTEGER;
ALTER TABLE "ingredients" ADD COLUMN "shelfLifeChilledDays" INTEGER DEFAULT 3;
ALTER TABLE "ingredients" ADD COLUMN "shelfLifeFrozenDays" INTEGER;
ALTER TABLE "restaurants" ADD COLUMN "labelSize" TEXT NOT NULL DEFAULT '60x40';

CREATE TABLE "food_labels" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "itemType" "LabelItemType" NOT NULL,
    "recipeId" TEXT,
    "ingredientId" TEXT,
    "itemName" TEXT NOT NULL,
    "storage" "LabelStorage" NOT NULL,
    "preparedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION,
    "unit" "Unit",
    "batchId" TEXT,
    "printedById" TEXT NOT NULL,
    "status" "LabelStatus" NOT NULL DEFAULT 'ACTIVE',
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "food_labels_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "food_labels_restaurantId_status_expiresAt_idx" ON "food_labels"("restaurantId", "status", "expiresAt");
CREATE INDEX "food_labels_restaurantId_createdAt_idx" ON "food_labels"("restaurantId", "createdAt");
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ingredient_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_labels" ADD CONSTRAINT "food_labels_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```
Check the real table names first (`grep -n '@@map("users")\|@@map("recipes")\|@@map("ingredients")\|@@map("restaurants")' prisma/schema.prisma`) and adjust the SQL if any differs. Then run `npx prisma generate` and apply to the test database: `npx prisma migrate deploy` with `.env.test` loaded (`npm run test:db:migrate`).

- [ ] **Step 4: Write `lib/labels/rules.ts`**

```ts
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';

/**
 * Food label rules (spec 2026-10-09 etiquetas, RDC 216). Pure: no I/O, unit-tested in
 * __tests__/unit/label-rules.test.ts.
 */

export type Storage = 'AMBIENT' | 'CHILLED' | 'FROZEN';
export const STORAGES: Storage[] = ['AMBIENT', 'CHILLED', 'FROZEN'];
export const STORAGE_LABEL: Record<Storage, string> = { AMBIENT: 'Ambiente', CHILLED: 'Refrigerado', FROZEN: 'Congelado' };
export const LABEL_SIZES = ['60x40', '40x25'] as const;
export type LabelSize = (typeof LABEL_SIZES)[number];

export interface ShelfLife {
  shelfLifeAmbientDays: number | null;
  shelfLifeChilledDays: number | null;
  shelfLifeFrozenDays: number | null;
}

const FIELD: Record<Storage, keyof ShelfLife> = {
  AMBIENT: 'shelfLifeAmbientDays',
  CHILLED: 'shelfLifeChilledDays',
  FROZEN: 'shelfLifeFrozenDays',
};

export function daysFor(item: ShelfLife, storage: Storage): number | null {
  const v = item[FIELD[storage]];
  return v === null || v === undefined ? null : v;
}

export function storagesOf(item: ShelfLife): Storage[] {
  return STORAGES.filter((s) => daysFor(item, s) !== null);
}

export const shelfLifeField = (storage: Storage) => FIELD[storage];

/**
 * 0 days = "consumir no dia": valid until 23:59 of the preparation day in Brasília (a label printed
 * at 23:30 must not get the next day, as a UTC day would). N days = N x 24 h after the preparation.
 */
export function computeExpiry(preparedAt: Date, days: number): Date {
  if (days === 0) {
    const day = brtDay(preparedAt);
    const next = new Date(Date.parse(`${day}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);
    return new Date(brtDayStart(next).getTime() - 60_000);
  }
  return new Date(preparedAt.getTime() + days * 864e5);
}

/** Shelf life typed on a recipe or ingredient: empty = not applicable; integer 0 to 365 */
export function parseShelfLifeDays(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n) || n < 0 || n > 365) throw new Error('Validade em dias: número inteiro de 0 a 365');
  return n;
}
```

- [ ] **Step 5: The plan feature**

In `lib/tier-guard.ts`, add `'labelExpiry'` to the feature union and to the map:
```ts
    // Owner decision 2026-10-09: label printing on every plan; the expiry control from Pro
    labelExpiry: ['pro', 'business', 'enterprise'],
```
In `lib/api/tier-middleware.ts`, add `'labelExpiry'` to `FeatureType` and `labelExpiry: 'Controle de validades',` to `featureNames`. In `app/api/tier/check/route.ts`, add `labelExpiry: isTierFeatureEnabled(tier, 'labelExpiry'),` to `features`.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx jest --config jest.unit.config.js __tests__/unit/label-rules.test.ts __tests__/unit/plan-matrix.test.ts` → PASS.
Run: `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261009150000_food_labels lib/labels/rules.ts lib/tier-guard.ts lib/api/tier-middleware.ts app/api/tier/check/route.ts __tests__/unit/label-rules.test.ts __tests__/unit/plan-matrix.test.ts
git commit -m "Etiquetas: data, shelf life rules and the labelExpiry plan feature"
```

---

### Task 2: Imprimir — itens, criar etiquetas, histórico

**Files:**
- Create: `lib/labels/access.ts`, `lib/labels/service.ts`
- Create: `app/api/labels/route.ts` (GET histórico, POST criar), `app/api/labels/items/route.ts` (GET itens para etiquetar)
- Test: `__tests__/integration/staff/labels-print.test.ts`

**Interfaces:**
- Consumes: `computeExpiry`, `daysFor`, `storagesOf`, `Storage` (Task 1).
- Produces (`lib/labels/access.ts`): `LABEL_ROLES: RestaurantRole[]` = `['OWNER','MANAGER','ADMIN','COOK']`; `requireLabelAccess()` → result of `requireRestaurantRole(LABEL_ROLES, 'Etiquetas: só dono, gerente ou cozinheiro')`.
- Produces (`lib/labels/service.ts`): `class LabelError extends Error { status: number }`; `listLabelItems(restaurantId: string): Promise<LabelItem[]>` where `LabelItem = { type: 'RECIPE'|'INGREDIENT'; id: string; name: string; unit: string; storages: Storage[]; shelfLife: ShelfLife; uses30d: number; batches: Array<{ id: string; batchNumber: string; expirationDate: Date }> }` (batches: the ingredient's active purchase lots, earliest expiry first, 10 max; always [] for a recipe) sorted by `uses30d` desc then name; `createLabels(member: RestaurantMember, input: CreateLabelsInput, now?: Date): Promise<{ ids: string[] }>` where `CreateLabelsInput = { itemType: 'RECIPE'|'INGREDIENT'; itemId: string; storage: Storage; expiresAt?: string | null; quantity?: number | null; batchId?: string | null; copies?: number; saveAsDefaultDays?: number | null }`; `listRecentLabels(restaurantId: string, now?: Date)` (last 30 days, newest first, 200 max).

- [ ] **Step 1: Write the failing integration test**

`__tests__/integration/staff/labels-print.test.ts`:
```ts
// @ts-nocheck
/** Printing food labels (spec 2026-10-09 etiquetas, 4.1, 4.2, 5.1) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as CREATE, GET as RECENT } from '../../../app/api/labels/route';
import { GET as ITEMS } from '../../../app/api/labels/items/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const post = (body: any, key?: string) => new NextRequest('http://x/api/labels', {
  method: 'POST', body: JSON.stringify(body), headers: key ? { 'Idempotency-Key': key } : {},
});

describe('printing food labels', () => {
  let rid: string, otherRid: string, recipeId: string, ingredientId: string, otherBatchId: string;
  const users: Record<string, any> = {};
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `lp-o-${tag}@gastrux.test`, name: 'Ana Souza', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Lp ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    for (const role of ['OWNER', 'COOK', 'CASHIER']) {
      const u = role === 'OWNER' ? owner : await prisma.user.create({ data: { email: `lp-${role.toLowerCase()}-${tag}@gastrux.test`, name: role, password: 'x', role } });
      await prisma.user.update({ where: { id: u.id }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: u.id, role, permissions: [], acceptedAt: new Date() } });
      users[role] = { id: u.id, email: u.email, role };
    }
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `LP${tag}`, name: 'Molho de tomate', baseYield: 2, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0 } })).id;
    const cat = await prisma.ingredientCategory.findFirst();
    ingredientId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `LI${tag}`, name: 'Leite integral', standardUnit: 'l', purchaseUnit: 'l', referenceCost: 5, ...(cat ? { categoryId: cat.id } : {}) } })).id;
    const otherOwner = await prisma.user.create({ data: { email: `lp-x-${tag}@gastrux.test`, name: 'X', password: 'x', role: 'OWNER' } });
    otherRid = (await prisma.restaurant.create({ data: { name: `Lp2 ${tag}`, ownerId: otherOwner.id, status: 'ACTIVE' } })).id;
    users.OTHER = { id: otherOwner.id };
    const cat2 = cat;
    const otherIng = await prisma.ingredient.create({ data: { restaurantId: otherRid, code: `LX${tag}`, name: 'Outro', standardUnit: 'l', purchaseUnit: 'l', referenceCost: 1, ...(cat2 ? { categoryId: cat2.id } : {}) } });
    otherBatchId = (await prisma.ingredientBatch.create({ data: { ingredientId: otherIng.id, batchNumber: 'B1', expirationDate: new Date('2027-01-01'), initialQuantity: 1, currentQuantity: 1, unit: 'l' } })).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.foodLabel.deleteMany({ where: { restaurantId: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [rid, otherRid] } } }); } catch {}
    try { await prisma.user.deleteMany({ where: { id: { in: Object.values(users).map((u: any) => u.id) } } }); } catch {}
  });

  it('lists recipes and ingredients with their storages (defaults: preparation 0/3/30, ingredient -/3/-)', async () => {
    as(users.COOK);
    const items = await (await ITEMS(new NextRequest('http://x'))).json();
    const recipe = items.find((i) => i.id === recipeId);
    const ing = items.find((i) => i.id === ingredientId);
    expect(recipe).toMatchObject({ type: 'RECIPE', name: 'Molho de tomate', unit: 'kg', storages: ['AMBIENT', 'CHILLED', 'FROZEN'] });
    expect(ing).toMatchObject({ type: 'INGREDIENT', unit: 'l', storages: ['CHILLED'] });
  });

  it('a cook prints 3 equal labels: 3 records, expiry from the item, the name kept', async () => {
    as(users.COOK);
    const res = await CREATE(post({ itemType: 'RECIPE', itemId: recipeId, storage: 'CHILLED', quantity: 1.5, copies: 3 }));
    expect(res.status).toBe(201);
    const { ids } = await res.json();
    expect(ids).toHaveLength(3);
    const labels = await prisma.foodLabel.findMany({ where: { id: { in: ids } } });
    for (const l of labels) {
      expect(l).toMatchObject({ restaurantId: rid, itemName: 'Molho de tomate', storage: 'CHILLED', quantity: 1.5, unit: 'kg', status: 'ACTIVE', printedById: users.COOK.id });
      expect(l.expiresAt.getTime() - l.preparedAt.getTime()).toBe(3 * 864e5);
    }
  });

  it('a double tap prints once (same Idempotency-Key)', async () => {
    as(users.COOK);
    const key = crypto.randomUUID();
    const a = await (await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED' }, key))).json();
    const b = await (await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED' }, key))).json();
    expect(b.ids).toEqual(a.ids);
    expect(await prisma.foodLabel.count({ where: { id: { in: a.ids } } })).toBe(1);
  });

  it('refuses: storage without days and no date, a date in the past, copies out of 1-20, a batch of another restaurant', async () => {
    as(users.COOK);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'FROZEN' }))).status).toBe(400);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED', expiresAt: '2020-01-01T10:00:00.000Z' }))).status).toBe(400);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED', copies: 21 }))).status).toBe(400);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'CHILLED', batchId: otherBatchId }))).status).toBe(404);
  });

  it('a manual date for a storage without days, saved as default only by a manager', async () => {
    as(users.COOK);
    const when = new Date(Date.now() + 5 * 864e5).toISOString();
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'FROZEN', expiresAt: when, saveAsDefaultDays: 30 }))).status).toBe(201);
    expect((await prisma.ingredient.findUnique({ where: { id: ingredientId } })).shelfLifeFrozenDays).toBeNull();
    as(users.OWNER);
    expect((await CREATE(post({ itemType: 'INGREDIENT', itemId: ingredientId, storage: 'FROZEN', expiresAt: when, saveAsDefaultDays: 30 }))).status).toBe(201);
    expect((await prisma.ingredient.findUnique({ where: { id: ingredientId } })).shelfLifeFrozenDays).toBe(30);
  });

  it('the cashier gets 403; the recent list has the newest first and only this restaurant', async () => {
    as(users.CASHIER);
    expect((await CREATE(post({ itemType: 'RECIPE', itemId: recipeId, storage: 'CHILLED' }))).status).toBe(403);
    expect((await RECENT(new NextRequest('http://x'))).status).toBe(403);
    as(users.COOK);
    const recent = await (await RECENT(new NextRequest('http://x'))).json();
    expect(recent.length).toBeGreaterThanOrEqual(4);
    expect(recent.every((l) => l.restaurantId === rid)).toBe(true);
    expect(new Date(recent[0].createdAt).getTime()).toBeGreaterThanOrEqual(new Date(recent[recent.length - 1].createdAt).getTime());
  });
});
```
If `ingredientCategory`/`code` are not required on `Ingredient` in this schema, drop them (check `awk '/^model Ingredient \{/,/^\}/' prisma/schema.prisma`).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-print`
Expected: FAIL (`Cannot find module '../../../app/api/labels/route'`).

- [ ] **Step 3: Write `lib/labels/access.ts`**

```ts
import { requireRestaurantRole, type RestaurantRole } from '@/lib/auth/restaurant-role';

/** Who prints and settles food labels (spec 2026-10-09): owner, manager, cook; not the cashier */
export const LABEL_ROLES: RestaurantRole[] = ['OWNER', 'MANAGER', 'ADMIN', 'COOK'];
export const requireLabelAccess = () => requireRestaurantRole(LABEL_ROLES, 'Etiquetas: só dono, gerente ou cozinheiro');
```

- [ ] **Step 4: Write `lib/labels/service.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { isManager, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { computeExpiry, daysFor, shelfLifeField, storagesOf, STORAGES, type ShelfLife, type Storage } from './rules';

/** Printing food labels (spec 2026-10-09 etiquetas, 4.1, 4.2, 5.1) */

export class LabelError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export interface LabelItem {
  type: 'RECIPE' | 'INGREDIENT';
  id: string;
  name: string;
  unit: string;
  storages: Storage[];
  shelfLife: ShelfLife;
  uses30d: number;
  batches: Array<{ id: string; batchNumber: string; expirationDate: Date }>;
}

const SHELF = { shelfLifeAmbientDays: true, shelfLifeChilledDays: true, shelfLifeFrozenDays: true } as const;

export async function listLabelItems(restaurantId: string, now = new Date()): Promise<LabelItem[]> {
  const since = new Date(now.getTime() - 30 * 864e5);
  const [recipes, ingredients, uses] = await Promise.all([
    prisma.recipe.findMany({ where: { restaurantId, active: true }, select: { id: true, name: true, yieldUnit: true, ...SHELF } }),
    prisma.ingredient.findMany({
      where: { restaurantId, active: true },
      select: { id: true, name: true, standardUnit: true, ...SHELF, batches: { where: { active: true }, orderBy: { expirationDate: 'asc' }, take: 10, select: { id: true, batchNumber: true, expirationDate: true } } },
    }),
    prisma.foodLabel.groupBy({ by: ['recipeId', 'ingredientId'], where: { restaurantId, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = new Map<string, number>();
  for (const u of uses) count.set((u.recipeId ?? u.ingredientId) as string, u._count._all);
  const shelf = (x: ShelfLife): ShelfLife => ({ shelfLifeAmbientDays: x.shelfLifeAmbientDays, shelfLifeChilledDays: x.shelfLifeChilledDays, shelfLifeFrozenDays: x.shelfLifeFrozenDays });
  const items: LabelItem[] = [
    ...recipes.map((r) => ({ type: 'RECIPE' as const, id: r.id, name: r.name, unit: r.yieldUnit, shelfLife: shelf(r), storages: storagesOf(r), uses30d: count.get(r.id) ?? 0, batches: [] })),
    ...ingredients.map((i) => ({ type: 'INGREDIENT' as const, id: i.id, name: i.name, unit: i.standardUnit, shelfLife: shelf(i), storages: storagesOf(i), uses30d: count.get(i.id) ?? 0, batches: i.batches })),
  ];
  return items.sort((a, b) => b.uses30d - a.uses30d || a.name.localeCompare(b.name, 'pt-BR'));
}

export interface CreateLabelsInput {
  itemType: 'RECIPE' | 'INGREDIENT';
  itemId: string;
  storage: Storage;
  expiresAt?: string | null;
  quantity?: number | null;
  batchId?: string | null;
  copies?: number;
  saveAsDefaultDays?: number | null;
}

export async function createLabels(member: RestaurantMember, input: CreateLabelsInput, now = new Date()) {
  if (!STORAGES.includes(input.storage)) throw new LabelError('Escolha a conservação');
  const copies = input.copies ?? 1;
  if (!Number.isInteger(copies) || copies < 1 || copies > 20) throw new LabelError('Número de etiquetas: de 1 a 20');
  const quantity = input.quantity === null || input.quantity === undefined || input.quantity === ('' as any) ? null : Number(input.quantity);
  if (quantity !== null && (!Number.isFinite(quantity) || quantity <= 0)) throw new LabelError('Quantidade inválida');

  const item = input.itemType === 'RECIPE'
    ? await prisma.recipe.findFirst({ where: { id: input.itemId, restaurantId: member.restaurantId }, select: { id: true, name: true, yieldUnit: true, ...SHELF } })
    : await prisma.ingredient.findFirst({ where: { id: input.itemId, restaurantId: member.restaurantId }, select: { id: true, name: true, standardUnit: true, ...SHELF } });
  if (!item) throw new LabelError('Item não encontrado', 404);

  let batchId: string | null = null;
  if (input.batchId) {
    if (input.itemType !== 'INGREDIENT') throw new LabelError('Lote só vale para insumo');
    const batch = await prisma.ingredientBatch.findFirst({ where: { id: input.batchId, ingredientId: item.id, ingredient: { restaurantId: member.restaurantId } }, select: { id: true } });
    if (!batch) throw new LabelError('Lote não encontrado', 404);
    batchId = batch.id;
  }

  const days = daysFor(item, input.storage);
  let expiresAt: Date;
  if (input.expiresAt) {
    expiresAt = new Date(input.expiresAt);
    if (Number.isNaN(expiresAt.getTime())) throw new LabelError('Validade inválida');
  } else if (days !== null) {
    expiresAt = computeExpiry(now, days);
  } else {
    throw new LabelError('Este item não tem validade para esta conservação: informe a data');
  }
  if (expiresAt.getTime() <= now.getTime()) throw new LabelError('A validade precisa ser depois de agora');

  // "Salvar como padrão deste item": managers only (the cook prints, the manager sets the rules)
  if (input.saveAsDefaultDays !== null && input.saveAsDefaultDays !== undefined && isManager(member)) {
    const d = input.saveAsDefaultDays;
    if (!Number.isInteger(d) || d < 0 || d > 365) throw new LabelError('Validade em dias: número inteiro de 0 a 365');
    const data = { [shelfLifeField(input.storage)]: d };
    if (input.itemType === 'RECIPE') await prisma.recipe.update({ where: { id: item.id }, data });
    else await prisma.ingredient.update({ where: { id: item.id }, data });
  }

  const unit = (input.itemType === 'RECIPE' ? (item as any).yieldUnit : (item as any).standardUnit) as any;
  const ids: string[] = [];
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < copies; i++) {
      const label = await tx.foodLabel.create({
        data: {
          restaurantId: member.restaurantId,
          itemType: input.itemType,
          recipeId: input.itemType === 'RECIPE' ? item.id : null,
          ingredientId: input.itemType === 'INGREDIENT' ? item.id : null,
          itemName: item.name,
          storage: input.storage,
          preparedAt: now,
          expiresAt,
          quantity,
          unit: quantity === null ? null : unit,
          batchId,
          printedById: member.userId,
        },
        select: { id: true },
      });
      ids.push(label.id);
    }
  });
  return { ids };
}

export async function listRecentLabels(restaurantId: string, now = new Date()) {
  return prisma.foodLabel.findMany({
    where: { restaurantId, createdAt: { gte: new Date(now.getTime() - 30 * 864e5) } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { printedBy: { select: { name: true } } },
  });
}
```

- [ ] **Step 5: Write the routes**

`app/api/labels/route.ts`:
```ts
// @ts-nocheck
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { requireLabelAccess } from '@/lib/labels/access';
import { createLabels, listRecentLabels, LabelError } from '@/lib/labels/service';

export const dynamic = 'force-dynamic';

/** GET /api/labels - labels printed in the last 30 days (reprint) */
export async function GET() {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listRecentLabels(auth.member.restaurantId));
}

/** POST /api/labels - print: { itemType, itemId, storage, expiresAt?, quantity?, batchId?, copies?, saveAsDefaultDays? } */
async function handlePOST(request: Request) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    return NextResponse.json(await createLabels(auth.member, body), { status: 201 });
  } catch (error) {
    if (error instanceof LabelError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[labels] create failed:', error);
    return NextResponse.json({ error: 'Não foi possível imprimir a etiqueta' }, { status: 500 });
  }
}

// A double tap prints once: the same Idempotency-Key gets the same answer (lib/api/idempotency.ts)
export const POST = idempotent(handlePOST);
```

`app/api/labels/items/route.ts`:
```ts
// @ts-nocheck
import { NextResponse } from 'next/server';
import { requireLabelAccess } from '@/lib/labels/access';
import { listLabelItems } from '@/lib/labels/service';

export const dynamic = 'force-dynamic';

/** GET /api/labels/items - preparations and ingredients to label, most used in 30 days first */
export async function GET() {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  return NextResponse.json(await listLabelItems(auth.member.restaurantId));
}
```

- [ ] **Step 6: Run the test**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-print`
Expected: PASS (6 tests). If the idempotency test fails, read `lib/api/idempotency.ts` for the header name it uses and the user scoping, and use the same in the test.

- [ ] **Step 7: Commit**

```bash
git add lib/labels/access.ts lib/labels/service.ts app/api/labels/route.ts app/api/labels/items/route.ts __tests__/integration/staff/labels-print.test.ts
git commit -m "Etiquetas: print labels (items, copies, expiry, manual date, recent list)"
```

---

### Task 3: Validades — consultar, usado, descartado (Pro+)

**Files:**
- Create: `lib/labels/settle.ts`
- Create: `app/api/labels/[id]/route.ts` (GET uma etiqueta), `app/api/labels/[id]/settle/route.ts` (POST baixa), `app/api/labels/expiry/route.ts` (GET painel)
- Test: `__tests__/integration/staff/labels-expiry.test.ts`

**Interfaces:**
- Consumes: `requireLabelAccess`, `LabelError` (Task 2); `enforceFeature(restaurantId, 'labelExpiry')` (`lib/api/tier-middleware.ts`, Task 1).
- Produces (`lib/labels/settle.ts`): `getLabel(restaurantId: string, id: string)` (with `printedBy.name`, `batch.batchNumber`; null when not in this restaurant); `settleLabel(member: RestaurantMember, id: string, action: 'USED' | 'DISCARDED', now?: Date): Promise<{ status: string; wasteLogs: number }>`; `expiryBoard(restaurantId: string, now?: Date): Promise<{ expired: Label[]; today: Label[]; tomorrow: Label[]; history: Label[] }>`.

- [ ] **Step 1: Write the failing integration test**

`__tests__/integration/staff/labels-expiry.test.ts`:
```ts
// @ts-nocheck
/** The expiry control (spec 2026-10-09 etiquetas, 4.3, 5.3, 5.4, 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as ONE } from '../../../app/api/labels/[id]/route';
import { POST as SETTLE } from '../../../app/api/labels/[id]/settle/route';
import { GET as BOARD } from '../../../app/api/labels/expiry/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const as = (u) => {
  const s = { user: u, expires: '2099-01-01' };
  (getServerSession as jest.Mock).mockResolvedValue(s);
  (getServerSessionNext as jest.Mock).mockResolvedValue(s);
};
const settle = (id: string, action: string) => SETTLE(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ action }) }), { params: { id } });

describe('labels: expiry control', () => {
  let rid: string, recipeId: string, emptyRecipeId: string, tomatoId: string, oilId: string, cook: any, otherCook: any;
  const label = (data: any) => prisma.foodLabel.create({ data: { restaurantId: rid, itemName: 'X', storage: 'CHILLED', preparedAt: new Date(Date.now() - 864e5), printedById: cook.id, ...data } });
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `le-o-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    rid = (await prisma.restaurant.create({ data: { name: `Le ${tag}`, ownerId: owner.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    const c = await prisma.user.create({ data: { email: `le-c-${tag}@gastrux.test`, name: 'Caio', password: 'x', role: 'COOK', currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: c.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    cook = { id: c.id, email: c.email, role: 'COOK' };
    const oo = await prisma.user.create({ data: { email: `le-x-${tag}@gastrux.test`, name: 'X', password: 'x', role: 'OWNER' } });
    const otherRid = (await prisma.restaurant.create({ data: { name: `Le2 ${tag}`, ownerId: oo.id, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    const oc = await prisma.user.create({ data: { email: `le-oc-${tag}@gastrux.test`, name: 'Y', password: 'x', role: 'COOK', currentRestaurantId: otherRid } });
    await prisma.restaurantUser.create({ data: { restaurantId: otherRid, userId: oc.id, role: 'COOK', permissions: [], acceptedAt: new Date() } });
    otherCook = { id: oc.id, email: oc.email, role: 'COOK' };
    tomatoId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `T${tag}`, name: 'Tomate', standardUnit: 'kg', purchaseUnit: 'kg', referenceCost: 8 } })).id;
    oilId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `O${tag}`, name: 'Azeite', standardUnit: 'l', purchaseUnit: 'l', referenceCost: 40 } })).id;
    // Molho: rende 2 kg com 2,5 kg de tomate e 0,1 l de azeite
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `M${tag}`, name: 'Molho', baseYield: 2, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0,
      ingredients: { create: [{ ingredientId: tomatoId, quantity: 2.5, unit: 'kg' }, { ingredientId: oilId, quantity: 0.1, unit: 'l' }] } } })).id;
    emptyRecipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Vazia', baseYield: 0, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0 } })).id;
  }, 60000);
  afterAll(async () => {
    try { await prisma.wasteLog.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.foodLabel.deleteMany({ where: { restaurantId: rid } }); } catch {}
  });

  it('discarding an expired preparation writes its ingredients to waste, proportionally, with cost', async () => {
    as(cook);
    const l = await label({ itemType: 'RECIPE', recipeId, itemName: 'Molho', expiresAt: new Date(Date.now() - 3600e3), quantity: 1, unit: 'kg' });
    const res = await settle(l.id, 'DISCARDED');
    expect(res.status).toBe(200);
    const logs = await prisma.wasteLog.findMany({ where: { restaurantId: rid }, orderBy: { estimatedCost: 'desc' } });
    // half the recipe (1 of 2 kg): 1,25 kg tomate (R$ 10,00) and 0,05 l azeite (R$ 2,00)
    expect(logs.map((w) => [w.ingredientId, w.quantity, w.estimatedCost, w.reason])).toEqual([
      [tomatoId, 1.25, 10, 'EXPIRED'],
      [oilId, 0.05, 2, 'EXPIRED'],
    ]);
    expect((await prisma.foodLabel.findUnique({ where: { id: l.id } })).status).toBe('DISCARDED');
    expect((await settle(l.id, 'USED')).status).toBe(409);
  });

  it('discarding an ingredient before it expires: OTHER; without quantity: no waste; recipe of yield 0: no NaN', async () => {
    as(cook);
    await prisma.wasteLog.deleteMany({ where: { restaurantId: rid } });
    const a = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5), quantity: 0.5, unit: 'l' });
    await settle(a.id, 'DISCARDED');
    const [w] = await prisma.wasteLog.findMany({ where: { restaurantId: rid } });
    expect([w.quantity, w.estimatedCost, w.reason]).toEqual([0.5, 20, 'OTHER']);
    const b = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5) });
    await settle(b.id, 'DISCARDED');
    const c = await label({ itemType: 'RECIPE', recipeId: emptyRecipeId, itemName: 'Vazia', expiresAt: new Date(Date.now() + 864e5), quantity: 1, unit: 'kg' });
    expect((await settle(c.id, 'DISCARDED')).status).toBe(200);
    const logs = await prisma.wasteLog.findMany({ where: { restaurantId: rid } });
    expect(logs).toHaveLength(1);
    expect(logs.every((l) => Number.isFinite(l.estimatedCost) && Number.isFinite(l.quantity))).toBe(true);
  });

  it('the board groups expired, today and tomorrow; a cook of another restaurant sees nothing', async () => {
    as(cook);
    const used = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5) });
    await settle(used.id, 'USED');
    const late = await label({ itemType: 'INGREDIENT', ingredientId: tomatoId, itemName: 'Tomate', expiresAt: new Date(Date.now() - 60e3) });
    const board = await (await BOARD(new NextRequest('http://x'))).json();
    expect(board.expired.map((l) => l.id)).toContain(late.id);
    expect(board.history.map((l) => l.id)).toContain(used.id);
    as(otherCook);
    expect((await ONE(new NextRequest('http://x'), { params: { id: late.id } })).status).toBe(404);
    expect((await settle(late.id, 'USED')).status).toBe(404);
  });

  it('Starter: reads the label but cannot settle it or open the board', async () => {
    await prisma.restaurant.update({ where: { id: rid }, data: { subscriptionTier: 'starter' } });
    try {
      as(cook);
      const l = await label({ itemType: 'INGREDIENT', ingredientId: oilId, itemName: 'Azeite', expiresAt: new Date(Date.now() + 864e5) });
      const one = await (await ONE(new NextRequest('http://x'), { params: { id: l.id } })).json();
      expect(one).toMatchObject({ id: l.id, canSettle: false });
      const res = await settle(l.id, 'USED');
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/Controle de validades/);
      expect((await prisma.foodLabel.findUnique({ where: { id: l.id } })).status).toBe('ACTIVE');
      expect((await BOARD(new NextRequest('http://x'))).status).toBe(403);
    } finally {
      await prisma.restaurant.update({ where: { id: rid }, data: { subscriptionTier: 'pro' } });
    }
  });
});
```
If `WasteLog.unit` or `RecipeIngredient` need other required fields in this schema, add them from `awk '/^model WasteLog \{/,/^\}/' prisma/schema.prisma`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-expiry`
Expected: FAIL (`Cannot find module '../../../app/api/labels/[id]/route'`).

- [ ] **Step 3: Write `lib/labels/settle.ts`**

```ts
import { prisma } from '@/lib/prisma';
import type { RestaurantMember } from '@/lib/auth/restaurant-role';
import { brtDay, brtDayStart } from '@/lib/staff/commission-rules';
import { LabelError } from './service';

/** Settling food labels and the expiry board (spec 2026-10-09 etiquetas, 4.3, 5.3) */

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function getLabel(restaurantId: string, id: string) {
  return prisma.foodLabel.findFirst({
    where: { id, restaurantId },
    include: { printedBy: { select: { name: true } }, settledBy: { select: { name: true } }, batch: { select: { batchNumber: true } } },
  });
}

/**
 * Used or discarded, once. A discard with a quantity goes to the waste log: the ingredient itself,
 * or each ingredient of the recipe in proportion to the label's quantity over the recipe's yield,
 * so the cost of what was thrown away counts in the waste report and the CMV.
 */
export async function settleLabel(member: RestaurantMember, id: string, action: 'USED' | 'DISCARDED', now = new Date()) {
  if (action !== 'USED' && action !== 'DISCARDED') throw new LabelError('Ação inválida');
  return prisma.$transaction(async (tx) => {
    const label = await tx.foodLabel.findFirst({ where: { id, restaurantId: member.restaurantId } });
    if (!label) throw new LabelError('Etiqueta não encontrada', 404);
    const guard = await tx.foodLabel.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: action, settledAt: now, settledById: member.userId },
    });
    if (guard.count === 0) throw new LabelError('Esta etiqueta já teve baixa', 409);

    let wasteLogs = 0;
    if (action === 'DISCARDED' && label.quantity && label.quantity > 0) {
      const expired = label.expiresAt.getTime() <= now.getTime();
      const reason = expired ? 'EXPIRED' : 'OTHER';
      const notes = expired ? `Etiqueta vencida: ${label.itemName}` : `Descartado antes do vencimento (etiqueta): ${label.itemName}`;
      const lines: Array<{ ingredientId: string; quantity: number; unit: any; cost: number }> = [];
      if (label.itemType === 'INGREDIENT' && label.ingredientId) {
        const ing = await tx.ingredient.findUnique({ where: { id: label.ingredientId }, select: { standardUnit: true, referenceCost: true } });
        if (ing) lines.push({ ingredientId: label.ingredientId, quantity: label.quantity, unit: ing.standardUnit, cost: label.quantity * ing.referenceCost });
      } else if (label.itemType === 'RECIPE' && label.recipeId) {
        const recipe = await tx.recipe.findUnique({
          where: { id: label.recipeId },
          select: { baseYield: true, ingredients: { select: { ingredientId: true, quantity: true, unit: true, ingredient: { select: { referenceCost: true } } } } },
        });
        // A recipe with no yield cannot be split: the label is discarded without waste lines
        if (recipe && recipe.baseYield > 0) {
          const share = label.quantity / recipe.baseYield;
          for (const ri of recipe.ingredients) {
            const q = ri.quantity * share;
            lines.push({ ingredientId: ri.ingredientId, quantity: q, unit: ri.unit, cost: q * ri.ingredient.referenceCost });
          }
        }
      }
      for (const line of lines) {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
        await tx.wasteLog.create({
          data: {
            restaurantId: member.restaurantId,
            ingredientId: line.ingredientId,
            quantity: round(line.quantity, 4),
            unit: line.unit,
            estimatedCost: Number.isFinite(line.cost) ? round(line.cost, 2) : 0,
            reason,
            notes,
            date: now,
          },
        });
        wasteLogs++;
      }
    }
    return { status: action, wasteLogs };
  });
}

/** Active labels expired / expiring today / tomorrow (Brasília days), and the last 30 days settled */
export async function expiryBoard(restaurantId: string, now = new Date()) {
  const today = brtDay(now);
  const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00.000Z`) + 864e5).toISOString().slice(0, 10);
  const endToday = brtDayStart(nextDay(today));
  const endTomorrow = brtDayStart(nextDay(nextDay(today)));
  const include = { printedBy: { select: { name: true } } };
  const [active, history] = await Promise.all([
    prisma.foodLabel.findMany({ where: { restaurantId, status: 'ACTIVE', expiresAt: { lt: endTomorrow } }, orderBy: { expiresAt: 'asc' }, include }),
    prisma.foodLabel.findMany({
      where: { restaurantId, status: { in: ['USED', 'DISCARDED'] }, settledAt: { gte: new Date(now.getTime() - 30 * 864e5) } },
      orderBy: { settledAt: 'desc' }, take: 200, include,
    }),
  ]);
  return {
    expired: active.filter((l) => l.expiresAt.getTime() <= now.getTime()),
    today: active.filter((l) => l.expiresAt.getTime() > now.getTime() && l.expiresAt < endToday),
    tomorrow: active.filter((l) => l.expiresAt >= endToday),
    history,
  };
}
```

- [ ] **Step 4: Write the routes**

`app/api/labels/[id]/route.ts`:
```ts
// @ts-nocheck
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLabelAccess } from '@/lib/labels/access';
import { getLabel } from '@/lib/labels/settle';
import { isTierFeatureEnabled } from '@/lib/tier-guard';

export const dynamic = 'force-dynamic';

/** GET /api/labels/[id] - the label opened by its QR code (only someone of the same restaurant) */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const label = await getLabel(auth.member.restaurantId, params.id);
  if (!label) return NextResponse.json({ error: 'Etiqueta não encontrada' }, { status: 404 });
  const r = await prisma.restaurant.findUnique({ where: { id: auth.member.restaurantId }, select: { subscriptionTier: true } });
  return NextResponse.json({ ...label, canSettle: isTierFeatureEnabled(r?.subscriptionTier || 'starter', 'labelExpiry') });
}
```

`app/api/labels/[id]/settle/route.ts`:
```ts
// @ts-nocheck
import { NextResponse } from 'next/server';
import { idempotent } from '@/lib/api/idempotency';
import { enforceFeature } from '@/lib/api/tier-middleware';
import { requireLabelAccess } from '@/lib/labels/access';
import { LabelError } from '@/lib/labels/service';
import { settleLabel } from '@/lib/labels/settle';

export const dynamic = 'force-dynamic';

/** POST /api/labels/[id]/settle { action: 'USED' | 'DISCARDED' } - the expiry control is from Pro */
async function handlePOST(request: Request, { params }: { params: { id: string } }) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const tierBlock = await enforceFeature(auth.member.restaurantId, 'labelExpiry');
  if (tierBlock) return tierBlock;
  try {
    const { action } = await request.json();
    return NextResponse.json(await settleLabel(auth.member, params.id, action));
  } catch (error) {
    if (error instanceof LabelError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('[labels] settle failed:', error);
    return NextResponse.json({ error: 'Não foi possível dar baixa' }, { status: 500 });
  }
}

export const POST = idempotent(handlePOST);
```

`app/api/labels/expiry/route.ts`:
```ts
// @ts-nocheck
import { NextResponse } from 'next/server';
import { enforceFeature } from '@/lib/api/tier-middleware';
import { requireLabelAccess } from '@/lib/labels/access';
import { expiryBoard } from '@/lib/labels/settle';

export const dynamic = 'force-dynamic';

/** GET /api/labels/expiry - expired, today, tomorrow and the settled history (Pro and up) */
export async function GET() {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const tierBlock = await enforceFeature(auth.member.restaurantId, 'labelExpiry');
  if (tierBlock) return tierBlock;
  return NextResponse.json(await expiryBoard(auth.member.restaurantId));
}
```

- [ ] **Step 5: Run the test**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-expiry`
Expected: PASS (4 tests). The settle call in the tests sends no Idempotency-Key: confirm `idempotent()` passes such requests through (read `lib/api/idempotency.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/labels/settle.ts app/api/labels/[id] app/api/labels/expiry __tests__/integration/staff/labels-expiry.test.ts
git commit -m "Etiquetas: expiry board, used/discarded with proportional waste (Pro+)"
```

---

### Task 4: Aviso da manhã

**Files:**
- Create: `lib/labels/morning-alert.ts`, `app/api/labels/morning-check/route.ts`
- Test: `__tests__/integration/staff/labels-morning.test.ts`

**Interfaces:**
- Consumes: `expiryBoard` (Task 3); `isTierFeatureEnabled` (`lib/tier-guard.ts`); `isCronAuthorized` (`lib/mercadopago-connect/cron-auth.ts`).
- Produces: `alertExpiringLabels(now?: Date): Promise<{ restaurants: number; alerted: number }>`; route `POST /api/labels/morning-check` (CRON_SECRET).

- [ ] **Step 1: Write the failing test**

`__tests__/integration/staff/labels-morning.test.ts`:
```ts
// @ts-nocheck
/** Morning alert of expired / expiring labels (spec 2026-10-09 etiquetas, 6) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { alertExpiringLabels } from '../../../lib/labels/morning-alert';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('labels: morning alert', () => {
  let pro: string, starter: string, userId: string;
  const alerts = (rid: string) => prisma.notification.findMany({ where: { restaurantId: rid, data: { path: ['kind'], equals: 'label_expiry' } } });
  beforeAll(async () => {
    userId = (await prisma.user.create({ data: { email: `lm-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    pro = (await prisma.restaurant.create({ data: { name: `Lm ${tag}`, ownerId: userId, status: 'ACTIVE', subscriptionTier: 'pro' } })).id;
    starter = (await prisma.restaurant.create({ data: { name: `Lm2 ${tag}`, ownerId: userId, status: 'ACTIVE', subscriptionTier: 'starter' } })).id;
    const now = Date.now();
    for (const rid of [pro, starter]) {
      await prisma.foodLabel.createMany({ data: [
        { restaurantId: rid, itemType: 'INGREDIENT', itemName: 'Leite', storage: 'CHILLED', preparedAt: new Date(now - 4 * 864e5), expiresAt: new Date(now - 3600e3), printedById: userId },
        { restaurantId: rid, itemType: 'INGREDIENT', itemName: 'Creme', storage: 'CHILLED', preparedAt: new Date(now - 864e5), expiresAt: new Date(now + 60e3), printedById: userId },
      ] });
    }
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { id: { in: [pro, starter] } } }); } catch {}
    try { await prisma.user.delete({ where: { id: userId } }); } catch {}
  });

  it('one restaurant-wide alert per day, only for Pro and up', async () => {
    await alertExpiringLabels();
    await alertExpiringLabels();
    const a = await alerts(pro);
    expect(a).toHaveLength(1);
    expect(a[0].userId).toBeNull();
    expect(a[0].title).toMatch(/1 etiqueta vencida/);
    expect(a[0].actionUrl).toBe('/etiquetas/validades');
    expect(await alerts(starter)).toHaveLength(0);
  });
});
```
The second label expires in 60 s: it counts as "vence hoje" unless the test runs within a minute of midnight in Brasília; the title assertion only checks the expired part.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-morning`
Expected: FAIL (`Cannot find module '../../../lib/labels/morning-alert'`).

- [ ] **Step 3: Write `lib/labels/morning-alert.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { isTierFeatureEnabled } from '@/lib/tier-guard';
import { brtDay } from '@/lib/staff/commission-rules';
import { expiryBoard } from './settle';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Every morning (07:00 Brasília, crontab with CRON_SECRET): one restaurant-wide alert (owner and
 * managers see it) per Pro+ restaurant with labels expired or expiring today. One per day.
 */
export async function alertExpiringLabels(now = new Date()) {
  const day = brtDay(now);
  const candidates = await prisma.foodLabel.groupBy({
    by: ['restaurantId'],
    where: { status: 'ACTIVE', expiresAt: { lt: new Date(now.getTime() + 864e5) } },
  });
  let alerted = 0;
  for (const { restaurantId } of candidates) {
    const r = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { subscriptionTier: true, status: true } });
    if (!r || !isTierFeatureEnabled(r.subscriptionTier || 'starter', 'labelExpiry')) continue;
    const board = await expiryBoard(restaurantId, now);
    if (board.expired.length === 0 && board.today.length === 0) continue;
    const dedupeKey = `label-expiry:${day}`;
    const existing = await prisma.notification.findFirst({ where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } }, select: { id: true } });
    if (existing) continue;
    const parts = [
      board.expired.length ? plural(board.expired.length, 'etiqueta vencida', 'etiquetas vencidas') : null,
      board.today.length ? `${plural(board.today.length, 'vence', 'vencem')} hoje` : null,
    ].filter(Boolean);
    await prisma.notification.create({
      data: {
        restaurantId,
        type: 'SYSTEM_INFO',
        severity: board.expired.length ? 'HIGH' : 'MEDIUM',
        title: parts.join(' e '),
        message: 'Confira as validades e dê baixa no que foi usado ou descartado.',
        actionUrl: '/etiquetas/validades',
        actionLabel: 'Ver validades',
        data: { kind: 'label_expiry', dedupeKey, expired: board.expired.length, today: board.today.length },
      },
    });
    alerted++;
  }
  return { restaurants: candidates.length, alerted };
}
```

- [ ] **Step 4: Write the cron route**

`app/api/labels/morning-check/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/mercadopago-connect/cron-auth';
import { alertExpiringLabels } from '@/lib/labels/morning-alert';
import { captureException } from '@/lib/sentry';

export const dynamic = 'force-dynamic';

/** POST /api/labels/morning-check - schedule daily at 07:00 Brasília (10:00 UTC) with CRON_SECRET */
export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json(await alertExpiringLabels());
  } catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: '/api/labels/morning-check' });
    console.error('[labels] morning check failed:', error);
    return NextResponse.json({ error: 'Morning check failed' }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run the test**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-morning` → PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/labels/morning-alert.ts app/api/labels/morning-check __tests__/integration/staff/labels-morning.test.ts
git commit -m "Etiquetas: morning alert of expired and expiring labels (Pro+, once a day)"
```

---

### Task 5: Página de impressão e tamanho da etiqueta

**Files:**
- Create: `app/api/print/labels/route.ts`, `app/imprimir/etiquetas/page.tsx`
- Modify: `app/api/admin/restaurant/settings/route.ts` (allowlist + validação + select), `app/admin/settings/page.tsx` (campo Tamanho da etiqueta)
- Test: `__tests__/integration/staff/labels-print-data.test.ts`

**Interfaces:**
- Consumes: `requireLabelAccess` (Task 2), `STORAGE_LABEL`, `LABEL_SIZES` (Task 1), `printWhenReady` (`lib/print/print-frame.ts`).
- Produces: `GET /api/print/labels?ids=a,b,c` → `{ size: '60x40'|'40x25', restaurantName: string, labels: Array<{ id, itemName, itemType, storage, storageLabel, preparedAt, expiresAt, quantity, unit, batchNumber, printedBy, qrUrl }> }` (only this restaurant's ids; 1 to 20); page `/imprimir/etiquetas?ids=...` (with `?auto=1` prints itself, opened by `printInHiddenFrame`).

- [ ] **Step 1: Write the failing test**

`__tests__/integration/staff/labels-print-data.test.ts`:
```ts
// @ts-nocheck
/** What a printed label carries, and the label size setting (spec 2026-10-09 etiquetas, 5.2, 5.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as PRINT } from '../../../app/api/print/labels/route';
import { PUT as SETTINGS } from '../../../app/api/admin/restaurant/settings/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('labels: print data and size', () => {
  let rid: string, ownerId: string, mine: string, theirs: string;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ld-${tag}@gastrux.test`, name: 'Ana Souza', password: 'x', role: 'OWNER' } });
    ownerId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Cantina ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const other = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const base = { itemType: 'RECIPE', itemName: 'Molho', storage: 'CHILLED', preparedAt: new Date(), expiresAt: new Date(Date.now() + 3 * 864e5), printedById: ownerId, quantity: 2, unit: 'kg' };
    mine = (await prisma.foodLabel.create({ data: { ...base, restaurantId: rid } })).id;
    theirs = (await prisma.foodLabel.create({ data: { ...base, restaurantId: other } })).id;
    const s = { user: { id: ownerId, email: o.email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.deleteMany({ where: { ownerId } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('returns only this restaurant labels, with storage in Portuguese, first name and the QR link', async () => {
    const body = await (await PRINT(new NextRequest(`http://x/api/print/labels?ids=${mine},${theirs}`))).json();
    expect(body.size).toBe('60x40');
    expect(body.restaurantName).toBe(`Cantina ${tag}`);
    expect(body.labels).toHaveLength(1);
    expect(body.labels[0]).toMatchObject({ id: mine, itemName: 'Molho', storageLabel: 'Refrigerado', printedBy: 'Ana', quantity: 2, unit: 'kg' });
    expect(body.labels[0].qrUrl).toMatch(new RegExp(`/etiquetas/${mine}$`));
  });

  it('the size is a restaurant setting: 60x40 or 40x25 only', async () => {
    const put = (labelSize: string) => SETTINGS(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ labelSize }) }));
    expect((await put('40x25')).status).toBe(200);
    expect((await (await PRINT(new NextRequest(`http://x/api/print/labels?ids=${mine}`))).json()).size).toBe('40x25');
    expect((await put('100x50')).status).toBe(400);
  });
});
```
Check the settings route's method name (`PUT` or `PATCH`) with `grep -n "export async function" app/api/admin/restaurant/settings/route.ts` and use it.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-print-data`
Expected: FAIL (`Cannot find module '../../../app/api/print/labels/route'`).

- [ ] **Step 3: The size setting**

In `app/api/admin/restaurant/settings/route.ts`: add `'labelSize'` to `allowedFields` (comment: `// Thermal label size (spec 2026-10-09 etiquetas, 5.5)`), add `labelSize: true` to both `select`s next to `serviceChargePercent`, and after the service charge validation:
```ts
  if (updateData.labelSize !== undefined && !['60x40', '40x25'].includes(updateData.labelSize)) {
    return NextResponse.json({ error: 'Tamanho da etiqueta: 60x40 ou 40x25' }, { status: 400 });
  }
```
In `app/admin/settings/page.tsx`: add `labelSize: '60x40'` to the form state, `labelSize: r.labelSize ?? '60x40'` when loading, send it in the save body, and next to the service charge field:
```tsx
<Label htmlFor="labelSize">Tamanho da etiqueta</Label>
<select id="labelSize" className="w-full border rounded-md px-3 py-2 text-sm" value={form.labelSize} onChange={e => updateField('labelSize', e.target.value)}>
  <option value="60x40">60 × 40 mm (padrão)</option>
  <option value="40x25">40 × 25 mm</option>
</select>
```

- [ ] **Step 4: The print data route**

`app/api/print/labels/route.ts`:
```ts
// @ts-nocheck
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLabelAccess } from '@/lib/labels/access';
import { STORAGE_LABEL } from '@/lib/labels/rules';

export const dynamic = 'force-dynamic';

/** GET /api/print/labels?ids=a,b - what the printed labels carry (spec 2026-10-09 etiquetas, 5.2) */
export async function GET(req: Request) {
  const auth = await requireLabelAccess();
  if (!auth.ok) return auth.response;
  const ids = (new URL(req.url).searchParams.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20);
  if (!ids.length) return NextResponse.json({ error: 'Nenhuma etiqueta' }, { status: 400 });
  const [restaurant, labels] = await Promise.all([
    prisma.restaurant.findUnique({ where: { id: auth.member.restaurantId }, select: { name: true, labelSize: true } }),
    prisma.foodLabel.findMany({
      where: { id: { in: ids }, restaurantId: auth.member.restaurantId },
      orderBy: { createdAt: 'asc' },
      include: { printedBy: { select: { name: true } }, batch: { select: { batchNumber: true } } },
    }),
  ]);
  const origin = process.env.NEXTAUTH_URL || new URL(req.url).origin;
  return NextResponse.json({
    size: restaurant?.labelSize || '60x40',
    restaurantName: restaurant?.name || '',
    labels: labels.map((l) => ({
      id: l.id,
      itemName: l.itemName,
      itemType: l.itemType,
      storage: l.storage,
      storageLabel: STORAGE_LABEL[l.storage],
      preparedAt: l.preparedAt,
      expiresAt: l.expiresAt,
      quantity: l.quantity,
      unit: l.unit,
      batchNumber: l.batch?.batchNumber ?? null,
      printedBy: (l.printedBy?.name || '').split(' ')[0],
      qrUrl: `${origin}/etiquetas/${l.id}`,
    })),
  });
}
```

- [ ] **Step 5: The print page**

`app/imprimir/etiquetas/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { printWhenReady } from '@/lib/print/print-frame';

interface PrintLabel {
  id: string; itemName: string; itemType: 'RECIPE' | 'INGREDIENT'; storageLabel: string;
  preparedAt: string; expiresAt: string; quantity: number | null; unit: string | null;
  batchNumber: string | null; printedBy: string; qrUrl: string;
}
interface Data { size: '60x40' | '40x25'; restaurantName: string; labels: PrintLabel[] }

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Food labels for a thermal label printer, one label per page in the restaurant's size (60x40 or
 * 40x25 mm). Opened by printInHiddenFrame with ?auto=1, prints itself when the QR codes are ready.
 */
export default function LabelsPrintPage() {
  const [data, setData] = useState<Data | null>(null);
  const [qrs, setQrs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const auto = params.get('auto') === '1';
    fetch(`/api/print/labels?ids=${encodeURIComponent(params.get('ids') || '')}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Erro ao carregar as etiquetas');
        const codes: Record<string, string> = {};
        for (const l of body.labels as PrintLabel[]) codes[l.id] = await QRCode.toDataURL(l.qrUrl, { margin: 0, width: 160 });
        setQrs(codes);
        setData(body);
        if (auto) printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!data) return <p className="p-4">Carregando...</p>;
  const small = data.size === '40x25';
  const [w, h] = small ? [40, 25] : [60, 40];

  return (
    <>
      <style>{`
        @page { size: ${w}mm ${h}mm; margin: 0; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .label { width: ${w}mm; height: ${h}mm; box-sizing: border-box; padding: 1.5mm; overflow: hidden;
          page-break-after: always; break-after: page; font-family: Arial, sans-serif; color: #000; display: flex; gap: 1.5mm; }
        .label:last-child { page-break-after: auto; break-after: auto; }
        .info { flex: 1; min-width: 0; font-size: ${small ? 6.5 : 8}pt; line-height: 1.15; }
        .name { font-weight: 700; font-size: ${small ? 8 : 10}pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .exp { font-weight: 700; font-size: ${small ? 8 : 10.5}pt; margin: 0.5mm 0; }
        .qr { width: ${small ? 13 : 17}mm; height: ${small ? 13 : 17}mm; align-self: center; }
      `}</style>
      {data.labels.map((l) => (
        <div className="label" key={l.id}>
          <div className="info">
            <div className="name">{l.itemName}</div>
            <div>{l.itemType === 'RECIPE' ? 'Preparado' : 'Aberto'} em {when(l.preparedAt)}</div>
            <div className="exp">Validade: {when(l.expiresAt)}</div>
            <div>{l.storageLabel}{!small && l.quantity ? ` · ${l.quantity.toLocaleString('pt-BR')} ${l.unit}` : ''}</div>
            {!small && <div>Resp.: {l.printedBy}{l.batchNumber ? ` · Lote ${l.batchNumber}` : ''}</div>}
            {!small && <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.restaurantName}</div>}
          </div>
          {qrs[l.id] && <img className="qr" src={qrs[l.id]} alt="" />}
        </div>
      ))}
    </>
  );
}
```
Check that `app/imprimir/layout.tsx` (if any) or the app shell does not wrap `/imprimir/*` with the menu (`shellMode` in `lib/navigation/app-nav.ts` returns `'none'` for `/imprimir`); if it does not, add `/imprimir` to the `'none'` list.

- [ ] **Step 6: Run the test and the typecheck**

Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-print-data` → PASS.
Run: `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/print/labels app/imprimir/etiquetas app/api/admin/restaurant/settings/route.ts app/admin/settings/page.tsx __tests__/integration/staff/labels-print-data.test.ts
git commit -m "Etiquetas: thermal print page (60x40 / 40x25) and the label size setting"
```

---

### Task 6: Telas — Imprimir, Validades, QR, dias na ficha e menu

**Files:**
- Create: `app/etiquetas/page.tsx` (Imprimir + histórico), `app/etiquetas/validades/page.tsx`, `app/etiquetas/[id]/page.tsx` (QR)
- Modify: `lib/navigation/app-nav.ts` (menu), `app/api/recipes/[id]/route.ts` + `app/api/recipes/route.ts` (PUT/POST aceitam os dias), `app/api/ingredients/[id]/route.ts` + `app/api/ingredients/route.ts` (idem), `app/receitas/[id]/editar/page.tsx`, `app/receitas/nova/page.tsx`, `app/insumos/[id]/editar/page.tsx`, `app/insumos/novo/page.tsx` (campos de dias)
- Test: `__tests__/unit/app-nav.test.ts`, `__tests__/integration/staff/labels-shelf-life.test.ts`

**Interfaces:**
- Consumes: `GET /api/labels/items`, `POST /api/labels`, `GET /api/labels`, `GET /api/labels/expiry`, `GET /api/labels/[id]`, `POST /api/labels/[id]/settle`, `/imprimir/etiquetas?ids=` (Tasks 2–5); `parseShelfLifeDays`, `STORAGE_LABEL`, `computeExpiry` (Task 1); `printInHiddenFrame` (`lib/print/print-frame.ts`); writes use `fetch` with an `Idempotency-Key: crypto.randomUUID()` header generated once per tap (printing needs the internet, so no offline queue).
- Produces: menu links `Etiquetas` (`/etiquetas`) and `Validades` (`/etiquetas/validades`) in the `estoque` group for `[...MANAGERS, 'COOK']`.

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/unit/app-nav.test.ts`:
```ts
  it('Etiquetas and Validades: owner, manager and cook, not the cashier (spec 2026-10-09 etiquetas)', () => {
    for (const role of ['OWNER', 'MANAGER', 'COOK']) expect(hrefs(navFor(role, false))).toEqual(expect.arrayContaining(['/etiquetas', '/etiquetas/validades']));
    expect(hrefs(navFor('CASHIER', false))).not.toContain('/etiquetas');
  });
```
`__tests__/integration/staff/labels-shelf-life.test.ts`:
```ts
// @ts-nocheck
/** Shelf life on the recipe and ingredient forms (spec 2026-10-09 etiquetas, 4.1, 5.5) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT as UPDATE_RECIPE } from '../../../app/api/recipes/[id]/route';
import { PUT as UPDATE_INGREDIENT } from '../../../app/api/ingredients/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('shelf life on recipes and ingredients', () => {
  let rid: string, ownerId: string, recipeId: string, ingredientId: string;
  beforeAll(async () => {
    const o = await prisma.user.create({ data: { email: `ls-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = o.id;
    rid = (await prisma.restaurant.create({ data: { name: `Ls ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const r = await prisma.recipe.create({ data: { restaurantId: rid, code: `LS${tag}`, name: 'Arroz', baseYield: 1, yieldUnit: 'kg', portionUnit: 'g', sellingPrice: 0 } });
    recipeId = r.id;
    ingredientId = (await prisma.ingredient.create({ data: { restaurantId: rid, code: `LSI${tag}`, name: 'Creme', standardUnit: 'l', purchaseUnit: 'l', referenceCost: 1 } })).id;
    const s = { user: { id: ownerId, email: o.email, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('new items get the defaults (preparation 0/3/30, ingredient -/3/-)', async () => {
    const r = await prisma.recipe.findUnique({ where: { id: recipeId } });
    const i = await prisma.ingredient.findUnique({ where: { id: ingredientId } });
    expect([r.shelfLifeAmbientDays, r.shelfLifeChilledDays, r.shelfLifeFrozenDays]).toEqual([0, 3, 30]);
    expect([i.shelfLifeAmbientDays, i.shelfLifeChilledDays, i.shelfLifeFrozenDays]).toEqual([null, 3, null]);
  });

  it('the forms save the days; empty clears; invalid is refused', async () => {
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    const put = (body: any) => UPDATE_RECIPE(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ name: recipe.name, baseYield: 1, yieldUnit: 'kg', portionUnit: 'g', ...body }) }), { params: { id: recipeId } });
    expect((await put({ shelfLifeAmbientDays: '', shelfLifeChilledDays: '5', shelfLifeFrozenDays: 60 })).status).toBeLessThan(300);
    const r = await prisma.recipe.findUnique({ where: { id: recipeId } });
    expect([r.shelfLifeAmbientDays, r.shelfLifeChilledDays, r.shelfLifeFrozenDays]).toEqual([null, 5, 60]);
    expect((await put({ shelfLifeChilledDays: -2 })).status).toBe(400);
    const ing = await UPDATE_INGREDIENT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ name: 'Creme', referenceCost: 1, shelfLifeChilledDays: '4' }) }), { params: { id: ingredientId } });
    expect(ing.status).toBeLessThan(300);
    expect((await prisma.ingredient.findUnique({ where: { id: ingredientId } })).shelfLifeChilledDays).toBe(4);
  });
});
```
Before writing the PUT bodies, read the two PUT handlers (`sed -n 60,130p app/api/recipes/[id]/route.ts`, same for ingredients) and include in the test body whatever fields they require.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts` → FAIL (`/etiquetas` missing).
Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-shelf-life` → FAIL on the days not saved.

- [ ] **Step 3: APIs accept the days**

In each of the four handlers (recipes POST and PUT, ingredients POST and PUT), before the Prisma write:
```ts
    // Shelf life per storage for food labels (spec 2026-10-09 etiquetas, 4.1): only what was sent
    const shelfLife: Record<string, number | null> = {};
    try {
      for (const f of ['shelfLifeAmbientDays', 'shelfLifeChilledDays', 'shelfLifeFrozenDays'] as const) {
        if (body[f] !== undefined) shelfLife[f] = parseShelfLifeDays(body[f]);
      }
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
```
and spread `...shelfLife` into the `data` of the create/update. Import `parseShelfLifeDays` from `@/lib/labels/rules`. On POST, nothing sent = the column defaults apply.

- [ ] **Step 4: Form fields**

In `app/receitas/[id]/editar/page.tsx`, `app/receitas/nova/page.tsx`, `app/insumos/[id]/editar/page.tsx`, `app/insumos/novo/page.tsx`: add `shelfLifeAmbientDays`, `shelfLifeChilledDays`, `shelfLifeFrozenDays` to the form state as strings (edit pages: loaded from the item, `null` → `''`; new recipe pages: `'0'`, `'3'`, `'30'`; new ingredient: `''`, `'3'`, `''`), send them as typed (the API parses), and add after the yield/cost fields:
```tsx
<div className="space-y-2">
  <Label>Validade da etiqueta (dias)</Label>
  <p className="text-xs text-muted-foreground">Vazio = não se aplica. 0 = consumir no dia.</p>
  <div className="grid grid-cols-3 gap-2">
    {([['shelfLifeAmbientDays', 'Ambiente'], ['shelfLifeChilledDays', 'Refrigerado'], ['shelfLifeFrozenDays', 'Congelado']] as const).map(([field, label]) => (
      <div key={field}>
        <Label htmlFor={field} className="text-xs">{label}</Label>
        <Input id={field} type="number" min={0} max={365} step={1} inputMode="numeric"
          value={formData[field] ?? ''} onChange={(e) => setFormData({ ...formData, [field]: e.target.value })} />
      </div>
    ))}
  </div>
</div>
```
(Use the state variable name each page already uses — `formData` or `form`.)

- [ ] **Step 5: Menu**

In `lib/navigation/app-nav.ts`, group `estoque`, after `Desperdício`:
```ts
      // Food labels (spec 2026-10-09 etiquetas): print on every plan, the expiry control from Pro
      { label: 'Etiquetas', href: '/etiquetas', roles: [...MANAGERS, 'COOK'] },
      { label: 'Validades', href: '/etiquetas/validades', roles: [...MANAGERS, 'COOK'] },
```

- [ ] **Step 6: Tela Imprimir — `app/etiquetas/page.tsx`**

Client component. Loads `GET /api/labels/items` and `GET /api/labels`. Layout, top to bottom (mobile first, `max-w-2xl mx-auto p-4 space-y-4`):
- title "Etiquetas" and a link "Validades" (`/etiquetas/validades`);
- search `Input` filtering items by name (normalize accents with `s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()`); list of item buttons (name + "Preparo" or "Insumo"), 12 shown before typing (the list already comes most-used first);
- when an item is chosen: its name; one large button per `item.storages` (`STORAGE_LABEL`); if `storages` is empty, a `datetime-local` input "Validade" (required) and, for `OWNER`/`MANAGER` (session role), a checkbox "Salvar como padrão deste item" with a number input of days and a storage picker;
- after choosing a storage: "Validade: dd/mm às hh:mm" computed with `computeExpiry(new Date(), days)` and a "Mudar" button that reveals a `datetime-local` prefilled with it;
- optional: "Quantidade" number + the item `unit`; "Etiquetas" number 1–20 (default 1); lote picker only for ingredients, from `item.batches` ("Lote B12 · vence 20/10"; hidden when the list is empty);
- button "Imprimir": `POST /api/labels` with `Idempotency-Key` (one key per tap, kept while the request runs), then `printInHiddenFrame('/imprimir/etiquetas?ids=' + ids.join(','))`, `toast.success('Etiqueta enviada para a impressora')`, and reset the choice; on error `toast.error(body.error)`; when `navigator.onLine` is false, disable the button and show "Sem internet: imprimir etiqueta precisa de conexão.";
- section "Impressas nos últimos 30 dias": each row item name, conservação, validade, responsável, and "Reimprimir" (`printInHiddenFrame('/imprimir/etiquetas?ids=' + id)`).

- [ ] **Step 7: Tela Validades — `app/etiquetas/validades/page.tsx`**

Client component. `GET /api/labels/expiry`; on 403 show a card "Controle de validades no plano Pro" with a link to `/pricing`. Otherwise three sections: **Vencidas** (`border-red-300 bg-red-50`), **Vencem hoje** (`border-amber-300 bg-amber-50`), **Vencem amanhã**; each row: item, conservação, validade (`toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })`), responsável, quantidade, buttons **Usado** and **Descartado** → `POST /api/labels/{id}/settle` `{ action }` (with `Idempotency-Key`), then reload; Descartado asks confirmation inline (second tap "Confirmar descarte") — no browser `confirm()`. Empty state: "Nada vencendo hoje ou amanhã." Toggle "Histórico" lists `history` (item, Usado/Descartado, quando, quem).

- [ ] **Step 8: Tela QR — `app/etiquetas/[id]/page.tsx`**

Client component. `GET /api/labels/{id}`: 404/401 → "Etiqueta não encontrada neste restaurante." Otherwise: item name, "Preparado em"/"Aberto em", validade (red "Vencida" badge when past), conservação, responsável, quantidade, lote, situação ("Ativa", "Usada", "Descartada"). If `status === 'ACTIVE' && canSettle`: buttons **Usado** / **Descartado** (same call as Validades). If `!canSettle`: the line "Controle de validades no plano Pro" with a link to `/pricing`.

- [ ] **Step 9: Run the tests and the typecheck**

Run: `npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts` → PASS.
Run: `npx jest --config jest.integration.config.js --testPathPatterns staff/labels-shelf-life` → PASS.
Run: `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 10: Commit**

```bash
git add app/etiquetas lib/navigation/app-nav.ts app/api/recipes app/api/ingredients app/receitas app/insumos __tests__/unit/app-nav.test.ts __tests__/integration/staff/labels-shelf-life.test.ts
git commit -m "Etiquetas: print, expiry and QR screens; shelf life on recipes and ingredients; menu"
```

---

### Task 7: Preços, site, verificação final e publicação

**Files:**
- Modify: `lib/billing/pricing-tiers.ts` (listas), `app/pricing/page.tsx` (linhas da tabela), `components/marketing/why-gastrux.tsx`
- Test: `__tests__/unit/plan-matrix.test.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing test**

Add to `__tests__/unit/plan-matrix.test.ts`:
```ts
  it('the plans tell about labels: printing on every plan, expiry control from Pro', () => {
    expect(BASE_PRICING_TIERS.STARTER.features).toContain('Etiquetas de manipulação');
    expect(BASE_PRICING_TIERS.PRO.features).toContain('Etiquetas com controle de validades');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/plan-matrix.test.ts` → FAIL.

- [ ] **Step 3: Texts**

`lib/billing/pricing-tiers.ts`: STARTER features, after `'Clientes: lista e histórico',` add `'Etiquetas de manipulação',`; PRO features, after `'Clientes com anotações',` add `'Etiquetas com controle de validades',`.
`app/pricing/page.tsx`: add `{ category: 'Operação', name: 'Etiquetas de manipulação' },` to the feature rows and in `featureMap`:
```ts
    // Owner decision 2026-10-09: printing on every plan, the expiry control from Pro
    'Etiquetas de manipulação': tierId === 'starter' ? 'Imprimir' : 'Imprimir + validades',
```
`components/marketing/why-gastrux.tsx`: add `{ feature: 'Etiquetas de manipulação (controle de validades no Pro)', plan: 'Todos' },`.

- [ ] **Step 4: Full verification**

Run, one at a time: `npx tsc --noEmit -p .`; `npx jest --config jest.unit.config.js`; `npx jest --config jest.integration.config.js --testPathPatterns staff`; `... --testPathPatterns vender`; `... --testPathPatterns caixa`; `... --testPathPatterns bad-day`. All green (report counts).

- [ ] **Step 5: Commit and publish**

```bash
git add lib/billing/pricing-tiers.ts app/pricing/page.tsx components/marketing/why-gastrux.tsx __tests__/unit/plan-matrix.test.ts
git commit -m "Etiquetas: plans and site tell about labels and the expiry control"
git fetch -q https://github.com/andreyluis2003/Gastrux.git main && git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main
```

- [ ] **Step 6: Hand-off to the owner**

Tell the owner: Deploy **homolog**, then `npx prisma migrate deploy` in the homolog app console (migration `20261009150000_food_labels`); after the browser check, the same on **app**. Then the crontab line for the VPS (07:00 BRT = 10:00 UTC), same style as the existing ones:
```
0 10 * * * curl -fsS -X POST -H "x-internal-trigger: $CRON_SECRET" https://gastrux.com/api/labels/morning-check >/dev/null
```
(using the CRON_SECRET value already in the other crontab lines). Browser check on homolog: print one 60×40 and one 40×25 (owner prints on the thermal printer), an expired label on Validades, open a label QR on the phone.
