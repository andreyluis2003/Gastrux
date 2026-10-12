# Pagamento na mesa, etapa 4: o mapa de mesas mostra o que foi pago e quem chamou o garçom — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the staff's table map (`/vender`), a table with payments shows "R$ X pago de R$ Y" (cash register and phone together, service charge included), and a table that tapped "Pagar com o garçom" stands out as "Chamou o garçom · há N min" until a payment arrives or the bill closes.

**Architecture:** `lib/vender/salao.ts` (one round trip for the map) gains, per open comanda, `waiterCalledAt` (from `OrderSession.payAtWaiterRequestedAt`, stage 1 column, cleared by `applyTablePayment` and on close) and, only for comandas that have any payment, `paidCents` and `billTotalCents` from `loadBill` (the same numbers as the bill dialog). Comandas without payments do not pay the cost of `loadBill`. The tile in `components/vender/salao-grid.tsx` shows the new state; the map already refreshes every 10 s.

**Tech Stack:** Next.js 14, Prisma 6 + PostgreSQL, Jest (unit `jest.unit.config.js`; integration `jest.integration.config.js` on 127.0.0.1:55432).

**Spec:** `docs/superpowers/specs/2026-10-10-pagamento-na-mesa-design.md` §5.2 (Mapa de mesas), §7 stage 4. The bill dialog's "PIX online" / "Cartão online" lines (also §5.2) already exist since stage 1.

## Global Constraints

- The map's numbers are the bill's numbers: `loadBill` (`lib/comanda/bill-service.ts`), integer cents.
- "Chamou o garçom" wins over "pediu a conta" (yellow) on the tile: it asks for someone to go to the table now.
- Copy in pt-BR; code, comments and commits in English; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; branch `feat/pay-at-table-stage4`; publish `git push origin HEAD:main` with `GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"`.
- No migration. Integration suites per folder with `--runInBand`.

## Review Focus

1. **A comanda with no payment** — the map must not run `loadBill` for it (a busy room has many tables); its tile is unchanged. Pinned in Task 1 (`no payment, no paid line`).
2. **A table paid in part from the cash register and in part by phone** — "pago" is the sum of both, net of refunds, as in the bill. Pinned in Task 1 (`cash and phone together`).
3. **The waiter call after a payment arrived** — gone from the map (stage 1 clears it); the tile must not keep a stale highlight. Pinned in Task 1 (`waiter call cleared by a payment`).

---

### Task 1: The map data (`lib/vender/salao.ts`)

**Files:**
- Modify: `lib/vender/salao.ts`
- Test: `__tests__/integration/vender/salao-payments.test.ts` (new)

**Interfaces:**
- Produces on `SalaoSession`: `waiterCalledAt: string | null`, `paidCents: number` (0 without payments), `billTotalCents: number | null` (null without payments).

- [ ] **Step 1: Write the failing test** `__tests__/integration/vender/salao-payments.test.ts`:

```ts
// @ts-nocheck
/** Pay at the table, stage 4: the map shows what was paid and who called the waiter (spec 2026-10-10 §5.2) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { loadSalao } from '../../../lib/vender/salao';
import { applyTablePayment } from '../../../lib/comanda/table-payment';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('the map: paid so far and waiter calls', () => {
  let rid, ownerId, recipe, t1, t2, t3, shift;

  const open = (tableId, data = {}) => prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeWaived: true, ...data } });
  const tile = async (tableId) => (await loadSalao(rid)).tables.find((t) => t.id === tableId).session;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `sp-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `SP ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    [t1, t2, t3] = await Promise.all([1, 2, 3].map(async (n) => (await prisma.table.create({ data: { restaurantId: rid, number: n, sectionId: sec.id, capacity: 4, qrToken: `sp${n}${tag}` } })).id));
    recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: `Caixa ${tag}` } });
    shift = await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0 } });
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('no payment, no paid line: the tile is as before', async () => {
    const s = await open(t1);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    expect(await tile(t1)).toMatchObject({ paidCents: 0, billTotalCents: null, waiterCalledAt: null });
  });

  it('cash and phone together: paid is their sum, of the bill total', async () => {
    const s = await open(t2);
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 3 } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 2000, orderSessionId: s.id, createdById: ownerId } });
    const p = await prisma.payment.create({ data: { restaurantId: rid, gateway: 'MERCADO_PAGO_CONNECT', method: 'PIX', status: 'APPROVED', amount: 30, orderSessionId: s.id } });
    await applyTablePayment(rid, p.id);
    expect(await tile(t2)).toMatchObject({ paidCents: 5000, billTotalCents: 9000 });
  });

  it('a table that called the waiter shows when; a payment clears it', async () => {
    const at = new Date(Date.now() - 3 * 60_000);
    const s = await open(t3, { payAtWaiterRequestedAt: at });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    expect((await tile(t3)).waiterCalledAt).toBe(at.toISOString());
    const p = await prisma.payment.create({ data: { restaurantId: rid, gateway: 'MERCADO_PAGO_CONNECT', method: 'PIX', status: 'APPROVED', amount: 10, orderSessionId: s.id } });
    await applyTablePayment(rid, p.id);
    expect(await tile(t3)).toMatchObject({ waiterCalledAt: null, paidCents: 1000, billTotalCents: 6000 });
  });
});
```

- [ ] **Step 2: Run it** — `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/salao-payments.test.ts` — Expected: FAIL (fields undefined).

- [ ] **Step 3: Implement** in `lib/vender/salao.ts`:
  1. `SalaoSession` gains `waiterCalledAt: string | null; paidCents: number; billTotalCents: number | null;` with a one-line comment each.
  2. The session `select` adds `payAtWaiterRequestedAt: true`.
  3. After the three queries, find the open comandas with any payment, in two queries over the ids of `sessions`: `prisma.cashSessionEntry.findMany({ where: { orderSessionId: { in: ids } }, select: { orderSessionId: true }, distinct: ['orderSessionId'] })` and `prisma.payment.findMany({ where: { orderSessionId: { in: ids }, appliedToBillAt: { not: null } }, select: { orderSessionId: true }, distinct: ['orderSessionId'] })`; for those ids only, `await loadBill(prisma, restaurantId, id)` (in `Promise.all`) into a `Map<id, { paidCents, totalCents }>`.
  4. `toSession` sets `waiterCalledAt: s.payAtWaiterRequestedAt?.toISOString() ?? null`, `paidCents: bills.get(s.id)?.paidCents ?? 0`, `billTotalCents: bills.get(s.id)?.totalCents ?? null`.

- [ ] **Step 4: Run it** — Expected: PASS; also `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender/salao.test.ts` (unchanged, PASS) and `npx tsc --noEmit -p .`.

- [ ] **Step 5: Commit** — `git add lib/vender/salao.ts __tests__/integration/vender/salao-payments.test.ts` and commit "Vender map: paid so far and the waiter call of each table".

---

### Task 1b: A payment from the cash register also answers the waiter call

Spec §5.3: `payAtWaiterRequestedAt` is "limpo quando entra um pagamento ou a conta fecha". Stage 1 clears it only for phone payments (`applyTablePayment`); a waiter who came with the card machine and recorded a partial payment left the table highlighted.

**Files:** Modify `lib/comanda/bill-service.ts` (`recordBillPayment`); Test: append to `__tests__/integration/vender/salao-payments.test.ts`.

- [ ] **Step 1: Failing test** (append inside the `describe`; it needs the staff payment entry point: import `{ recordBillPayment } from '../../../lib/comanda/bill-service'` and check its signature in `lib/comanda/bill-service.ts` before writing the call; pass `member = { userId: ownerId, restaurantId: rid, role: 'OWNER' }`, `cashSessionId: shift.id`, one CASH payment of R$ 10,00):

```ts
  it('a payment recorded by the staff answers the waiter call too', async () => {
    const tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 4, sectionId: (await prisma.tableSection.findFirst({ where: { restaurantId: rid } })).id, capacity: 4, qrToken: `sp4${tag}` } })).id;
    const s = await open(tableId, { payAtWaiterRequestedAt: new Date() });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 30, quantity: 2 } });
    await recordBillPayment({ userId: ownerId, restaurantId: rid, role: 'OWNER' }, s.id, { payments: [{ method: 'dinheiro', amount: '10,00' }], cashSessionId: shift.id });
    expect((await tile(tableId)).waiterCalledAt).toBeNull();
  });
```

- [ ] **Step 2:** Run — FAIL (`waiterCalledAt` still set).
- [ ] **Step 3:** In `recordBillPayment`, right after `recordSaleEntries(...)`: `await tx.orderSession.update({ where: { id: sessionId }, data: { payAtWaiterRequestedAt: null } });` with the comment `// The staff took a payment: the table's "pagar com o garçom" was answered (spec 2026-10-10 §5.3)`.
- [ ] **Step 4:** Run — PASS; `npx jest -c jest.integration.config.js --runInBand __tests__/integration/vender` all PASS.
- [ ] **Step 5:** Commit "Bill: a payment from the cash register answers the waiter call".

---

### Task 2: The tile (`components/vender/salao-grid.tsx`)

**Files:** Modify `components/vender/salao-grid.tsx`.

- [ ] **Step 1:** In `Tile`, `const waiter = !!session?.waiterCalledAt;`. Class order: `waiter ? 'bg-rose-50 border-rose-500 text-rose-900 animate-pulse' : asked ? (amber) : busy ? (emerald) : (slate)` — keep the existing classes for the other states.
- [ ] **Step 2:** Under the title: `{waiter && <div className="text-xs font-semibold">Chamou o garçom · {openFor(session!.waiterCalledAt!, new Date())}</div>}`, shown instead of "Pediu a conta" when both are set.
- [ ] **Step 3:** When `session.billTotalCents !== null && session.paidCents > 0`, add a line `<div className="text-xs">{brl(session.paidCents)} pago de {brl(session.billTotalCents)}</div>` under the total line.
- [ ] **Step 4:** `npx tsc --noEmit -p .`; `npx jest -c jest.unit.config.js` — PASS. Commit "Vender map: tile shows paid so far and highlights a waiter call".

---

### Task 3: Verify, publish, check

- [ ] `npx tsc --noEmit -p .`; unit; integration `vender`, `caixa`, `bad-day`, `api` (per folder) — all pass.
- [ ] Final whole-branch review by a fresh reviewer; fix Critical/Important with a failing test first.
- [ ] Push to `main`; owner deploys homolog and app (no migration).
- [ ] Homolog: on a table with an open comanda, tap "Pagar com o garçom" from its QR menu → the map shows the tile in rose, "Chamou o garçom · agora"; record a partial payment in the staff bill → the tile shows "R$ X pago de R$ Y" and the waiter highlight is gone.
