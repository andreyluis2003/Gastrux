# Delivery Payment Methods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a delivery customer pay with every common method, not only PIX: PIX, credit/debit card and Mercado Pago balance online, and cash (with change), credit, debit and meal vouchers on delivery, with the restaurant choosing which "on delivery" methods it accepts.

**Architecture:** A pure module (`lib/delivery-payments/choice.ts`) turns the restaurant's settings plus its Mercado Pago connection into the options a customer may pick, validates the customer's choice on the server, and renders the kitchen note. A small settings table (`DeliveryPaymentSettings`) stores what the restaurant accepts on delivery. The public order route validates the choice against the server-computed total, stores it on the `Order`, and appends a "Pagamento: ..." line to the order notes (the KDS already shows them). Online PIX reuses the PIX route of the Mercado Pago plan; online card uses a new route that creates a Checkout Pro preference with the restaurant's own token. The delivery page gets a payment-method selector.

**Tech Stack:** Next.js 14 (App Router), Prisma 6.7 / PostgreSQL, `mercadopago` SDK 2.13.0, Jest (`jest.unit.config.js` DB-free; `jest.integration.config.js` real DB), React client components with the existing `Card`/`Button`/`Input` UI kit.

**Spec:** `docs/superpowers/specs/2026-09-19-delivery-payment-methods-design.md` (read it first). It depends on `docs/superpowers/specs/2026-09-19-mercadopago-connect-design.md`.

## Global Constraints

- **Prerequisite:** every task of `docs/superpowers/plans/2026-09-19-mercadopago-connect.md` up to Task 12 is complete, except that plan's Task 11 Step 6 (the delivery page), which was put ON HOLD and is superseded by Task 7 here. This plan reuses: `hasActiveConnection` and `getMpClientForRestaurant` / `markNeedsReconnect` (`lib/mercadopago-connect/connection-service.ts`), `resolvePixTarget`, `normalizePayer`, `ONLINE_PAYMENT_UNAVAILABLE` (`pix-target.ts` / `pix-service.ts`), `notificationUrlFor`, `isUnauthorizedError` (`payments.ts`), the `POST /api/pagamentos/mp/pix` and `GET /api/pagamentos/mp/pix/status` routes, and the `acceptsOnlinePayment` flag already added to `app/api/public/delivery/menu/[restaurantId]/route.ts`.
- **The server is authoritative.** The order route validates the customer's payment choice against the restaurant's settings and its Mercado Pago connection, using the total computed on the server (`subtotal + delivery fee`). The screen only reflects what the server offers; nothing the browser sends about availability or amount is trusted.
- **No platform token:** online card payments are created only with the restaurant's own client (`getMpClientForRestaurant`); a restaurant without a usable connection gets `409 ONLINE_PAYMENT_UNAVAILABLE` and never a fallback.
- **Multi-tenant:** every query is scoped by `restaurantId`. Admin routes use `requireAdminSession()` + `getCurrentRestaurantId()` from `lib/whatsapp/get-restaurant.ts`; the restaurant always comes from the session, never from a request body.
- **Defaults:** a restaurant without a settings row accepts cash, credit and debit on delivery, and does NOT accept vouchers. Vouchers require at least one brand from `VR`, `ALELO`, `SODEXO`, `TICKET`.
- **Change (troco):** `changeFor` must be a finite number, at least the order total, and is optional. The kitchen note says "sem troco" when it is absent or equals the total.
- **Deterministic text:** the kitchen note and its tests use a local `R$ 0,00` formatter (no `Intl`), so they do not depend on the runtime locale.
- **Line endings:** `lib/mercado-pago.ts`, `app/api/public/delivery/order/route.ts`, `app/api/public/delivery/menu/[restaurantId]/route.ts`, `app/delivery/[restaurantId]/page.tsx` and `app/admin/delivery-site/page.tsx` use CRLF. Preserve CRLF when editing (for example apply the edits with a small Node script that reads the file, converts `\r\n` to `\n`, replaces the exact strings, and writes it back with `\r\n`), and check `git diff --stat` shows only the intended hunks.
- **Database gate.** Same rule as the Mercado Pago plan: `.env` points to a remote database that has not been confirmed as disposable, and the worktree has no `.env`. **Steps tagged `[DB]` are written but must NOT be run** until the maintainer confirms a dedicated test database. Prisma commands that only read the schema need dummy values: `DATABASE_URL="postgresql://u:p@localhost:5432/d" DIRECT_URL="postgresql://u:p@localhost:5432/d"`. Pure logic is tested with `jest.unit.config.js`.
- **Test fixtures** must satisfy the schema's required fields: `MenuItem` needs `categoryId`, `name`, `price`; `Recipe` needs `restaurantId`, `code`, `name`, `baseYield`, `yieldUnit` (`Unit`: `kg|g|ml|l|un`), `portionUnit`; `MenuCategory` needs `name`; `Order` needs `restaurantId`, `orderNumber`.
- **Commits:** explicit paths only (never `git add -A` or `git add .`), nothing under `docs/` or `.superpowers/`, and the trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Only commit when the maintainer asked for commits.
- **Test style:** Jest globals (no `@jest/globals` import) and `// @ts-nocheck` at the top of test files.
- **UI has no automated tests** (`jest` runs in a `node` environment): verify with `npx tsc --noEmit` and the manual steps.

## Editing helper for CRLF files

Tasks 4, 5, 7 and 8 replace exact strings inside CRLF files. Save this helper OUTSIDE the repository (for example `$TEMP/apply-edits.js`; never commit it) and call it from a small script per file, passing `[oldText, newText]` pairs written with plain `\n` line breaks. It refuses to write unless every `oldText` matches exactly once, and it writes CRLF back:

```javascript
const fs = require('fs');

module.exports = function applyEdits(file, pairs) {
  let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const [from, to] of pairs) {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`Expected exactly 1 match in ${file}, found ${count} for:\n${from}`);
    text = text.replace(from, () => to);
  }
  fs.writeFileSync(file, text.replace(/\n/g, '\r\n'));
};
```

After each file, `git diff --stat` must show only the intended hunks (no whole-file line-ending churn). If a file turns out to be LF, the same script must leave it LF (check with `file <path>` first and skip the final `\n` to `\r\n` conversion).

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` + 1 migration (modify/new) | `DeliveryPaymentMethod` enum, `Order` payment fields, `DeliveryPaymentSettings` |
| `lib/delivery-payments/choice.ts` (new) | Pure: types, options builder, choice validation, kitchen note, settings parsing |
| `lib/delivery-payments/settings-service.ts` (new) | Read/save settings, `getDeliveryPaymentOptions` |
| `app/api/admin/delivery/payment-settings/route.ts` (new) | Restaurant configures what it accepts on delivery |
| `app/api/public/delivery/menu/[restaurantId]/route.ts` (modify) | Expose `restaurant.paymentOptions` |
| `app/api/public/delivery/order/route.ts` (modify) | Validate and store the payment choice, add the kitchen note |
| `lib/mercado-pago.ts` (modify) | Optional `excludedPaymentTypes` on the preference |
| `app/api/pagamentos/mp/delivery-checkout/route.ts` (new) | Online card payment (Checkout Pro) for a delivery order |
| `components/delivery/payment-method-selector.tsx`, `payment-return.tsx`, `payment-settings-card.tsx` (new) | Customer selector, return-from-checkout screen, restaurant settings card |
| `app/delivery/[restaurantId]/page.tsx`, `app/admin/delivery-site/page.tsx` (modify) | Wire the new pieces in |

---

## Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260919130000_add_delivery_payment_methods/migration.sql`

**Interfaces:**
- Produces: enum `DeliveryPaymentMethod`; `Order.paymentMethod` (`DeliveryPaymentMethod?`), `Order.cashChangeFor` (`Decimal?`), `Order.voucherBrand` (`String?`); model `DeliveryPaymentSettings` (accessor `prisma.deliveryPaymentSettings`) with `restaurantId` unique, `acceptCash`, `acceptCreditOnDelivery`, `acceptDebitOnDelivery`, `acceptVoucherOnDelivery`, `voucherBrands String[]`. Used by Tasks 3 to 5.

- [ ] **Step 1: Snapshot the schema for an offline diff**

Run: `cp prisma/schema.prisma "$TEMP/schema.before-delivery.prisma"`

- [ ] **Step 2: Add the enum and the settings model**

Append after the `MercadoPagoConnection` model (any location works; keep it near the other payment models):

```prisma
enum DeliveryPaymentMethod {
  ONLINE_PIX
  ONLINE_CARD
  CASH
  CREDIT_ON_DELIVERY
  DEBIT_ON_DELIVERY
  VOUCHER_ON_DELIVERY
}

model DeliveryPaymentSettings {
  id                      String     @id @default(cuid())
  restaurantId            String     @unique
  acceptCash              Boolean    @default(true)
  acceptCreditOnDelivery  Boolean    @default(true)
  acceptDebitOnDelivery   Boolean    @default(true)
  acceptVoucherOnDelivery Boolean    @default(false)
  voucherBrands           String[]   @default([])
  createdAt               DateTime   @default(now())
  updatedAt               DateTime   @updatedAt
  restaurant              Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@map("delivery_payment_settings")
}
```

- [ ] **Step 3: Add the Order fields and the Restaurant relation**

In `model Order`, right after these two lines

```prisma
  total               Decimal?                 @db.Decimal(12, 2)
  paymentStatus       PaymentStatus            @default(PENDING)
```

add (if the pair matches more than once, use the one inside `model Order`):

```prisma
  paymentMethod       DeliveryPaymentMethod?
  cashChangeFor       Decimal?                 @db.Decimal(12, 2)
  voucherBrand        String?
```

In `model Restaurant`, right after the line `  mercadoPagoConnection MercadoPagoConnection?`, add:

```prisma
  deliveryPaymentSettings DeliveryPaymentSettings?
```

- [ ] **Step 4: Validate and generate**

Run: `DATABASE_URL="postgresql://u:p@localhost:5432/d" DIRECT_URL="postgresql://u:p@localhost:5432/d" npx prisma validate` then `npx prisma generate`
Expected: both succeed; `grep -c "DeliveryPaymentSettings" node_modules/.prisma/client/index.d.ts` prints a number greater than 0.

- [ ] **Step 5: Write the migration**

Create `prisma/migrations/20260919130000_add_delivery_payment_methods/migration.sql`:

```sql
-- How a delivery customer pays (chosen at checkout) and what the restaurant
-- accepts on delivery. Existing orders keep NULL payment fields.
CREATE TYPE "DeliveryPaymentMethod" AS ENUM ('ONLINE_PIX', 'ONLINE_CARD', 'CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY');

ALTER TABLE "orders" ADD COLUMN "paymentMethod" "DeliveryPaymentMethod",
ADD COLUMN "cashChangeFor" DECIMAL(12,2),
ADD COLUMN "voucherBrand" TEXT;

CREATE TABLE "delivery_payment_settings" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "acceptCash" BOOLEAN NOT NULL DEFAULT true,
    "acceptCreditOnDelivery" BOOLEAN NOT NULL DEFAULT true,
    "acceptDebitOnDelivery" BOOLEAN NOT NULL DEFAULT true,
    "acceptVoucherOnDelivery" BOOLEAN NOT NULL DEFAULT false,
    "voucherBrands" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_payment_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_payment_settings_restaurantId_key" ON "delivery_payment_settings"("restaurantId");

ALTER TABLE "delivery_payment_settings" ADD CONSTRAINT "delivery_payment_settings_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 6: Verify the SQL against the schema, offline**

Run: `DATABASE_URL="postgresql://u:p@localhost:5432/d" DIRECT_URL="postgresql://u:p@localhost:5432/d" npx prisma migrate diff --from-schema-datamodel "$TEMP/schema.before-delivery.prisma" --to-schema-datamodel prisma/schema.prisma --script`
Expected: equivalent to the migration file (`CREATE TYPE "DeliveryPaymentMethod"`, `ALTER TABLE "orders" ADD COLUMN ...` for the three columns, `CREATE TABLE "delivery_payment_settings"`, its unique index and foreign key). If column types, defaults or constraint names differ, fix the migration file to match the generated SQL. This needs no database.

- [ ] **Step 7: [DB] Apply the migration**

Run: `npx prisma migrate deploy` — **only** after the maintainer confirms a dedicated test database. Run `npx prisma migrate status` first and confirm the pending list.

- [ ] **Step 8: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add prisma/schema.prisma prisma/migrations/20260919130000_add_delivery_payment_methods
git commit -m "feat: add delivery payment methods schema"
```

---

## Task 2: Pure choice logic

**Files:**
- Create: `lib/delivery-payments/choice.ts`
- Test: `__tests__/unit/delivery-payment-choice.test.ts`

**Interfaces:**
- Produces (all exported from `choice.ts`, safe to import from client components):
  - `DELIVERY_PAYMENT_METHODS` (readonly tuple), `type DeliveryPaymentMethod`, `VOUCHER_BRANDS: Record<string, string>` (`{ VR: 'VR', ALELO: 'Alelo', SODEXO: 'Sodexo', TICKET: 'Ticket' }`), `VOUCHER_BRAND_IDS: string[]`
  - `interface DeliveryPaymentSettingsData { acceptCash: boolean; acceptCreditOnDelivery: boolean; acceptDebitOnDelivery: boolean; acceptVoucherOnDelivery: boolean; voucherBrands: string[] }`, `DEFAULT_DELIVERY_PAYMENT_SETTINGS`
  - `interface DeliveryPaymentOptions { online: { pix: boolean; card: boolean }; onDelivery: { cash: boolean; credit: boolean; debit: boolean; voucher: { enabled: boolean; brands: string[] } } }`
  - `buildPaymentOptions(settings: DeliveryPaymentSettingsData | null, hasOnlineConnection: boolean): DeliveryPaymentOptions`
  - `hasAnyPaymentOption(options: DeliveryPaymentOptions): boolean`
  - `interface ValidatedChoice { paymentMethod: DeliveryPaymentMethod; changeFor: number | null; voucherBrand: string | null }`, `type ValidationResult = { ok: true; choice: ValidatedChoice } | { ok: false; error: string }`
  - `validatePaymentChoice(options: DeliveryPaymentOptions, input: { paymentMethod?: unknown; changeFor?: unknown; voucherBrand?: unknown }, total: number): ValidationResult`
  - `describePaymentForKitchen(choice: ValidatedChoice, total: number): string`
  - `isPayOnDelivery(method: string | null | undefined): boolean`
  - `parseSettingsInput(input: unknown): { ok: true; data: DeliveryPaymentSettingsData } | { ok: false; error: string }`

- [ ] **Step 1: Write the failing test**

Create `__tests__/unit/delivery-payment-choice.test.ts`:

```typescript
// @ts-nocheck
import {
  DEFAULT_DELIVERY_PAYMENT_SETTINGS,
  buildPaymentOptions,
  hasAnyPaymentOption,
  validatePaymentChoice,
  describePaymentForKitchen,
  isPayOnDelivery,
  parseSettingsInput,
} from '../../lib/delivery-payments/choice';

const allOn = {
  acceptCash: true,
  acceptCreditOnDelivery: true,
  acceptDebitOnDelivery: true,
  acceptVoucherOnDelivery: true,
  voucherBrands: ['VR', 'ALELO'],
};

describe('delivery-payments/choice', () => {
  describe('buildPaymentOptions', () => {
    it('uses the defaults when the restaurant never configured anything', () => {
      expect(buildPaymentOptions(null, false)).toEqual({
        online: { pix: false, card: false },
        onDelivery: { cash: true, credit: true, debit: true, voucher: { enabled: false, brands: [] } },
      });
      expect(DEFAULT_DELIVERY_PAYMENT_SETTINGS.acceptVoucherOnDelivery).toBe(false);
    });

    it('enables online PIX and card only when the Mercado Pago connection is usable', () => {
      expect(buildPaymentOptions(null, true).online).toEqual({ pix: true, card: true });
      expect(buildPaymentOptions(null, false).online).toEqual({ pix: false, card: false });
    });

    it('enables vouchers only with at least one valid brand and drops unknown brands', () => {
      const none = buildPaymentOptions({ ...allOn, voucherBrands: [] }, false);
      expect(none.onDelivery.voucher).toEqual({ enabled: false, brands: [] });

      const some = buildPaymentOptions({ ...allOn, voucherBrands: ['VR', 'BOGUS'] }, false);
      expect(some.onDelivery.voucher).toEqual({ enabled: true, brands: ['VR'] });

      const off = buildPaymentOptions({ ...allOn, acceptVoucherOnDelivery: false }, false);
      expect(off.onDelivery.voucher.enabled).toBe(false);
    });

    it('reports when nothing at all is available', () => {
      const off = { acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] };
      expect(hasAnyPaymentOption(buildPaymentOptions(off, false))).toBe(false);
      expect(hasAnyPaymentOption(buildPaymentOptions(off, true))).toBe(true);
      expect(hasAnyPaymentOption(buildPaymentOptions(null, false))).toBe(true);
    });
  });

  describe('validatePaymentChoice', () => {
    const options = buildPaymentOptions(allOn, true);

    it('requires a known payment method', () => {
      expect(validatePaymentChoice(options, {}, 50)).toEqual({ ok: false, error: 'Escolha a forma de pagamento' });
      expect(validatePaymentChoice(options, { paymentMethod: 'BITCOIN' }, 50)).toEqual({ ok: false, error: 'Escolha a forma de pagamento' });
      expect(validatePaymentChoice(options, { paymentMethod: 42 }, 50).ok).toBe(false);
    });

    it('rejects online methods when the restaurant has no usable connection', () => {
      const offline = buildPaymentOptions(allOn, false);
      const pix = validatePaymentChoice(offline, { paymentMethod: 'ONLINE_PIX' }, 50);
      const card = validatePaymentChoice(offline, { paymentMethod: 'ONLINE_CARD' }, 50);
      expect(pix).toEqual({ ok: false, error: 'Esta forma de pagamento não está disponível neste restaurante' });
      expect(card.ok).toBe(false);
    });

    it('accepts online methods and ignores change and voucher input for them', () => {
      const r = validatePaymentChoice(options, { paymentMethod: 'ONLINE_PIX', changeFor: 100, voucherBrand: 'VR' }, 50);
      expect(r).toEqual({ ok: true, choice: { paymentMethod: 'ONLINE_PIX', changeFor: null, voucherBrand: null } });
      expect(validatePaymentChoice(options, { paymentMethod: 'ONLINE_CARD' }, 50).ok).toBe(true);
    });

    it('accepts cash with no change, or with change at least the total', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH' }, 57.9)).toEqual({
        ok: true, choice: { paymentMethod: 'CASH', changeFor: null, voucherBrand: null },
      });
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: '' }, 57.9).choice.changeFor).toBeNull();
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: 100 }, 57.9).choice.changeFor).toBe(100);
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: '100' }, 57.9).choice.changeFor).toBe(100);
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: 57.9 }, 57.9).choice.changeFor).toBe(57.9);
    });

    it('rejects change below the total and invalid change values', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: 50 }, 57.9)).toEqual({
        ok: false, error: 'O valor para troco deve ser maior ou igual ao total do pedido',
      });
      for (const bad of [0, -5, 'abc', NaN, Infinity]) {
        expect(validatePaymentChoice(options, { paymentMethod: 'CASH', changeFor: bad }, 57.9)).toEqual({
          ok: false, error: 'Valor do troco inválido',
        });
      }
    });

    it('accepts credit and debit on delivery only when enabled', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'CREDIT_ON_DELIVERY' }, 50).ok).toBe(true);
      expect(validatePaymentChoice(options, { paymentMethod: 'DEBIT_ON_DELIVERY' }, 50).ok).toBe(true);
      const off = buildPaymentOptions({ ...allOn, acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false }, false);
      expect(validatePaymentChoice(off, { paymentMethod: 'CASH' }, 50).ok).toBe(false);
      expect(validatePaymentChoice(off, { paymentMethod: 'CREDIT_ON_DELIVERY' }, 50).ok).toBe(false);
      expect(validatePaymentChoice(off, { paymentMethod: 'DEBIT_ON_DELIVERY' }, 50).ok).toBe(false);
    });

    it('requires an accepted voucher brand, case-insensitive', () => {
      expect(validatePaymentChoice(options, { paymentMethod: 'VOUCHER_ON_DELIVERY' }, 50)).toEqual({
        ok: false, error: 'Escolha a bandeira do vale-refeição',
      });
      expect(validatePaymentChoice(options, { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'SODEXO' }, 50).ok).toBe(false);
      expect(validatePaymentChoice(options, { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'vr' }, 50)).toEqual({
        ok: true, choice: { paymentMethod: 'VOUCHER_ON_DELIVERY', changeFor: null, voucherBrand: 'VR' },
      });
      const noVoucher = buildPaymentOptions({ ...allOn, acceptVoucherOnDelivery: false }, false);
      expect(validatePaymentChoice(noVoucher, { paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'VR' }, 50).ok).toBe(false);
    });
  });

  describe('describePaymentForKitchen', () => {
    const base = { changeFor: null, voucherBrand: null };

    it('describes online payments', () => {
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'ONLINE_PIX' }, 50)).toBe('Pagamento: PIX online');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'ONLINE_CARD' }, 50)).toBe('Pagamento: cartão online (Mercado Pago)');
    });

    it('tells the driver how much change to bring', () => {
      const note = describePaymentForKitchen({ ...base, paymentMethod: 'CASH', changeFor: 100 }, 57.9);
      expect(note).toBe('Pagamento na entrega: dinheiro — troco para R$ 100,00 (levar R$ 42,10 de troco)');
    });

    it('says no change when there is none to bring', () => {
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'CASH' }, 57.9)).toBe('Pagamento na entrega: dinheiro — sem troco');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'CASH', changeFor: 57.9 }, 57.9)).toBe('Pagamento na entrega: dinheiro — sem troco');
    });

    it('reminds the driver to bring the card machine', () => {
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'CREDIT_ON_DELIVERY' }, 50)).toBe('Pagamento na entrega: cartão de crédito (levar maquininha)');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'DEBIT_ON_DELIVERY' }, 50)).toBe('Pagamento na entrega: cartão de débito (levar maquininha)');
      expect(describePaymentForKitchen({ ...base, paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'ALELO' }, 50)).toBe(
        'Pagamento na entrega: vale-refeição/alimentação Alelo (levar maquininha)'
      );
    });
  });

  describe('isPayOnDelivery', () => {
    it('is true only for the four on-delivery methods', () => {
      for (const m of ['CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY']) expect(isPayOnDelivery(m)).toBe(true);
      for (const m of ['ONLINE_PIX', 'ONLINE_CARD', '', null, undefined, 'X']) expect(isPayOnDelivery(m)).toBe(false);
    });
  });

  describe('parseSettingsInput', () => {
    it('accepts a valid payload and de-duplicates brands', () => {
      const r = parseSettingsInput({ ...allOn, voucherBrands: ['VR', 'VR', 'ALELO'] });
      expect(r).toEqual({ ok: true, data: { ...allOn, voucherBrands: ['VR', 'ALELO'] } });
    });

    it('rejects non-boolean flags, non-array brands and unknown brands', () => {
      expect(parseSettingsInput({ ...allOn, acceptCash: 'yes' })).toEqual({ ok: false, error: 'Campo inválido: acceptCash' });
      expect(parseSettingsInput({ ...allOn, voucherBrands: 'VR' })).toEqual({ ok: false, error: 'Campo inválido: voucherBrands' });
      expect(parseSettingsInput({ ...allOn, voucherBrands: ['VR', 'BOGUS'] })).toEqual({ ok: false, error: 'Bandeira inválida: BOGUS' });
      expect(parseSettingsInput(null)).toEqual({ ok: false, error: 'Corpo da requisição inválido' });
    });

    it('requires at least one brand when vouchers are enabled', () => {
      expect(parseSettingsInput({ ...allOn, voucherBrands: [] })).toEqual({ ok: false, error: 'Escolha ao menos uma bandeira de vale-refeição' });
      expect(parseSettingsInput({ ...allOn, acceptVoucherOnDelivery: false, voucherBrands: [] }).ok).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/delivery-payment-choice.test.ts`
Expected: FAIL — `Cannot find module '../../lib/delivery-payments/choice'`.

- [ ] **Step 3: Implement `lib/delivery-payments/choice.ts`**

```typescript
/**
 * Pure rules for how a delivery customer may pay. No I/O: importable from the
 * server (order route) and from client components (the payment selector).
 * The server is authoritative; the screen only reflects `DeliveryPaymentOptions`.
 */

export const DELIVERY_PAYMENT_METHODS = [
  'ONLINE_PIX',
  'ONLINE_CARD',
  'CASH',
  'CREDIT_ON_DELIVERY',
  'DEBIT_ON_DELIVERY',
  'VOUCHER_ON_DELIVERY',
] as const;

export type DeliveryPaymentMethod = (typeof DELIVERY_PAYMENT_METHODS)[number];

/** id -> label shown to the customer and on the kitchen note. */
export const VOUCHER_BRANDS: Record<string, string> = {
  VR: 'VR',
  ALELO: 'Alelo',
  SODEXO: 'Sodexo',
  TICKET: 'Ticket',
};
export const VOUCHER_BRAND_IDS: string[] = Object.keys(VOUCHER_BRANDS);

export interface DeliveryPaymentSettingsData {
  acceptCash: boolean;
  acceptCreditOnDelivery: boolean;
  acceptDebitOnDelivery: boolean;
  acceptVoucherOnDelivery: boolean;
  voucherBrands: string[];
}

/** What a restaurant that never configured anything accepts on delivery. */
export const DEFAULT_DELIVERY_PAYMENT_SETTINGS: DeliveryPaymentSettingsData = {
  acceptCash: true,
  acceptCreditOnDelivery: true,
  acceptDebitOnDelivery: true,
  acceptVoucherOnDelivery: false,
  voucherBrands: [],
};

export interface DeliveryPaymentOptions {
  online: { pix: boolean; card: boolean };
  onDelivery: {
    cash: boolean;
    credit: boolean;
    debit: boolean;
    voucher: { enabled: boolean; brands: string[] };
  };
}

export function buildPaymentOptions(
  settings: DeliveryPaymentSettingsData | null,
  hasOnlineConnection: boolean
): DeliveryPaymentOptions {
  const s = settings ?? DEFAULT_DELIVERY_PAYMENT_SETTINGS;
  const brands = s.voucherBrands.filter((id) => VOUCHER_BRAND_IDS.includes(id));
  return {
    online: { pix: hasOnlineConnection, card: hasOnlineConnection },
    onDelivery: {
      cash: s.acceptCash,
      credit: s.acceptCreditOnDelivery,
      debit: s.acceptDebitOnDelivery,
      voucher: { enabled: s.acceptVoucherOnDelivery && brands.length > 0, brands },
    },
  };
}

export function hasAnyPaymentOption(options: DeliveryPaymentOptions): boolean {
  const d = options.onDelivery;
  return options.online.pix || options.online.card || d.cash || d.credit || d.debit || d.voucher.enabled;
}

export interface ValidatedChoice {
  paymentMethod: DeliveryPaymentMethod;
  changeFor: number | null;
  voucherBrand: string | null;
}

export type ValidationResult = { ok: true; choice: ValidatedChoice } | { ok: false; error: string };

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function brl(value: number): string {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

const UNAVAILABLE = 'Esta forma de pagamento não está disponível neste restaurante';

function accept(paymentMethod: DeliveryPaymentMethod, extra: Partial<ValidatedChoice> = {}): ValidationResult {
  return { ok: true, choice: { paymentMethod, changeFor: null, voucherBrand: null, ...extra } };
}

/**
 * Validates what the customer picked against what the restaurant offers.
 * `total` must be the server-computed order total (subtotal + delivery fee).
 */
export function validatePaymentChoice(
  options: DeliveryPaymentOptions,
  input: { paymentMethod?: unknown; changeFor?: unknown; voucherBrand?: unknown },
  total: number
): ValidationResult {
  const raw = input.paymentMethod;
  if (typeof raw !== 'string' || !DELIVERY_PAYMENT_METHODS.includes(raw as DeliveryPaymentMethod)) {
    return { ok: false, error: 'Escolha a forma de pagamento' };
  }
  const method = raw as DeliveryPaymentMethod;

  switch (method) {
    case 'ONLINE_PIX':
      return options.online.pix ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'ONLINE_CARD':
      return options.online.card ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'CREDIT_ON_DELIVERY':
      return options.onDelivery.credit ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'DEBIT_ON_DELIVERY':
      return options.onDelivery.debit ? accept(method) : { ok: false, error: UNAVAILABLE };
    case 'CASH': {
      if (!options.onDelivery.cash) return { ok: false, error: UNAVAILABLE };
      const change = input.changeFor;
      if (change === undefined || change === null || change === '') return accept(method);
      const value = round2(Number(change));
      if (!Number.isFinite(value) || value <= 0) return { ok: false, error: 'Valor do troco inválido' };
      if (value < round2(total)) {
        return { ok: false, error: 'O valor para troco deve ser maior ou igual ao total do pedido' };
      }
      return accept(method, { changeFor: value });
    }
    case 'VOUCHER_ON_DELIVERY': {
      const voucher = options.onDelivery.voucher;
      if (!voucher.enabled) return { ok: false, error: UNAVAILABLE };
      const brand = typeof input.voucherBrand === 'string' ? input.voucherBrand.trim().toUpperCase() : '';
      if (!voucher.brands.includes(brand)) return { ok: false, error: 'Escolha a bandeira do vale-refeição' };
      return accept(method, { voucherBrand: brand });
    }
  }
}

/** One line for the order notes: the KDS card already shows `Order.specialInstructions`. */
export function describePaymentForKitchen(choice: ValidatedChoice, total: number): string {
  switch (choice.paymentMethod) {
    case 'ONLINE_PIX':
      return 'Pagamento: PIX online';
    case 'ONLINE_CARD':
      return 'Pagamento: cartão online (Mercado Pago)';
    case 'CASH': {
      const change = choice.changeFor === null ? 0 : round2(choice.changeFor - total);
      if (choice.changeFor === null || change <= 0) return 'Pagamento na entrega: dinheiro — sem troco';
      return `Pagamento na entrega: dinheiro — troco para ${brl(choice.changeFor)} (levar ${brl(change)} de troco)`;
    }
    case 'CREDIT_ON_DELIVERY':
      return 'Pagamento na entrega: cartão de crédito (levar maquininha)';
    case 'DEBIT_ON_DELIVERY':
      return 'Pagamento na entrega: cartão de débito (levar maquininha)';
    case 'VOUCHER_ON_DELIVERY': {
      const label = choice.voucherBrand ? VOUCHER_BRANDS[choice.voucherBrand] ?? choice.voucherBrand : '';
      return `Pagamento na entrega: vale-refeição/alimentação ${label} (levar maquininha)`.replace(/\s+\(/, ' (');
    }
  }
}

export function isPayOnDelivery(method: string | null | undefined): boolean {
  return (
    method === 'CASH' ||
    method === 'CREDIT_ON_DELIVERY' ||
    method === 'DEBIT_ON_DELIVERY' ||
    method === 'VOUCHER_ON_DELIVERY'
  );
}

/** Validates the settings a restaurant sends from the admin screen. */
export function parseSettingsInput(
  input: unknown
): { ok: true; data: DeliveryPaymentSettingsData } | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Corpo da requisição inválido' };
  const body = input as Record<string, unknown>;

  const flags = ['acceptCash', 'acceptCreditOnDelivery', 'acceptDebitOnDelivery', 'acceptVoucherOnDelivery'] as const;
  for (const key of flags) {
    if (typeof body[key] !== 'boolean') return { ok: false, error: `Campo inválido: ${key}` };
  }
  if (!Array.isArray(body.voucherBrands) || body.voucherBrands.some((b) => typeof b !== 'string')) {
    return { ok: false, error: 'Campo inválido: voucherBrands' };
  }

  const brands: string[] = [];
  for (const raw of body.voucherBrands as string[]) {
    const id = raw.trim().toUpperCase();
    if (!VOUCHER_BRAND_IDS.includes(id)) return { ok: false, error: `Bandeira inválida: ${raw}` };
    if (!brands.includes(id)) brands.push(id);
  }
  if (body.acceptVoucherOnDelivery === true && brands.length === 0) {
    return { ok: false, error: 'Escolha ao menos uma bandeira de vale-refeição' };
  }

  return {
    ok: true,
    data: {
      acceptCash: body.acceptCash as boolean,
      acceptCreditOnDelivery: body.acceptCreditOnDelivery as boolean,
      acceptDebitOnDelivery: body.acceptDebitOnDelivery as boolean,
      acceptVoucherOnDelivery: body.acceptVoucherOnDelivery as boolean,
      voucherBrands: brands,
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/delivery-payment-choice.test.ts`
Expected: PASS, 19 tests. If the voucher note test fails on spacing, fix the implementation, not the test: the expected text is exactly `Pagamento na entrega: vale-refeição/alimentação Alelo (levar maquininha)` (no double space when a brand is present; a missing brand must not leave a double space).

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/delivery-payments/choice.ts __tests__/unit/delivery-payment-choice.test.ts
git commit -m "feat: add delivery payment options, validation and kitchen note"
```

---

## Task 3: Settings service and admin API

**Files:**
- Create: `lib/delivery-payments/settings-service.ts`
- Create: `app/api/admin/delivery/payment-settings/route.ts`
- Test: `__tests__/integration/api/delivery-payment-settings.test.ts` **[DB]**

**Interfaces:**
- Consumes: Task 1 (`prisma.deliveryPaymentSettings`), Task 2 (`buildPaymentOptions`, `parseSettingsInput`, `DEFAULT_DELIVERY_PAYMENT_SETTINGS`, types), `hasActiveConnection` (`lib/mercadopago-connect/connection-service.ts`), `requireAdminSession` / `getCurrentRestaurantId` (`lib/whatsapp/get-restaurant.ts`).
- Produces:
  - `getDeliveryPaymentSettings(restaurantId: string): Promise<DeliveryPaymentSettingsData>` (defaults when no row)
  - `saveDeliveryPaymentSettings(restaurantId: string, data: DeliveryPaymentSettingsData): Promise<DeliveryPaymentSettingsData>`
  - `getDeliveryPaymentOptions(restaurantId: string): Promise<DeliveryPaymentOptions>`
  - HTTP: `GET /api/admin/delivery/payment-settings` → `{ settings: DeliveryPaymentSettingsData, online: { connected: boolean } }`; `PUT` (same path) with a `DeliveryPaymentSettingsData` body → same response, `400 { error }` on invalid input. Restaurant from the session; any admin-role user of the current restaurant.

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/delivery-payment-settings.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import {
  getDeliveryPaymentSettings,
  saveDeliveryPaymentSettings,
  getDeliveryPaymentOptions,
} from '../../../lib/delivery-payments/settings-service';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { GET, PUT } from '../../../app/api/admin/delivery/payment-settings/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const VALID = {
  acceptCash: false,
  acceptCreditOnDelivery: true,
  acceptDebitOnDelivery: false,
  acceptVoucherOnDelivery: true,
  voucherBrands: ['VR', 'TICKET'],
};

describe('delivery payment settings', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
  });

  const asStaff = (role = 'OWNER') =>
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role },
    });

  const put = (body: any) =>
    PUT(new Request('https://gastrux.test/api/admin/delivery/payment-settings', { method: 'PUT', body: JSON.stringify(body) }) as any);

  describe('service', () => {
    it('returns the defaults when the restaurant never saved settings', async () => {
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual({
        acceptCash: true,
        acceptCreditOnDelivery: true,
        acceptDebitOnDelivery: true,
        acceptVoucherOnDelivery: false,
        voucherBrands: [],
      });
    });

    it('saves and reads back, and keeps restaurants isolated', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      expect(await getDeliveryPaymentSettings(A.restaurantId)).toEqual(VALID);
      expect((await getDeliveryPaymentSettings(B.restaurantId)).acceptCash).toBe(true);
    });

    it('overwrites on a second save (one row per restaurant)', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      await saveDeliveryPaymentSettings(A.restaurantId, { ...VALID, acceptCash: true });
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
      expect((await getDeliveryPaymentSettings(A.restaurantId)).acceptCash).toBe(true);
    });

    it('derives the options from the settings and the Mercado Pago connection', async () => {
      await saveDeliveryPaymentSettings(A.restaurantId, VALID);
      const offline = await getDeliveryPaymentOptions(A.restaurantId);
      expect(offline.online).toEqual({ pix: false, card: false });
      expect(offline.onDelivery).toEqual({
        cash: false, credit: true, debit: false, voucher: { enabled: true, brands: ['VR', 'TICKET'] },
      });

      await saveConnection(A.restaurantId, TOKENS);
      expect((await getDeliveryPaymentOptions(A.restaurantId)).online).toEqual({ pix: true, card: true });
      expect((await getDeliveryPaymentOptions(B.restaurantId)).online).toEqual({ pix: false, card: false });
    });
  });

  describe('admin route', () => {
    it('rejects unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect((await GET()).status).toBe(401);
      expect((await put(VALID)).status).toBe(401);
    });

    it('denies roles outside the admin set', async () => {
      asStaff('CASHIER');
      expect((await GET()).status).toBe(403);
      expect((await put(VALID)).status).toBe(403);
    });

    it('returns the defaults and the online connection state', async () => {
      asStaff();
      const body = await (await GET()).json();
      expect(body.settings.acceptCash).toBe(true);
      expect(body.online).toEqual({ connected: false });

      await saveConnection(A.restaurantId, TOKENS);
      expect((await (await GET()).json()).online).toEqual({ connected: true });
    });

    it("saves the session's own restaurant and ignores a restaurantId in the body", async () => {
      asStaff();
      const res = await put({ ...VALID, restaurantId: B.restaurantId });

      expect(res.status).toBe(200);
      expect((await res.json()).settings).toEqual(VALID);
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: B.restaurantId } })).toBe(0);
      expect((await getDeliveryPaymentSettings(A.restaurantId)).voucherBrands).toEqual(['VR', 'TICKET']);
    });

    it('answers 400 for invalid input and saves nothing', async () => {
      asStaff();
      const res = await put({ ...VALID, voucherBrands: [] });

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Escolha ao menos uma bandeira de vale-refeição');
      expect(await prisma.deliveryPaymentSettings.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/delivery-payment-settings.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/delivery-payments/settings-service'`. Do not run this until the maintainer confirms a dedicated test database.

- [ ] **Step 3: Implement `lib/delivery-payments/settings-service.ts`**

```typescript
import { prisma } from '@/lib/prisma';
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
import {
  DEFAULT_DELIVERY_PAYMENT_SETTINGS,
  buildPaymentOptions,
  type DeliveryPaymentOptions,
  type DeliveryPaymentSettingsData,
} from './choice';

/** Settings a restaurant saved for what it accepts on delivery (defaults when it never did). */
export async function getDeliveryPaymentSettings(restaurantId: string): Promise<DeliveryPaymentSettingsData> {
  const row = await prisma.deliveryPaymentSettings.findUnique({ where: { restaurantId } });
  if (!row) return { ...DEFAULT_DELIVERY_PAYMENT_SETTINGS, voucherBrands: [] };
  return {
    acceptCash: row.acceptCash,
    acceptCreditOnDelivery: row.acceptCreditOnDelivery,
    acceptDebitOnDelivery: row.acceptDebitOnDelivery,
    acceptVoucherOnDelivery: row.acceptVoucherOnDelivery,
    voucherBrands: row.voucherBrands,
  };
}

/** `data` must already be validated with `parseSettingsInput`. */
export async function saveDeliveryPaymentSettings(
  restaurantId: string,
  data: DeliveryPaymentSettingsData
): Promise<DeliveryPaymentSettingsData> {
  const row = await prisma.deliveryPaymentSettings.upsert({
    where: { restaurantId },
    create: { restaurantId, ...data },
    update: { ...data },
  });
  return {
    acceptCash: row.acceptCash,
    acceptCreditOnDelivery: row.acceptCreditOnDelivery,
    acceptDebitOnDelivery: row.acceptDebitOnDelivery,
    acceptVoucherOnDelivery: row.acceptVoucherOnDelivery,
    voucherBrands: row.voucherBrands,
  };
}

/** What a customer may pick at checkout: the settings plus the Mercado Pago connection. */
export async function getDeliveryPaymentOptions(restaurantId: string): Promise<DeliveryPaymentOptions> {
  const [settings, connected] = await Promise.all([
    getDeliveryPaymentSettings(restaurantId),
    hasActiveConnection(restaurantId),
  ]);
  return buildPaymentOptions(settings, connected);
}
```

- [ ] **Step 4: Implement the admin route** — `app/api/admin/delivery/payment-settings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
import { parseSettingsInput } from '@/lib/delivery-payments/choice';
import {
  getDeliveryPaymentSettings,
  saveDeliveryPaymentSettings,
} from '@/lib/delivery-payments/settings-service';

export const dynamic = 'force-dynamic';

async function resolveRestaurant() {
  const auth = await requireAdminSession();
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return { error: NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 }) };
  }
  return { restaurantId };
}

async function payload(restaurantId: string) {
  const [settings, connected] = await Promise.all([
    getDeliveryPaymentSettings(restaurantId),
    hasActiveConnection(restaurantId),
  ]);
  return { settings, online: { connected } };
}

export async function GET() {
  const ctx = await resolveRestaurant();
  if ('error' in ctx) return ctx.error;
  return NextResponse.json(await payload(ctx.restaurantId));
}

/** The restaurant always comes from the session: a restaurantId in the body is ignored. */
export async function PUT(request: NextRequest) {
  const ctx = await resolveRestaurant();
  if ('error' in ctx) return ctx.error;

  const parsed = parseSettingsInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await saveDeliveryPaymentSettings(ctx.restaurantId, parsed.data);
  return NextResponse.json(await payload(ctx.restaurantId));
}
```

- [ ] **Step 5: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/delivery-payment-settings.test.ts`
Expected: PASS, 9 tests. (Only after the DB gate is lifted.)

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/delivery-payments/settings-service.ts app/api/admin/delivery/payment-settings/route.ts __tests__/integration/api/delivery-payment-settings.test.ts
git commit -m "feat: add delivery payment settings service and admin API"
```


---

## Task 4: Public menu options and order validation

**Files:**
- Modify: `app/api/public/delivery/menu/[restaurantId]/route.ts`
- Modify: `app/api/public/delivery/order/route.ts`
- Test: `__tests__/integration/api/delivery-order-payment.test.ts` **[DB]**
- Test: `__tests__/integration/api/delivery-menu-payment-options.test.ts` **[DB]**

**Interfaces:**
- Consumes: `getDeliveryPaymentOptions` (Task 3); `validatePaymentChoice`, `describePaymentForKitchen`, `ValidatedChoice` (Task 2); Order columns (Task 1); `hasActiveConnection` import added to the menu route by the Mercado Pago plan's Task 11.
- Produces:
  - `GET /api/public/delivery/menu/[restaurantId]` → `restaurant.paymentOptions: DeliveryPaymentOptions` (and `restaurant.acceptsOnlinePayment`, kept for older clients, equal to `paymentOptions.online.pix`).
  - `POST /api/public/delivery/order` accepts `paymentMethod`, `changeFor?`, `voucherBrand?`. It validates them against the server-computed total, stores `paymentMethod`, `cashChangeFor`, `voucherBrand` on the Order, adds one "Pagamento..." line to `Order.specialInstructions`, and returns `order.paymentMethod` and `order.paymentSummary`. A missing or unavailable method answers `400 { error }` and creates nothing (no Order, no Customer).

- [ ] **Step 1: Write the failing test for the order route** **[DB]**

Create `__tests__/integration/api/delivery-order-payment.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/api/tier-middleware', () => ({
  ...jest.requireActual('../../../lib/api/tier-middleware'),
  enforceResourceLimit: jest.fn().mockResolvedValue(null),
}));

import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { POST } from '../../../app/api/public/delivery/order/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const ALL_OFF = { acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: false, voucherBrands: [] };

describe('POST /api/public/delivery/order - payment choice', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let itemA: string;
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  const makeMenuItem = async (restaurantId: string) => {
    const suffix = crypto.randomBytes(4).toString('hex');
    const category = await prisma.menuCategory.create({ data: { restaurantId, name: `Cat ${suffix}` } });
    const recipe = await prisma.recipe.create({
      data: { restaurantId, code: `R-${suffix}`, name: `Prato ${suffix}`, baseYield: 1, yieldUnit: 'un', portionUnit: 'un' },
    });
    const item = await prisma.menuItem.create({
      data: { restaurantId, categoryId: category.id, name: `Item ${suffix}`, price: 20, recipeId: recipe.id, active: true, available: true },
    });
    return item.id;
  };

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
    itemA = await makeMenuItem(A.restaurantId);
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: { in: ids } } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(cleanRows);

  // menu item 20 + delivery fee 5 = server total 25
  const body = (extra = {}) => ({
    restaurantId: A.restaurantId,
    customerName: 'Maria',
    customerPhone: '11999999999',
    deliveryAddress: 'Rua A, 1',
    items: [{ menuItemId: itemA, quantity: 1 }],
    deliveryFee: 5,
    ...extra,
  });

  const post = (payload: any) =>
    POST(new Request('https://gastrux.test/api/public/delivery/order', { method: 'POST', body: JSON.stringify(payload) }) as any);

  const orderCount = () => prisma.order.count({ where: { restaurantId: A.restaurantId } });

  it('requires a payment method and creates nothing without one', async () => {
    const res = await post(body());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Escolha a forma de pagamento');
    expect(await orderCount()).toBe(0);
  });

  it('rejects an online method when the restaurant has no Mercado Pago connection, accepts it with one', async () => {
    const denied = await post(body({ paymentMethod: 'ONLINE_PIX' }));
    expect(denied.status).toBe(400);
    expect(await orderCount()).toBe(0);

    await saveConnection(A.restaurantId, TOKENS);
    const res = await post(body({ paymentMethod: 'ONLINE_PIX' }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.order.paymentMethod).toBe('ONLINE_PIX');
    const order = await prisma.order.findUnique({ where: { id: json.order.id } });
    expect(order.paymentMethod).toBe('ONLINE_PIX');
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.specialInstructions).toContain('Pagamento: PIX online');
  });

  it('stores cash with change and tells the driver how much change to bring', async () => {
    const res = await post(body({ paymentMethod: 'CASH', changeFor: 100 }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.order.paymentSummary).toBe('Pagamento na entrega: dinheiro — troco para R$ 100,00 (levar R$ 75,00 de troco)');
    const order = await prisma.order.findUnique({ where: { id: json.order.id } });
    expect(order.paymentMethod).toBe('CASH');
    expect(Number(order.cashChangeFor)).toBe(100);
    expect(order.voucherBrand).toBeNull();
    expect(order.paymentStatus).toBe('PENDING');
    expect(order.specialInstructions).toContain('Pagamento na entrega: dinheiro — troco para R$ 100,00');
  });

  it('validates change against the SERVER total, ignoring any total sent by the browser', async () => {
    const res = await post(body({ paymentMethod: 'CASH', changeFor: 10, total: 1 }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('O valor para troco deve ser maior ou igual ao total do pedido');
    expect(await orderCount()).toBe(0);
  });

  it('accepts credit and debit on delivery by default and refuses them once the restaurant turns them off', async () => {
    expect((await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY' }))).status).toBe(200);
    expect((await post(body({ paymentMethod: 'DEBIT_ON_DELIVERY' }))).status).toBe(200);

    await saveDeliveryPaymentSettings(A.restaurantId, ALL_OFF);
    expect((await post(body({ paymentMethod: 'CREDIT_ON_DELIVERY' }))).status).toBe(400);
    expect((await post(body({ paymentMethod: 'CASH' }))).status).toBe(400);
  });

  it('keeps vouchers off by default and needs an accepted brand once enabled', async () => {
    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'VR' }))).status).toBe(400);

    await saveDeliveryPaymentSettings(A.restaurantId, { ...ALL_OFF, acceptCash: true, acceptVoucherOnDelivery: true, voucherBrands: ['VR'] });
    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY' }))).status).toBe(400);
    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'ALELO' }))).status).toBe(400);

    const res = await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'vr' }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.order.paymentSummary).toBe('Pagamento na entrega: vale-refeição/alimentação VR (levar maquininha)');
    expect((await prisma.order.findUnique({ where: { id: json.order.id } })).voucherBrand).toBe('VR');
  });

  it("never applies another restaurant's settings or connection", async () => {
    await saveDeliveryPaymentSettings(B.restaurantId, { ...ALL_OFF, acceptCash: true, acceptVoucherOnDelivery: true, voucherBrands: ['VR'] });
    await saveConnection(B.restaurantId, TOKENS);

    expect((await post(body({ paymentMethod: 'VOUCHER_ON_DELIVERY', voucherBrand: 'VR' }))).status).toBe(400);
    expect((await post(body({ paymentMethod: 'ONLINE_CARD' }))).status).toBe(400);
    expect(await orderCount()).toBe(0);
  });

  it('refuses every method when the restaurant offers nothing', async () => {
    await saveDeliveryPaymentSettings(A.restaurantId, ALL_OFF);
    for (const paymentMethod of ['ONLINE_PIX', 'ONLINE_CARD', 'CASH', 'CREDIT_ON_DELIVERY', 'DEBIT_ON_DELIVERY', 'VOUCHER_ON_DELIVERY']) {
      expect((await post(body({ paymentMethod, voucherBrand: 'VR' }))).status).toBe(400);
    }
    expect(await orderCount()).toBe(0);
  });
});
```

- [ ] **Step 2: Write the test for the public menu options** **[DB]**

Create `__tests__/integration/api/delivery-menu-payment-options.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { saveDeliveryPaymentSettings } from '../../../lib/delivery-payments/settings-service';
import { GET as deliveryMenu } from '../../../app/api/public/delivery/menu/[restaurantId]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('GET /api/public/delivery/menu - paymentOptions', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.deliveryPaymentSettings.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(cleanRows);

  const menu = async (restaurantId: string) =>
    (await deliveryMenu(new Request('https://gastrux.test/x') as any, { params: { restaurantId } })).json();

  it('offers the default on-delivery methods and no online methods without a connection', async () => {
    const { restaurant } = await menu(A.restaurantId);
    expect(restaurant.paymentOptions).toEqual({
      online: { pix: false, card: false },
      onDelivery: { cash: true, credit: true, debit: true, voucher: { enabled: false, brands: [] } },
    });
    expect(restaurant.acceptsOnlinePayment).toBe(false);
  });

  it('adds the online methods when the restaurant is connected', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const { restaurant } = await menu(A.restaurantId);
    expect(restaurant.paymentOptions.online).toEqual({ pix: true, card: true });
    expect(restaurant.acceptsOnlinePayment).toBe(true);
  });

  it('reflects the restaurant settings and never another restaurant', async () => {
    await saveDeliveryPaymentSettings(B.restaurantId, {
      acceptCash: false, acceptCreditOnDelivery: false, acceptDebitOnDelivery: false, acceptVoucherOnDelivery: true, voucherBrands: ['SODEXO'],
    });

    const b = (await menu(B.restaurantId)).restaurant.paymentOptions.onDelivery;
    expect(b).toEqual({ cash: false, credit: false, debit: false, voucher: { enabled: true, brands: ['SODEXO'] } });
    expect((await menu(A.restaurantId)).restaurant.paymentOptions.onDelivery.cash).toBe(true);
  });

  it('never exposes token material', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    expect(JSON.stringify(await menu(A.restaurantId))).not.toMatch(/APP_USR|TG-r|accessToken|refreshToken|v1:/);
  });
});
```

- [ ] **Step 3: [DB] Run both tests to verify they fail**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/delivery-order-payment.test.ts __tests__/integration/api/delivery-menu-payment-options.test.ts`
Expected: FAIL (`paymentOptions` undefined; the order route ignores the payment fields). Only after the DB gate is lifted.

- [ ] **Step 4: Expose the options on the public menu**

In `app/api/public/delivery/menu/[restaurantId]/route.ts`, replace:

```typescript
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
```

with:

```typescript
import { getDeliveryPaymentOptions } from '@/lib/delivery-payments/settings-service';
```

and replace:

```typescript
    const acceptsOnlinePayment = await hasActiveConnection(params.restaurantId);

    return NextResponse.json(
      { restaurant: { ...restaurant, acceptsOnlinePayment }, categories: filteredCategories },
```

with:

```typescript
    const paymentOptions = await getDeliveryPaymentOptions(params.restaurantId);
    // Kept for older clients: true when the restaurant can take PIX/card online.
    const acceptsOnlinePayment = paymentOptions.online.pix;

    return NextResponse.json(
      { restaurant: { ...restaurant, acceptsOnlinePayment, paymentOptions }, categories: filteredCategories },
```

(The response is cached for 60 seconds. That is safe: the order route validates the choice again on the server.)

- [ ] **Step 5: Validate and store the choice in the order route**

In `app/api/public/delivery/order/route.ts` make these six edits.

Edit 1 — imports. Replace:

```typescript
import { prisma } from '@/lib/prisma';
```

with:

```typescript
import { prisma } from '@/lib/prisma';
import { getDeliveryPaymentOptions } from '@/lib/delivery-payments/settings-service';
import { validatePaymentChoice, describePaymentForKitchen } from '@/lib/delivery-payments/choice';
```

Edit 2 — read the new fields. Replace:

```typescript
      specialInstructions,
      deliveryFee = 0,
    } = body;
```

with:

```typescript
      specialInstructions,
      deliveryFee = 0,
      paymentMethod,
      changeFor,
      voucherBrand,
    } = body;
```

Edit 3 — validate right after the server computes the total (before any Customer is created, so a bad choice leaves nothing behind). Replace:

```typescript
    const total = subtotal + safeDeliveryFee;
    const orderNumber = generateOrderNumber();
```

with:

```typescript
    const total = subtotal + safeDeliveryFee;

    // The payment choice is validated on the server against what this restaurant
    // offers (its settings and its Mercado Pago connection) and against the
    // server-computed total; nothing the browser says about availability is trusted.
    const paymentOptions = await getDeliveryPaymentOptions(restaurantId);
    const choiceResult = validatePaymentChoice(paymentOptions, { paymentMethod, changeFor, voucherBrand }, total);
    if (!choiceResult.ok) {
      return NextResponse.json({ error: choiceResult.error }, { status: 400 });
    }
    const choice = choiceResult.choice;

    const orderNumber = generateOrderNumber();
```

Edit 4 — store the choice. Replace:

```typescript
        fees: safeDeliveryFee,
        total,
        specialInstructions: [
```

with:

```typescript
        fees: safeDeliveryFee,
        total,
        paymentMethod: choice.paymentMethod,
        cashChangeFor: choice.changeFor,
        voucherBrand: choice.voucherBrand,
        specialInstructions: [
```

Edit 5 — the kitchen note (the KDS card already shows `Order.specialInstructions`). Replace:

```typescript
          deliveryReference ? `Referência: ${deliveryReference}` : '',
          `Cliente: ${customerName} - ${customerPhone}`,
```

with:

```typescript
          deliveryReference ? `Referência: ${deliveryReference}` : '',
          describePaymentForKitchen(choice, total),
          `Cliente: ${customerName} - ${customerPhone}`,
```

Edit 6 — return the choice. Replace:

```typescript
        itemCount: order.totalItems,
      },
```

with:

```typescript
        itemCount: order.totalItems,
        paymentMethod: choice.paymentMethod,
        paymentSummary: describePaymentForKitchen(choice, total),
      },
```

- [ ] **Step 6: [DB] Run both tests to verify they pass**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/delivery-order-payment.test.ts __tests__/integration/api/delivery-menu-payment-options.test.ts`
Expected: PASS, 8 + 4 tests. Also re-run the Mercado Pago plan's `mp-public-flag.test.ts`: its `acceptsOnlinePayment` expectations still hold.

- [ ] **Step 7: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add __tests__/integration/api/delivery-order-payment.test.ts __tests__/integration/api/delivery-menu-payment-options.test.ts "app/api/public/delivery/menu/[restaurantId]/route.ts" app/api/public/delivery/order/route.ts
git commit -m "feat: validate and store the delivery payment choice, expose payment options"
```

---

## Task 5: Online card checkout for delivery

**Files:**
- Modify: `lib/mercado-pago.ts` (optional `excludedPaymentTypes` on the preference)
- Create: `app/api/pagamentos/mp/delivery-checkout/route.ts`
- Test: `__tests__/unit/mp-preference-exclusions.test.ts`
- Test: `__tests__/integration/api/mp-delivery-checkout.test.ts` **[DB]**

**Interfaces:**
- Consumes: `resolvePixTarget` (`pix-target.ts`), `normalizePayer` and `ONLINE_PAYMENT_UNAVAILABLE` (`pix-service.ts`), `getMpClientForRestaurant` / `markNeedsReconnect` (`connection-service.ts`), `notificationUrlFor` / `isUnauthorizedError` (`payments.ts`), `createCheckoutPreference(input, client)` (`lib/mercado-pago.ts`, Mercado Pago plan Task 6), the Order `paymentMethod` column (Task 1).
- Produces:
  - `CreatePreferenceInput.excludedPaymentTypes?: string[]` in `lib/mercado-pago.ts`: each id becomes `{ id }` in `payment_methods.excluded_payment_types`; omitted means `[]` exactly as today.
  - `POST /api/pagamentos/mp/delivery-checkout` (public) body `{ orderId, payerEmail?, payerName? }` → `200 { success: true, paymentId, initPoint }`; `409` when the order was not created with `ONLINE_CARD`, is already paid/cancelled, or the restaurant has no usable connection (`code: 'ONLINE_PAYMENT_UNAVAILABLE'`); `404` for an unknown order; `502` when Mercado Pago fails. The amount and the restaurant come from the order on the server. The customer returns to `/delivery/<restaurantId>?payment=<our Payment.id>&n=<orderNumber>&result=<success|failure|pending>`; the existing `GET /api/pagamentos/mp/pix/status` works for this payment id.

- [ ] **Step 1: Write the failing unit test for the exclusion**

Create `__tests__/unit/mp-preference-exclusions.test.ts`:

```typescript
// @ts-nocheck
jest.mock('mercadopago', () => {
  const preferenceCreate = jest.fn().mockResolvedValue({ id: 'pref' });
  return {
    __mocks: { preferenceCreate },
    MercadoPagoConfig: jest.fn(),
    Payment: jest.fn(),
    Preference: jest.fn(() => ({ create: preferenceCreate })),
    PreApproval: jest.fn(),
    MerchantOrder: jest.fn(),
  };
});

import * as mp from 'mercadopago';
import { createCheckoutPreference } from '../../lib/mercado-pago';

const mocks = (mp as any).__mocks;
const client = { accessToken: 'restaurant-token' } as any;

const input = {
  orderId: 'o1',
  items: [{ id: 'i', title: 'Pedido', quantity: 1, unitPrice: 25 }],
  payer: { email: 'a@b.com' },
  backUrls: { success: 's', failure: 'f', pending: 'p' },
  notificationUrl: 'https://x/webhook?rid=r1',
  externalReference: 'pay1',
};

describe('createCheckoutPreference excludedPaymentTypes', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps today\'s behavior when nothing is excluded (billing and staff checkout)', async () => {
    await createCheckoutPreference(input, client);
    const body = mocks.preferenceCreate.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual([]);
    expect(body.payment_methods.installments).toBe(12);
  });

  it('sends each excluded payment type as an { id } object', async () => {
    await createCheckoutPreference({ ...input, excludedPaymentTypes: ['ticket', 'atm'] }, client);
    const body = mocks.preferenceCreate.mock.calls[0][0].body;
    expect(body.payment_methods.excluded_payment_types).toEqual([{ id: 'ticket' }, { id: 'atm' }]);
    expect(body.payment_methods.installments).toBe(12);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-preference-exclusions.test.ts`
Expected: FAIL — the second test gets `[]` because `excludedPaymentTypes` is ignored.

- [ ] **Step 3: Add the option in `lib/mercado-pago.ts`** (CRLF file: preserve line endings)

In `interface CreatePreferenceInput`, replace:

```typescript
  statementDescriptor?: string;
}
```

with:

```typescript
  statementDescriptor?: string;
  /** Mercado Pago payment TYPE ids to hide at checkout, e.g. 'ticket' (boleto) and 'atm'. */
  excludedPaymentTypes?: string[];
}
```

and in `createCheckoutPreference`, replace:

```typescript
      excluded_payment_types: [],
```

with:

```typescript
      excluded_payment_types: (input.excludedPaymentTypes ?? []).map((id) => ({ id })),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-preference-exclusions.test.ts __tests__/unit/mp-lib-client-param.test.ts`
Expected: PASS (2 + 4 tests). The second file guards that the platform-billing behavior is unchanged.

- [ ] **Step 5: Write the failing integration test for the route** **[DB]**

Create `__tests__/integration/api/mp-delivery-checkout.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
}));

import { createCheckoutPreference } from '../../../lib/mercado-pago';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST } from '../../../app/api/pagamentos/mp/delivery-checkout/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PREFERENCE = { id: 'pref-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

describe('POST /api/pagamentos/mp/delivery-checkout', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ['CREDENTIALS_ENCRYPTION_KEY', 'NEXTAUTH_URL'].forEach((k) => (saved[k] = process.env[k]));
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    Object.entries(saved).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    createCheckoutPreference.mockResolvedValue(PREFERENCE);
  });

  const makeOrder = (overrides = {}) =>
    prisma.order.create({
      data: {
        restaurantId: A.restaurantId,
        orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`,
        total: 57.9,
        paymentStatus: 'PENDING',
        paymentMethod: 'ONLINE_CARD',
        ...overrides,
      },
    });

  const post = (payload: any) =>
    POST(new Request('https://gastrux.test/api/pagamentos/mp/delivery-checkout', { method: 'POST', body: JSON.stringify(payload) }) as any);

  it('requires an order id and 404s for an unknown order', async () => {
    expect((await post({})).status).toBe(400);
    expect((await post({ orderId: 'nope' })).status).toBe(404);
  });

  it('refuses an order that was not created with online card, or is already paid', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const cash = await makeOrder({ paymentMethod: 'CASH' });
    const paid = await makeOrder({ paymentStatus: 'APPROVED' });

    expect((await post({ orderId: cash.id })).status).toBe(409);
    expect((await post({ orderId: paid.id })).status).toBe(409);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it('answers 409 and creates nothing without a usable connection, and never uses another restaurant\'s', async () => {
    const order = await makeOrder();
    expect((await post({ orderId: order.id })).status).toBe(409);

    await saveConnection(B.restaurantId, TOKENS);
    const res = await post({ orderId: order.id });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("creates the payment and the preference with the restaurant's own token and a server-computed amount", async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();

    const res = await post({ orderId: order.id, amount: 1, payerEmail: 'cli@ex.com', payerName: 'Maria Souza' });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ success: true, paymentId: expect.any(String), initPoint: 'https://mp/init' });

    const payment = await prisma.payment.findUnique({ where: { id: json.paymentId } });
    expect(payment).toMatchObject({ restaurantId: A.restaurantId, orderId: order.id, gateway: 'MERCADO_PAGO_CONNECT', method: 'MERCADO_PAGO', status: 'PENDING' });
    expect(Number(payment.amount)).toBe(57.9);
    expect(payment.platformFee).toBeNull();

    const [input, client] = createCheckoutPreference.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(input.items[0].unitPrice).toBe(57.9);
    expect(input.externalReference).toBe(payment.id);
    expect(input.notificationUrl).toBe(`https://gastrux.test/api/pagamentos/mp/webhook?rid=${A.restaurantId}`);
    expect(input.excludedPaymentTypes).toEqual(['ticket', 'atm']);
    expect(input.backUrls.success).toContain(`/delivery/${A.restaurantId}?payment=${payment.id}&n=${encodeURIComponent(order.orderNumber)}&result=success`);
    expect(input.payer).toMatchObject({ email: 'cli@ex.com', name: 'Maria Souza' });

    const tx = await prisma.mercadoPagoTransaction.findFirst({ where: { paymentId: payment.id } });
    expect(tx.preferenceId).toBe('pref-1');
  });

  it('reuses the pending checkout for the same order instead of creating another', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();

    const first = await (await post({ orderId: order.id })).json();
    const second = await (await post({ orderId: order.id })).json();

    expect(second).toEqual(first);
    expect(createCheckoutPreference).toHaveBeenCalledTimes(1);
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('cancels the payment and asks to reconnect when Mercado Pago answers 401', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();
    createCheckoutPreference.mockRejectedValue({ status: 401, message: 'unauthorized' });

    const res = await post({ orderId: order.id });

    expect(res.status).toBe(409);
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
    expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('CANCELLED');
  });

  it('returns 502 and cancels the payment on other Mercado Pago errors', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const order = await makeOrder();
    createCheckoutPreference.mockRejectedValue(new Error('MP down'));

    const res = await post({ orderId: order.id });

    expect(res.status).toBe(502);
    expect((await getConnection(A.restaurantId)).status).toBe('ACTIVE');
    expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('CANCELLED');
  });
});
```

- [ ] **Step 6: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-delivery-checkout.test.ts`
Expected: FAIL — `Cannot find module '../../../app/api/pagamentos/mp/delivery-checkout/route'`. Only after the DB gate is lifted.

- [ ] **Step 7: Implement the route** — `app/api/pagamentos/mp/delivery-checkout/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCheckoutPreference } from '@/lib/mercado-pago';
import { getMpClientForRestaurant, markNeedsReconnect } from '@/lib/mercadopago-connect/connection-service';
import { isUnauthorizedError, notificationUrlFor } from '@/lib/mercadopago-connect/payments';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { normalizePayer, ONLINE_PAYMENT_UNAVAILABLE } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/** Reuse a pending checkout only while its link is surely still valid. */
const REUSE_WINDOW_MS = 25 * 60 * 1000;

/** Boleto and ATM/bank-slip payments take days to clear: unsuitable for a delivery order. */
const EXCLUDED_PAYMENT_TYPES = ['ticket', 'atm'];

function parseMetadata(raw: string | null): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * POST /api/pagamentos/mp/delivery-checkout
 * Public (the customer has no login). Creates a Checkout Pro preference, with
 * the RESTAURANT's own token, for a delivery order the customer chose to pay
 * by card online. The restaurant and the amount come from the order on the
 * server; the browser only names the order.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) || {};

    const resolved = await resolvePixTarget({ orderId: body.orderId });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    const target = resolved.target;
    if (!target.orderId) return NextResponse.json({ error: 'Informe orderId' }, { status: 400 });

    const order = await prisma.order.findUnique({
      where: { id: target.orderId },
      select: { orderNumber: true, paymentMethod: true },
    });
    if (!order || order.paymentMethod !== 'ONLINE_CARD') {
      return NextResponse.json({ error: 'Este pedido não usa pagamento com cartão online' }, { status: 409 });
    }

    const client = await getMpClientForRestaurant(target.restaurantId);
    if (!client) {
      return NextResponse.json({ error: ONLINE_PAYMENT_UNAVAILABLE, code: 'ONLINE_PAYMENT_UNAVAILABLE' }, { status: 409 });
    }

    const reusable = await prisma.payment.findFirst({
      where: {
        restaurantId: target.restaurantId,
        orderId: target.orderId,
        gateway: 'MERCADO_PAGO_CONNECT',
        method: 'MERCADO_PAGO',
        status: 'PENDING',
        amount: target.amount,
        createdAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });
    const storedInitPoint = reusable ? parseMetadata(reusable.metadata).initPoint : null;
    if (reusable && storedInitPoint) {
      return NextResponse.json({ success: true, paymentId: reusable.id, initPoint: storedInitPoint });
    }

    const payer = normalizePayer({ payerEmail: body.payerEmail, payerName: body.payerName });
    const payment = await prisma.payment.create({
      data: {
        restaurantId: target.restaurantId,
        orderId: target.orderId,
        amount: target.amount,
        currency: 'BRL',
        method: 'MERCADO_PAGO',
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'PENDING',
        description: target.description,
        customerEmail: payer.email,
        customerName: payer.name,
        metadata: JSON.stringify({ ...target.metadata, source: 'delivery-card' }),
      },
    });

    const base = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '');
    const back = (result: string) =>
      `${base}/delivery/${target.restaurantId}?payment=${payment.id}&n=${encodeURIComponent(order.orderNumber)}&result=${result}`;

    try {
      const preference = await createCheckoutPreference(
        {
          orderId: target.orderId,
          items: [{ id: order.orderNumber, title: target.description, quantity: 1, unitPrice: target.amount }],
          payer: { email: payer.email, name: payer.name },
          backUrls: { success: back('success'), failure: back('failure'), pending: back('pending') },
          notificationUrl: notificationUrlFor(target.restaurantId),
          externalReference: payment.id,
          autoReturn: 'approved',
          excludedPaymentTypes: EXCLUDED_PAYMENT_TYPES,
        },
        client
      );

      await prisma.mercadoPagoTransaction.create({
        data: {
          paymentId: payment.id,
          preferenceId: preference.id,
          externalReference: payment.id,
          initPoint: preference.init_point,
          sandboxInitPoint: preference.sandbox_init_point,
        },
      });
      await prisma.payment.update({
        where: { id: payment.id },
        data: { metadata: JSON.stringify({ ...target.metadata, source: 'delivery-card', initPoint: preference.init_point }) },
      });

      return NextResponse.json({ success: true, paymentId: payment.id, initPoint: preference.init_point });
    } catch (error) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});

      if (isUnauthorizedError(error)) {
        await markNeedsReconnect(target.restaurantId, 'Mercado Pago rejeitou o token (401)');
        return NextResponse.json({ error: ONLINE_PAYMENT_UNAVAILABLE, code: 'ONLINE_PAYMENT_UNAVAILABLE' }, { status: 409 });
      }
      console.error('[delivery-checkout] preference creation failed:', error);
      return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, { status: 502 });
    }
  } catch (error) {
    console.error('[delivery-checkout] error:', error);
    return NextResponse.json({ error: 'Erro ao iniciar pagamento com cartão' }, { status: 500 });
  }
}
```

- [ ] **Step 8: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-delivery-checkout.test.ts`
Expected: PASS, 7 tests. (Only after the DB gate is lifted.)

- [ ] **Step 9: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add lib/mercado-pago.ts app/api/pagamentos/mp/delivery-checkout/route.ts __tests__/unit/mp-preference-exclusions.test.ts __tests__/integration/api/mp-delivery-checkout.test.ts
git commit -m "feat: add online card checkout for delivery orders"
```


---

## Task 6: UI components

**Files:**
- Create: `components/delivery/payment-method-selector.tsx`
- Create: `components/delivery/payment-return.tsx`
- Create: `components/delivery/payment-settings-card.tsx`

**Interfaces:**
- Consumes: Task 2 (`DeliveryPaymentOptions`, `DeliveryPaymentMethod`, `DeliveryPaymentSettingsData`, `VOUCHER_BRANDS`, `VOUCHER_BRAND_IDS`, `hasAnyPaymentOption`), `GET|PUT /api/admin/delivery/payment-settings` (Task 3), `GET /api/pagamentos/mp/pix/status` (Mercado Pago plan Task 8), the existing `Card`, `Button`, `Input` components and `formatBRL` from `lib/formatters.ts`.
- Produces:
  - `PaymentMethodSelector({ options, total, value, onChange })`, `type PaymentChoice = { method: DeliveryPaymentMethod | null; changeFor: string; voucherBrand: string }`, `EMPTY_PAYMENT_CHOICE`, `parseChangeInput(text: string): { valid: boolean; value?: number }`
  - `PaymentReturn({ restaurantId, paymentId, orderNumber })`
  - `PaymentSettingsCard()`

These components have no automated test (no DOM in the Jest setup): verify with the type-check here and the manual steps of Task 8.

- [ ] **Step 1: Create the customer selector**

Create `components/delivery/payment-method-selector.tsx`:

```tsx
'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Banknote, CreditCard, QrCode, Ticket, Wallet } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';
import {
  VOUCHER_BRANDS,
  hasAnyPaymentOption,
  type DeliveryPaymentMethod,
  type DeliveryPaymentOptions,
} from '@/lib/delivery-payments/choice';

export interface PaymentChoice {
  method: DeliveryPaymentMethod | null;
  /** Text typed by the customer, "100" or "100,50"; converted with parseChangeInput before sending. */
  changeFor: string;
  voucherBrand: string;
}

export const EMPTY_PAYMENT_CHOICE: PaymentChoice = { method: null, changeFor: '', voucherBrand: '' };

/** Empty is valid (no change needed); a positive number is valid; anything else is not. */
export function parseChangeInput(text: string): { valid: boolean; value?: number } {
  const trimmed = text.trim();
  if (!trimmed) return { valid: true };
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? { valid: true, value } : { valid: false };
}

interface Row {
  method: DeliveryPaymentMethod;
  label: string;
  hint: string;
  icon: ReactNode;
}

interface Props {
  options?: DeliveryPaymentOptions;
  total: number;
  value: PaymentChoice;
  onChange: (value: PaymentChoice) => void;
}

function OptionRow({ row, selected, onSelect }: { row: Row; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
        selected ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-300' : 'border-gray-200 bg-white hover:border-orange-300'
      }`}
    >
      <span className={selected ? 'text-orange-600' : 'text-gray-500'}>{row.icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{row.label}</span>
        <span className="block text-xs text-gray-500">{row.hint}</span>
      </span>
      <span
        className={`h-4 w-4 rounded-full border ${selected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'}`}
        aria-hidden="true"
      />
    </button>
  );
}

export function PaymentMethodSelector({ options, total, value, onChange }: Props) {
  if (!options) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-600">Não foi possível carregar as formas de pagamento. Recarregue a página.</p>
      </Card>
    );
  }
  if (!hasAnyPaymentOption(options)) {
    return (
      <Card className="p-4">
        <p className="text-sm text-gray-600">
          Este restaurante ainda não configurou as formas de pagamento do delivery. Fale com o restaurante.
        </p>
      </Card>
    );
  }

  const online: Row[] = [];
  if (options.online.pix) {
    online.push({ method: 'ONLINE_PIX', label: 'PIX', hint: 'Pague agora com QR Code', icon: <QrCode className="h-5 w-5" /> });
  }
  if (options.online.card) {
    online.push({
      method: 'ONLINE_CARD',
      label: 'Cartão de crédito ou débito',
      hint: 'Pague agora pelo Mercado Pago (aceita também saldo Mercado Pago)',
      icon: <CreditCard className="h-5 w-5" />,
    });
  }

  const onDelivery: Row[] = [];
  const d = options.onDelivery;
  if (d.cash) onDelivery.push({ method: 'CASH', label: 'Dinheiro', hint: 'Pague ao receber o pedido', icon: <Banknote className="h-5 w-5" /> });
  if (d.credit) {
    onDelivery.push({ method: 'CREDIT_ON_DELIVERY', label: 'Cartão de crédito', hint: 'Na maquininha, na entrega', icon: <CreditCard className="h-5 w-5" /> });
  }
  if (d.debit) {
    onDelivery.push({ method: 'DEBIT_ON_DELIVERY', label: 'Cartão de débito', hint: 'Na maquininha, na entrega', icon: <CreditCard className="h-5 w-5" /> });
  }
  if (d.voucher.enabled) {
    onDelivery.push({ method: 'VOUCHER_ON_DELIVERY', label: 'Vale-refeição / alimentação', hint: 'Na maquininha, na entrega', icon: <Ticket className="h-5 w-5" /> });
  }

  const select = (method: DeliveryPaymentMethod) => onChange({ ...value, method });

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-bold text-sm flex items-center gap-2">
        <Wallet className="h-4 w-4" /> Forma de Pagamento
      </h3>

      {online.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Pagar agora">
          <p className="text-xs font-medium uppercase text-gray-500">Pagar agora</p>
          {online.map((row) => (
            <OptionRow key={row.method} row={row} selected={value.method === row.method} onSelect={() => select(row.method)} />
          ))}
        </div>
      )}

      {onDelivery.length > 0 && (
        <div className="space-y-2" role="radiogroup" aria-label="Pagar na entrega">
          <p className="text-xs font-medium uppercase text-gray-500">Pagar na entrega</p>
          {onDelivery.map((row) => (
            <OptionRow key={row.method} row={row} selected={value.method === row.method} onSelect={() => select(row.method)} />
          ))}
        </div>
      )}

      {value.method === 'CASH' && (
        <div>
          <label className="text-xs font-medium text-gray-600">Troco para quanto? (opcional)</label>
          <Input
            inputMode="decimal"
            placeholder="Ex.: 100,00"
            value={value.changeFor}
            onChange={(e) => onChange({ ...value, changeFor: e.target.value })}
          />
          <p className="mt-1 text-xs text-gray-500">
            Total do pedido: {formatBRL(total)}. Deixe em branco se não precisar de troco.
          </p>
        </div>
      )}

      {value.method === 'VOUCHER_ON_DELIVERY' && (
        <div>
          <label className="text-xs font-medium text-gray-600">Bandeira do vale</label>
          <select
            className="w-full rounded-lg border p-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-300"
            value={value.voucherBrand}
            onChange={(e) => onChange({ ...value, voucherBrand: e.target.value })}
          >
            <option value="">Escolha a bandeira</option>
            {d.voucher.brands.map((id) => (
              <option key={id} value={id}>
                {VOUCHER_BRANDS[id] ?? id}
              </option>
            ))}
          </select>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Create the return-from-checkout screen**

Create `components/delivery/payment-return.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';

type ReturnState = 'checking' | 'approved' | 'failed' | 'timeout';

const POLL_MS = 4000;
const MAX_POLLS = 150; // about 10 minutes

interface Props {
  restaurantId: string;
  paymentId: string;
  orderNumber: string;
}

/**
 * Shown when the customer comes back from Mercado Pago's card checkout
 * (?payment=<our Payment.id>&n=<order number>). It asks OUR server for the
 * payment status; the webhook is what actually marks the payment as paid.
 */
export function PaymentReturn({ restaurantId, paymentId, orderNumber }: Props) {
  const [state, setState] = useState<ReturnState>('checking');

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    const check = async () => {
      attempts += 1;
      try {
        const res = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${encodeURIComponent(paymentId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.approved) {
          setState('approved');
          return;
        }
        if (['declined', 'cancelled', 'chargeback'].includes(data.status)) {
          setState('failed');
          return;
        }
      } catch {
        /* keep polling */
      }
      if (attempts >= MAX_POLLS) {
        if (!cancelled) setState('timeout');
        return;
      }
      timer = setTimeout(check, POLL_MS);
    };

    timer = setTimeout(check, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paymentId]);

  const backToMenu = () => {
    window.location.href = `/delivery/${restaurantId}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <Card className="p-8 text-center max-w-md w-full space-y-4">
        {state === 'checking' && (
          <>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-orange-600" />
            <h2 className="text-xl font-bold">Confirmando seu pagamento...</h2>
            <p className="text-sm text-gray-600">Pedido #{orderNumber}. Isso leva só alguns instantes.</p>
          </>
        )}
        {state === 'approved' && (
          <>
            <CheckCircle className="h-14 w-14 mx-auto text-green-600" />
            <h2 className="text-2xl font-bold text-green-800">Pagamento confirmado!</h2>
            <p className="text-gray-600">
              Seu pedido <span className="font-bold">#{orderNumber}</span> foi recebido pelo restaurante.
            </p>
          </>
        )}
        {state === 'failed' && (
          <>
            <XCircle className="h-14 w-14 mx-auto text-red-600" />
            <h2 className="text-xl font-bold text-red-700">Pagamento não aprovado</h2>
            <p className="text-sm text-gray-600">
              O pagamento do pedido #{orderNumber} não foi concluído. Fale com o restaurante ou faça um novo pedido.
            </p>
          </>
        )}
        {state === 'timeout' && (
          <>
            <Clock className="h-14 w-14 mx-auto text-orange-500" />
            <h2 className="text-xl font-bold">Ainda aguardando o pagamento</h2>
            <p className="text-sm text-gray-600">
              Não recebemos a confirmação do pedido #{orderNumber}. Se você já pagou, ela pode levar mais alguns minutos: fale com o restaurante.
            </p>
          </>
        )}
        <Button className="w-full" onClick={backToMenu}>
          Voltar ao cardápio
        </Button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Create the restaurant settings card**

Create `components/delivery/payment-settings-card.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Wallet } from 'lucide-react';
import { VOUCHER_BRANDS, VOUCHER_BRAND_IDS, type DeliveryPaymentSettingsData } from '@/lib/delivery-payments/choice';

interface Loaded {
  settings: DeliveryPaymentSettingsData;
  online: { connected: boolean };
}

export function PaymentSettingsCard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [settings, setSettings] = useState<DeliveryPaymentSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/delivery/payment-settings');
      if (!res.ok) throw new Error();
      const json: Loaded = await res.json();
      setData(json);
      setSettings(json.settings);
    } catch {
      toast.error('Não foi possível carregar as formas de pagamento');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/delivery/payment-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error || 'Não foi possível salvar');
        return;
      }
      setData(json);
      setSettings(json.settings);
      toast.success('Formas de pagamento salvas');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </Card>
    );
  }
  if (!data || !settings) return null;

  const toggleBrand = (id: string) =>
    setSettings({
      ...settings,
      voucherBrands: settings.voucherBrands.includes(id)
        ? settings.voucherBrands.filter((b) => b !== id)
        : [...settings.voucherBrands, id],
    });

  const check = (label: string, key: 'acceptCash' | 'acceptCreditOnDelivery' | 'acceptDebitOnDelivery' | 'acceptVoucherOnDelivery') => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={settings[key]}
        onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })}
      />
      {label}
    </label>
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Wallet className="h-6 w-6 text-orange-600 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold">Formas de pagamento do delivery</h2>
          <p className="text-sm text-gray-600">Escolha o que seus clientes podem usar ao pedir pelo link de delivery.</p>
        </div>
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">Pagar agora (PIX, cartão de crédito e débito, saldo Mercado Pago)</p>
        {data.online.connected ? (
          <p className="text-green-700">Ativo: seu Mercado Pago está conectado.</p>
        ) : (
          <p className="text-gray-600">
            Indisponível até você conectar o Mercado Pago.{' '}
            <Link href="/dashboard/pagamentos/conectar" className="text-orange-600 underline">
              Conectar agora
            </Link>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Pagar na entrega</p>
        {check('Dinheiro (com troco)', 'acceptCash')}
        {check('Cartão de crédito na maquininha', 'acceptCreditOnDelivery')}
        {check('Cartão de débito na maquininha', 'acceptDebitOnDelivery')}
        {check('Vale-refeição / alimentação na maquininha', 'acceptVoucherOnDelivery')}

        {settings.acceptVoucherOnDelivery && (
          <div className="ml-6 space-y-1">
            <p className="text-xs text-gray-600">Bandeiras aceitas:</p>
            <div className="flex flex-wrap gap-3">
              {VOUCHER_BRAND_IDS.map((id) => (
                <label key={id} className="flex items-center gap-1 text-sm">
                  <input type="checkbox" checked={settings.voucherBrands.includes(id)} onChange={() => toggleBrand(id)} />
                  {VOUCHER_BRANDS[id]}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        Salvar
      </Button>
    </Card>
  );
}
```

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors. (`lucide-react` must export `Banknote`, `Ticket`, `Wallet`, `QrCode`, `CreditCard`, `XCircle`, `Clock`, `CheckCircle`, `Loader2`; if an icon name is missing in the installed version, use the closest available icon.)

```bash
git add components/delivery/payment-method-selector.tsx components/delivery/payment-return.tsx components/delivery/payment-settings-card.tsx
git commit -m "feat: add delivery payment selector, checkout return screen and settings card"
```

---

## Task 7: Delivery page integration

**Files:**
- Modify: `app/delivery/[restaurantId]/page.tsx` (CRLF file: use the editing helper)

**Interfaces:**
- Consumes: Task 6 components, `restaurant.paymentOptions` and `order.paymentMethod` / `order.paymentSummary` (Task 4), `POST /api/pagamentos/mp/delivery-checkout` (Task 5), `POST /api/pagamentos/mp/pix` with `{ orderId, payerEmail?, payerName? }` and `GET /api/pagamentos/mp/pix/status` (Mercado Pago plan Task 8).
- Produces: the finished customer flow. This task supersedes the Mercado Pago plan's Task 11 Step 6 (delivery page), which is on hold and must not be applied.

There is no automated test: verify with `npx tsc --noEmit` and the manual steps of Task 8.

- [ ] **Step 1: Apply the edits**

Apply these thirteen replacements to `app/delivery/[restaurantId]/page.tsx` with the CRLF helper (each `old` string must match exactly once; write `\n` line breaks in the script).

Edit 1 — imports. Replace:

```typescript
import { toast } from 'sonner';

interface MenuItem {
```

with:

```typescript
import { toast } from 'sonner';
import {
  PaymentMethodSelector,
  EMPTY_PAYMENT_CHOICE,
  parseChangeInput,
  type PaymentChoice,
} from '@/components/delivery/payment-method-selector';
import { PaymentReturn } from '@/components/delivery/payment-return';
import type { DeliveryPaymentOptions } from '@/lib/delivery-payments/choice';

interface MenuItem {
```

Edit 2 — the restaurant type. Replace:

```typescript
  businessHours?: any;
}

interface CartItem {
```

with:

```typescript
  businessHours?: any;
  acceptsOnlinePayment?: boolean;
  paymentOptions?: DeliveryPaymentOptions;
}

interface CartItem {
```

Edit 3 — state and the return-from-checkout detection. Replace:

```typescript
  const [orderData, setOrderData] = useState<any>(null);
```

with:

```typescript
  const [orderData, setOrderData] = useState<any>(null);

  // Payment method chosen at checkout, and the state of a return from Mercado Pago's card checkout
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>(EMPTY_PAYMENT_CHOICE);
  const [returned, setReturned] = useState<{ paymentId: string; orderNumber: string } | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const paymentId = query.get('payment');
    const orderNumber = query.get('n');
    if (paymentId && orderNumber) setReturned({ paymentId, orderNumber });
  }, []);
```

Edit 4 — validate the choice before sending. Replace:

```typescript
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      toast.error('Preencha nome, telefone e endereço');
      return;
    }
    setSubmitting(true);
```

with:

```typescript
    if (!customerName.trim() || !customerPhone.trim() || !deliveryAddress.trim()) {
      toast.error('Preencha nome, telefone e endereço');
      return;
    }
    if (!paymentChoice.method) {
      toast.error('Escolha a forma de pagamento');
      return;
    }
    const change: { valid: boolean; value?: number } =
      paymentChoice.method === 'CASH' ? parseChangeInput(paymentChoice.changeFor) : { valid: true };
    if (!change.valid) {
      toast.error('Informe um valor válido para o troco');
      return;
    }
    if (paymentChoice.method === 'VOUCHER_ON_DELIVERY' && !paymentChoice.voucherBrand) {
      toast.error('Escolha a bandeira do vale-refeição');
      return;
    }
    setSubmitting(true);
```

Edit 5 — send the choice. Replace:

```typescript
          deliveryFee: DELIVERY_FEE,
        }),
```

with:

```typescript
          deliveryFee: DELIVERY_FEE,
          paymentMethod: paymentChoice.method,
          changeFor: change.value,
          voucherBrand: paymentChoice.method === 'VOUCHER_ON_DELIVERY' ? paymentChoice.voucherBrand : undefined,
        }),
```

Edit 6 — after the order exists, go online only for the online methods. Replace:

```typescript
      setOrderData(data.order);
      setStep('payment');
      toast.success('Pedido criado! Realize o pagamento.');
```

with:

```typescript
      setOrderData(data.order);
      if (data.order.paymentMethod === 'ONLINE_PIX' || data.order.paymentMethod === 'ONLINE_CARD') {
        setStep('payment');
        toast.success('Pedido criado! Realize o pagamento.');
      } else {
        // Pay on delivery: nothing else to do online.
        setStep('success');
        toast.success('Pedido enviado! O pagamento será feito na entrega.');
      }
```

Edit 7 — the PIX request sends only the order (the server computes the amount). Replace:

```typescript
        body: JSON.stringify({
          amount: orderData.total,
          description: `Delivery ${orderData.orderNumber}`,
          payerEmail: customerEmail || 'cliente@delivery.com',
          payerName: customerName,
          externalReference: orderData.id,
        }),
```

with:

```typescript
        body: JSON.stringify({
          orderId: orderData.id,
          payerEmail: customerEmail || undefined,
          payerName: customerName,
        }),
```

Edit 8 — start the card checkout. Insert immediately before `  function startPixPolling(paymentId: string) {` (replace that line with the new function followed by the same line):

```typescript
  async function startCardCheckout() {
    if (!orderData) return;
    setPixLoading(true);
    try {
      const res = await fetch('/api/pagamentos/mp/delivery-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: orderData.id,
          payerEmail: customerEmail || undefined,
          payerName: customerName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao iniciar pagamento com cartão');
      // Leaves the page: the customer pays at Mercado Pago and returns to /delivery/<id>?payment=...&n=...
      window.location.href = data.initPoint;
    } catch (err: any) {
      toast.error(err.message || 'Erro ao iniciar pagamento com cartão');
      setPixLoading(false);
    }
  }

  function startPixPolling(paymentId: string) {
```

Edit 9 — the payment step title. Replace:

```typescript
            <h1 className="text-lg font-bold">Pagamento PIX</h1>
```

with:

```typescript
            <h1 className="text-lg font-bold">Pagamento</h1>
```

Edit 10 — the payment step shows the card button for card orders. Replace:

```typescript
            {!pixData ? (
```

with:

```typescript
            {orderData?.paymentMethod === 'ONLINE_CARD' ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 text-center">
                  Você será levado ao Mercado Pago para pagar com cartão de crédito, débito ou saldo Mercado Pago, e depois volta para cá.
                </p>
                <Button className="w-full bg-orange-600 hover:bg-orange-700" onClick={startCardCheckout} disabled={pixLoading}>
                  {pixLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Abrindo o Mercado Pago...</> : <><CreditCard className="h-4 w-4 mr-2" /> Pagar com cartão</>}
                </Button>
              </div>
            ) : !pixData ? (
```

Edit 11 — the confirmation screen must not claim a payment that happens on delivery. Replace:

```typescript
            <p className="text-sm"><span className="font-medium">Status:</span> Pagamento confirmado ✔</p>
```

with:

```typescript
            <p className="text-sm"><span className="font-medium">Status:</span> {pixPaid ? 'Pagamento confirmado ✔' : orderData?.paymentSummary || 'Pagamento na entrega'}</p>
```

Edit 12 — back from the card checkout, confirm the payment instead of showing the menu. Replace:

```typescript
  if (loading) {
```

with:

```typescript
  // Back from Mercado Pago's card checkout: confirm the payment instead of showing the menu.
  if (returned) {
    return <PaymentReturn restaurantId={restaurantId} paymentId={returned.paymentId} orderNumber={returned.orderNumber} />;
  }

  if (loading) {
```

Edit 13 — the selector in the checkout step, and the submit button waits for a choice. Replace:

```typescript
          {/* Notes */}
```

with:

```typescript
          {/* Payment method */}
          <PaymentMethodSelector
            options={restaurant?.paymentOptions}
            total={grandTotal}
            value={paymentChoice}
            onChange={setPaymentChoice}
          />

          {/* Notes */}
```

and replace:

```typescript
            onClick={handleSubmitOrder}
            disabled={submitting || cart.length === 0}
```

with:

```typescript
            onClick={handleSubmitOrder}
            disabled={submitting || cart.length === 0 || !paymentChoice.method}
```

- [ ] **Step 2: Check the diff is only the intended hunks**

Run: `git diff --stat -- "app/delivery/[restaurantId]/page.tsx"`
Expected: a small diff (roughly 100 insertions and a few deletions), with no whole-file line-ending churn.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (`paymentChoice`, `change`, `orderData`, `returned` and the component props all resolve.)

- [ ] **Step 4: Commit**

```bash
git add "app/delivery/[restaurantId]/page.tsx"
git commit -m "feat: let delivery customers choose how to pay"
```

---

## Task 8: Admin page integration and final verification

**Files:**
- Modify: `app/admin/delivery-site/page.tsx` (CRLF file: use the editing helper)

**Interfaces:**
- Consumes: `PaymentSettingsCard` (Task 6).
- Produces: the settings card inside the existing delivery-site page.

- [ ] **Step 1: Add the card to the delivery-site page**

Apply two replacements with the CRLF helper.

Edit 1 — import. Replace:

```typescript
import { toast } from 'sonner';

export default function DeliverySitePage() {
```

with:

```typescript
import { toast } from 'sonner';
import { PaymentSettingsCard } from '@/components/delivery/payment-settings-card';

export default function DeliverySitePage() {
```

Edit 2 — render it below the existing card, at the end of the page. Replace:

```typescript
      </Card>
    </div>
  );
}
```

with:

```typescript
      </Card>

      <PaymentSettingsCard />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run every unit test**

Run: `npm run test:unit`
Expected: PASS for all files under `__tests__/unit/` (including `delivery-payment-choice.test.ts` and `mp-preference-exclusions.test.ts`).

- [ ] **Step 4: Audit**

Run: `grep -rn "acceptsOnlinePayment" app components lib --include=*.ts --include=*.tsx`
Expected: matches only the two public menu routes and the QR menu page (the delivery page must no longer branch on it: it uses `restaurant.paymentOptions`).

Run: `grep -rn "'/api/pagamentos/mp/pix'" app --include=*.tsx`
Expected: the delivery page's PIX request sends `orderId` (no `amount`); no page sends a browser-chosen amount to the public PIX route.

- [ ] **Step 5: [DB] Run the integration tests of this plan**

Only after the maintainer confirms `DATABASE_URL` is a dedicated test database and the migrations of both plans were applied.

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/delivery-payment-settings.test.ts __tests__/integration/api/delivery-order-payment.test.ts __tests__/integration/api/delivery-menu-payment-options.test.ts __tests__/integration/api/mp-delivery-checkout.test.ts`
Expected: PASS for all four files.

- [ ] **Step 6: Manual end-to-end**

Run `npm run dev` with the Mercado Pago configuration of that plan's Task 0, and use a Mercado Pago test seller and buyer. Check:
1. **Not connected:** `/delivery/<restaurantId>` shows only "Pagar na entrega" options (cash, credit, debit; vouchers only after the restaurant enables them). Choose cash with change 100 for a total below 100: the confirmation says "Pagamento na entrega: dinheiro — troco para R$ 100,00 (levar R$ ... de troco)". Submit with change below the total: the server refuses (toast with the server message).
2. **Kitchen note:** the new order's notes (KDS card and the admin orders list) contain the "Pagamento..." line with the change to bring or "levar maquininha".
3. **Connected:** "Pagar agora" appears with PIX and "Cartão de crédito ou débito". PIX: the QR appears (the amount is the order total), pay in the sandbox: the page reaches the confirmation.
4. **Card online:** choose the card option: the payment step shows "Pagar com cartão"; the button opens Mercado Pago's checkout (boleto and ATM options are not offered); pay with a test card: Mercado Pago returns to `/delivery/<id>?payment=...&n=...`, the page shows "Confirmando..." then "Pagamento confirmado!". The `Payment` is `APPROVED` (`gateway MERCADO_PAGO_CONNECT`) and `Order.paymentStatus` is `APPROVED`.
5. **Settings:** in `/admin/delivery-site` the "Formas de pagamento do delivery" card loads, saves, and the customer page reflects the change after the 60-second menu cache. Enabling vouchers without a brand is refused. The card links to `/dashboard/pagamentos/conectar` when not connected.
6. **Nothing offered:** with all four "na entrega" options off and no connection, the customer sees "ainda não configurou as formas de pagamento" and cannot submit.
7. **Old cached page:** an open tab from before the deploy that submits without a payment method gets "Escolha a forma de pagamento"; reloading fixes it.
8. **Vouchers:** with vouchers enabled and a brand, the order stores `voucherBrand` and the note names the brand.

- [ ] **Step 7: Rollout**

1. Apply the migration (`npx prisma migrate deploy`) after a database snapshot.
2. Deploy. Restaurants without saved settings immediately accept cash, credit and debit on delivery (vouchers stay off): nobody is left without a way to pay.
3. Tell restaurants about the new settings card, and to connect Mercado Pago to offer online payment.
4. Confirm with the Mercado Pago documentation that boleto/ATM exclusion ids (`ticket`, `atm`) are right, and whether Mercado Pago can process meal-voucher brands (spec, section 8).

- [ ] **Step 8: Commit**

```bash
git add app/admin/delivery-site/page.tsx
git commit -m "feat: add delivery payment settings card to the admin delivery page"
```
