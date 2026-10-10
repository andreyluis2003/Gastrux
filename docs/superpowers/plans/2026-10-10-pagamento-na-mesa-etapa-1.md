# Pagamento na mesa, etapa 1: a conta recebe os pagamentos online e fecha sozinha — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PIX (or, later, card) paid online for a table counts on that table's bill, and the bill closes by itself, frees the table and issues the NFC-e when the payments reach the total.

**Architecture:** Online payments stay in `Payment` (gateway `MERCADO_PAGO_CONNECT`) and get a link to the comanda (`orderSessionId`) and to the open cash shift (`cashSessionId`). `loadBill` sums cash entries **and** applied online payments. One function, `applyTablePayment`, runs under the comanda lock when a linked payment becomes APPROVED (all three confirmation paths go through `syncRestaurantPayment`), marks it applied once, and closes the bill through the same write `recordBillPayment` uses. The existing table PIX (QR menu "pagar a conta") becomes the first producer: it now charges what is left on the bill (service charge included, minus what was paid) and is linked to the comanda.

**Tech Stack:** Next.js 14 (app router), Prisma 5 + PostgreSQL, Jest (unit: `jest.unit.config.js`; integration: `jest.integration.config.js` against the portable test DB on 127.0.0.1:55432).

**Spec:** `docs/superpowers/specs/2026-10-10-pagamento-na-mesa-design.md` (this plan is stage 1 of §7).

## Global Constraints

- Money is integer cents in every rule; `Payment.amount` / `amountRefunded` are `Decimal` and are converted with `toCents` from `lib/comanda/line-total.ts`.
- The browser never decides amount, restaurant or comanda (spec §5.4); the table PIX amount is computed on the server.
- A payment already approved by Mercado Pago is never refused or rolled back by Gastrux (spec §5.4).
- Each online payment is applied to a bill at most once (`Payment.appliedToBillAt`).
- The cash drawer and the blind close are unchanged: online payments never create `CashSessionEntry` rows (spec §5.3).
- One NFC-e per bill, with the CPF of the last applied payment that carried one (spec §3.4). The CPF is stored in the existing `Payment.customerDocument` (no new `customerCpf` column: deviation from spec §5.3, same meaning).
- Copy shown to people is Portuguese (pt-BR); code, comments and commit messages in English.
- Migrations are additive and are applied by hand after Deploy: `npx prisma migrate deploy` in the Easypanel console (no auto-migrate).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; publish with `git push origin HEAD:main` using `GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"` from `C:\Users\andre\gastrux-fix-delivery`.

## Review Focus

1. **The same approval arrives twice or concurrently** (webhook + page polling + 5-min sweep) — the bill must count the payment once and the NFC-e must be issued once. Pinned in Task 3 (`applies once`, `two at once`).
2. **An approval that crashed between "Payment APPROVED" and "applied to the bill"** — the next notification for that payment must apply it (self-healing), otherwise the table stays open forever. Pinned in Task 4 (`self-heals`).
3. **A manager reopens a closed bill that had online payments** — the online money must still count, so only the rest is open again. Pinned in Task 2 (`survives a reopening`).
4. **A refund of an online payment** (button Estornar on /dashboard/pagamentos) — the bill must stop counting it (REFUNDED counts 0, PARTIALLY_REFUNDED counts the rest). Pinned in Task 2.
5. **The staff tries to "Estornar" an online payment from the bill dialog** — that button returns cash from the drawer; it must not exist for online payments. Pinned in Task 5 (button hidden + `online` flag in the API).

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/20261010120000_table_online_payments/migration.sql` | New columns and relations (Task 1) |
| `lib/comanda/bill.ts` | Pure money rule `onlinePaidCents` (Task 2) |
| `lib/comanda/bill-service.ts` | `loadBill` sums online payments; `emitClosedBillFor` (Task 2) |
| `lib/comanda/table-payment.ts` (new) | `applyTablePayment`: apply once, close, NFC-e, alerts (Task 3) |
| `lib/comanda/table-payment-alerts.ts` (new) | Restaurant-wide bell alerts for table payments (Task 3) |
| `lib/mercadopago-connect/payment-sync.ts` | Calls `applyTablePayment`; self-heal (Task 4) |
| `lib/mercadopago-connect/pix-target.ts`, `pix-service.ts` | Table PIX = what is left on the bill, linked to the comanda (Task 4) |
| `lib/caixa/sessions.ts`, `app/caixa/page.tsx` | Shift view shows "PIX online" / "Cartão online" of the shift (Task 5) |
| `components/vender/conta-dialog.tsx` | Labels for online payments, no cash refund button on them (Task 5) |

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (models `Payment` ~line 2009, `OrderSession` ~line 1787, `CashSession` ~line 1873)
- Create: `prisma/migrations/20261010120000_table_online_payments/migration.sql`
- Test: `__tests__/integration/vender/table-payment-schema.test.ts`

**Interfaces:**
- Produces: `Payment.orderSessionId String?`, `Payment.cashSessionId String?`, `Payment.tableShareMode String?`, `Payment.appliedToBillAt DateTime?`, relations `Payment.orderSession`, `Payment.cashSession`, back-relations `OrderSession.onlinePayments Payment[]`, `CashSession.onlinePayments Payment[]`; `OrderSession.payAtWaiterRequestedAt DateTime?`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/table-payment-schema.test.ts
// @ts-nocheck
/** Pay at the table, stage 1 (spec 2026-10-10 §5.3): an online payment links to its comanda and shift */
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

describe('table online payments schema', () => {
  let A: any;
  beforeAll(async () => { A = (await createMultiRestaurantScenario()).restaurantA; });
  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.cashRegister.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  it('stores the comanda, the shift, the share mode and when it was applied; deleting the comanda keeps the payment', async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, status: 'OPEN', payAtWaiterRequestedAt: new Date() } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: A.restaurantId, name: 'Caixa', isDefault: true } });
    const shift = await prisma.cashSession.create({ data: { restaurantId: A.restaurantId, cashRegisterId: reg.id, openedById: A.ownerId, openingFloatCents: 0, status: 'OPEN' } });
    const p = await prisma.payment.create({
      data: {
        restaurantId: A.restaurantId, amount: 12.5, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED',
        orderSessionId: s.id, cashSessionId: shift.id, tableShareMode: 'ALL', appliedToBillAt: new Date(), customerDocument: '12345678909',
      },
    });
    const read = await prisma.payment.findUnique({ where: { id: p.id }, include: { orderSession: true, cashSession: true } });
    expect(read.orderSession.id).toBe(s.id);
    expect(read.cashSession.id).toBe(shift.id);
    expect(read.tableShareMode).toBe('ALL');
    expect(read.appliedToBillAt).toBeInstanceOf(Date);

    await prisma.orderSession.delete({ where: { id: s.id } });
    expect((await prisma.payment.findUnique({ where: { id: p.id } })).orderSessionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/table-payment-schema.test.ts`
Expected: FAIL (Prisma: unknown argument `payAtWaiterRequestedAt` / `orderSessionId`).

- [ ] **Step 3: Edit `prisma/schema.prisma`**

In `model Payment`, after `subscriptionId String?`:

```prisma
  /// Pay at the table (spec 2026-10-10): the comanda this online payment pays towards
  orderSessionId       String?
  orderSession         OrderSession?           @relation("OrderSessionOnlinePayments", fields: [orderSessionId], references: [id], onDelete: SetNull)
  /// The cash shift open when the payment was applied to the bill (null: no shift was open). Never in the drawer.
  cashSessionId        String?
  cashSession          CashSession?            @relation("CashSessionOnlinePayments", fields: [cashSessionId], references: [id], onDelete: SetNull)
  /// How the customer chose the amount: ALL, EQUAL:<n> or AMOUNT
  tableShareMode       String?
  /// When the payment was added to the bill: set once, under the comanda lock
  appliedToBillAt      DateTime?
```

and in its index list:

```prisma
  @@index([orderSessionId])
  @@index([cashSessionId])
```

In `model OrderSession`, after `mergedIntoId String?`:

```prisma
  /// The table asked to pay with the waiter (pay at the table); cleared by a payment or when the bill closes
  payAtWaiterRequestedAt DateTime?
  onlinePayments        Payment[]             @relation("OrderSessionOnlinePayments")
```

In `model CashSession`, after `entries CashSessionEntry[]`:

```prisma
  onlinePayments    Payment[]          @relation("CashSessionOnlinePayments")
```

- [ ] **Step 4: Write the migration**

```sql
-- prisma/migrations/20261010120000_table_online_payments/migration.sql
-- Pay at the table, stage 1 (spec 2026-10-10): online payments count on the bill of their comanda
ALTER TABLE "payments" ADD COLUMN "orderSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN "cashSessionId" TEXT;
ALTER TABLE "payments" ADD COLUMN "tableShareMode" TEXT;
ALTER TABLE "payments" ADD COLUMN "appliedToBillAt" TIMESTAMP(3);
ALTER TABLE "order_sessions" ADD COLUMN "payAtWaiterRequestedAt" TIMESTAMP(3);
CREATE INDEX "payments_orderSessionId_idx" ON "payments"("orderSessionId");
CREATE INDEX "payments_cashSessionId_idx" ON "payments"("cashSessionId");
ALTER TABLE "payments" ADD CONSTRAINT "payments_orderSessionId_fkey" FOREIGN KEY ("orderSessionId") REFERENCES "order_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_cashSessionId_fkey" FOREIGN KEY ("cashSessionId") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Table PIX made before this change stay unlinked (their bills were closed by hand with cash-register
-- payments): no backfill, so nothing old is counted twice
```

Check the table name first: `grep -n '@@map("payments")' prisma/schema.prisma` must print one line (the `Payment` model). If the map is different, use that name in every statement.

- [ ] **Step 5: Apply to the test DB and run the test**

Run: `npm run test:db:migrate` then `npx prisma generate` then `npx jest --config jest.integration.config.js __tests__/integration/vender/table-payment-schema.test.ts`
Expected: migrate prints no drift; test PASS.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p .` (expected: no output)

```bash
git add prisma/schema.prisma prisma/migrations/20261010120000_table_online_payments __tests__/integration/vender/table-payment-schema.test.ts
git commit -m "Pay at the table: link online payments to their comanda and cash shift

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The bill counts applied online payments

**Files:**
- Modify: `lib/comanda/bill.ts` (add `onlinePaidCents`)
- Modify: `lib/comanda/bill-service.ts` (`BillPayment`, `loadBill`, `emitClosedBill` → `emitClosedBillFor`)
- Test: `__tests__/unit/bill-online.test.ts`, `__tests__/integration/vender/bill-online.test.ts`

**Interfaces:**
- Consumes: Task 1 columns.
- Produces:
  - `onlinePaidCents(p: { amount: unknown; amountRefunded: unknown; status: string }): number` in `lib/comanda/bill.ts`.
  - `BillPayment` gains `online: boolean`; online methods are `'PIX_ONLINE' | 'CARD_ONLINE'`.
  - `export async function emitClosedBillFor(restaurantId: string, sessionId: string, cpf?: string | null, customerName?: string | null)` in `bill-service.ts`; `emitClosedBill(member, …)` delegates to it.
  - `loadBill` counts only `Payment` rows with `orderSessionId = sessionId`, gateway `MERCADO_PAGO_CONNECT`, status in `APPROVED | PARTIALLY_REFUNDED | REFUNDED` **and `appliedToBillAt` not null**.

- [ ] **Step 1: Write the failing unit test**

```ts
// __tests__/unit/bill-online.test.ts
import { onlinePaidCents } from '../../lib/comanda/bill';

describe('onlinePaidCents', () => {
  it('counts an approved payment in full, a partial refund as the rest, a refund as nothing', () => {
    expect(onlinePaidCents({ amount: '50.00', amountRefunded: 0, status: 'APPROVED' })).toBe(5_000);
    expect(onlinePaidCents({ amount: 50, amountRefunded: '12.50', status: 'PARTIALLY_REFUNDED' })).toBe(3_750);
    expect(onlinePaidCents({ amount: 50, amountRefunded: 50, status: 'REFUNDED' })).toBe(0);
    expect(onlinePaidCents({ amount: 50, amountRefunded: 0, status: 'PENDING' })).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/bill-online.test.ts`
Expected: FAIL (`onlinePaidCents` is not a function).

- [ ] **Step 3: Implement in `lib/comanda/bill.ts`**

Add the import at the top: `import { toCents } from './line-total';` and, after `paidNetCents`:

```ts
/** What one online payment (pay at the table) puts on the bill: approved money minus what was refunded */
export function onlinePaidCents(p: { amount: unknown; amountRefunded: unknown; status: string }): number {
  if (p.status !== 'APPROVED' && p.status !== 'PARTIALLY_REFUNDED') return 0;
  return Math.max(0, toCents(p.amount) - toCents(p.amountRefunded));
}
```

Run the unit test again. Expected: PASS.

- [ ] **Step 4: Write the failing integration test**

```ts
// __tests__/integration/vender/bill-online.test.ts
// @ts-nocheck
/** Pay at the table, stage 1 (spec 2026-10-10 §5.4): the bill sums the cash register and the applied online payments */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
import { autoEmitNFCe } from '../../../lib/nfe/emit-session';
import { loadBill, emitClosedBillFor } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('bill with online payments', () => {
  let rid: string, ownerId: string, recipeId: string, tableId: string, shiftId: string;
  // 2 x 50,00 = 100,00 + 10% = 110,00
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  const online = (sid: string, amount: number, extra: any = {}) => prisma.payment.create({
    data: { restaurantId: rid, amount, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', orderSessionId: sid, appliedToBillAt: new Date(), ...extra },
  });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `bo-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `BO ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `B${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `bo${tag}` } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
  }, 60000);

  afterAll(async () => {
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('sums cash and applied online payments; lists online ones with their own label', async () => {
    const sid = await newBill();
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents: 3_000, orderSessionId: sid, createdById: ownerId } });
    await online(sid, 50);
    await online(sid, 20, { method: 'CARD' });
    const bill = await loadBill(prisma, rid, sid);
    expect(bill).toMatchObject({ totalCents: 11_000, paidCents: 10_000, remainingCents: 1_000 });
    expect(bill.payments.map((p) => [p.method, p.amountCents, p.online])).toEqual([
      ['CASH', 3_000, false], ['PIX_ONLINE', 5_000, true], ['CARD_ONLINE', 2_000, true],
    ]);
  });

  it('ignores payments not applied yet, pending ones and other comandas', async () => {
    const sid = await newBill();
    const other = await newBill();
    await online(sid, 50, { appliedToBillAt: null });
    await online(sid, 50, { status: 'PENDING' });
    await online(other, 50);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
  });

  it('a refunded online payment stops counting; a partial refund counts the rest', async () => {
    const sid = await newBill();
    await online(sid, 50, { status: 'REFUNDED', amountRefunded: 50 });
    await online(sid, 40, { status: 'PARTIALLY_REFUNDED', amountRefunded: 10 });
    const bill = await loadBill(prisma, rid, sid);
    expect(bill.paidCents).toBe(3_000);
    expect(bill.payments.find((p) => p.amountCents === 5_000).refunded).toBe(true);
  });

  it('online payments survive a reopening (only cash is given back by the reopen)', async () => {
    const sid = await newBill();
    await online(sid, 60);
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'REFUND', method: 'CASH', amountCents: 0, direction: 'OUT', description: 'Reabertura da comanda: teste', orderSessionId: sid, createdById: ownerId } });
    const bill = await loadBill(prisma, rid, sid);
    expect(bill.paidCents).toBe(6_000);
    expect(bill.payments.find((p) => p.online).refunded).toBe(false);
  });

  it('the NFC-e method follows what paid the most, online included', async () => {
    const sid = await newBill();
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'CASH', amountCents: 1_000, orderSessionId: sid, createdById: ownerId } });
    await online(sid, 100);
    (autoEmitNFCe as jest.Mock).mockClear();
    await emitClosedBillFor(rid, sid, '123.456.789-09', 'Maria');
    expect((autoEmitNFCe as jest.Mock).mock.calls[0][0]).toMatchObject({ restaurantId: rid, orderSessionId: sid, paymentMethod: 'pix', customerCPF: '12345678909', customerName: 'Maria' });
  });
});
```

The reopen case mimics what `reverseSaleEntries` (`lib/caixa/sale.ts:95`) writes: a REFUND entry described `Reabertura da comanda: <motivo>`, which `loadBill` matches with `startsWith`.

- [ ] **Step 5: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/bill-online.test.ts`
Expected: FAIL (`paidCents` 3000 instead of 10000; `emitClosedBillFor` is not a function).

- [ ] **Step 6: Implement in `lib/comanda/bill-service.ts`**

1. Change the import from `./bill` to: `import { billTotals, onlinePaidCents, paidNetCents, serviceApplies, settlePartial } from './bill';` and add `import { toCents } from '@/lib/comanda/line-total';` (already imports `lineTotalCents` from there: extend that import).
2. Replace the `BillPayment` interface:

```ts
/** A payment of the bill: a cash-register entry, or an online payment of the table (PIX_ONLINE / CARD_ONLINE) */
export interface BillPayment { id: string; method: string; amountCents: number; changeCents: number; createdAt: string; refunded: boolean; online: boolean }
```

3. In `loadBill`, after the `entries` query add:

```ts
  // Pay at the table (spec 2026-10-10): online payments count once they were applied under the comanda lock
  const onlineRows = await db.payment.findMany({
    where: {
      restaurantId, orderSessionId: sessionId, gateway: 'MERCADO_PAGO_CONNECT',
      status: { in: ['APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, appliedToBillAt: { not: null },
    },
    select: { id: true, method: true, amount: true, amountRefunded: true, status: true, appliedToBillAt: true },
    orderBy: { appliedToBillAt: 'asc' },
  });
```

4. Replace `const paidCents = paidNetCents(entries);` with:

```ts
  const paidCents = paidNetCents(entries) + onlineRows.reduce((sum, p) => sum + onlinePaidCents(p), 0);
```

5. In the `payments` construction, add `online: false,` to the mapped cash entry object, and right after the `payments` array is built:

```ts
  for (const p of onlineRows) {
    payments.push({
      id: p.id,
      method: p.method === 'PIX' ? 'PIX_ONLINE' : 'CARD_ONLINE',
      amountCents: toCents(p.amount),
      changeCents: 0,
      createdAt: p.appliedToBillAt!.toISOString(),
      refunded: p.status === 'REFUNDED',
      online: true,
    });
  }
  payments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
```

(`payments` must be declared with `const payments: BillPayment[] = …` as today; `push` and `sort` mutate it.)

6. Replace `emitClosedBill` with:

```ts
/**
 * The NFC-e of a bill that just closed, when the restaurant turned it on: the method that paid the most
 * goes on the note (same rule as the old close), online payments of the table included. The note never
 * fails the close.
 */
export async function emitClosedBillFor(restaurantId: string, sessionId: string, cpf?: string | null, customerName?: string | null) {
  // A closed bill is a sale of the month: the plan warns at 80% / 100% and never blocks (2026-10-09)
  await noteSalesThresholds(restaurantId);
  const entries = await prisma.cashSessionEntry.findMany({
    where: { orderSessionId: sessionId, restaurantId, type: 'RECEIPT' },
    select: { method: true, amountCents: true },
  });
  const onlineRows = await prisma.payment.findMany({
    where: { orderSessionId: sessionId, restaurantId, gateway: 'MERCADO_PAGO_CONNECT', appliedToBillAt: { not: null } },
    select: { method: true, amount: true, amountRefunded: true, status: true },
  });
  const byMethod = new Map<CashMethod, number>();
  const add = (m: CashMethod, cents: number) => byMethod.set(m, (byMethod.get(m) ?? 0) + cents);
  for (const e of entries) add(e.method as CashMethod, e.amountCents);
  for (const p of onlineRows) add(p.method === 'PIX' ? 'PIX' : 'CREDIT', onlinePaidCents(p));
  const primary = CASH_METHODS.reduce((best, m) => ((byMethod.get(m) ?? 0) > (byMethod.get(best) ?? 0) ? m : best), 'CASH' as CashMethod);
  return autoEmitNFCe({
    restaurantId,
    orderSessionId: sessionId,
    customerCPF: cpf ? String(cpf).replace(/\D/g, '') || undefined : undefined,
    customerName: customerName ?? undefined,
    paymentMethod: toNfcePaymentMethod(primary),
    onlyIfEnabled: true,
  });
}

export async function emitClosedBill(member: RestaurantMember, sessionId: string, cpf?: string | null, customerName?: string | null) {
  return emitClosedBillFor(member.restaurantId, sessionId, cpf, customerName);
}
```

- [ ] **Step 7: Run the new tests and the bill suites**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/bill-online.test.ts __tests__/integration/vender/bill.test.ts __tests__/integration/vender/bill-payments.test.ts __tests__/integration/vender/bill-refund.test.ts __tests__/integration/vender/bill-review-fixes.test.ts`
Expected: all PASS. If an older bill test compares a whole `payments` element with `toEqual`, add `online: false` to its expected object (that is the only expected change).

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc --noEmit -p .` (expected: no output)

```bash
git add lib/comanda/bill.ts lib/comanda/bill-service.ts __tests__/unit/bill-online.test.ts __tests__/integration/vender
git commit -m "Pay at the table: the bill counts the online payments applied to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `applyTablePayment` — apply once, close the bill, NFC-e and alerts

**Files:**
- Create: `lib/comanda/table-payment-alerts.ts`
- Create: `lib/comanda/table-payment.ts`
- Test: `__tests__/integration/vender/table-payment-apply.test.ts`

**Interfaces:**
- Consumes: `loadBill(db, restaurantId, sessionId)`, `emitClosedBillFor(restaurantId, sessionId, cpf, name)` (Task 2), `lockComanda(tx, sessionId)` from `lib/comanda/add-item.ts`.
- Produces:
  - `export type ApplyOutcome = 'applied' | 'closed' | 'already-applied' | 'not-a-table-payment' | 'bill-closed'`
  - `export async function applyTablePayment(restaurantId: string, paymentId: string): Promise<{ outcome: ApplyOutcome; overpaidCents: number; withoutShift: boolean }>`
  - alerts: `alertTablePaid(restaurantId, sessionId, label, totalCents)`, `alertTableOverpaid(restaurantId, sessionId, label, overpaidCents, paymentId)`, `alertOnlineWithoutShift(restaurantId, sessionId, label, amountCents, paymentId)`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/table-payment-apply.test.ts
// @ts-nocheck
/** Pay at the table, stage 1 (spec 2026-10-10 §5.4): an approved online payment is applied once and closes the bill */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
import { autoEmitNFCe } from '../../../lib/nfe/emit-session';
import { applyTablePayment } from '../../../lib/comanda/table-payment';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('applyTablePayment', () => {
  let rid: string, ownerId: string, recipeId: string, tableId: string, regId: string;
  // 2 x 50,00 = 100,00 + 10% = 110,00
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN', serviceChargeEligible: true, payAtWaiterRequestedAt: new Date() } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  const approved = (sid: string, amount: number, extra: any = {}) => prisma.payment.create({
    data: { restaurantId: rid, amount, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', orderSessionId: sid, ...extra },
  });
  const alerts = (kind: string) => prisma.notification.findMany({ where: { restaurantId: rid, data: { path: ['kind'], equals: kind } } });
  const openShift = () => prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: regId, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `ta-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `TA ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `T${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `ta${tag}` } })).id;
    regId = (await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } })).id;
  }, 60000);

  beforeEach(async () => {
    (autoEmitNFCe as jest.Mock).mockClear();
    await prisma.notification.deleteMany({ where: { restaurantId: rid } });
    await prisma.cashSession.deleteMany({ where: { restaurantId: rid } });
  });

  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a part leaves the bill open, records the shift and clears the waiter request', async () => {
    const shift = await openShift();
    const sid = await newBill();
    const p = await approved(sid, 50);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toEqual({ outcome: 'applied', overpaidCents: 0, withoutShift: false });
    const row = await prisma.payment.findUnique({ where: { id: p.id } });
    expect(row.cashSessionId).toBe(shift.id);
    expect(row.appliedToBillAt).toBeInstanceOf(Date);
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).payAtWaiterRequestedAt).toBeNull();
    expect((await loadBill(prisma, rid, sid)).remainingCents).toBe(6_000);
    expect(autoEmitNFCe).not.toHaveBeenCalled();
  });

  it('the payment that reaches the total closes the bill with the service charge and issues ONE NFC-e with the last CPF', async () => {
    await openShift();
    const sid = await newBill();
    const a = await approved(sid, 55, { customerDocument: '11111111111' });
    const b = await approved(sid, 55, { customerDocument: '22222222222' });
    await applyTablePayment(rid, a.id);
    const r = await applyTablePayment(rid, b.id);
    expect(r.outcome).toBe('closed');
    expect(await prisma.orderSession.findUnique({ where: { id: sid } })).toMatchObject({ status: 'CLOSED', serviceChargeCents: 1_000 });
    expect(autoEmitNFCe).toHaveBeenCalledTimes(1);
    expect((autoEmitNFCe as jest.Mock).mock.calls[0][0]).toMatchObject({ orderSessionId: sid, customerCPF: '22222222222' });
    expect(await alerts('table-paid')).toHaveLength(1);
  });

  it('applies once: a repeated call changes nothing and issues nothing new', async () => {
    await openShift();
    const sid = await newBill();
    const p = await approved(sid, 110);
    expect((await applyTablePayment(rid, p.id)).outcome).toBe('closed');
    expect((await applyTablePayment(rid, p.id)).outcome).toBe('already-applied');
    expect(autoEmitNFCe).toHaveBeenCalledTimes(1);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(11_000);
  });

  it('two at once: both are counted, the bill closes once, the NFC-e is issued once', async () => {
    await openShift();
    const sid = await newBill();
    const a = await approved(sid, 55);
    const b = await approved(sid, 55);
    const res = await Promise.all([applyTablePayment(rid, a.id), applyTablePayment(rid, b.id)]);
    expect(res.map((r) => r.outcome).sort()).toEqual(['applied', 'closed']);
    expect(autoEmitNFCe).toHaveBeenCalledTimes(1);
  });

  it('more than the total: the bill closes and the manager is told how much was paid over', async () => {
    await openShift();
    const sid = await newBill();
    const p = await approved(sid, 122);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toMatchObject({ outcome: 'closed', overpaidCents: 1_200 });
    const over = await alerts('table-overpaid');
    expect(over).toHaveLength(1);
    expect(over[0].message).toContain('R$ 12,00');
  });

  it('a payment that arrives after the bill was closed is kept, not applied twice, and reported as paid over in full', async () => {
    await openShift();
    const sid = await newBill();
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED', closedAt: new Date() } });
    const p = await approved(sid, 30);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toMatchObject({ outcome: 'bill-closed', overpaidCents: 3_000 });
    expect((await prisma.orderSession.findUnique({ where: { id: sid } })).status).toBe('CLOSED');
    expect(await alerts('table-overpaid')).toHaveLength(1);
  });

  it('without an open shift the payment still counts and the manager is warned', async () => {
    const sid = await newBill();
    const p = await approved(sid, 40);
    const r = await applyTablePayment(rid, p.id);
    expect(r).toMatchObject({ outcome: 'applied', withoutShift: true });
    expect((await prisma.payment.findUnique({ where: { id: p.id } })).cashSessionId).toBeNull();
    expect(await alerts('table-no-shift')).toHaveLength(1);
  });

  it('ignores payments that are not approved, not linked to a comanda, or from another restaurant', async () => {
    const sid = await newBill();
    const pending = await approved(sid, 10, { status: 'PENDING' });
    const loose = await prisma.payment.create({ data: { restaurantId: rid, amount: 10, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED' } });
    expect((await applyTablePayment(rid, pending.id)).outcome).toBe('not-a-table-payment');
    expect((await applyTablePayment(rid, loose.id)).outcome).toBe('not-a-table-payment');
    expect((await applyTablePayment('other-restaurant', (await approved(sid, 10)).id)).outcome).toBe('not-a-table-payment');
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/table-payment-apply.test.ts`
Expected: FAIL (cannot find module `lib/comanda/table-payment`).

- [ ] **Step 3: Write `lib/comanda/table-payment-alerts.ts`**

```ts
import { prisma } from '@/lib/prisma';

/**
 * Bell alerts of pay at the table (spec 2026-10-10 §5.2): restaurant-wide (no userId), so owner, manager and
 * admin see them (lib/notification-utils.ts notificationAudience). One per dedupe key; never throws.
 */
async function notify(restaurantId: string, kind: string, dedupeKey: string, title: string, message: string, severity: 'MEDIUM' | 'HIGH', extra: Record<string, unknown>) {
  try {
    const existing = await prisma.notification.findFirst({
      where: { restaurantId, data: { path: ['dedupeKey'], equals: dedupeKey } },
      select: { id: true },
    });
    if (existing) return;
    await prisma.notification.create({
      data: {
        restaurantId, type: kind === 'table-paid' ? 'PAYMENT_RECEIVED' : 'SYSTEM_ERROR', severity, title, message,
        actionUrl: '/vender', actionLabel: 'Ver mesas', data: { kind, dedupeKey, ...extra },
      },
    });
  } catch (error) {
    console.error('Could not store the table payment alert:', error);
  }
}

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

export function alertTablePaid(restaurantId: string, sessionId: string, label: string, totalCents: number) {
  return notify(restaurantId, 'table-paid', `table-paid:${sessionId}`, `${label} paga pelo celular`,
    `${label} pagou ${brl(totalCents)} pelo celular. A conta foi fechada e a mesa está livre.`, 'MEDIUM', { orderSessionId: sessionId });
}

export function alertTableOverpaid(restaurantId: string, sessionId: string, label: string, overpaidCents: number, paymentId: string) {
  return notify(restaurantId, 'table-overpaid', `table-overpaid:${paymentId}`, `${label} pagou a mais pelo celular`,
    `${label} pagou ${brl(overpaidCents)} a mais pelo celular. Devolva em Pagamentos com o botão Estornar.`, 'HIGH', { orderSessionId: sessionId, paymentId });
}

export function alertOnlineWithoutShift(restaurantId: string, sessionId: string, label: string, amountCents: number, paymentId: string) {
  return notify(restaurantId, 'table-no-shift', `table-no-shift:${paymentId}`, 'Pagamento online recebido sem caixa aberto',
    `${label} pagou ${brl(amountCents)} pelo celular sem caixa aberto. O valor entrou na conta, fora de qualquer turno.`, 'HIGH', { orderSessionId: sessionId, paymentId });
}
```

- [ ] **Step 4: Write `lib/comanda/table-payment.ts`**

```ts
import { prisma } from '@/lib/prisma';
import { lockComanda } from '@/lib/comanda/add-item';
import { emitClosedBillFor, loadBill } from '@/lib/comanda/bill-service';
import { onlinePaidCents } from '@/lib/comanda/bill';
import { alertOnlineWithoutShift, alertTableOverpaid, alertTablePaid } from './table-payment-alerts';

export type ApplyOutcome = 'applied' | 'closed' | 'already-applied' | 'not-a-table-payment' | 'bill-closed';

/**
 * Pay at the table (spec 2026-10-10 §5.4): an online payment approved by Mercado Pago is added to the bill of
 * its comanda, once, under the comanda lock. The payment that reaches the total closes the bill exactly as a
 * cash-register payment does (lib/comanda/bill-service.ts recordBillPayment). A payment already approved is
 * never refused: over the total, or for a bill already closed, the manager is told to refund it.
 */
export async function applyTablePayment(restaurantId: string, paymentId: string): Promise<{ outcome: ApplyOutcome; overpaidCents: number; withoutShift: boolean }> {
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, restaurantId, gateway: 'MERCADO_PAGO_CONNECT' },
    select: { id: true, orderSessionId: true, status: true, amount: true, amountRefunded: true },
  });
  if (!payment || !payment.orderSessionId || payment.status !== 'APPROVED') {
    return { outcome: 'not-a-table-payment', overpaidCents: 0, withoutShift: false };
  }
  const sessionId = payment.orderSessionId;

  const result = await prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const before = await loadBill(tx, restaurantId, sessionId);
    const shift = await tx.cashSession.findFirst({ where: { restaurantId, status: 'OPEN' }, orderBy: { openedAt: 'asc' }, select: { id: true } });
    const marked = await tx.payment.updateMany({
      where: { id: payment.id, appliedToBillAt: null },
      data: { appliedToBillAt: new Date(), cashSessionId: shift?.id ?? null },
    });
    if (marked.count === 0) return { outcome: 'already-applied' as const, overpaidCents: 0, withoutShift: false, label: '', totalCents: 0 };
    const withoutShift = !shift;
    const label = before?.label ?? 'Mesa';

    if (!before || before.status === 'CLOSED' || before.status === 'CANCELLED') {
      return { outcome: 'bill-closed' as const, overpaidCents: onlinePaidCents(payment), withoutShift, label, totalCents: 0 };
    }

    await tx.orderSession.update({ where: { id: sessionId }, data: { payAtWaiterRequestedAt: null } });
    const after = (await loadBill(tx, restaurantId, sessionId))!;
    const overpaidCents = Math.max(0, after.paidCents - after.totalCents);
    if (after.remainingCents > 0) return { outcome: 'applied' as const, overpaidCents, withoutShift, label, totalCents: after.totalCents };

    const guard = await tx.orderSession.updateMany({
      where: { id: sessionId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
      data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: after.serviceCents, payAtWaiterRequestedAt: null },
    });
    return { outcome: guard.count === 1 ? ('closed' as const) : ('applied' as const), overpaidCents, withoutShift, label, totalCents: after.totalCents };
  });

  if (result.outcome === 'already-applied') return { outcome: result.outcome, overpaidCents: 0, withoutShift: false };

  if (result.outcome === 'closed') {
    try {
      const withCpf = await prisma.payment.findFirst({
        where: { restaurantId, orderSessionId: sessionId, appliedToBillAt: { not: null }, customerDocument: { not: null } },
        orderBy: { appliedToBillAt: 'desc' },
        select: { customerDocument: true },
      });
      const session = await prisma.orderSession.findUnique({ where: { id: sessionId }, select: { customerName: true } });
      await emitClosedBillFor(restaurantId, sessionId, withCpf?.customerDocument ?? null, session?.customerName ?? null);
    } catch (error) {
      // The note never fails the close: the fiscal alert of autoEmitNFCe covers a rejection
      console.error('[table-payment] NFC-e after an online close failed:', error);
    }
    await alertTablePaid(restaurantId, sessionId, result.label, result.totalCents);
  }
  if (result.overpaidCents > 0) await alertTableOverpaid(restaurantId, sessionId, result.label, result.overpaidCents, payment.id);
  if (result.withoutShift) await alertOnlineWithoutShift(restaurantId, sessionId, result.label, onlinePaidCents(payment), payment.id);

  return { outcome: result.outcome, overpaidCents: result.overpaidCents, withoutShift: result.withoutShift };
}
```

- [ ] **Step 5: Run the test**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/table-payment-apply.test.ts`
Expected: PASS (8 tests). In the "two at once" case, if the second call reads the bill before the first committed, the advisory lock (`lockComanda`) serializes them: the outcomes must be exactly one `applied` and one `closed`.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit -p .` (expected: no output)

```bash
git add lib/comanda/table-payment.ts lib/comanda/table-payment-alerts.ts __tests__/integration/vender/table-payment-apply.test.ts
git commit -m "Pay at the table: an approved online payment is applied once and closes the bill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Wire it to Mercado Pago confirmations; the table PIX charges what is left on the bill

**Files:**
- Modify: `lib/mercadopago-connect/payment-sync.ts` (end of `syncRestaurantPayment` and its self-healing branch)
- Modify: `lib/mercadopago-connect/pix-target.ts` (`resolveTable`)
- Modify: `lib/mercadopago-connect/pix-service.ts` (`newPaymentData`, `scopeFor`)
- Modify: `__tests__/integration/bad-day/table-tab-changes.test.ts` (S5-2 cases and the "paying the tab" todos)
- Test: `__tests__/integration/vender/table-payment-sync.test.ts`

**Interfaces:**
- Consumes: `applyTablePayment(restaurantId, paymentId)` (Task 3), `loadBill` (Task 2).
- Produces: `ResolvedPixTarget` for a table keeps `sessionId` and now its `amount` = the bill's `remainingCents / 100`; table PIX `Payment` rows carry `orderSessionId` and `tableShareMode: 'ALL'`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/table-payment-sync.test.ts
// @ts-nocheck
/** Pay at the table, stage 1: the table PIX charges what is left and its approval closes the bill */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));
jest.mock('../../../lib/mercadopago-connect/connection-service', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/connection-service'),
  getMpClientForRestaurant: jest.fn().mockResolvedValue({ fake: 'client' }),
}));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  cancelConnectPayment: jest.fn().mockResolvedValue({}),
  getConnectPayment: jest.fn(),
}));

import { createConnectPix, getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';
import { POST as pixRoute } from '../../../app/api/pagamentos/mp/pix/route';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
let mpSeq = 70_000;

describe('table PIX on the bill', () => {
  let rid: string, ownerId: string, recipeId: string, table: any, regId: string;
  const newBill = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: table.id, status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 2 } });
    return s.id;
  };
  const askPix = async () => {
    const res = await pixRoute(new Request('http://localhost/api/pagamentos/mp/pix', { method: 'POST', body: JSON.stringify({ qrToken: table.qrToken }) }) as any);
    return { status: res.status, body: await res.json() };
  };
  const settle = async (paymentId: string, amount: number) => {
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    getConnectPayment.mockResolvedValueOnce({ id: Number(p.gatewayPaymentId), status: 'approved', status_detail: 'accredited', external_reference: paymentId, transaction_amount: amount, fee_details: [] });
    return syncRestaurantPayment(rid, p.gatewayPaymentId);
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    ownerId = (await prisma.user.create({ data: { email: `ts-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `TS ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `S${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    table = await prisma.table.create({ data: { restaurantId: rid, number: 8, sectionId: sec.id, capacity: 4, qrToken: `ts${tag}` } });
    regId = (await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } })).id;
    await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: regId, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } });
  }, 60000);

  beforeEach(() => {
    jest.clearAllMocks();
    createConnectPix.mockImplementation(async () => {
      const id = ++mpSeq;
      return { id, status: 'pending', date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString(), point_of_interaction: { transaction_data: { qr_code: `qr-${id}`, qr_code_base64: 'b64', ticket_url: `https://mp/${id}` } } };
    });
  });

  afterAll(async () => {
    try { await prisma.notification.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.payment.deleteMany({ where: { restaurantId: rid } }); } catch {}
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('charges what is left on the bill (service charge included, minus what was paid) and links the comanda', async () => {
    const sid = await newBill();
    const shift = await prisma.cashSession.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 1_000, orderSessionId: sid, createdById: ownerId } });
    const pix = await askPix();
    expect(pix.status).toBe(200);
    expect(pix.body.amount).toBe(100);
    const row = await prisma.payment.findUnique({ where: { id: pix.body.paymentId } });
    expect(row).toMatchObject({ orderSessionId: sid, tableShareMode: 'ALL' });
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CANCELLED' } });
  });

  it('its approval closes the bill; a repeated notification changes nothing', async () => {
    const sid = await newBill();
    const pix = await askPix();
    expect((await settle(pix.body.paymentId, 110)).updated).toBe(true);
    expect((await loadBill(prisma, rid, sid))).toMatchObject({ status: 'CLOSED', paidCents: 11_000 });
    await settle(pix.body.paymentId, 110);
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(11_000);
  });

  it('self-heals: an APPROVED payment that was never applied is applied by the next notification', async () => {
    const sid = await newBill();
    const pix = await askPix();
    await prisma.payment.update({ where: { id: pix.body.paymentId }, data: { status: 'APPROVED', gatewayPaymentId: (await prisma.payment.findUnique({ where: { id: pix.body.paymentId } })).gatewayPaymentId } });
    expect((await loadBill(prisma, rid, sid)).paidCents).toBe(0);
    await settle(pix.body.paymentId, 110);
    expect((await loadBill(prisma, rid, sid)).status).toBe('CLOSED');
  });

  it('a table with nothing left to pay gets no PIX', async () => {
    const sid = await newBill();
    const shift = await prisma.cashSession.findFirst({ where: { restaurantId: rid, status: 'OPEN' } });
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shift.id, type: 'RECEIPT', method: 'CASH', amountCents: 11_000, orderSessionId: sid, createdById: ownerId } });
    const pix = await askPix();
    expect(pix.status).toBe(409);
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CANCELLED' } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/table-payment-sync.test.ts`
Expected: FAIL (amount 100 vs 110 expectations, `orderSessionId` null, bill not closed).

- [ ] **Step 3: `pix-target.ts` — the table amount is what is left on the bill**

In `resolveTable`, replace everything from `const session = await prisma.orderSession.findFirst(` to the final `return { ok: true, … }` with:

```ts
  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: OPEN_SESSION_STATUSES } },
    orderBy: { openedAt: 'desc' },
    select: { id: true },
  });
  if (!session) return { ok: false, status: 409, error: 'Nenhuma comanda aberta nesta mesa' };

  // What is left on the bill (spec 2026-10-10 §5.4): items with their paid modifiers, the service
  // charge, minus what the cash register and the table's online payments already hold.
  const bill = await loadBill(prisma, table.restaurantId, session.id);
  if (!bill || bill.items.length === 0) return { ok: false, status: 409, error: 'A comanda está vazia' };
  if (bill.remainingCents <= 0) return { ok: false, status: 409, error: 'Esta conta já está paga' };

  return {
    ok: true,
    target: {
      restaurantId: table.restaurantId,
      amount: bill.remainingCents / 100,
      description: `Mesa ${table.number}`,
      orderId: null,
      sessionId: session.id,
      metadata: { source: 'table', sessionId: session.id, tableId: table.id, tableNumber: table.number },
    },
  };
```

Add `import { loadBill } from '@/lib/comanda/bill-service';` and remove the now unused `lineTotalCents` import if nothing else in the file uses it (`grep -n lineTotalCents lib/mercadopago-connect/pix-target.ts`).

- [ ] **Step 4: `pix-service.ts` — table PIX rows are linked to the comanda**

In `newPaymentData`, add after `metadata: …`:

```ts
    // Pay at the table (spec 2026-10-10): the PIX of a table pays towards its comanda
    orderSessionId: target.sessionId ?? null,
    tableShareMode: target.sessionId ? 'ALL' : null,
```

Replace `scopeFor` with:

```ts
function scopeFor(target: ResolvedPixTarget) {
  return target.orderId ? { orderId: target.orderId } : { orderSessionId: target.sessionId };
}
```

- [ ] **Step 5: `payment-sync.ts` — apply on approval, self-heal**

Add the import: `import { applyTablePayment } from '@/lib/comanda/table-payment';`

Replace the self-healing `if` inside `if (!canTransition(payment.status, mapped)) {` with:

```ts
    if (mapped === 'APPROVED' && payment.status === 'APPROVED' && amountMatches) {
      if (payment.orderId) await applyLinkedRecords(restaurantId, payment, mp, 'APPROVED');
      // Pay at the table: an approval that never reached the bill (crash between the two writes) is applied now
      if (payment.orderSessionId && !payment.appliedToBillAt) await applyTablePaymentSafely(restaurantId, payment.id);
    }
```

Replace the last lines (from `// A table PIX is not linked to its comanda` to before `return { updated: true, status: mapped };`) with:

```ts
  if (approved && payment.orderSessionId) {
    // Pay at the table (spec 2026-10-10): the approval counts on the bill and may close it
    await applyTablePaymentSafely(restaurantId, payment.id);
  } else if (approved && !payment.orderId) {
    // A table PIX made before pay at the table (metadata only): check that it still adds up to the tab
    await reconcileTabPayment(restaurantId, payment);
  }
```

and add, above `syncRestaurantPayment`:

```ts
/** The bill write must never break the payment sync: a failure is reported and the next notification retries */
async function applyTablePaymentSafely(restaurantId: string, paymentId: string): Promise<void> {
  try {
    await applyTablePayment(restaurantId, paymentId);
  } catch (error) {
    console.error('[mp-connect] could not apply the table payment to its bill:', error);
    captureException(error instanceof Error ? error : new Error(String(error)), { endpoint: 'mp-connect/payment-sync', restaurantId, paymentId });
  }
}
```

- [ ] **Step 6: Run the new test**

Run: `npx jest --config jest.integration.config.js __tests__/integration/vender/table-payment-sync.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Update the bad-day suite to the new behaviour**

Run: `npx jest --config jest.integration.config.js __tests__/integration/bad-day/table-tab-changes.test.ts`. The S5-2 cases now go through `applyTablePayment` instead of `reconcileTabPayment`. Change them as follows (the `settle`, `tabAlerts` helpers stay; add `const tableAlerts = (kind) => prisma.notification.findMany({ where: { restaurantId: A.restaurantId, data: { path: ['kind'], equals: kind } } });` next to `alerts`):

1. `'a PIX paid for an OLD total raises ONE alert…'` → rename to `'a PIX paid for an OLD total counts on the bill and leaves the rest open (no alert: the rest is simply still to pay)'`; replace its three `raised` assertions with:

```ts
      const bill = await loadBill(prisma, A.restaurantId, session.id);
      expect(bill).toMatchObject({ paidCents: 3_000, remainingCents: 300 });
      expect(await tabAlerts()).toHaveLength(0);
```

2. `'a PIX that covers the tab exactly raises no alert'` → add after the existing assertions: `expect((await prisma.orderSession.findUnique({ where: { id: session.id } })).status).toBe('CLOSED');` then reopen the session for the next cases: `await prisma.orderSession.update({ where: { id: session.id }, data: { status: 'OPEN', closedAt: null } });`.

3. `'a PIX bigger than the tab … says how much is left over'` → replace its `raised` assertions with:

```ts
      const over = await tableAlerts('table-overpaid');
      expect(over).toHaveLength(1);
      expect(over[0].message).toContain('R$ 30,00');
      await prisma.orderSession.update({ where: { id: session.id }, data: { status: 'OPEN', closedAt: null } });
```

4. `'two approved PIX that together cover the tab raise no alert'` builds rows by hand with metadata only: add `orderSessionId: session.id` to the first row together with `appliedToBillAt: new Date()`, and `orderSessionId: session.id` to the second; then assert `expect(await tableAlerts('table-overpaid')).toHaveLength(0);` and reopen the session as in (2).

5. In `wipe`, add `await prisma.orderSession.update({ where: { id: session.id }, data: { status: 'OPEN', closedAt: null } }).catch(() => {});` so every case starts from an open tab.

6. Replace the two `it.todo` of `describe('paying the tab')` with a comment line: `// Covered by __tests__/integration/vender/table-payment-apply.test.ts and table-payment-sync.test.ts (pay at the table, 2026-10-10)`.

Add the import `import { loadBill } from '../../../lib/comanda/bill-service';` and mock the NFC-e like the other suites (`jest.mock('../../../lib/nfe/emit-session', () => ({ autoEmitNFCe: jest.fn().mockResolvedValue({ ok: true }) }));`). Run the suite again. Expected: PASS.

- [ ] **Step 8: Run every PIX and bill suite, type-check, commit**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-pix-route.test.ts __tests__/integration/bad-day __tests__/integration/vender`
Expected: PASS. In `mp-pix-route.test.ts` the table cases compute the tab from items; their sessions are not `serviceChargeEligible`, so amounts are unchanged. If one case fails only because the reuse lookup now uses `orderSessionId`, create its hand-made PENDING row with `orderSessionId` set as well.

Run: `npx tsc --noEmit -p .` (expected: no output)

```bash
git add lib/mercadopago-connect lib/comanda __tests__/integration
git commit -m "Pay at the table: the table PIX charges what is left and its approval closes the bill

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: The cash shift and the bill dialog show online payments as online

**Files:**
- Modify: `lib/caixa/sessions.ts` (`SessionView`, `getSessionView`)
- Modify: `app/caixa/page.tsx` (~line 104)
- Modify: `components/vender/conta-dialog.tsx` (~lines 200-213 and the `METHOD` map)
- Test: `__tests__/integration/caixa/sessions.test.ts` (new case)

**Interfaces:**
- Consumes: `Payment.cashSessionId` (Task 1), `BillPayment.online` (Task 2).
- Produces: `SessionView.tableOnline: { pixCents: number; cardCents: number }`.

- [ ] **Step 1: Write the failing test** — append to `__tests__/integration/caixa/sessions.test.ts`, inside `describe('cash shift service')` (it already has `owner`, `register` and `openSession`; its `beforeEach` deletes the shifts):

```ts
  it('lists the table online payments of the shift apart from the drawer', async () => {
    const { session } = await openSession(owner, { cashRegisterId: register.id, openingFloat: 0 });
    const base = { restaurantId: A.restaurantId, gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', cashSessionId: session.id, appliedToBillAt: new Date() };
    await prisma.payment.create({ data: { ...base, amount: 25, method: 'PIX' } });
    await prisma.payment.create({ data: { ...base, amount: 40, method: 'CARD' } });
    await prisma.payment.create({ data: { ...base, amount: 10, method: 'PIX', status: 'REFUNDED', amountRefunded: 10 } });
    const view = await getSessionView(owner, session.id);
    expect(view.tableOnline).toEqual({ pixCents: 2_500, cardCents: 4_000 });
    expect(view.expected.pix).toBe(0); // never in the drawer
    await prisma.payment.deleteMany({ where: { cashSessionId: session.id } });
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/caixa/sessions.test.ts`
Expected: FAIL (`tableOnline` undefined).

- [ ] **Step 3: Implement in `lib/caixa/sessions.ts`**

Add to `SessionView`: `tableOnline: { pixCents: number; cardCents: number };`

Add the helper next to `onlineDuring`:

```ts
/** Pay at the table (spec 2026-10-10 §5.2): online payments applied to bills while this shift was open. Never in the drawer. */
async function tableOnlineOf(restaurantId: string, cashSessionId: string) {
  const rows = await prisma.payment.findMany({
    where: { restaurantId, cashSessionId, appliedToBillAt: { not: null } },
    select: { method: true, amount: true, amountRefunded: true, status: true },
  });
  let pixCents = 0;
  let cardCents = 0;
  for (const p of rows) {
    const cents = onlinePaidCents(p);
    if (p.method === 'PIX') pixCents += cents; else cardCents += cents;
  }
  return { pixCents, cardCents };
}
```

with `import { onlinePaidCents } from '@/lib/comanda/bill';`, and in the object returned by `getSessionView`, after `online: …`:

```ts
    tableOnline: await tableOnlineOf(member.restaurantId, session.id),
```

Run the test. Expected: PASS.

- [ ] **Step 4: Show it on `/caixa`** — in `app/caixa/page.tsx`, right after the paragraph at ~line 104 (`Recebido online no período…`):

```tsx
            {(view.tableOnline.pixCents > 0 || view.tableOnline.cardCents > 0) && (
              <p className="text-xs text-gray-500">
                Pago na mesa pelo celular (fora da gaveta): PIX online {(view.tableOnline.pixCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · Cartão online {(view.tableOnline.cardCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            )}
```

If the page's `view` type is declared locally, add `tableOnline: { pixCents: number; cardCents: number }` to it.

- [ ] **Step 5: Bill dialog labels and no cash refund on online payments** — in `components/vender/conta-dialog.tsx`:

1. Find the `METHOD` map (`grep -n "const METHOD" components/vender/conta-dialog.tsx`) and add the two entries: `PIX_ONLINE: 'PIX online', CARD_ONLINE: 'Cartão online',`.
2. Change the refund button condition from `{manager && !closed && !p.refunded && (` to `{manager && !closed && !p.refunded && !p.online && (` — an online payment is refunded through Mercado Pago in Pagamentos, never from the drawer.
3. If the bill type in this file is declared locally, add `online?: boolean` to its payment type.

- [ ] **Step 6: Unit + integration + type-check**

Run: `npx tsc --noEmit -p .` (expected: no output), `npx jest --config jest.unit.config.js` (expected: all PASS), `npx jest --config jest.integration.config.js __tests__/integration/caixa __tests__/integration/vender` (expected: PASS).

- [ ] **Step 7: Commit**

```bash
git add lib/caixa/sessions.ts app/caixa/page.tsx components/vender/conta-dialog.tsx __tests__/integration/caixa/sessions.test.ts
git commit -m "Pay at the table: the shift and the bill show online payments apart from the drawer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Full verification, publish, deploy and validate

**Files:** none new.

- [ ] **Step 1: Whole suites**

Run: `npx tsc --noEmit -p .`, `npx jest --config jest.unit.config.js`, `npx jest --config jest.integration.config.js __tests__/integration/vender __tests__/integration/caixa __tests__/integration/bad-day __tests__/integration/api/mp-pix-route.test.ts __tests__/integration/staff`
Expected: tsc silent; all listed suites PASS. These are not the 9 legacy suites known to fail on `main` since the initial commit (api/stock, orders, financial, db/*, multi-tenant/*, external/delivery, mp-webhook-connect): if one of those is run and fails, it is pre-existing, not this work.

- [ ] **Step 2: Publish**

```bash
GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes" git push origin HEAD:main
```

- [ ] **Step 3: Owner deploys (homolog first, then app)** — tell the owner, in this order: Easypanel `homolog` → Deploy → Console `npx prisma migrate deploy`; check; then `app` → Deploy → Console `npx prisma migrate deploy`. Until the migration runs, every bill read fails (the new columns are queried), so the console command must follow the deploy immediately, at a quiet hour.

- [ ] **Step 4: Homolog check (browser)** — on `https://homolog.gastrux.com` with the test restaurant: open a table with one item, open the bill dialog (Vender) and confirm it loads and shows "Falta" correctly; open `/caixa` and confirm the page loads. PIX itself is not testable in homolog (Mercado Pago test accounts, 2026-10-04).

- [ ] **Step 5: Production validation with real money** — on the owner's production test restaurant (Business plan, Mercado Pago connected, caixa open): table with one R$ 1,00 item and the service charge waived by staff; scan the table QR, "pagar a conta" by PIX (R$ 1,00); confirm within ~10 s: bill CLOSED, table free on the map, bell alert "Mesa N paga pelo celular", `/caixa` shows "PIX online R$ 1,00" outside the drawer, NFC-e only if the restaurant has production fiscal on. Then refund the R$ 1,00 with **Estornar** in `/dashboard/pagamentos`.

- [ ] **Step 6: Update the manual and memory** — in the Gastrux manual (Claude Doc `e47fd4d1-0a3f-4e2b-a96d-86475da2833e`), section 9 "Funcionalidades", add one line under Pagamentos: "PIX pago na mesa pelo QR conta na conta da mesa e fecha a conta sozinha (etapa 1 do pagamento na mesa, 2026-10-10)". Record the stage as done in the project memory.
```
