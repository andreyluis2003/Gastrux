# Vender sem ficha técnica + pacote de usabilidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any menu item sells everywhere (comanda, balcão, QR, delivery site, WhatsApp) even without a ficha técnica, and a new restaurant finds its way to the first sale from the home screen.

**Architecture:** The sale lines (`OrderSessionItem`, `OrderItem`) keep requiring a recipe: about 59 readers (bill, KDS, cupom, NFC-e fiscal data, CMV, reports) read the line through its recipe. Instead, a menu item without a ficha técnica gets a **ficha simples**: a Recipe with the item's name and price and no ingredients (no stock deducted, cost 0), created by `ensureMenuItemRecipes` when the item is created, when its recipe is unlinked, at seed time, and lazily on its first sale (existing items). The owner can later add ingredients to that same ficha in Fichas técnicas. The usability pack fixes what the 2026-10-12 walkthrough found.

**Tech Stack:** Next.js 14 app router, Prisma 6.7 + PostgreSQL, Jest (unit `jest.unit.config.js`; integration `jest.integration.config.js`, run per folder with `--runInBand`).

**Spec:** No separate spec. Source: owner request 2026-10-12 ("item 1 junto com o pacote rápido") after the usability walkthrough recorded in memory `project_gastrux-backlog.md` item 6b. That walkthrough is the authority: findings 1 (sell without ficha), 2 (home leads to selling), 3 (Finalizar venda disabled without a hint), 4 (prices with a dot), 5 (Conta on the phone bar), toast lingering.

## Global Constraints

- No schema migration. `OrderSessionItem.recipeId` and `OrderItem.recipeId` stay required.
- A ficha simples: `code` = `PROD-` + 8 uppercase hex, `baseYield 1`, `yieldUnit 'un'`, `portionSize 1`, `portionUnit 'un'`, `sellingPrice` = menu item price, `description` = menu item description, no ingredients.
- Creating fichas simples for a restaurant runs under `pg_advisory_xact_lock(hashtext('menu-item-recipe:' + restaurantId))` and re-reads after the lock: two sales of the same unlinked item at the same instant create ONE ficha.
- Every user-facing text in pt-BR, no em dashes.
- Money on screen with `brl()` from `@/components/caixa/money` (takes cents) — never `toFixed(2)`.

## Review Focus

1. Two devices adding the same unlinked item at the same moment: exactly one ficha simples, both lines on it (test in Task 1).
2. A menu item of restaurant B passed with restaurant A's id: never linked, never sold (ensure filters by `restaurantId`; test in Task 1).
3. Unlinking a recipe in the Cardápio digital (PUT `recipeId: ''`): the item keeps selling (gets a new ficha simples), the old recipe is untouched (test in Task 3).
4. WhatsApp bot looked up menu items without `restaurantId` (any restaurant's item): now scoped (test in Task 2).
5. An offline comanda line of an unlinked item replays fine: the server links on the replayed add (covered by Task 2's comanda test, same route).

---

### Task 1: Ficha simples (`lib/cardapio/product-recipe.ts`)

**Files:**
- Create: `lib/cardapio/product-recipe.ts`
- Test: `__tests__/integration/vender/product-recipe.test.ts`

**Interfaces:**
- Produces:
  - `createProductRecipe(tx: Prisma.TransactionClient, restaurantId: string, item: { name: string; description: string | null; price: Prisma.Decimal | number }): Promise<{ id: string }>`
  - `ensureMenuItemRecipes(db: Prisma.TransactionClient | typeof prisma, restaurantId: string, menuItemIds?: string[]): Promise<number>` — links a ficha simples to every menu item of `restaurantId` (only those ids, or all of the restaurant when omitted) that has `recipeId: null`; returns how many were linked.

- [ ] **Step 1: Write the failing test**

```ts
// @ts-nocheck
/** Ficha simples: a menu item without a ficha técnica sells everywhere (owner, 2026-10-12) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { ensureMenuItemRecipes } from '../../../lib/cardapio/product-recipe';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('ficha simples', () => {
  let ownerId, rid, otherRid, cat, otherCat;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `pr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `PR ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `PR2 ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    otherCat = await prisma.menuCategory.create({ data: { restaurantId: otherRid, name: 'Bebidas', position: 0, active: true } });
  });
  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });
  const item = (restaurantId, categoryId, name) => prisma.menuItem.create({ data: { restaurantId, categoryId, name, description: '350 ml', price: 6, position: 0 } });

  it('links a ficha simples with the item name and price, no ingredients', async () => {
    const mi = await item(rid, cat.id, `Refri ${tag}`);
    expect(await ensureMenuItemRecipes(prisma, rid, [mi.id])).toBe(1);
    const linked = await prisma.menuItem.findUnique({ where: { id: mi.id }, include: { recipe: { include: { ingredients: true } } } });
    expect(linked.recipe).toMatchObject({ restaurantId: rid, name: `Refri ${tag}`, description: '350 ml', sellingPrice: 6, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' });
    expect(linked.recipe.code).toMatch(/^PROD-[0-9A-F]{8}$/);
    expect(linked.recipe.ingredients).toEqual([]);
    expect(await ensureMenuItemRecipes(prisma, rid, [mi.id])).toBe(0); // already linked
  });

  it('two sales of the same item at the same instant create one ficha', async () => {
    const mi = await item(rid, cat.id, `Agua ${tag}`);
    await Promise.all([ensureMenuItemRecipes(prisma, rid, [mi.id]), ensureMenuItemRecipes(prisma, rid, [mi.id])]);
    expect(await prisma.recipe.count({ where: { restaurantId: rid, name: `Agua ${tag}` } })).toBe(1);
  });

  it('never links another restaurant\'s item', async () => {
    const theirs = await item(otherRid, otherCat.id, `Suco ${tag}`);
    expect(await ensureMenuItemRecipes(prisma, rid, [theirs.id])).toBe(0);
    expect((await prisma.menuItem.findUnique({ where: { id: theirs.id } })).recipeId).toBeNull();
  });

  it('without ids, links every unlinked item of the restaurant', async () => {
    await item(rid, cat.id, `Cerveja ${tag}`);
    expect(await ensureMenuItemRecipes(prisma, rid)).toBeGreaterThanOrEqual(1);
    expect(await prisma.menuItem.count({ where: { restaurantId: rid, recipeId: null } })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/product-recipe.test.ts`
Expected: FAIL with "Cannot find module '../../../lib/cardapio/product-recipe'"

- [ ] **Step 3: Write minimal implementation**

```ts
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Ficha simples (owner, 2026-10-12): a menu item sold as bought (a soda, a water) or not yet given its
 * ficha técnica. The sale lines need a recipe (the bill, the kitchen, the cupom, the NFC-e fiscal data
 * and the reports read them through it), so the item gets one with its own name and price and no
 * ingredients: nothing leaves stock and its cost is zero until the owner adds ingredients to it in
 * Fichas técnicas. It used to be refused on every sale ("vincule uma receita primeiro"), and the sign-up
 * example menu itself created its drinks that way.
 */
export async function createProductRecipe(
  tx: Prisma.TransactionClient,
  restaurantId: string,
  item: { name: string; description: string | null; price: Prisma.Decimal | number },
) {
  return tx.recipe.create({
    data: {
      restaurantId,
      code: `PROD-${randomBytes(4).toString('hex').toUpperCase()}`,
      name: item.name,
      description: item.description,
      baseYield: 1,
      yieldUnit: 'un',
      portionSize: 1,
      portionUnit: 'un',
      sellingPrice: Number(item.price) || 0,
    },
    select: { id: true },
  });
}

/**
 * Links a ficha simples to the menu items of this restaurant that have none (only `menuItemIds`, or
 * all of them). Under a per-restaurant lock, re-read after it: two sales of the same item at the same
 * instant create one ficha. Returns how many items were linked.
 */
export async function ensureMenuItemRecipes(db: Db, restaurantId: string, menuItemIds?: string[]): Promise<number> {
  const ids = menuItemIds ? [...new Set(menuItemIds.filter(Boolean))] : undefined;
  if (ids && ids.length === 0) return 0;
  const where = { restaurantId, recipeId: null, ...(ids ? { id: { in: ids } } : {}) };
  // The usual case (every item linked) costs one read and no lock
  if ((await db.menuItem.count({ where })) === 0) return 0;

  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'menu-item-recipe:' + restaurantId}))`;
    const missing = await tx.menuItem.findMany({ where, select: { id: true, name: true, description: true, price: true } });
    for (const mi of missing) {
      const recipe = await createProductRecipe(tx, restaurantId, mi);
      await tx.menuItem.update({ where: { id: mi.id }, data: { recipeId: recipe.id } });
    }
    return missing.length;
  };
  return '$transaction' in db ? (db as typeof prisma).$transaction(run) : run(db as Prisma.TransactionClient);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/product-recipe.test.ts`
Expected: PASS 4/4

- [ ] **Step 5: Commit**

```bash
git add lib/cardapio/product-recipe.ts __tests__/integration/vender/product-recipe.test.ts
git commit -m "Ficha simples: a menu item without a ficha técnica gets a recipe with no ingredients"
```

---

### Task 2: Every sale path links the ficha simples

**Files:**
- Modify: `lib/comanda/add-item.ts` (the `if (input.menuItemId)` block of `addComandaItem`; the merge lookup in `addOrMergeComandaItem`)
- Modify: `app/api/public/orders/[qrToken]/route.ts:75-95`
- Modify: `app/api/public/delivery/order/route.ts:55-85`
- Modify: `lib/whatsapp/bot.ts:557-569`
- Test: `__tests__/integration/caixa/quick-sale.test.ts`, `__tests__/integration/vender/qr-order.test.ts`, `__tests__/integration/api/delivery-order-payment.test.ts`, `__tests__/integration/vender/whatsapp-kitchen.test.ts`

**Interfaces:**
- Consumes: `ensureMenuItemRecipes(db, restaurantId, ids)` from Task 1.

- [ ] **Step 1: Write the failing tests**

In `__tests__/integration/caixa/quick-sale.test.ts`, add inside the describe (uses its `sale`, `openSession`, `owner`, `reg`, `A`, `tag`):

```ts
  it('sells a menu item without a ficha técnica (a soda): it gets a ficha simples (2026-10-12)', async () => {
    const cat = await prisma.menuCategory.create({ data: { restaurantId: A.restaurantId, name: `Bebidas ${tag}`, position: 9, active: true } });
    const soda = await prisma.menuItem.create({ data: { restaurantId: A.restaurantId, categoryId: cat.id, name: `Refri ${tag}`, price: 6, position: 0 } });
    const { session } = await openSession(owner, { cashRegisterId: reg.id, openingFloat: 0 });
    const clientId = `bal-${crypto.randomUUID()}`;
    const res = await sale({ clientId, items: [{ menuItemId: soda.id, quantity: 2 }], cashSessionId: session.id, payments: [{ method: 'pix', amount: 12 }] });
    expect(res.status).toBe(201);
    const line = await prisma.orderSessionItem.findFirst({ where: { sessionId: clientId }, include: { recipe: true } });
    expect(line.recipe.name).toBe(`Refri ${tag}`);
    expect(Number(line.price)).toBe(6);
    expect((await prisma.menuItem.findUnique({ where: { id: soda.id } })).recipeId).toBe(line.recipeId);
  });
```

In `__tests__/integration/vender/qr-order.test.ts`, add (uses its `order`, `rid`, `tag`):

```ts
  it('a QR order takes a drink without a ficha técnica (2026-10-12)', async () => {
    const cat = await prisma.menuCategory.findFirst({ where: { restaurantId: rid } });
    const soda = await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: `Refri ${tag}`, price: 6, position: 5 } });
    const res = await order([{ menuItemId: soda.id, quantity: 1 }]);
    expect(res.status).toBeLessThan(300);
    const linked = await prisma.menuItem.findUnique({ where: { id: soda.id } });
    expect(linked.recipeId).not.toBeNull();
    expect(await prisma.orderSessionItem.count({ where: { recipeId: linked.recipeId } })).toBe(1);
  });
```

In `__tests__/integration/api/delivery-order-payment.test.ts`: read the file first; add one test that creates a menu item without `recipeId` in the test restaurant's delivery menu and posts it through the same helper the file already uses for a successful order; expect the success status the file already expects (not 422) and one `orderItem` whose `recipeId` equals the item's new `recipeId`.

In `__tests__/integration/vender/whatsapp-kitchen.test.ts`: read the file first; add one test that puts in the cart a menu item without `recipeId` of the conversation's restaurant and expects the order created with that item (as the file's existing happy path does), and one test that puts a menu item of ANOTHER restaurant in the cart and expects no order created.

- [ ] **Step 2: Run tests to verify they fail**

Run each: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/caixa/quick-sale.test.ts` (and the three others)
Expected: the new tests FAIL (quick-sale 400 "não está vinculado a uma receita"; QR 400 "not linked to a recipe"; delivery 422 "Itens sem receita"; WhatsApp "não estão disponíveis" / other restaurant's item accepted).

- [ ] **Step 3: Implement**

`lib/comanda/add-item.ts`, in `addComandaItem`, replace the `if (input.menuItemId) { ... }` block with:

```ts
  if (input.menuItemId) {
    // A menu item without a ficha técnica sells too: it gets its ficha simples here (lib/cardapio/product-recipe.ts)
    await ensureMenuItemRecipes(db, restaurantId, [input.menuItemId]);
    const menuItem = await db.menuItem.findFirst({
      where: { id: input.menuItemId, restaurantId },
      include: { recipe: { select: { id: true } } },
    });
    if (!menuItem) throw new AddItemError('Menu item not found', 404);
    recipeId = menuItem.recipeId || menuItem.recipe?.id || null;
    price = Number(menuItem.price) || 0;
  }
```

and add `import { ensureMenuItemRecipes } from '@/lib/cardapio/product-recipe';`. In `addOrMergeComandaItem`, before `const menuItem = await tx.menuItem.findFirst(...)`, add `await ensureMenuItemRecipes(tx, restaurantId, [input.menuItemId]);` so the second tap of a soda merges like any item.

`app/api/public/orders/[qrToken]/route.ts`: right after `const menuItemIds = items.map(...)`, add:

```ts
    // Items without a ficha técnica get their ficha simples before the check below (2026-10-12)
    await ensureMenuItemRecipes(prisma, table.restaurantId, menuItemIds);
```

`app/api/public/delivery/order/route.ts`: before the `prisma.menuItem.findMany` that builds `menuMap`, add the same call with the requested ids and the restaurant id that query already filters by (read the lines above to take the exact variable name), and update the comment above `unlinkedItems` to say the check is a safety net after the ficha simples.

`lib/whatsapp/bot.ts:557-569`:

```ts
  // Map MenuItem → recipeId (items without a ficha técnica get their ficha simples first)
  const menuItemIds = cart.map((c) => c.menuItemId);
  await ensureMenuItemRecipes(prisma, ctx.restaurantId, menuItemIds);
  const menuItems = await prisma.menuItem.findMany({
    // Only this restaurant's items: the lookup had no restaurant filter
    where: { id: { in: menuItemIds }, restaurantId: ctx.restaurantId },
    select: { id: true, recipeId: true, name: true, price: true },
  });
  const missing = menuItems.filter((mi) => !mi.recipeId);
  if (missing.length > 0 || menuItems.length < new Set(menuItemIds).size) {
```

(the message inside stays). Add the import in each file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/caixa` then `__tests__/integration/vender` then `__tests__/integration/api`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/add-item.ts app/api/public/orders/[qrToken]/route.ts app/api/public/delivery/order/route.ts lib/whatsapp/bot.ts __tests__/integration
git commit -m "Every sale path sells menu items without a ficha técnica (ficha simples on first sale)"
```

---

### Task 3: Cardápio writes and the example menu create the ficha simples

**Files:**
- Modify: `app/api/cardapio/itens/route.ts` (POST, after `prisma.menuItem.create`)
- Modify: `app/api/cardapio/itens/[id]/route.ts` (PUT, after the update)
- Modify: `lib/onboarding/seed-template.ts` (after `tx.menuItem.createMany`)
- Test: `__tests__/integration/vender/product-recipe.test.ts` (add), plus a seed test in the same file

**Interfaces:**
- Consumes: `ensureMenuItemRecipes` (Task 1); `seedStarterTemplate(restaurantId, businessType)` from `lib/onboarding/seed-template.ts`.

- [ ] **Step 1: Write the failing tests** (append to `product-recipe.test.ts`; mock auth at the top of the file as `__tests__/integration/caixa/quick-sale.test.ts` does: `jest.mock('next-auth', ...)`, `jest.mock('../../../lib/whatsapp/get-restaurant', ...)`, and `restaurantUser` OWNER membership for `ownerId` on `rid`)

```ts
  it('the example menu of a new account has no item without a ficha', async () => {
    const fresh = (await prisma.restaurant.create({ data: { name: `Seed ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    try {
      await seedStarterTemplate(fresh, 'hamburgueria');
      expect(await prisma.menuItem.count({ where: { restaurantId: fresh } })).toBeGreaterThan(0);
      expect(await prisma.menuItem.count({ where: { restaurantId: fresh, recipeId: null } })).toBe(0);
    } finally { await prisma.restaurant.delete({ where: { id: fresh } }); }
  });

  it('an item created in the Cardápio digital without a ficha gets one; unlinking keeps it selling and leaves the old recipe', async () => {
    as(ownerId, rid);
    const created = await (await createItem({ categoryId: cat.id, name: `Novo ${tag}`, price: 9 })).json();
    expect((await prisma.menuItem.findUnique({ where: { id: created.id } })).recipeId).not.toBeNull();
    const real = await prisma.recipe.create({ data: { restaurantId: rid, code: `R-${tag}`, name: 'Real', baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
    await updateItem(created.id, { recipeId: real.id });
    await updateItem(created.id, { recipeId: '' });
    const after = await prisma.menuItem.findUnique({ where: { id: created.id } });
    expect(after.recipeId).not.toBeNull();
    expect(after.recipeId).not.toBe(real.id);
    expect(await prisma.recipe.findUnique({ where: { id: real.id } })).not.toBeNull();
  });
```

with helpers `as`, `createItem` (POST `app/api/cardapio/itens/route`) and `updateItem` (PUT `app/api/cardapio/itens/[id]/route`, `{ params: { id } }`) built like `quick-sale.test.ts` builds its `sale`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/product-recipe.test.ts`
Expected: the two new tests FAIL (seeded drinks have `recipeId: null`; created item has `recipeId: null`).

- [ ] **Step 3: Implement**

- POST: after the create, `await ensureMenuItemRecipes(prisma, restaurantId, [item.id]);` then return the item re-read with the same `include` the route already returns.
- PUT: after the update, `await ensureMenuItemRecipes(prisma, restaurantId, [params.id]);` then re-read and return.
- Seed: after `tx.menuItem.createMany(...)`, `await ensureMenuItemRecipes(tx, restaurantId);`. Update the seed doc comment: resale items get a ficha simples.

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender` and `npx jest -c jest.unit.config.js __tests__/unit/starter-templates.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/cardapio lib/onboarding/seed-template.ts __tests__/integration/vender/product-recipe.test.ts
git commit -m "Cardápio and the example menu give every item a ficha simples"
```

---

### Task 4: Screens offer every item; cardápio texts

**Files:**
- Modify: `lib/vender/rules.ts:24-25` (`groupByCategory`)
- Modify: `__tests__/unit/vender-rules.test.ts:60-65`
- Modify: `app/admin/cardapio/page.tsx:334-340` (form label and empty option), `:393-397` (price and "Sem receita" badge)

- [ ] **Step 1: Write the failing test** — replace the `menu items without a recipe` describe in `__tests__/unit/vender-rules.test.ts`:

```ts
describe('menu items without a ficha técnica', () => {
  it('are offered: the server gives them a ficha simples on the first sale (2026-10-12)', () => {
    const groups = groupByCategory([entry('a'), entry('b', { recipeId: null, recipe: null })]);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest -c jest.unit.config.js __tests__/unit/vender-rules.test.ts`
Expected: FAIL (`['a']` received)

- [ ] **Step 3: Implement**

`lib/vender/rules.ts`:

```ts
    // Unavailable items are not offered. An item without a ficha técnica is: the server gives it a ficha
    // simples on the first sale (lib/cardapio/product-recipe.ts, 2026-10-12)
    if (item.available === false) continue;
```

`app/admin/cardapio/page.tsx`: label `Ficha técnica (opcional)`; empty option `Sem ficha técnica: vende normalmente, sem baixa de estoque`; price `{brl(Math.round(Number(item.price) * 100))}` with `import { brl } from '@/components/caixa/money'`; delete the "Sem receita" badge block (every item now has a ficha).

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest -c jest.unit.config.js __tests__/unit/vender-rules.test.ts && npx tsc --noEmit -p .`
Expected: PASS, tsc exit 0

- [ ] **Step 5: Commit**

```bash
git add lib/vender/rules.ts __tests__/unit/vender-rules.test.ts app/admin/cardapio/page.tsx
git commit -m "Comanda offers items without a ficha técnica; cardápio texts and prices in reais"
```

---

### Task 5: Quick pack (balcão and comanda screens)

**Files:**
- Modify: `components/comanda/counter-sale.tsx` (prices lines 81, 136, 172; hint above "Finalizar venda"; toast id)
- Modify: `components/caixa/panel-state.ts` (add `finishHint` next to `panelState`)
- Modify: `app/vender/[sessionId]/page.tsx:154-161` (phone bar)
- Test: `__tests__/unit/caixa-payment-panel.test.ts`

**Interfaces:**
- Produces: `finishHint(totalCents: number, payments: PanelPayment[]): string | null` exported next to `panelState` (same file): `null` when the sale can be finished, `'Escolha a forma de pagamento'` when there is no payment line, otherwise the reason `panelState` already gives (read `panelState`'s return shape first and reuse its message field if it has one; if it has none, `'Confira os valores das formas de pagamento'`).

- [ ] **Step 1: Write the failing test** (append to `__tests__/unit/caixa-payment-panel.test.ts`, importing `finishHint` from where `panelState` is imported there)

```ts
describe('finishHint (2026-10-12: "Finalizar venda" was disabled with no reason on screen)', () => {
  it('asks for the payment method when none was chosen', () => {
    expect(finishHint(3200, [])).toBe('Escolha a forma de pagamento');
  });
  it('says nothing when the sale can be finished', () => {
    expect(finishHint(3200, [{ method: 'dinheiro', amount: '32,00' }] as any)).toBeNull();
  });
});
```

(Read the file's existing payment literals first and copy their exact shape for the second case.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest -c jest.unit.config.js __tests__/unit/caixa-payment-panel.test.ts`
Expected: FAIL (`finishHint` is not a function)

- [ ] **Step 3: Implement**

- `finishHint` next to `panelState`.
- `counter-sale.tsx`: `brl(Math.round(priceOf(entry) * 100))` and `brl(Math.round(total * 100))` on screen and in the queue label; when `lines.length > 0` and `finishHint(...)` is not null, show it in `text-sm text-amber-700` right above the button; the "Venda registrada" toast gets `id: 'counter-sale-done'` and a `useEffect(() => () => { toast.dismiss('counter-sale-done'); }, [])` so it leaves with the screen (it stayed over the next comanda).
- `app/vender/[sessionId]/page.tsx` phone bar: replace the `Ver comanda` button with `<Button variant="outline" disabled={c.lines.length === 0} onClick={() => setShowConta(true)}>Conta</Button>` (the left side, "N itens ^", already opens the list).

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest -c jest.unit.config.js && npx tsc --noEmit -p .`
Expected: unit all PASS, tsc exit 0

- [ ] **Step 5: Commit**

```bash
git add components/comanda/counter-sale.tsx app/vender/[sessionId]/page.tsx __tests__/unit/caixa-payment-panel.test.ts components/caixa/panel-state.ts
git commit -m "Balcão: prices in reais, why Finalizar is disabled, toast leaves with the screen; Conta on the phone bar"
```

---

### Task 6: Home leads to selling (Vender + Primeiros passos)

**Files:**
- Create: `lib/onboarding/first-steps.ts`
- Create: `components/dashboard/first-steps.tsx`
- Modify: `app/dashboard/page.tsx` (replace the address banner block)
- Test: `__tests__/integration/vender/first-steps.test.ts`

**Interfaces:**
- Produces: `firstSteps(restaurantId: string): Promise<FirstStep[]>` with `type FirstStep = { key: 'caixa' | 'venda' | 'cardapio' | 'endereco' | 'nfce'; label: string; href: string; done: boolean }`, in this order:
  - `caixa` "Abrir o caixa" `/vender` — done when the restaurant has any `CashSession`
  - `venda` "Fazer a primeira venda" `/vender` — done when any `OrderSession` with `status: 'CLOSED'`
  - `cardapio` "Cadastrar seus produtos e preços" `/admin/cardapio` — done when any `MenuItem` was created more than 10 minutes after the restaurant (`createdAt`)
  - `endereco` "Completar o endereço" `/admin/settings` — done when `restaurant.address` is set
  - `nfce` "Configurar a nota fiscal (NFC-e)" `/admin/fiscal` — done when an `NFeConfig` with `active: true` and `nfeApiKey` not empty exists

- [ ] **Step 1: Write the failing test**

```ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { firstSteps } from '../../../lib/onboarding/first-steps';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('primeiros passos', () => {
  let ownerId, rid;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `fs-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `FS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
  });
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });
  const done = async () => Object.fromEntries((await firstSteps(rid)).map((s) => [s.key, s.done]));

  it('a new account has every step to do, in order', async () => {
    expect((await firstSteps(rid)).map((s) => s.key)).toEqual(['caixa', 'venda', 'cardapio', 'endereco', 'nfce']);
    expect(await done()).toEqual({ caixa: false, venda: false, cardapio: false, endereco: false, nfce: false });
  });

  it('each step is done by what the restaurant actually did', async () => {
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', tableNumber: 1 } });
    await prisma.restaurant.update({ where: { id: rid }, data: { address: 'Rua A, 1' } });
    const d = await done();
    expect(d.venda).toBe(true);
    expect(d.endereco).toBe(true);
    expect(d.caixa).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/first-steps.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

`lib/onboarding/first-steps.ts`: one `Promise.all` of the five reads (`cashSession.count`, `orderSession.count`, `restaurant.findUnique` select `createdAt, address`, `menuItem.count` with `createdAt: { gt: createdAt + 10 min }`, `nFeConfig.count({ where: { restaurantId, active: true, nfeApiKey: { not: '' } } })`), mapped to the five `FirstStep` in order. Doc comment: the home used to show stock and CMV cards to an account that had not sold yet (walkthrough 2026-10-12).

`components/dashboard/first-steps.tsx` (server-safe, no client state): a card titled "Primeiros passos" with "N de 5 concluídos", each step a `Link` row with a check (done, muted) or an empty circle (to do); shown only when at least one step is not done. Above it, for everyone, a large `Link` button "Vender" to `/vender` (`bg-primary text-primary-foreground`, full width on phone).

`app/dashboard/page.tsx`: replace the `missingAddress` banner with `<FirstSteps steps={steps} />` where `steps = restaurantId && canEditRestaurant ? await firstSteps(restaurantId) : null` (the address is now a step); keep the "Vender" button visible when `steps` is null. Remove the `missingAddress` query.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/first-steps.test.ts && npx tsc --noEmit -p .`
Expected: PASS 2/2, tsc exit 0

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/first-steps.ts components/dashboard/first-steps.tsx app/dashboard/page.tsx __tests__/integration/vender/first-steps.test.ts
git commit -m "Home: Vender button and Primeiros passos for a new account"
```

---

## After the tasks

Full suites (tsc, unit, integration api / vender / caixa / bad-day per folder), the final whole-branch review on the most capable model, then push to main; the owner deploys and I check on homolog with the test account `teste.ux.20261012@exemplo.com`: sell a soda on Mesa 2 and at the balcão, see the home with Vender and Primeiros passos.
