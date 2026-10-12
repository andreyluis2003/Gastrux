# Pagamento na mesa, etapa 3: cartão e "pagar com o garçom" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the table's bill screen (stage 2), a person can pay their part by card through Mercado Pago Checkout Pro and come back to the bill, or tap "Pagar com o garçom", which alerts the staff in the bell.

**Architecture:** The card part reuses the delivery card checkout: the code of `app/api/pagamentos/mp/delivery-checkout/route.ts` that claims the Payment row and creates the preference moves to `lib/mercadopago-connect/card-checkout.ts`, used by both the delivery route and the table pay route (`method: 'CARD'`). The card claim learns the table target the way the PIX claim did in stage 2: one live checkout per phone (payerKey in `Payment.metadata`) and per part, linked to the comanda (`orderSessionId`), so stage 1's `applyTablePayment` applies it like a PIX. Mercado Pago sends the customer back to `/menu/<qrToken>?payment=<id>`; the bill screen polls the existing status route with Mercado Pago's id as a hint. "Pagar com o garçom" is a public route that stamps `OrderSession.payAtWaiterRequestedAt` (exists since stage 1, cleared when a payment is applied or the bill closes) and creates a restaurant-wide bell alert, at most once a minute per table. No migration.

**Tech Stack:** Next.js 14 (app router), Prisma 6 + PostgreSQL, Jest (unit: `jest.unit.config.js`; integration: `jest.integration.config.js` on 127.0.0.1:55432).

**Spec:** `docs/superpowers/specs/2026-10-10-pagamento-na-mesa-design.md` §5.1 item 3, §5.2 (bell alerts), §5.4 ("Pagar com o garçom"), §7 stage 3. Owner change 2026-10-12: Pro, Business and Enterprise.

## Global Constraints

- The browser never decides amount, restaurant or comanda: same as stage 2, the part comes from `shareCents` on the server.
- Card = Mercado Pago Checkout Pro with the RESTAURANT's own token (no platform fallback); excluded payment types for the table: `ticket`, `atm`, `bank_transfer` (PIX has its own button).
- The checkout link lives 30 minutes (`CARD_LINK_VALIDITY_MS`); a pending card checkout of the same phone and same part is reused within 25 minutes (`CARD_REUSE_WINDOW_MS`).
- Whether a card payment was approved is only ever answered by our status route (`/api/pagamentos/mp/pix/status?paymentId=&mpPaymentId=`), never by the query string Mercado Pago appends.
- "Pagar com o garçom": at most one alert per table per minute; the alert uses `NotificationType.PAYMENT_PENDING`, restaurant-wide (`userId` null), action `/vender`.
- Copy in pt-BR; code, comments and commits in English; commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; publish with `git push origin HEAD:main` (`GIT_SSH_COMMAND="ssh -i ~/.ssh/gastrux_github_deploy -o IdentitiesOnly=yes"`), from `C:\Users\andre\gastrux-fix-delivery`, branch `feat/pay-at-table-stage3`.
- Integration suites run per folder with `--runInBand` (they interfere when run together).
- No migration.

## Review Focus

1. **Two phones choose "Cartão" for the same equal part** — each gets its own checkout link; never the other phone's (the delivery claim reuses by order and amount only). Pinned in Task 1 (`two phones, same card part`).
2. **The customer comes back from Mercado Pago before the webhook** — the screen must show "Confirmando..." and then "Pagamento confirmado", using Mercado Pago's `payment_id` from the URL as the hint; a `result=failure` return must say the card was not charged and keep the bill. Pinned in Task 2 (unit test of the return parser) and the homolog/prod check of Task 4.
3. **The delivery card checkout keeps working** after its code moves to the shared module. Pinned in Task 1 by running the existing delivery checkout tests unchanged.
4. **"Pagar com o garçom" tapped many times** — one alert per minute, the field stamped, nothing else changes. Pinned in Task 3 (`at most one alert a minute`).
5. **A card payment approved for a bill already closed** (someone paid the rest by PIX meanwhile) — kept, applied as overpaid with the manager alert, exactly like a PIX (stage 1 rule). Pinned in Task 1 (`card applies like a PIX`).

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/mercadopago-connect/card-claim.ts` | Claim key and scope for a table part per phone (Task 1) |
| `lib/mercadopago-connect/card-checkout.ts` (new) | Claim + preference + transaction row, shared by delivery and table (Task 1) |
| `app/api/pagamentos/mp/delivery-checkout/route.ts` | Uses `createCardCheckout` (Task 1) |
| `app/api/public/table/[qrToken]/pay/route.ts` | `method: 'CARD'` (Task 1) |
| `lib/menu/card-return.ts` (new) | Reads `?payment=&payment_id=&result=` of the return (Task 2) |
| `components/menu/table-bill.tsx`, `app/menu/[qrToken]/page.tsx` | Pix / Cartão choice, card return, "Pagar com o garçom" (Tasks 2, 3) |
| `app/api/public/table/[qrToken]/call-waiter/route.ts` (new), `lib/comanda/table-payment-alerts.ts` | Call the waiter + bell alert (Task 3) |

---

### Task 1: Card checkout for one part, per phone

**Files:**
- Modify: `lib/mercadopago-connect/card-claim.ts`
- Create: `lib/mercadopago-connect/card-checkout.ts`
- Modify: `app/api/pagamentos/mp/delivery-checkout/route.ts`
- Modify: `app/api/public/table/[qrToken]/pay/route.ts`
- Test: `__tests__/integration/api/public-table-card.test.ts` (new); existing `__tests__/integration/api/mp-delivery-checkout.test.ts`, `__tests__/unit/mp-delivery-checkout-route.test.ts` must stay green unchanged.

**Interfaces:**
- Consumes: `resolvePixTarget({ qrToken, share })` and `ResolvedPixTarget` (stage 2: `payerKey`, `shareMode`, `customerDocument`, `sessionId`); `applyTablePayment(restaurantId, paymentId)` (stage 1).
- Produces:
  - `createCardCheckout(input: { target: ResolvedPixTarget; payer: { email: string; name?: string }; backUrl: (paymentId: string, result: 'success' | 'failure' | 'pending') => string; itemId: string; excludedPaymentTypes: string[] }): Promise<{ ok: true; paymentId: string; initPoint: string } | { ok: false; status: number; error: string; code?: string }>`
  - `resolveBaseUrl(): string | null` (moved from the delivery route, exported from `card-checkout.ts`).
  - `POST /api/public/table/[qrToken]/pay` with `method: 'CARD'` → `200 { success: true, paymentId, initPoint, amount, sessionId }`.

- [ ] **Step 1: Write the failing test**

`__tests__/integration/api/public-table-card.test.ts`:

```ts
// @ts-nocheck
/** Pay at the table, stage 3: one card checkout per phone and per part (spec 2026-10-10 §5.1 item 3) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
}));
const fakeProvider = { name: 'fake', emitNFCe: jest.fn(async () => ({ ok: true, status: 'authorized' })), emitNFe: jest.fn(), getStatus: jest.fn(), cancelNFCe: jest.fn() };
jest.mock('../../../lib/nfe/provider', () => ({ getProvider: jest.fn(() => fakeProvider) }));

import { createCheckoutPreference } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { applyTablePayment } from '../../../lib/comanda/table-payment';
import { POST as postPay } from '../../../app/api/public/table/[qrToken]/pay/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PHONE_A = 'phoneAAAAAAAAAAAAAAAA';
const PHONE_B = 'phoneBBBBBBBBBBBBBBBB';

describe('table card checkout', () => {
  let A, table, session, burger;
  const tag = crypto.randomBytes(3).toString('hex');
  let pref = 0;
  const savedUrl = process.env.NEXTAUTH_URL;

  const pay = async (body) => {
    const res = await postPay(new Request(`https://x/api/public/table/${table.qrToken}/pay`, { method: 'POST', body: JSON.stringify(body) }) as any, { params: { qrToken: table.qrToken } });
    return { status: res.status, body: await res.json() };
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    A = (await createMultiRestaurantScenario()).restaurantA;
    await saveConnection(A.restaurantId, TOKENS);
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `Salão ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 6, sectionId: section.id, capacity: 4, qrToken: `card-${tag}-qrtoken01` } });
    burger = await prisma.recipe.create({ data: { restaurantId: A.restaurantId, code: `R-${tag}`, name: `Burger ${tag}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' } });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    createCheckoutPreference.mockImplementation(async () => { pref++; return { id: `pref-${pref}`, init_point: `https://mp/checkout/${pref}`, sandbox_init_point: null }; });
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: A.restaurantId } } });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    session = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 6, status: 'OPEN', serviceChargeWaived: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: burger.id, price: 30, quantity: 2 } });
  });

  afterAll(async () => {
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: A.restaurantId } } });
    await prisma.payment.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
    process.env.NEXTAUTH_URL = savedUrl;
  });

  it('a card part makes a checkout of that part, linked to the comanda, coming back to the table menu', async () => {
    const r = await pay({ method: 'CARD', mode: 'EQUAL', people: 2, cpf: '529.982.247-25', payerKey: PHONE_A });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, initPoint: 'https://mp/checkout/' + pref, amount: 30, sessionId: session.id });
    const row = await prisma.payment.findUnique({ where: { id: r.body.paymentId } });
    expect(row).toMatchObject({ method: 'MERCADO_PAGO', status: 'PENDING', orderSessionId: session.id, tableShareMode: 'EQUAL:2', customerDocument: '52998224725' });
    expect(Number(row.amount)).toBe(30);
    const input = createCheckoutPreference.mock.calls[0][0];
    expect(input.externalReference).toBe(row.id);
    expect(input.backUrls.success).toBe(`https://gastrux.test/menu/${table.qrToken}?payment=${row.id}&result=success`);
    expect(input.excludedPaymentTypes).toEqual(['ticket', 'atm', 'bank_transfer']);
    expect(input.items[0].unitPrice).toBe(30);
  });

  it('two phones, same card part: each gets its own checkout; the same phone gets its own link back', async () => {
    const [a, b] = await Promise.all([
      pay({ method: 'CARD', mode: 'EQUAL', people: 2, payerKey: PHONE_A }),
      pay({ method: 'CARD', mode: 'EQUAL', people: 2, payerKey: PHONE_B }),
    ]);
    expect(a.body.paymentId).not.toBe(b.body.paymentId);
    expect(a.body.initPoint).not.toBe(b.body.initPoint);
    const again = await pay({ method: 'CARD', mode: 'EQUAL', people: 2, payerKey: PHONE_A });
    expect(again.body.paymentId).toBe(a.body.paymentId);
    expect(createCheckoutPreference).toHaveBeenCalledTimes(2);
  });

  it('card applies like a PIX: approved, it counts on the bill and the last part closes it', async () => {
    const a = await pay({ method: 'CARD', mode: 'AMOUNT', amountCents: 2000, payerKey: PHONE_A });
    await prisma.payment.update({ where: { id: a.body.paymentId }, data: { status: 'APPROVED' } });
    expect((await applyTablePayment(A.restaurantId, a.body.paymentId)).outcome).toBe('applied');
    const b = await pay({ method: 'CARD', mode: 'ALL', payerKey: PHONE_B });
    expect(b.body.amount).toBe(40);
    await prisma.payment.update({ where: { id: b.body.paymentId }, data: { status: 'APPROVED' } });
    expect((await applyTablePayment(A.restaurantId, b.body.paymentId)).outcome).toBe('closed');
  });

  it('refuses an unknown method', async () => {
    expect((await pay({ method: 'BOLETO', mode: 'ALL', payerKey: PHONE_A })).status).toBe(422);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api/public-table-card.test.ts`
Expected: FAIL (`method: 'CARD'` ignored: a PIX is created, `createCheckoutPreference` never called).

- [ ] **Step 3: Generalize the card claim (`lib/mercadopago-connect/card-claim.ts`)**

Replace `cardLockKey` and the `existing` lookup scope and the created row so a table target works per phone:

```ts
export function cardLockKey(target: ResolvedPixTarget): string {
  // A table part (stage 3) is claimed per comanda: the phones of one table queue on the same lock
  return target.orderId ? `card:${target.restaurantId}:order:${target.orderId}` : `card:${target.restaurantId}:session:${target.sessionId}`;
}

/** Same payer as this target: the order, or the phone at the table (payerKey checked by isValidPayerKey: no LIKE wildcards) */
function cardScope(target: ResolvedPixTarget) {
  if (target.orderId) return { orderId: target.orderId };
  return { orderSessionId: target.sessionId, metadata: { contains: `"payerKey":"${target.payerKey}"` } };
}
```

In `claimCardPayment`, in the `findFirst` replace `orderId: target.orderId,` with `...cardScope(target),`, and in `payment.create` data replace `orderId: target.orderId,` and the `metadata` line with:

```ts
        orderId: target.orderId,
        // Pay at the table (stage 3): the card part pays towards its comanda, like the table PIX
        orderSessionId: target.sessionId ?? null,
        tableShareMode: target.sessionId ? (target.shareMode ?? 'ALL') : null,
        customerDocument: target.customerDocument ?? null,
        metadata: JSON.stringify({ ...target.metadata, source: target.sessionId ? 'table-card' : 'delivery-card' }),
```

A table target without `payerKey` must never reach the claim: `createCardCheckout` refuses it (Step 4).

- [ ] **Step 4: Create `lib/mercadopago-connect/card-checkout.ts`**

Move from `app/api/pagamentos/mp/delivery-checkout/route.ts` into this module, unchanged in behaviour: `resolveBaseUrl()`, the claim (`claimCardPayment`), the preference creation with its error handling (definite rejection → CANCELLED, unauthorized → `markNeedsReconnect` + `ONLINE_PAYMENT_UNAVAILABLE`, else `MP_FAILED_STATUS`), and the `mercadoPagoTransaction.create` after it. Signature:

```ts
export async function createCardCheckout(input: {
  target: ResolvedPixTarget;
  payer: { email: string; name?: string };
  backUrl: (paymentId: string, result: 'success' | 'failure' | 'pending') => string;
  itemId: string;
  excludedPaymentTypes: string[];
}): Promise<{ ok: true; paymentId: string; initPoint: string } | { ok: false; status: number; error: string; code?: string }>
```

Body, in order: `if (target.sessionId && !target.payerKey) return { ok: false, status: 422, error: 'Recarregue a página e tente de novo.' }`; `getMpClientForRestaurant` (none → 409 `ONLINE_PAYMENT_UNAVAILABLE`); `claimCardPayment` (`in-progress` → 409 `CHECKOUT_IN_PROGRESS`, `reuse` → ok with its link); `createCheckoutPreference({ orderId: target.orderId ?? undefined, items: [{ id: itemId, title: target.description, quantity: 1, unitPrice: target.amount }], payer, backUrls: { success: backUrl(id,'success'), failure: backUrl(id,'failure'), pending: backUrl(id,'pending') }, notificationUrl: notificationUrlFor(target.restaurantId), externalReference: payment.id, autoReturn: 'approved', excludedPaymentTypes, expires: true, expirationDateFrom: toMpDate(new Date(Date.now() - 60_000)), expirationDateTo: toMpDate(new Date(Date.now() + CARD_LINK_VALIDITY_MS)) }, client)`; the transaction row; return `{ ok: true, paymentId: payment.id, initPoint: preference.init_point }`. Keep every comment of the delivery route that explains a rule, next to the rule.

`app/api/pagamentos/mp/delivery-checkout/route.ts` keeps its own checks (order exists, `paymentMethod === 'ONLINE_CARD'`, base URL) and then:

```ts
    const out = await createCardCheckout({
      target,
      payer,
      backUrl: (id, result) => `${base}/delivery/${target.restaurantId}?payment=${id}&n=${encodeURIComponent(order.orderNumber)}&result=${result}`,
      itemId: order.orderNumber,
      excludedPaymentTypes: EXCLUDED_PAYMENT_TYPES,
    });
    if (!out.ok) return NextResponse.json({ error: out.error, ...(out.code ? { code: out.code } : {}) }, { status: out.status });
    return NextResponse.json({ success: true, paymentId: out.paymentId, initPoint: out.initPoint });
```

Run the delivery tests now: `npx jest -c jest.unit.config.js __tests__/unit/mp-delivery-checkout-route.test.ts` and `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api/mp-delivery-checkout.test.ts` — Expected: PASS unchanged (if the unit test mocks modules by path, point its mocks at the modules the route now imports through `card-checkout.ts`, without changing any assertion; ledger it).

- [ ] **Step 5: `method: 'CARD'` in `app/api/public/table/[qrToken]/pay/route.ts`**

After `resolved` (and before the PIX call):

```ts
    const method = body?.method ?? 'PIX';
    if (method !== 'PIX' && method !== 'CARD') return NextResponse.json({ error: 'Escolha Pix ou cartão.' }, { status: 422 });
    if (method === 'CARD') {
      const base = resolveBaseUrl();
      if (!base) return NextResponse.json({ error: 'Pagamento com cartão indisponível no momento. Use o Pix ou pague com o garçom.' }, { status: 500 });
      const out = await createCardCheckout({
        target: resolved.target,
        payer: normalizePayer({ payerName: body?.payerName }),
        // Back to this table's menu, which reopens the bill and confirms the payment (lib/menu/card-return.ts)
        backUrl: (id, result) => `${base}/menu/${params.qrToken}?payment=${id}&result=${result}`,
        itemId: `mesa-${resolved.target.sessionId}`,
        // PIX has its own button; boleto and bank slips take days
        excludedPaymentTypes: ['ticket', 'atm', 'bank_transfer'],
      });
      if (!out.ok) return NextResponse.json({ error: out.error, code: out.code }, { status: out.status });
      return NextResponse.json({ success: true, paymentId: out.paymentId, initPoint: out.initPoint, amount: resolved.target.amount, sessionId: resolved.target.sessionId });
    }
```

Move the `method` check above `resolvePixTarget` so an unknown method is refused before any read; keep the CARD branch after it.

- [ ] **Step 6: Run the tests**

Run: `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api` and `npx jest -c jest.unit.config.js` — Expected: PASS. `npx tsc --noEmit -p .` — no output.

- [ ] **Step 7: Commit**

```bash
git add lib/mercadopago-connect/card-claim.ts lib/mercadopago-connect/card-checkout.ts app/api/pagamentos/mp/delivery-checkout/route.ts "app/api/public/table/[qrToken]/pay/route.ts" __tests__/integration/api/public-table-card.test.ts
git commit -m "Pay at the table: card checkout for one part, per phone

The delivery card checkout moves to lib/mercadopago-connect/card-checkout.ts
and the table pay route uses it for method CARD: one Checkout Pro link per
phone and per part, linked to the comanda so stage 1 applies it like a PIX,
coming back to the table menu.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pix or card on the bill screen, and the way back from Mercado Pago

**Files:**
- Create: `lib/menu/card-return.ts`
- Test: `__tests__/unit/menu-card-return.test.ts`
- Modify: `components/menu/table-bill.tsx`, `app/menu/[qrToken]/page.tsx`

**Interfaces:**
- Consumes: Task 1's `POST .../pay` with `method: 'CARD'` → `{ initPoint }`; `statusPollUrl(paymentId, mpPaymentId)` from `lib/delivery-payments/return-params.ts`.
- Produces: `readTableCardReturn(search: string): { paymentId: string; mpPaymentId: string | null; failed: boolean } | null`; `<TableBill qrToken onClose returning?: { paymentId: string; mpPaymentId: string | null; failed: boolean } />`.

- [ ] **Step 1: Write the failing test** `__tests__/unit/menu-card-return.test.ts`:

```ts
import { readTableCardReturn } from '@/lib/menu/card-return';

describe('coming back to the table from the card checkout', () => {
  it('reads our payment id and Mercado Pago\'s id (digits only) from the URL', () => {
    expect(readTableCardReturn('?payment=cmabc&result=success&payment_id=1827405&collection_id=1827405'))
      .toEqual({ paymentId: 'cmabc', mpPaymentId: '1827405', failed: false });
  });
  it('a failure return is a failure; approval is never read from the URL', () => {
    expect(readTableCardReturn('?payment=cmabc&result=failure')).toEqual({ paymentId: 'cmabc', mpPaymentId: null, failed: true });
    expect(readTableCardReturn('?payment=cmabc&result=success&status=approved')).toMatchObject({ failed: false });
  });
  it('ignores what is not a return, and a Mercado Pago id that is not digits', () => {
    expect(readTableCardReturn('')).toBeNull();
    expect(readTableCardReturn('?payment_id=123')).toBeNull();
    expect(readTableCardReturn('?payment=cmabc&payment_id=12a')).toMatchObject({ mpPaymentId: null });
  });
});
```

- [ ] **Step 2: Run it** — `npx jest -c jest.unit.config.js __tests__/unit/menu-card-return.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `lib/menu/card-return.ts`**

```ts
/**
 * What the table menu needs from the URL the customer lands on after the card checkout (stage 3). Pure.
 * Only ?payment (our Payment id) identifies the payment; Mercado Pago's payment_id / collection_id is a hint
 * for our status route. Approval is never read from the URL: only `result=failure` is shown as such.
 */
const DIGITS = /^[0-9]{1,20}$/;

export function readTableCardReturn(search: string): { paymentId: string; mpPaymentId: string | null; failed: boolean } | null {
  const q = new URLSearchParams(search);
  const paymentId = q.get('payment');
  if (!paymentId) return null;
  const mp = q.get('payment_id') || q.get('collection_id');
  return { paymentId, mpPaymentId: mp && DIGITS.test(mp) ? mp : null, failed: q.get('result') === 'failure' };
}
```

- [ ] **Step 4: Run it** — Expected: PASS.

- [ ] **Step 5: The screen** (`components/menu/table-bill.tsx`)

1. New prop `returning?: { paymentId: string; mpPaymentId: string | null; failed: boolean }` and state `method: 'PIX' | 'CARD'` (default `'PIX'`), `checkingCard: { paymentId: string; mpPaymentId: string | null } | null`.
2. On mount, when `returning` is set: if `failed`, `toast.error('O pagamento com cartão não foi concluído. Nada foi cobrado.')`; else `setCheckingCard(returning)`.
3. While `checkingCard` is set, poll `statusPollUrl(checkingCard.paymentId, checkingCard.mpPaymentId)` (import from `@/lib/delivery-payments/return-params`) every 4 s for up to 2 minutes; on `approved`: `toast.success('Pagamento com cartão confirmado.')`, clear `checkingCard`, `load()` (the bill shows "Já pago" and what is left, or "Conta paga"). The amount is not shown in a banner: the page came back from Mercado Pago and no longer holds it. While checking, render above the bill a status line: `<Loader2 className="h-4 w-4 animate-spin" /> Confirmando o pagamento com cartão...`. After 2 minutes without approval: clear it and show `'Ainda não recebemos a confirmação do cartão. Se o valor foi cobrado, ele aparece na conta em instantes.'`.
4. Above "Pagar ..." add the choice: two buttons `Pix` / `Cartão` (`variant={method === m ? 'default' : 'outline'}`), and the pay button label becomes `Pagar ${reais(cents)} com ${method === 'PIX' ? 'Pix' : 'cartão'}`.
5. `payPix` becomes `pay()`: sends `method` in the body; for `'CARD'`, on success `window.location.href = data.initPoint` (keep `busy` true: the page leaves); for `'PIX'` the stage 2 flow is unchanged.

`app/menu/[qrToken]/page.tsx`: on mount read `readTableCardReturn(window.location.search)`; when it returns something, open the bill with it (`setShowBill(true)` and pass `returning`), then `window.history.replaceState(null, '', window.location.pathname)` so a reload does not repeat it.

- [ ] **Step 6: Check** — `npx tsc --noEmit -p .` (no output); `npx jest -c jest.unit.config.js` (all pass).

- [ ] **Step 7: Commit**

```bash
git add lib/menu/card-return.ts __tests__/unit/menu-card-return.test.ts components/menu/table-bill.tsx "app/menu/[qrToken]/page.tsx"
git commit -m "Pay at the table: Pix or card on the bill, and the way back from Mercado Pago

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: "Pagar com o garçom"

**Files:**
- Create: `app/api/public/table/[qrToken]/call-waiter/route.ts`
- Modify: `lib/comanda/table-payment-alerts.ts` (new `alertTableCallsWaiter`; the `type` mapping gives it `PAYMENT_PENDING`)
- Modify: `components/menu/table-bill.tsx` (button + confirmation)
- Test: `__tests__/integration/api/public-table-call-waiter.test.ts`

**Interfaces:**
- Produces: `POST /api/public/table/[qrToken]/call-waiter` → `200 { called: true }` or `200 { called: false, alreadyCalled: true }` (within a minute); `404` unknown table; `403` plan without pay at the table; `409` no open comanda. `alertTableCallsWaiter(restaurantId, sessionId, label, at: Date)`.

- [ ] **Step 1: Write the failing test** `__tests__/integration/api/public-table-call-waiter.test.ts`:

```ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST as callWaiter } from '../../../app/api/public/table/[qrToken]/call-waiter/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('pagar com o garçom', () => {
  let A, table, session;
  const tag = crypto.randomBytes(3).toString('hex');
  const call = async (qrToken = table.qrToken) => {
    const res = await callWaiter(new Request(`https://x/api/public/table/${qrToken}/call-waiter`, { method: 'POST' }) as any, { params: { qrToken } });
    return { status: res.status, body: await res.json() };
  };
  const alerts = () => prisma.notification.findMany({ where: { restaurantId: A.restaurantId, data: { path: ['kind'], equals: 'table-call-waiter' } } });

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = process.env.CREDENTIALS_ENCRYPTION_KEY || crypto.randomBytes(32).toString('base64');
    A = (await createMultiRestaurantScenario()).restaurantA;
    await saveConnection(A.restaurantId, TOKENS);
    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: `S ${tag}`, capacity: 20 } });
    table = await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 8, sectionId: section.id, capacity: 4, qrToken: `wait-${tag}-qrtoken01` } });
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    session = await prisma.orderSession.create({ data: { restaurantId: A.restaurantId, userId: A.ownerId, tableId: table.id, tableNumber: 8, status: 'OPEN' } });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: A.restaurantId } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });
    await cleanupMultiTenantData([A.restaurantId]);
  });

  it('stamps the comanda and tells the staff in the bell', async () => {
    expect(await call()).toEqual({ status: 200, body: { called: true } });
    expect((await prisma.orderSession.findUnique({ where: { id: session.id } })).payAtWaiterRequestedAt).not.toBeNull();
    const [a] = await alerts();
    expect(a).toMatchObject({ type: 'PAYMENT_PENDING', userId: null, title: 'Mesa 8 quer pagar com o garçom', actionUrl: '/vender' });
  });

  it('at most one alert a minute, however many taps', async () => {
    await Promise.all([call(), call(), call()]);
    expect(await call()).toMatchObject({ body: { called: false, alreadyCalled: true } });
    expect(await alerts()).toHaveLength(1);
    await prisma.orderSession.update({ where: { id: session.id }, data: { payAtWaiterRequestedAt: new Date(Date.now() - 61_000) } });
    expect((await call()).body.called).toBe(true);
    expect(await alerts()).toHaveLength(2);
  });

  it('refuses what it must', async () => {
    expect((await call('nao-existe-0123456789')).status).toBe(404);
    await prisma.orderSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: new Date() } });
    expect((await call()).status).toBe(409);
    await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'starter' } });
    try {
      expect((await call()).status).toBe(403);
    } finally {
      await prisma.restaurant.update({ where: { id: A.restaurantId }, data: { subscriptionTier: 'business' } });
    }
  });
});
```

- [ ] **Step 2: Run it** — `npx jest -c jest.integration.config.js --runInBand __tests__/integration/api/public-table-call-waiter.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Alert** — in `lib/comanda/table-payment-alerts.ts`, in `notify` change the type to `type: kind === 'table-paid' ? 'PAYMENT_RECEIVED' : kind === 'table-call-waiter' ? 'PAYMENT_PENDING' : 'SYSTEM_ERROR'`, and add:

```ts
/** "Pagar com o garçom" (spec 2026-10-10 §5.4): one alert per call; the route lets one through a minute */
export function alertTableCallsWaiter(restaurantId: string, sessionId: string, label: string, at: Date) {
  return notify(restaurantId, 'table-call-waiter', `table-call-waiter:${sessionId}:${at.getTime()}`, `${label} quer pagar com o garçom`,
    `${label} pediu para pagar com o garçom. Leve a maquininha ou a conta até a mesa.`, 'MEDIUM', { orderSessionId: sessionId });
}
```

- [ ] **Step 4: Route** `app/api/public/table/[qrToken]/call-waiter/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sessionLabel } from '@/lib/vender/rules';
import { alertTableCallsWaiter } from '@/lib/comanda/table-payment-alerts';
import { TABLE_PAYMENT_UNAVAILABLE, tablePaymentPlanAllows } from '@/lib/mercadopago-connect/table-payment-access';

export const dynamic = 'force-dynamic';

const OPEN = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;
const ONE_MINUTE_MS = 60_000;

/**
 * POST: the table asks to pay with the waiter (spec 2026-10-10 §5.4). Stamps the comanda (cleared by a payment
 * or when the bill closes, lib/comanda/table-payment.ts) and alerts the staff, at most once a minute per table:
 * the stamp is written only when it is empty or older than a minute, so taps at the same instant alert once.
 */
export async function POST(_req: NextRequest, { params }: { params: { qrToken: string } }) {
  const table = await prisma.table.findUnique({ where: { qrToken: params.qrToken }, select: { id: true, number: true, restaurantId: true } });
  if (!table) return NextResponse.json({ error: 'Mesa não encontrada' }, { status: 404 });
  if (!(await tablePaymentPlanAllows(table.restaurantId))) return NextResponse.json({ error: TABLE_PAYMENT_UNAVAILABLE }, { status: 403 });

  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: [...OPEN] } },
    orderBy: { openedAt: 'desc' },
    select: { id: true, tableNumber: true, customerName: true },
  });
  if (!session) return NextResponse.json({ error: 'Esta mesa ainda não tem conta aberta. Chame o garçom.' }, { status: 409 });

  const now = new Date();
  const stamped = await prisma.orderSession.updateMany({
    where: { id: session.id, OR: [{ payAtWaiterRequestedAt: null }, { payAtWaiterRequestedAt: { lt: new Date(now.getTime() - ONE_MINUTE_MS) } }] },
    data: { payAtWaiterRequestedAt: now },
  });
  if (stamped.count === 0) return NextResponse.json({ called: false, alreadyCalled: true });

  await alertTableCallsWaiter(table.restaurantId, session.id, sessionLabel({ table: { number: table.number }, tableNumber: session.tableNumber, customerName: session.customerName }), now);
  return NextResponse.json({ called: true });
}
```

- [ ] **Step 5: Run it** — Expected: PASS.

- [ ] **Step 6: Button on the bill screen** (`components/menu/table-bill.tsx`): below the pay button,

```tsx
      <Button variant="ghost" className="w-full" disabled={waiterBusy} onClick={callWaiter}>Pagar com o garçom</Button>
```

with state `waiterBusy` and:

```ts
  async function callWaiter() {
    setWaiterBusy(true);
    try {
      const res = await fetch(`/api/public/table/${qrToken}/call-waiter`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data.error || 'Não foi possível chamar o garçom'); return; }
      toast.success('Pronto! O garçom foi avisado e já vem até a mesa.');
    } catch {
      toast.error('Sem conexão. Chame o garçom.');
    } finally {
      setWaiterBusy(false);
    }
  }
```

(`alreadyCalled` shows the same success text: the staff already has the alert.)

- [ ] **Step 7: Check and commit** — `npx tsc --noEmit -p .`; `npx jest -c jest.unit.config.js`; then

```bash
git add "app/api/public/table/[qrToken]/call-waiter/route.ts" lib/comanda/table-payment-alerts.ts components/menu/table-bill.tsx __tests__/integration/api/public-table-call-waiter.test.ts
git commit -m "Pay at the table: 'Pagar com o garçom' alerts the staff

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Verify, review, publish, validate

- [ ] **Step 1:** `npx tsc --noEmit -p .`; `npx jest -c jest.unit.config.js`; `npx jest -c jest.integration.config.js --runInBand __tests__/integration/<folder>` for `api`, `vender`, `caixa`, `bad-day` — all pass; record counts.
- [ ] **Step 2:** Final whole-branch review by a fresh reviewer (most capable model) with this plan's Review Focus; fix Critical/Important with a failing test first.
- [ ] **Step 3:** Push to `main`; owner: Deploy homolog, then app (no migration).
- [ ] **Step 4: Homolog** (phone size): "Cartão" creates the checkout and leaves to Mercado Pago (homolog has only test accounts: the card payment itself is not expected to complete there); coming back with `?payment=<id>&result=failure` shows "não foi concluído"; "Pagar com o garçom" shows the confirmation and the bell of the homolog restaurant shows "Mesa N quer pagar com o garçom" once per minute.
- [ ] **Step 5: Production** (owner's restaurant set to `pro`, back to `starter` at the end): Mesa 1 with one "Teste R$ 1", service charge off; on a phone, "Cartão" → pay R$ 1,00 with a real card at Mercado Pago → back on the bill: "Confirmando..." then confirmed and "Conta paga"; the bell, `/caixa` ("Cartão online R$ 1,00"); refund with Estornar; "Pagar com o garçom" on another open table → bell alert.
