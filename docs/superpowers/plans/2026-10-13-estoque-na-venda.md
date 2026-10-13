# Estoque baixa na venda + entrada que não se perde — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every closed sale takes its ingredients out of stock (kitchen screen or not), exactly once, and the first stock entry of an ingredient is never lost.

**Architecture:** One function, `settleSessionStock`, reconciles a closed comanda with the stock: the target consumption comes from its current lines (ficha quantity × units, the same formula the kitchen uses today), minus what was already taken for it (the kitchen's `AUTO_DEDUCTION` movements of its orders, `referenceType 'ORDER'`, and its own earlier settlements, `referenceType 'ORDER_SESSION'`); the difference leaves stock, or comes back when a reopened bill lost lines. It runs at every point a comanda is closed. The kitchen keeps deducting while the comanda is open (real-time stock); an order completed after its comanda closed deducts nothing (the close already did). No schema change: `StockMovement.referenceId/referenceType` carry the link.

**Tech Stack:** Next.js 14 app router, Prisma 6.7 + PostgreSQL, Jest (integration `jest.integration.config.js`, per folder `--runInBand`; unit `jest.unit.config.js`).

**Spec:** No separate spec. Authority: owner approval 2026-10-13 ("pode") of the usability research 2 findings recorded in memory `project_gastrux-backlog.md` item 9 (finding g: stock only leaves on KDS COMPLETED; finding a: an ENTRY on an ingredient without a Stock row is lost).

## Global Constraints

- No migration.
- "Controlled" stock (kept rule, like Consumer's "estoque controlado"): an ingredient's quantity changes on a sale only if it has a `Stock` row (created by a count or an entry). The movement is ALWAYS recorded (the CMV reads movements). A manual movement (entry, exit, adjustment on the Estoque screen) creates the `Stock` row when missing.
- Consumption formula unchanged: `recipeIngredient.quantity × line quantity` (same as `deductOrderStock` today; batch recipes with baseYield > 1 are out of scope).
- Settlement movements: `movementType 'AUTO_DEDUCTION'`, `referenceType 'ORDER_SESSION'`, `referenceId` = comanda id, `quantity` negative when stock leaves, positive when it comes back; reason `Venda: <label>` / `Item retirado da conta: <label>`.
- Settlement runs under `pg_advisory_xact_lock(hashtext('stock-session:' + sessionId))`.
- Stock never comes back for what the kitchen took (`ORDER` movements): a line withdrawn after the kitchen made it is a loss, handled by `lib/kds-cancel-order.ts`. Only earlier `ORDER_SESSION` deductions can be returned.
- pt-BR UI texts, no em dashes.

## Review Focus

1. Kitchen completes an order AFTER its comanda closed: no second deduction (test in Task 2).
2. Reopen ("Reabrir conta"), remove a line, close again: that line's stock comes back once; close twice: nothing more (tests in Task 1).
3. Merge (juntar mesas) of a source that had been closed and reopened: its `ORDER_SESSION` movements follow it to the target, so the target close does not deduct them again (test in Task 2).
4. A recipe of another restaurant on a line (data corruption) never moves this restaurant's stock (test in Task 1).
5. Concurrency: two closes / settlements of the same comanda at the same instant deduct once (test in Task 1).

---

### Task 1: `settleSessionStock` (`lib/stock/session-stock.ts`)

**Files:**
- Create: `lib/stock/session-stock.ts`
- Test: `__tests__/integration/vender/session-stock.test.ts`

**Interfaces:**
- Produces: `settleSessionStock(db: Prisma.TransactionClient | typeof prisma, restaurantId: string, sessionId: string): Promise<{ moved: number }>` — `moved` = number of ingredients whose stock movement was written. Only a session with `status: 'CLOSED'` is settled (any other status returns `{ moved: 0 }`).

- [ ] **Step 1: Write the failing test**

```ts
// @ts-nocheck
/** A closed sale takes its ingredients out of stock once, kitchen screen or not (2026-10-13) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { settleSessionStock } from '../../../lib/stock/session-stock';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('stock at the sale', () => {
  let ownerId, rid, otherRid, burger, blend, bread, salt, foreign;
  const stockOf = async (ingredientId) => (await prisma.stock.findFirst({ where: { ingredientId } }))?.currentQuantity ?? null;
  const closedSale = async (lines) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'CLOSED', tableNumber: 1, closedAt: new Date() } });
    for (const [recipeId, quantity] of lines) await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, quantity, price: 30 } });
    return s.id;
  };

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `ss-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `SS2 ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const cat = await prisma.ingredientCategory.create({ data: { restaurantId: rid, name: `Cat ${tag}` } });
    const ing = (name, code) => prisma.ingredient.create({ data: { restaurantId: rid, categoryId: cat.id, code: `${code}-${tag}`, name, standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 0, referenceCost: 10 } });
    blend = await ing('Blend', 'BL'); bread = await ing('Pão', 'PA'); salt = await ing('Sal', 'SA');
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: blend.id, currentQuantity: 10 } });
    await prisma.stock.create({ data: { restaurantId: rid, ingredientId: bread.id, currentQuantity: 20 } });
    // salt has no Stock row: not controlled
    burger = await prisma.recipe.create({ data: { restaurantId: rid, code: `BG-${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', ingredients: { create: [{ ingredientId: blend.id, quantity: 0.15 }, { ingredientId: bread.id, quantity: 1 }, { ingredientId: salt.id, quantity: 0.01 }] } } });
    const ocat = await prisma.ingredientCategory.create({ data: { restaurantId: otherRid, name: `OCat ${tag}` } });
    const oing = await prisma.ingredient.create({ data: { restaurantId: otherRid, categoryId: ocat.id, code: `OI-${tag}`, name: 'Alheio', standardUnit: 'kg', purchaseUnit: 'kg', conversionFactor: 1, minimumStock: 0, referenceCost: 1 } });
    await prisma.stock.create({ data: { restaurantId: otherRid, ingredientId: oing.id, currentQuantity: 5 } });
    foreign = await prisma.recipe.create({ data: { restaurantId: otherRid, code: `FR-${tag}`, name: 'Alheia', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', ingredients: { create: [{ ingredientId: oing.id, quantity: 1 }] } } });
    foreign.ing = oing;
  });
  afterAll(async () => {
    for (const id of [rid, otherRid]) {
      await prisma.recipeIngredient.deleteMany({ where: { recipe: { restaurantId: id } } });
      try { await prisma.restaurant.delete({ where: { id } }); } catch {}
    }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a closed sale takes its controlled ingredients out once; the uncontrolled one is only recorded', async () => {
    const sid = await closedSale([[burger.id, 2]]);
    const b0 = await stockOf(blend.id), p0 = await stockOf(bread.id);
    await settleSessionStock(prisma, rid, sid);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(blend.id)).toBeCloseTo(b0 - 0.3);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 - 2);
    expect(await stockOf(salt.id)).toBeNull();
    const moves = await prisma.stockMovement.findMany({ where: { referenceType: 'ORDER_SESSION', referenceId: sid } });
    expect(moves.map((m) => [m.ingredientId, m.quantity, m.movementType]).sort()).toEqual(
      [[blend.id, -0.3, 'AUTO_DEDUCTION'], [bread.id, -2, 'AUTO_DEDUCTION'], [salt.id, -0.02, 'AUTO_DEDUCTION']].sort()
    );
  });

  it('what the kitchen already took is not taken again', async () => {
    const sid = await closedSale([[burger.id, 1]]);
    const order = await prisma.order.create({ data: { restaurantId: rid, orderNumber: `K-${tag}-1`, orderType: 'DINE_IN', status: 'COMPLETED', total: 30, orderSessionId: sid } });
    await prisma.stockMovement.create({ data: { restaurantId: rid, ingredientId: bread.id, quantity: -1, movementType: 'AUTO_DEDUCTION', referenceType: 'ORDER', referenceId: order.id } });
    const p0 = await stockOf(bread.id);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(bread.id)).toBeCloseTo(p0);
  });

  it('a reopened bill that lost a line gives that stock back once; the kitchen part never comes back', async () => {
    const sid = await closedSale([[burger.id, 3]]);
    await settleSessionStock(prisma, rid, sid);
    const p0 = await stockOf(bread.id);
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'OPEN' } });
    await prisma.orderSessionItem.updateMany({ where: { sessionId: sid }, data: { quantity: 1 } });
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED' } });
    await settleSessionStock(prisma, rid, sid);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 + 2);
  });

  it('an open or cancelled comanda is not settled', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN', tableNumber: 2 } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, quantity: 1, price: 30 } });
    expect((await settleSessionStock(prisma, rid, s.id)).moved).toBe(0);
    expect(await prisma.stockMovement.count({ where: { referenceId: s.id } })).toBe(0);
  });

  it('another restaurant\'s recipe never moves stock', async () => {
    const sid = await closedSale([[foreign.id, 1]]);
    await settleSessionStock(prisma, rid, sid);
    expect(await stockOf(foreign.ing.id)).toBe(5);
  });

  it('two settlements at the same instant deduct once', async () => {
    const sid = await closedSale([[burger.id, 1]]);
    const p0 = await stockOf(bread.id);
    await Promise.all([settleSessionStock(prisma, rid, sid), settleSessionStock(prisma, rid, sid)]);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 - 1);
  });
});
```

Before writing, read `prisma/schema.prisma` models `Ingredient`, `IngredientCategory`, `RecipeIngredient` and adjust the fixture's create data to the required fields (the test must create valid rows; keep the assertions as written).

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/session-stock.test.ts`
Expected: FAIL with "Cannot find module '../../../lib/stock/session-stock'"

- [ ] **Step 3: Implement**

```ts
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type Db = Prisma.TransactionClient | typeof prisma;
const EPS = 1e-9;

/**
 * A closed comanda takes its ingredients out of stock (2026-10-13: stock only left when the kitchen screen
 * marked an order COMPLETED, so a counter sale, a drink or a restaurant without the kitchen screen never
 * moved stock). Reconciled, so it can run at every close: target = ficha quantity × units of the current
 * lines; already taken = the kitchen's movements for this comanda's orders (ORDER) and this comanda's own
 * earlier settlements (ORDER_SESSION). The difference leaves stock; a reopened bill that lost lines gets
 * back only what an earlier settlement took (what the kitchen made is a loss, lib/kds-cancel-order.ts).
 * The quantity changes only for a controlled ingredient (one with a Stock row); the movement is always
 * recorded, for the CMV.
 */
export async function settleSessionStock(db: Db, restaurantId: string, sessionId: string): Promise<{ moved: number }> {
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'stock-session:' + sessionId}))`;
    const session = await tx.orderSession.findFirst({
      where: { id: sessionId, restaurantId },
      select: {
        status: true, tableNumber: true, customerName: true,
        items: { select: { quantity: true, recipe: { select: { restaurantId: true, ingredients: { select: { ingredientId: true, quantity: true } } } } } },
      },
    });
    if (!session || session.status !== 'CLOSED') return { moved: 0 };

    const target = new Map<string, number>();
    for (const line of session.items) {
      if (!line.recipe || line.recipe.restaurantId !== restaurantId) continue;
      for (const ri of line.recipe.ingredients) {
        target.set(ri.ingredientId, (target.get(ri.ingredientId) ?? 0) + Number(ri.quantity) * Number(line.quantity));
      }
    }

    const orderIds = (await tx.order.findMany({ where: { orderSessionId: sessionId, restaurantId }, select: { id: true } })).map((o) => o.id);
    const moves = await tx.stockMovement.findMany({
      where: {
        restaurantId,
        movementType: 'AUTO_DEDUCTION',
        OR: [
          { referenceType: 'ORDER_SESSION', referenceId: sessionId },
          ...(orderIds.length ? [{ referenceType: 'ORDER', referenceId: { in: orderIds } }] : []),
        ],
      },
      select: { ingredientId: true, quantity: true, referenceType: true },
    });
    const kitchen = new Map<string, number>();
    const settled = new Map<string, number>();
    for (const m of moves) {
      const bucket = m.referenceType === 'ORDER' ? kitchen : settled;
      bucket.set(m.ingredientId, (bucket.get(m.ingredientId) ?? 0) - Number(m.quantity));
    }

    const label = session.tableNumber ? `Mesa ${session.tableNumber}` : session.customerName || 'balcão';
    let moved = 0;
    for (const ingredientId of new Set([...target.keys(), ...settled.keys()])) {
      const diff = (target.get(ingredientId) ?? 0) - (kitchen.get(ingredientId) ?? 0) - (settled.get(ingredientId) ?? 0);
      let change = 0;
      if (diff > EPS) change = -diff;
      else if (diff < -EPS) change = Math.min(-diff, settled.get(ingredientId) ?? 0);
      if (Math.abs(change) <= EPS) continue;
      await tx.stockMovement.create({
        data: {
          restaurantId, ingredientId, quantity: change, movementType: 'AUTO_DEDUCTION',
          reason: change < 0 ? `Venda: ${label}` : `Item retirado da conta: ${label}`,
          referenceType: 'ORDER_SESSION', referenceId: sessionId,
        },
      });
      // Controlled ingredients only (a Stock row exists): never creates one
      await tx.stock.updateMany({
        where: { restaurantId, ingredientId },
        data: { currentQuantity: { increment: change }, lastUpdated: new Date() },
      });
      moved++;
    }
    return { moved };
  };
  return '$transaction' in db ? (db as typeof prisma).$transaction(run) : run(db as Prisma.TransactionClient);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/session-stock.test.ts`
Expected: PASS 6/6

- [ ] **Step 5: Commit**

```bash
git add lib/stock/session-stock.ts __tests__/integration/vender/session-stock.test.ts
git commit -m "Stock leaves at the sale: settleSessionStock reconciles a closed comanda with the stock"
```

---

### Task 2: Settle at every close; the kitchen does not deduct after the close; merge carries settlements

**Files:**
- Modify: `lib/comanda/bill-service.ts` (the two `status: 'CLOSED'` updates, ~lines 180 and 255)
- Modify: `lib/comanda/table-payment.ts` (~line 48)
- Modify: `lib/comanda/transfer.ts` (~line 117 merge; ~line 135 paid-up merge close)
- Modify: `app/api/comanda/quick-sale/route.ts` (~lines 53 and 110)
- Modify: `app/api/comanda/sessions/[id]/route.ts` (~line 157 close)
- Modify: `lib/kds/order-status.ts` (`changeOrderStatus` COMPLETED branch)
- Test: `__tests__/integration/caixa/quick-sale.test.ts`, `__tests__/integration/vender/session-stock.test.ts` (add), `__tests__/integration/vender/merge.test.ts` (add)

**Interfaces:**
- Consumes: `settleSessionStock(db, restaurantId, sessionId)` from Task 1.

- [ ] **Step 1: Write the failing tests**

In `quick-sale.test.ts` (uses its `sale`, `openSession`, `owner`, `reg`, `A`, `burger`, `tag`): give `burger` an ingredient with a Stock row in a new test, sell 2, expect the stock down by 2 × the ficha quantity and one `ORDER_SESSION` movement per ingredient for `clientId`. Read the file's `beforeAll` first; create the ingredient, its category, the Stock row and the RecipeIngredient inside the test (as Task 1's fixture does).

Append to `session-stock.test.ts`:

```ts
  it('the kitchen finishing an order after its comanda closed takes nothing more', async () => {
    const { changeOrderStatus } = await import('../../../lib/kds/order-status');
    const sid = await closedSale([[burger.id, 1]]);
    await settleSessionStock(prisma, rid, sid);
    const p0 = await stockOf(bread.id);
    const order = await prisma.order.create({ data: { restaurantId: rid, orderNumber: `K-${tag}-2`, orderType: 'DINE_IN', status: 'PREPARING', total: 30, orderSessionId: sid } });
    await prisma.orderItem.create({ data: { orderId: order.id, recipeId: burger.id, quantity: 1 } });
    await changeOrderStatus(rid, order.id, 'COMPLETED');
    expect(await stockOf(bread.id)).toBeCloseTo(p0);
  });

  it('the kitchen still takes stock while the comanda is open, and the close takes only the rest', async () => {
    const { changeOrderStatus } = await import('../../../lib/kds/order-status');
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'OPEN', tableNumber: 3 } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: burger.id, quantity: 2, price: 30 } });
    const order = await prisma.order.create({ data: { restaurantId: rid, orderNumber: `K-${tag}-3`, orderType: 'DINE_IN', status: 'PREPARING', total: 30, orderSessionId: s.id } });
    await prisma.orderItem.create({ data: { orderId: order.id, recipeId: burger.id, quantity: 1 } });
    const p0 = await stockOf(bread.id);
    await changeOrderStatus(rid, order.id, 'COMPLETED');
    expect(await stockOf(bread.id)).toBeCloseTo(p0 - 1);
    await prisma.orderSession.update({ where: { id: s.id }, data: { status: 'CLOSED' } });
    await settleSessionStock(prisma, rid, s.id);
    expect(await stockOf(bread.id)).toBeCloseTo(p0 - 2);
  });
```

In `merge.test.ts`: read the file; add one test where the source comanda has an `ORDER_SESSION` movement (create it directly, as if closed and reopened before), merge it into the target with the file's merge helper, and expect that movement's `referenceId` to be the target id.

In `sessions/[id]` close: read `__tests__/integration/vender/bill.test.ts` (or the file that closes a comanda through the PUT route) and add one test: close a comanda with a burger line through that route, expect one `ORDER_SESSION` movement per ficha ingredient.

- [ ] **Step 2: Run to verify they fail**

Run each file with `npx jest -c jest.integration.config.js --runInBand <file>`.
Expected: the new tests FAIL (no movement at close; kitchen deducts after close; merge movement keeps the source id).

- [ ] **Step 3: Implement**

- After each `status: 'CLOSED'` write listed in Files, in the same transaction when there is one (`tx`), call `await settleSessionStock(tx, restaurantId, sessionId)`; outside a transaction (`quick-sale` line ~110, and the `existing` replay at ~53), call it with `prisma` after the update. Use the variable names already in scope at each site (read each site first).
- `lib/comanda/transfer.ts` merge, next to `tx.order.updateMany({ where: { orderSessionId: source.id ... } })`:

```ts
    // Stock already settled for the source (closed and reopened before) follows it, so the target close does not take it again
    await tx.stockMovement.updateMany({ where: { restaurantId: member.restaurantId, referenceType: 'ORDER_SESSION', referenceId: source.id }, data: { referenceId: target.id } });
```

- `lib/kds/order-status.ts`, in the transaction, replace `if (status === 'COMPLETED') await deductOrderStock(tx, restaurantId, orderId);` with:

```ts
    if (status === 'COMPLETED') {
      // A comanda already closed settled its stock at the close (lib/stock/session-stock.ts): the kitchen takes nothing more
      const link = await tx.order.findUnique({ where: { id: orderId }, select: { comanda: { select: { status: true } } } });
      if (link?.comanda?.status !== 'CLOSED') await deductOrderStock(tx, restaurantId, orderId);
    }
```

  (check the relation name on `Order` for `orderSessionId`; the schema shows `comanda OrderSession? @relation("OrderComanda", ...)`.)

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender` then `__tests__/integration/caixa`, then `__tests__/integration/bad-day`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add lib/comanda lib/kds/order-status.ts app/api/comanda __tests__/integration
git commit -m "Every comanda close settles its stock; the kitchen takes nothing after the close; merge carries settlements"
```

---

### Task 3: A manual stock movement creates the Stock row (the first entry is not lost)

**Files:**
- Modify: `app/api/stock/movement/route.ts` (the `if (stock && ingredient)` block)
- Test: `__tests__/integration/vender/session-stock.test.ts` (add) — or a new `__tests__/integration/api/stock-movement.test.ts` with the auth setup of `__tests__/integration/bad-day/new-operator-mistakes.test.ts` (it calls safeHandler routes)

- [ ] **Step 1: Write the failing test**

A new ingredient without a Stock row; POST `{ ingredientId, movementType: 'ENTRY', quantity: 5 }` to the route; expect a Stock row with 5. A second POST `{ movementType: 'MANUAL_DEDUCTION', quantity: 2 }` → 3. And POST an exit on another ingredient without a row → a row with -2 (the manager's own movement starts the control).

- [ ] **Step 2: Run to verify it fails**

Expected: FAIL (no Stock row after the ENTRY; the movement exists).

- [ ] **Step 3: Implement**

Replace the read-then-`if (stock && ingredient)` update with an upsert, keeping the low-stock notification on the new quantity:

```ts
  // The first movement of an ingredient starts its control (2026-10-13: an ENTRY on an ingredient without a
  // Stock row was recorded but never counted, so a new account's first purchase vanished)
  const signed = body.movementType === 'ENTRY' ? body.quantity : -body.quantity;
  const updatedStock = await prisma.stock.upsert({
    where: { restaurantId_ingredientId: { restaurantId: context.restaurantId, ingredientId: body.ingredientId } },
    create: { restaurantId: context.restaurantId, ingredientId: body.ingredientId, currentQuantity: signed },
    update: { currentQuantity: { increment: signed }, lastUpdated: new Date() },
  });
  const newQuantity = updatedStock.currentQuantity;
```

and keep the existing `if (newQuantity < ingredient.minimumStock) { ...notifyLowStock... }` block after it (unindented from the removed `if`).

- [ ] **Step 4: Run to verify it passes**

Run the test file, then `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api`
Expected: PASS (including `security-fixes.test.ts`, which pins the atomic increment)

- [ ] **Step 5: Commit**

```bash
git add app/api/stock/movement/route.ts __tests__/integration
git commit -m "Estoque: the first manual movement of an ingredient creates its stock (entries were lost)"
```

---

### Task 4: Contagem shows quantities in Brazilian format

**Files:**
- Modify: `app/contagem/page.tsx:200,218,240,242` (`toFixed(2)`)

- [ ] **Step 1:** Replace each `x.toFixed(2)` shown to the user with `formatQuantity(x)` from `@/lib/formatters` (pt-BR, up to 2 decimals); keep the `+` sign logic for differences.
- [ ] **Step 2:** `npx tsc --noEmit -p .` → exit 0; `npx jest -c jest.unit.config.js` → PASS.
- [ ] **Step 3: Commit** `git commit -m "Contagem: quantities with a comma"`.

---

## After the tasks

Full suites (tsc, unit, integration api / vender / caixa / bad-day / staff / admin per folder), final whole-branch review on the most capable model, fix pass, push to main; the owner deploys; homolog check with `teste.estoque.20261013@exemplo.com`: count Blend 3 kg, sell a burger at the balcão without the kitchen, Estoque shows 2,85 kg; Nova Movimentação entry on an uncounted insumo shows in Estoque. Then delete that account with the cleanup script (homolog console).
