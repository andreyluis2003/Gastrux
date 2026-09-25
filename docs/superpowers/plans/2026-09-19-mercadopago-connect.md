# Mercado Pago por Restaurante (OAuth Marketplace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each restaurant connect its own Mercado Pago account with one click (OAuth), so every PIX and card payment made by the restaurant's customers is created with the restaurant's own token and lands in the restaurant's account — never in the Gastrux platform account.

**Architecture:** A new `MercadoPagoConnection` table holds one encrypted OAuth token pair per restaurant. A small `lib/mercadopago-connect/` module owns OAuth, token refresh, and a `getMpClientForRestaurant()` factory. The public PIX route stops trusting the browser: it receives an `orderId` (delivery) or `qrToken` (table tab), computes the amount on the server, records a `Payment` row (`gateway = MERCADO_PAGO_CONNECT`), and creates the MP payment with the restaurant's token. The existing MP webhook gains a `?rid=<restaurantId>` branch that fetches the payment with the restaurant's token and applies an idempotent status transition; the branch without `rid` (Gastrux's own subscription billing) is left untouched.

**Tech Stack:** Next.js 14 (App Router) API routes, Prisma 6.7 / PostgreSQL, NextAuth session, `mercadopago` SDK 2.13.0, Node `crypto` (AES-256-GCM, HMAC), Jest (`jest.unit.config.js` new, no DB; `jest.integration.config.js` existing, real DB).

**Spec:** `docs/superpowers/specs/2026-09-19-mercadopago-connect-design.md` (read it first; the "Deviations from the spec" section below lists what this plan adds after reading the code).

## Global Constraints

- **No restaurant payment may use the platform token** (`MERCADO_PAGO_ACCESS_TOKEN`), in PIX, card checkout, refund or webhook. Only Gastrux's own subscription billing keeps the global token: `app/api/pagamentos/mp/preapproval/route.ts`, `app/api/billing/mp/*`, and the webhook branch without `rid`. Do not modify those.
- **No platform fee** for now. Do not implement `marketplace_fee`; it stays an optional future parameter.
- **No fallback to the platform account.** A restaurant without an `ACTIVE` connection gets `409` and the PIX option is hidden in the UI.
- **Credentials are encrypted at rest** with AES-256-GCM using `CREDENTIALS_ENCRYPTION_KEY` (32 bytes, base64). Stored format: `v1:<iv b64>:<tag b64>:<ciphertext b64>`. Tokens are never logged and never returned by any API.
- **Multi-tenant:** every Prisma query touching restaurant data is scoped by `restaurantId`. Use `requireAdminSession()` + `getCurrentRestaurantId()` from `lib/whatsapp/get-restaurant.ts`. Managing the connection (start/callback/disconnect) is strictly `OWNER` or `ADMIN` (a missing role is denied), as in `app/api/pagamentos/stripe/connect/route.ts`.
- **Mercado Pago endpoints and OAuth parameters live only in `lib/mercadopago-connect/oauth-client.ts`.** If Task 0 finds that the docs differ from what this plan assumes, only that file (and its tests) changes.
- **Expiry timezone:** PIX `date_of_expiration` is sent with the fixed `-03:00` offset (Brazil has no DST). PIX expires in 30 minutes.
- **Database gate.** `.env` points `DATABASE_URL` to a remote database (`hosteddb.reai.io`) that has not been confirmed as a disposable test database. Every integration test runs `cleanupAllTestData()` there and every migration writes there. **Steps tagged `[DB]` must NOT be run until the maintainer confirms `DATABASE_URL` points to a dedicated test database.** Write the code and the test first; run `[DB]` steps when unlocked. Pure logic is tested with `jest.unit.config.js`, which never connects to any database.
- **Commits:** the working tree contains many unrelated uncommitted changes. Stage explicit paths only (never `git add -A` or `git add .`). For `prisma/schema.prisma`, `.env.example`, `app/api/pagamentos/mp/webhook/route.ts` and `app/dashboard/pagamentos/page.tsx`, use `git add -p` and stage only this plan's hunks. Only commit if the maintainer has asked for commits; otherwise skip commit steps.
- **Test style:** unit tests use Jest globals (`describe`, `it`, `expect`, `jest`) without importing from `@jest/globals`, so `jest.mock` hoisting works. Add `// @ts-nocheck` at the top of test files, as the existing tests do.

## Deviations from the spec (found while reading the code)

The plan implements the spec plus these adjustments. The spec gets a matching "Revisões" section.

1. **`Order.paymentStatus` is never updated today.** Nothing in `app/api` or `lib` sets it after `POST /api/public/delivery/order` creates the order as `PENDING`. The spec assumed an existing path; there is none. The new webhook branch sets it to `APPROVED` (idempotently) when a `Payment` with an `orderId` is approved.
2. **QR-menu PIX has no order at all.** `app/menu/[qrToken]/page.tsx` sends a client-chosen `amount` and `mesa-<id>-<ts>` as reference. The route now accepts `{ qrToken }` and computes the amount from the table's open `OrderSession` items (`price × quantity`). The "Pagar com Pix agora" button therefore submits the cart first, then requests the PIX. The session is **not** auto-closed on payment (closing the tab is a staff action); the approved `Payment` shows in the dashboard.
3. **The existing refund helper cannot refund approved payments.** `lib/mercado-pago.ts#refundPayment` calls `Payment.cancel`, which the SDK documents as "only payments not yet approved". The Connect refund uses `PaymentRefund` (`create` for partial, `total` for full). The old helper is left as is.
4. **Token refresh runs on use as well as in cron.** No `vercel.json`/workflow schedules crons in this repo, so relying on cron alone is fragile. `getMpClientForRestaurant()` refreshes inline when the token expires within 24 hours. A claim (`updateMany` on `updatedAt`) prevents two concurrent refreshes from burning a single-use refresh token.
5. **No generic rate limiter exists** (`lib/` has none; `middleware.ts` does no limiting). Instead, creating a PIX for the same target with the same amount within 25 minutes reuses the existing pending `Payment` and its QR code.
6. **Disconnect deletes the row.** The status enum is `ACTIVE | NEEDS_RECONNECT` only (`REVOKED` from the spec is unnecessary).
7. **Route paths:** `GET|DELETE /api/pagamentos/mp/connect` (status / disconnect), `GET /api/pagamentos/mp/connect/start` (redirect to Mercado Pago), `GET /api/pagamentos/mp/connect/callback`, `POST /api/pagamentos/mp/connect/refresh` (cron).
8. **Delivery payment methods: SUPERSEDED (2026-09-19).** The maintainer decided delivery must offer every common payment method (PIX, credit, debit and more), so the "PIX only, otherwise pay on delivery" fallback proposed here is dropped. The delivery page is NOT changed by this plan (Task 11, Step 6 is on hold) until the delivery payment-methods design is approved.
9. **Webhook safety checks added:** the MP payment id must match `Payment.gatewayPaymentId` when already set, and an approval requires `transaction_amount` equal to `Payment.amount`.
10. **The new gateway value must appear in listings:** `app/api/pagamentos/route.ts` (GET filter only, not the POST allow-list), the payments dashboard filter/icon, and the reconciliation page.
11. **A third caller of the PIX route exists: the dashboard's "PIX avulso" page** (`app/dashboard/pagamentos/checkout/page.tsx`). Staff type an amount (there is no order) and the page polls `GET /pix?paymentId=`, which this plan removes. It gets an authenticated `POST /api/pagamentos/mp/pix/manual` (any signed-in staff member of the current restaurant, a cashier included; the restaurant comes from the session) and polls the new `/pix/status`. The public route stays strict (`orderId` or `qrToken` only).

## File Structure

| File | Responsibility |
|---|---|
| `jest.unit.config.js` (new) | Jest config for DB-free unit tests under `__tests__/unit/` |
| `lib/security/credential-crypto.ts` (new) | `encryptSecret` / `decryptSecret` (AES-256-GCM, versioned) |
| `lib/mercadopago-connect/oauth-state.ts` (new) | Signed, expiring OAuth `state` (HMAC) |
| `lib/mercadopago-connect/oauth-client.ts` (new) | Authorization URL, code exchange, token refresh (only place with MP OAuth endpoints) |
| `lib/mercadopago-connect/refresh-policy.ts` (new) | Pure functions: when to refresh, when a token is expired |
| `lib/mercadopago-connect/connection-service.ts` (new) | Persist/read/refresh/disconnect connections; `getMpClientForRestaurant` |
| `lib/mercadopago-connect/guard.ts` (new) | `requireConnectManager()` (OWNER/ADMIN + current restaurant) |
| `lib/mercadopago-connect/payments.ts` (new) | MP calls with a restaurant client: create PIX, get payment, refund |
| `lib/mercadopago-connect/payment-status.ts` (new) | Pure `canTransition(from, to)` |
| `lib/mercadopago-connect/payment-sync.ts` (new) | Apply an MP payment to our `Payment`/`Order` (used by webhook and status route) |
| `lib/mercadopago-connect/pix-target.ts` (new) | Resolve `{orderId}` / `{qrToken}` into restaurant + server-side amount |
| `lib/mercadopago-connect/pix-service.ts` (new) | Create (or reuse) the PIX for a resolved target |
| `app/api/pagamentos/mp/connect/**` (new) | Connect routes |
| `app/api/pagamentos/mp/pix/route.ts`, `.../pix/status/route.ts` (rewrite) | Public PIX create / status |
| `app/api/pagamentos/mp/pix/manual/route.ts` (new) | Authenticated staff "PIX avulso" (typed amount, no order) |
| `app/api/pagamentos/mp/webhook/route.ts` (modify) | `rid` branch |
| `app/api/pagamentos/mp/refund/route.ts`, `.../checkout/route.ts` (modify) | Restaurant token for `MERCADO_PAGO_CONNECT` |
| `lib/mercado-pago.ts` (modify) | Optional `client` argument on `getPayment`, `createCheckoutPreference`, `createPixPreference` |
| `prisma/schema.prisma` + 2 migrations (modify/new) | `MercadoPagoConnection`, `PaymentGateway.MERCADO_PAGO_CONNECT` |
| `app/api/public/delivery/menu/[restaurantId]/route.ts`, `app/api/public/menu/[qrToken]/route.ts` (modify) | `acceptsOnlinePayment` flag |
| `app/delivery/[restaurantId]/page.tsx`, `app/menu/[qrToken]/page.tsx`, `app/dashboard/pagamentos/checkout/page.tsx` (modify) | Send `orderId`/`qrToken` (or use the manual route), hide PIX when unavailable |
| `components/payments/mp-connect-card.tsx`, `mp-connect-banner.tsx`, `app/dashboard/pagamentos/conectar/page.tsx` (new) | Connection UI and migration notice |

---

## Task 0: Manual Mercado Pago configuration and premise check (prerequisite, no code)

**Files:** none. Done once by whoever administers the Gastrux Mercado Pago developer account.

**Interfaces:**
- Produces: `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY` values used by Tasks 1, 3 and 5; and the confirmed answers to the four premises below.

- [ ] **Step 1: Configure the OAuth application**

In `mercadopago.com.br/developers` → **Suas integrações** → the Gastrux application → enable OAuth / marketplace and register the redirect URL `https://gastrux.com/api/pagamentos/mp/connect/callback` (add your tunnel URL as well for local tests). Copy the **App ID** (this is `MERCADO_PAGO_CLIENT_ID`) and the **Client secret** (`MERCADO_PAGO_CLIENT_SECRET`).

- [ ] **Step 2: Confirm the webhook is registered**

In the same application → **Webhooks**, confirm the production URL is `https://gastrux.com/api/pagamentos/mp/webhook` with the **Pagamentos** event enabled, and note that the signature secret shown there is the value already used as `MERCADO_PAGO_WEBHOOK_SECRET_PROD`.

- [ ] **Step 3: Confirm the four premises against the current documentation**

Read the current Mercado Pago docs (OAuth for marketplaces, webhooks, payments) and record each answer in section 9 of the spec. These come from general knowledge, not from verified sources:

| # | Premise | Where it matters |
|---|---|---|
| 1 | Authorization URL `https://auth.mercadopago.com.br/authorization` with `client_id`, `response_type=code`, `platform_id=mp`, `state`, `redirect_uri`; token endpoint `POST https://api.mercadopago.com/oauth/token` with JSON body `client_id`, `client_secret`, `grant_type` (`authorization_code` with `code`+`redirect_uri`, or `refresh_token` with `refresh_token`); response has `access_token`, `refresh_token`, `user_id`, `public_key`, `live_mode`, `expires_in` (seconds) | `oauth-client.ts` |
| 2 | Validity of access token and refresh token, and whether a refresh token is single-use | refresh claim in `connection-service.ts` |
| 3 | The webhook signature secret is the same for payments of sellers connected by OAuth | webhook branch |
| 4 | Fee parameter name/semantics (`marketplace_fee`), for the future extension point | not implemented now |

If a premise is wrong, adjust only the file named in the last column before continuing.

- [ ] **Step 4: Generate the encryption key and set the variables**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Set in the local `.env` and in the production environment: `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`. Store the key in a secrets manager as well: **if it is lost, every stored token becomes unreadable and every restaurant must reconnect.**

- [ ] **Step 5: Check for real PIX that already went to the platform account**

In the Gastrux Mercado Pago account, search payments made through the old route (`description` starting with `Delivery ` or `Mesa `, or `external_reference` starting with `mesa-`). If any real payment exists, list it per restaurant: that money belongs to the restaurants and must be repaid outside this codebase.

- [ ] **Step 6: Schedule the refresh cron (after Task 5 is deployed)**

In the hosting platform, schedule a daily `POST https://gastrux.com/api/pagamentos/mp/connect/refresh` with header `Authorization: Bearer <CRON_SECRET>`.

---

## Task 1: Unit-test infrastructure and credential encryption

**Files:**
- Create: `jest.unit.config.js`
- Create: `lib/security/credential-crypto.ts`
- Test: `__tests__/unit/credential-crypto.test.ts`
- Modify: `package.json` (add a script)
- Modify: `.env.example`

**Interfaces:**
- Produces: `encryptSecret(plain: string): string`, `decryptSecret(payload: string): string` (both throw on a bad key/format/tampering), consumed by Task 4.

- [ ] **Step 1: Create the DB-free Jest config**

Create `jest.unit.config.js`:

```javascript
/**
 * Jest configuration for DB-free unit tests.
 * Unlike jest.integration.config.js this has no globalSetup / setupFilesAfterEnv,
 * so it never connects to DATABASE_URL and never runs cleanupAllTestData().
 */
module.exports = {
  displayName: 'unit',
  testMatch: ['**/__tests__/unit/**/*.test.ts'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json', diagnostics: false }],
  },
  testTimeout: 15000,
  verbose: true,
};
```

In `package.json`, inside `"scripts"`, add the line (keep the trailing comma rules of the file):

```json
    "test:unit": "jest --config jest.unit.config.js",
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/unit/credential-crypto.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { encryptSecret, decryptSecret } from '../../lib/security/credential-crypto';

const KEY_A = crypto.randomBytes(32).toString('base64');
const KEY_B = crypto.randomBytes(32).toString('base64');

describe('lib/security/credential-crypto', () => {
  const original = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_A;
  });

  afterAll(() => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = original;
  });

  it('round-trips a secret, including unicode', () => {
    const secret = 'APP_USR-1234567890-abcdef-ção-✓';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('produces a versioned payload that does not contain the plaintext', () => {
    const payload = encryptSecret('super-secret-token');
    expect(payload.startsWith('v1:')).toBe(true);
    expect(payload.split(':')).toHaveLength(4);
    expect(payload).not.toContain('super-secret-token');
  });

  it('uses a random IV, so encrypting twice gives different payloads', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('rejects a tampered ciphertext', () => {
    const [v, iv, tag, data] = encryptSecret('token').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] = flipped[0] ^ 0xff;
    expect(() => decryptSecret([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });

  it('rejects a payload encrypted with a different key', () => {
    const payload = encryptSecret('token');
    process.env.CREDENTIALS_ENCRYPTION_KEY = KEY_B;
    expect(() => decryptSecret(payload)).toThrow();
  });

  it('rejects a malformed payload', () => {
    expect(() => decryptSecret('not-a-payload')).toThrow('Formato de segredo criptografado inválido');
    expect(() => decryptSecret('v2:a:b:c')).toThrow('Formato de segredo criptografado inválido');
  });

  it('fails clearly when the key is missing or has the wrong size', () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow('CREDENTIALS_ENCRYPTION_KEY não configurada');
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptSecret('x')).toThrow('deve ter 32 bytes');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/credential-crypto.test.ts`
Expected: FAIL — `Cannot find module '../../lib/security/credential-crypto'`.

- [ ] **Step 4: Implement `lib/security/credential-crypto.ts`**

```typescript
import crypto from 'crypto';

/**
 * AES-256-GCM encryption for third-party credentials stored in the database
 * (OAuth access/refresh tokens today; other integrations later).
 *
 * Stored format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`. The version
 * prefix lets us rotate the algorithm or key later without a flag day.
 * Base64 never contains ':' so the payload splits unambiguously.
 */

const VERSION = 'v1';
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error('CREDENTIALS_ENCRYPTION_KEY não configurada');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY deve ter 32 bytes em base64');
  }
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) {
    throw new Error('Formato de segredo criptografado inválido');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/credential-crypto.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Document the new variable**

Add to `.env.example` (next to the other integration variables):

```
# Encryption key for stored third-party credentials (32 random bytes, base64).
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
# If lost, all stored OAuth tokens become unreadable and every restaurant must reconnect.
CREDENTIALS_ENCRYPTION_KEY=
```

- [ ] **Step 7: Commit**

```bash
git add jest.unit.config.js lib/security/credential-crypto.ts __tests__/unit/credential-crypto.test.ts
git add -p package.json .env.example
git commit -m "feat: add DB-free unit test config and AES-256-GCM credential encryption"
```

---

## Task 2: Prisma schema and migrations

**Files:**
- Modify: `prisma/schema.prisma` (new model + enum, `Restaurant` relation, `PaymentGateway` value)
- Create: `prisma/migrations/20260919120000_add_mercadopago_connections/migration.sql`
- Create: `prisma/migrations/20260919120100_add_payment_gateway_mercado_pago_connect/migration.sql`

**Interfaces:**
- Produces: Prisma models/enums `MercadoPagoConnection`, `MercadoPagoConnectionStatus` (`ACTIVE | NEEDS_RECONNECT`), and `PaymentGateway.MERCADO_PAGO_CONNECT`, used by Tasks 4 to 12.

- [ ] **Step 1: Snapshot the current schema for an offline diff**

Run: `cp prisma/schema.prisma "$TEMP/schema.before.prisma"`

- [ ] **Step 2: Add the enum value**

In `prisma/schema.prisma`, in `enum PaymentGateway`, add a line after `STRIPE_CONNECT`:

```prisma
enum PaymentGateway {
  MERCADO_PAGO
  STRIPE
  STRIPE_CONNECT
  MERCADO_PAGO_CONNECT
  MANUAL
}
```

- [ ] **Step 3: Add the model and status enum**

Append after the `WhatsAppConfig` model (any location works; keep it near other integration models):

```prisma
enum MercadoPagoConnectionStatus {
  ACTIVE
  NEEDS_RECONNECT
}

model MercadoPagoConnection {
  id               String                      @id @default(cuid())
  restaurantId     String                      @unique
  mpUserId         String
  accessToken      String
  refreshToken     String
  publicKey        String?
  liveMode         Boolean                     @default(true)
  lifetimeSeconds  Int
  expiresAt        DateTime
  status           MercadoPagoConnectionStatus @default(ACTIVE)
  connectedAt      DateTime                    @default(now())
  lastRefreshAt    DateTime?
  lastRefreshError String?
  createdAt        DateTime                    @default(now())
  updatedAt        DateTime                    @updatedAt
  restaurant       Restaurant                  @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@index([status, expiresAt])
  @@map("mercado_pago_connections")
}
```

`accessToken` and `refreshToken` store the `v1:` encrypted payload from Task 1, never plaintext.

- [ ] **Step 4: Add the relation on `Restaurant`**

In `model Restaurant`, right after the `mercadoPagoAccountId  String?` line, add:

```prisma
  mercadoPagoConnection MercadoPagoConnection?
```

- [ ] **Step 5: Validate and generate**

Run: `npx prisma validate` then `npx prisma generate`
Expected: both succeed; `grep -c "MercadoPagoConnection" node_modules/.prisma/client/index.d.ts` prints a number greater than 0.

- [ ] **Step 6: Write the migrations**

Create `prisma/migrations/20260919120000_add_mercadopago_connections/migration.sql`:

```sql
-- One row per restaurant: the restaurant's own Mercado Pago OAuth connection.
-- accessToken/refreshToken hold AES-256-GCM payloads ("v1:..."), never plaintext.
CREATE TYPE "MercadoPagoConnectionStatus" AS ENUM ('ACTIVE', 'NEEDS_RECONNECT');

CREATE TABLE "mercado_pago_connections" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "publicKey" TEXT,
    "liveMode" BOOLEAN NOT NULL DEFAULT true,
    "lifetimeSeconds" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "MercadoPagoConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRefreshAt" TIMESTAMP(3),
    "lastRefreshError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_pago_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_pago_connections_restaurantId_key" ON "mercado_pago_connections"("restaurantId");

CREATE INDEX "mercado_pago_connections_status_expiresAt_idx" ON "mercado_pago_connections"("status", "expiresAt");

ALTER TABLE "mercado_pago_connections" ADD CONSTRAINT "mercado_pago_connections_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Create `prisma/migrations/20260919120100_add_payment_gateway_mercado_pago_connect/migration.sql` (its own migration, because a new enum value cannot be used in the same transaction that adds it):

```sql
-- Payments received directly by a restaurant through its own Mercado Pago
-- account (as opposed to MERCADO_PAGO = Gastrux's own subscription billing).
ALTER TYPE "PaymentGateway" ADD VALUE 'MERCADO_PAGO_CONNECT';
```

- [ ] **Step 7: Verify the SQL matches the schema, offline**

Run: `npx prisma migrate diff --from-schema-datamodel "$TEMP/schema.before.prisma" --to-schema-datamodel prisma/schema.prisma --script`
Expected: prints `ALTER TYPE "PaymentGateway" ADD VALUE 'MERCADO_PAGO_CONNECT'`, `CREATE TYPE "MercadoPagoConnectionStatus"`, `CREATE TABLE "mercado_pago_connections"` and the index and foreign key statements, equivalent to the two migration files. If the generated SQL differs in column types or constraint names, fix the migration files to match it. This command needs no database.

- [ ] **Step 8: [DB] Apply the migrations**

Run: `npx prisma migrate deploy`
Expected: lists both new migrations as applied, exit code 0. **Warning:** `migrate deploy` also applies any other pending migration in `prisma/migrations/` (for example the untracked lead-qualification ones). Run `npx prisma migrate status` first and confirm the list of pending migrations is what you expect.

- [ ] **Step 9: Commit**

```bash
git add prisma/migrations/20260919120000_add_mercadopago_connections prisma/migrations/20260919120100_add_payment_gateway_mercado_pago_connect
git add -p prisma/schema.prisma
git commit -m "feat: add MercadoPagoConnection model and MERCADO_PAGO_CONNECT gateway"
```

---

## Task 3: OAuth state signing and the Mercado Pago OAuth client

**Files:**
- Create: `lib/mercadopago-connect/oauth-state.ts`
- Create: `lib/mercadopago-connect/oauth-client.ts`
- Test: `__tests__/unit/mp-oauth-state.test.ts`
- Test: `__tests__/unit/mp-oauth-client.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `process.env.NEXTAUTH_SECRET`, `MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `NEXTAUTH_URL`, `CREDENTIALS_ENCRYPTION_KEY`.
- Produces:
  - `createOAuthState(input: { restaurantId: string; userId: string }, now?: number): string`
  - `verifyOAuthState(state: string, now?: number): { restaurantId: string; userId: string; nonce: string; exp: number } | null`
  - `interface MpOAuthTokens { accessToken: string; refreshToken: string; mpUserId: string; publicKey: string | null; liveMode: boolean; lifetimeSeconds: number }`
  - `class MpOAuthError extends Error { status: number; revoked: boolean }`
  - `isConnectConfigured(): boolean`, `getRedirectUri(): string`, `buildAuthorizationUrl(state: string): string`, `exchangeCodeForTokens(code: string): Promise<MpOAuthTokens>`, `refreshTokens(refreshToken: string): Promise<MpOAuthTokens>`

- [ ] **Step 1: Write the failing tests for the state**

Create `__tests__/unit/mp-oauth-state.test.ts`:

```typescript
// @ts-nocheck
import { createOAuthState, verifyOAuthState } from '../../lib/mercadopago-connect/oauth-state';

describe('mercadopago-connect/oauth-state', () => {
  const original = process.env.NEXTAUTH_SECRET;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-nextauth-secret';
  });

  afterAll(() => {
    process.env.NEXTAUTH_SECRET = original;
  });

  it('round-trips restaurantId and userId', () => {
    const state = createOAuthState({ restaurantId: 'rest-1', userId: 'user-1' });
    const payload = verifyOAuthState(state);
    expect(payload?.restaurantId).toBe('rest-1');
    expect(payload?.userId).toBe('user-1');
    expect(typeof payload?.nonce).toBe('string');
  });

  it('is unique per call (random nonce)', () => {
    const a = createOAuthState({ restaurantId: 'r', userId: 'u' });
    const b = createOAuthState({ restaurantId: 'r', userId: 'u' });
    expect(a).not.toBe(b);
  });

  it('rejects an expired state', () => {
    const now = Date.now();
    const state = createOAuthState({ restaurantId: 'r', userId: 'u' }, now);
    expect(verifyOAuthState(state, now + 10 * 60 * 1000 + 1)).toBeNull();
    expect(verifyOAuthState(state, now + 5 * 60 * 1000)).not.toBeNull();
  });

  it('rejects a tampered body (e.g. swapping the restaurant)', () => {
    const state = createOAuthState({ restaurantId: 'rest-1', userId: 'user-1' });
    const [body, sig] = state.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), restaurantId: 'rest-2' })
    ).toString('base64url');
    expect(verifyOAuthState(`${forged}.${sig}`)).toBeNull();
  });

  it('rejects a state signed with another secret', () => {
    const state = createOAuthState({ restaurantId: 'r', userId: 'u' });
    process.env.NEXTAUTH_SECRET = 'a-different-secret';
    expect(verifyOAuthState(state)).toBeNull();
  });

  it('rejects malformed input', () => {
    expect(verifyOAuthState('')).toBeNull();
    expect(verifyOAuthState('no-dot')).toBeNull();
    expect(verifyOAuthState('a.b')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-oauth-state.test.ts`
Expected: FAIL — `Cannot find module '../../lib/mercadopago-connect/oauth-state'`.

- [ ] **Step 3: Implement `oauth-state.ts`**

```typescript
import crypto from 'crypto';

/**
 * Signed, expiring `state` for the Mercado Pago OAuth round trip.
 * Binds the callback to the restaurant and user that started the flow, so a
 * forged or replayed callback cannot attach someone else's Mercado Pago
 * account to a restaurant (CSRF / tenant confusion). Stateless: the nonce is
 * not stored, replay is bounded by the 10-minute expiry and by the fact that
 * the OAuth `code` itself is single-use.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthStatePayload {
  restaurantId: string;
  userId: string;
  nonce: string;
  exp: number;
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error('NEXTAUTH_SECRET não configurado');
  return value;
}

function sign(body: string): string {
  return crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}

export function createOAuthState(
  input: { restaurantId: string; userId: string },
  now: number = Date.now()
): string {
  const payload: OAuthStatePayload = {
    restaurantId: input.restaurantId,
    userId: input.userId,
    nonce: crypto.randomBytes(12).toString('base64url'),
    exp: now + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyOAuthState(state: string, now: number = Date.now()): OAuthStatePayload | null {
  const [body, signature, ...rest] = (state || '').split('.');
  if (!body || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(body));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (
      typeof payload?.restaurantId !== 'string' ||
      typeof payload?.userId !== 'string' ||
      typeof payload?.nonce !== 'string' ||
      typeof payload?.exp !== 'number'
    ) {
      return null;
    }
    if (payload.exp < now) return null;
    return payload as OAuthStatePayload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-oauth-state.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing tests for the OAuth client**

Create `__tests__/unit/mp-oauth-client.test.ts`:

```typescript
// @ts-nocheck
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshTokens,
  isConnectConfigured,
  getRedirectUri,
  MpOAuthError,
} from '../../lib/mercadopago-connect/oauth-client';

const ENV_KEYS = [
  'MERCADO_PAGO_CLIENT_ID',
  'MERCADO_PAGO_CLIENT_SECRET',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'CREDENTIALS_ENCRYPTION_KEY',
];

describe('mercadopago-connect/oauth-client', () => {
  const saved: Record<string, string | undefined> = {};
  const originalFetch = global.fetch;

  beforeEach(() => {
    ENV_KEYS.forEach((k) => (saved[k] = process.env[k]));
    process.env.MERCADO_PAGO_CLIENT_ID = 'client-123';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-456';
    process.env.NEXTAUTH_URL = 'https://gastrux.test/';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';
    process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  });

  afterEach(() => {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const tokenResponse = {
    access_token: 'APP_USR-access',
    refresh_token: 'TG-refresh',
    user_id: 998877,
    public_key: 'APP_USR-public',
    live_mode: true,
    expires_in: 15552000,
  };

  it('reports whether the integration is configured', () => {
    expect(isConnectConfigured()).toBe(true);
    delete process.env.MERCADO_PAGO_CLIENT_SECRET;
    expect(isConnectConfigured()).toBe(false);
  });

  it('builds the redirect URI without a double slash', () => {
    expect(getRedirectUri()).toBe('https://gastrux.test/api/pagamentos/mp/connect/callback');
  });

  it('builds the authorization URL with the required parameters', () => {
    const url = new URL(buildAuthorizationUrl('the-state'));
    expect(url.origin + url.pathname).toBe('https://auth.mercadopago.com.br/authorization');
    expect(url.searchParams.get('client_id')).toBe('client-123');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('platform_id')).toBe('mp');
    expect(url.searchParams.get('state')).toBe('the-state');
    expect(url.searchParams.get('redirect_uri')).toBe(getRedirectUri());
  });

  it('exchanges an authorization code for tokens', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => tokenResponse });
    global.fetch = fetchMock;

    const tokens = await exchangeCodeForTokens('the-code');

    expect(tokens).toEqual({
      accessToken: 'APP_USR-access',
      refreshToken: 'TG-refresh',
      mpUserId: '998877',
      publicKey: 'APP_USR-public',
      liveMode: true,
      lifetimeSeconds: 15552000,
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.mercadopago.com/oauth/token');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({
      client_id: 'client-123',
      client_secret: 'secret-456',
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: getRedirectUri(),
    });
  });

  it('refreshes tokens with the refresh_token grant', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => tokenResponse });
    global.fetch = fetchMock;

    await refreshTokens('old-refresh');

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      client_id: 'client-123',
      client_secret: 'secret-456',
      grant_type: 'refresh_token',
      refresh_token: 'old-refresh',
    });
  });

  it('flags invalid_grant as a revoked connection', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', message: 'Refresh token invalid' }),
    });

    const error = await refreshTokens('bad').catch((e) => e);
    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.revoked).toBe(true);
    expect(error.status).toBe(400);
    expect(error.message).toBe('Refresh token invalid');
  });

  it('does not flag a server error as revoked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({}),
    });

    const error = await refreshTokens('x').catch((e) => e);
    expect(error).toBeInstanceOf(MpOAuthError);
    expect(error.revoked).toBe(false);
  });

  it('rejects a response without tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ access_token: 'only' }) });
    await expect(exchangeCodeForTokens('c')).rejects.toBeInstanceOf(MpOAuthError);
  });

  it('fails clearly when credentials are missing', async () => {
    delete process.env.MERCADO_PAGO_CLIENT_ID;
    await expect(exchangeCodeForTokens('c')).rejects.toThrow('MERCADO_PAGO_CLIENT_ID');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-oauth-client.test.ts`
Expected: FAIL — `Cannot find module '../../lib/mercadopago-connect/oauth-client'`.

- [ ] **Step 7: Implement `oauth-client.ts`**

```typescript
/**
 * Mercado Pago OAuth (marketplace) client. This is the ONLY file that knows
 * the Mercado Pago OAuth endpoints and parameter names; if the docs differ
 * from these assumptions (see Task 0, premise 1) only this file changes.
 */

const AUTH_URL = 'https://auth.mercadopago.com.br/authorization';
const TOKEN_URL = 'https://api.mercadopago.com/oauth/token';

export interface MpOAuthTokens {
  accessToken: string;
  refreshToken: string;
  mpUserId: string;
  publicKey: string | null;
  liveMode: boolean;
  lifetimeSeconds: number;
}

export class MpOAuthError extends Error {
  status: number;
  revoked: boolean;

  constructor(message: string, status: number, revoked: boolean) {
    super(message);
    this.name = 'MpOAuthError';
    this.status = status;
    this.revoked = revoked;
  }
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.MERCADO_PAGO_CLIENT_ID;
  const clientSecret = process.env.MERCADO_PAGO_CLIENT_SECRET;
  if (!clientId) throw new Error('MERCADO_PAGO_CLIENT_ID não configurado');
  if (!clientSecret) throw new Error('MERCADO_PAGO_CLIENT_SECRET não configurado');
  return { clientId, clientSecret };
}

export function isConnectConfigured(): boolean {
  return Boolean(
    process.env.MERCADO_PAGO_CLIENT_ID &&
      process.env.MERCADO_PAGO_CLIENT_SECRET &&
      process.env.NEXTAUTH_URL &&
      process.env.NEXTAUTH_SECRET &&
      process.env.CREDENTIALS_ENCRYPTION_KEY
  );
}

export function getRedirectUri(): string {
  const base = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '');
  return `${base}/api/pagamentos/mp/connect/callback`;
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: getRedirectUri(),
  });
  return `${AUTH_URL}?${params.toString()}`;
}

function parseTokens(data: any): MpOAuthTokens {
  if (!data?.access_token || !data?.refresh_token || data?.user_id == null || !data?.expires_in) {
    throw new MpOAuthError('Resposta do Mercado Pago sem tokens', 502, false);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    mpUserId: String(data.user_id),
    publicKey: data.public_key ?? null,
    liveMode: data.live_mode !== false,
    lifetimeSeconds: Number(data.expires_in),
  };
}

async function requestTokens(grant: Record<string, string>): Promise<MpOAuthTokens> {
  const { clientId, clientSecret } = credentials();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, ...grant }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message =
      data?.message || data?.error_description || data?.error || `Mercado Pago OAuth error ${res.status}`;
    const revoked = data?.error === 'invalid_grant' || res.status === 401;
    throw new MpOAuthError(message, res.status, revoked);
  }
  return parseTokens(data);
}

export function exchangeCodeForTokens(code: string): Promise<MpOAuthTokens> {
  return requestTokens({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
  });
}

export function refreshTokens(refreshToken: string): Promise<MpOAuthTokens> {
  return requestTokens({ grant_type: 'refresh_token', refresh_token: refreshToken });
}
```

- [ ] **Step 8: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-oauth-state.test.ts __tests__/unit/mp-oauth-client.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 9: Document the new variables**

Add to `.env.example` next to `CREDENTIALS_ENCRYPTION_KEY`:

```
# Mercado Pago OAuth (marketplace) - restaurants connect their own account.
# Mercado Pago developers panel -> your application -> App ID / Client secret.
MERCADO_PAGO_CLIENT_ID=
MERCADO_PAGO_CLIENT_SECRET=
```

- [ ] **Step 10: Commit**

```bash
git add lib/mercadopago-connect/oauth-state.ts lib/mercadopago-connect/oauth-client.ts __tests__/unit/mp-oauth-state.test.ts __tests__/unit/mp-oauth-client.test.ts
git add -p .env.example
git commit -m "feat: add signed OAuth state and Mercado Pago OAuth client"
```


---

## Task 4: Refresh policy and the connection service

**Files:**
- Create: `lib/mercadopago-connect/refresh-policy.ts`
- Create: `lib/mercadopago-connect/connection-service.ts`
- Test: `__tests__/unit/mp-refresh-policy.test.ts`
- Test: `__tests__/integration/api/mp-connection-service.test.ts` **[DB]**

**Interfaces:**
- Consumes: `encryptSecret`/`decryptSecret` (Task 1), `MpOAuthTokens`/`refreshTokens`/`MpOAuthError` (Task 3), Prisma `MercadoPagoConnection` (Task 2), `createNotification` from `lib/notification-utils.ts` (existing: `createNotification({ userId, type, severity, title, message, actionUrl, actionLabel })`).
- Produces (all in `connection-service.ts` unless noted):
  - `saveConnection(restaurantId: string, tokens: MpOAuthTokens): Promise<MercadoPagoConnection>`
  - `getConnection(restaurantId: string)`, `getActiveConnection(restaurantId: string)` (null unless `status === 'ACTIVE'`), `hasActiveConnection(restaurantId: string): Promise<boolean>`
  - `markNeedsReconnect(restaurantId: string, reason: string): Promise<void>` (notifies the owner once, on the transition)
  - `refreshConnection(restaurantId: string): Promise<'refreshed' | 'needs_reconnect' | 'failed' | 'skipped'>`
  - `getMpClientForRestaurant(restaurantId: string): Promise<MercadoPagoConfig | null>`
  - `disconnect(restaurantId: string): Promise<void>` (deletes the row)
  - `refreshExpiringConnections(now?: number): Promise<{ checked: number; refreshed: number; needsReconnect: number; failed: number }>`
  - `refresh-policy.ts`: `shouldRefresh(conn: { expiresAt: Date; lifetimeSeconds: number }, now?: number): boolean` (true when less than 25% of the lifetime remains), `isExpiredOrNear(conn: { expiresAt: Date }, now?: number): boolean` (true within 24 hours of expiry), `isExpired(conn: { expiresAt: Date }, now?: number): boolean`

- [ ] **Step 1: Write the failing unit test for the policy**

Create `__tests__/unit/mp-refresh-policy.test.ts`:

```typescript
// @ts-nocheck
import { shouldRefresh, isExpiredOrNear, isExpired } from '../../lib/mercadopago-connect/refresh-policy';

const DAY = 24 * 60 * 60 * 1000;
const LIFETIME_SECONDS = 180 * 24 * 60 * 60; // 180 days; 25% = 45 days

describe('mercadopago-connect/refresh-policy', () => {
  const now = Date.now();

  describe('shouldRefresh', () => {
    it('is false while more than 25% of the lifetime remains', () => {
      expect(shouldRefresh({ expiresAt: new Date(now + 150 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(false);
      expect(shouldRefresh({ expiresAt: new Date(now + 46 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(false);
    });

    it('is true once less than 25% of the lifetime remains', () => {
      expect(shouldRefresh({ expiresAt: new Date(now + 44 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(true);
      expect(shouldRefresh({ expiresAt: new Date(now + 1 * DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(true);
    });

    it('is true for an already expired token', () => {
      expect(shouldRefresh({ expiresAt: new Date(now - DAY), lifetimeSeconds: LIFETIME_SECONDS }, now)).toBe(true);
    });
  });

  describe('isExpiredOrNear', () => {
    it('is true within 24 hours of expiry and after it', () => {
      expect(isExpiredOrNear({ expiresAt: new Date(now + 23 * 60 * 60 * 1000) }, now)).toBe(true);
      expect(isExpiredOrNear({ expiresAt: new Date(now - 1000) }, now)).toBe(true);
    });

    it('is false with more than 24 hours left', () => {
      expect(isExpiredOrNear({ expiresAt: new Date(now + 2 * DAY) }, now)).toBe(false);
    });
  });

  describe('isExpired', () => {
    it('is true only when expiry is not in the future', () => {
      expect(isExpired({ expiresAt: new Date(now - 1) }, now)).toBe(true);
      expect(isExpired({ expiresAt: new Date(now) }, now)).toBe(true);
      expect(isExpired({ expiresAt: new Date(now + 1) }, now)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-refresh-policy.test.ts`
Expected: FAIL — `Cannot find module '../../lib/mercadopago-connect/refresh-policy'`.

- [ ] **Step 3: Implement `refresh-policy.ts`**

```typescript
/**
 * Pure decisions about when a Mercado Pago token needs refreshing.
 * Kept free of I/O so it is unit-testable without a database.
 */

/** Refresh (cron) when less than this fraction of the original lifetime is left. */
export const REFRESH_THRESHOLD_FRACTION = 0.25;

/** Refresh inline (on use) when the token expires within this window. */
export const ON_USE_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

export function shouldRefresh(
  conn: { expiresAt: Date; lifetimeSeconds: number },
  now: number = Date.now()
): boolean {
  const remainingMs = conn.expiresAt.getTime() - now;
  return remainingMs < conn.lifetimeSeconds * 1000 * REFRESH_THRESHOLD_FRACTION;
}

export function isExpiredOrNear(conn: { expiresAt: Date }, now: number = Date.now()): boolean {
  return conn.expiresAt.getTime() - now < ON_USE_REFRESH_WINDOW_MS;
}

export function isExpired(conn: { expiresAt: Date }, now: number = Date.now()): boolean {
  return conn.expiresAt.getTime() <= now;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-refresh-policy.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing integration test for the service** **[DB]**

Create `__tests__/integration/api/mp-connection-service.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import {
  saveConnection,
  getConnection,
  getActiveConnection,
  hasActiveConnection,
  markNeedsReconnect,
  refreshConnection,
  getMpClientForRestaurant,
  disconnect,
  refreshExpiringConnections,
} from '../../../lib/mercadopago-connect/connection-service';
import { decryptSecret } from '../../../lib/security/credential-crypto';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = {
  accessToken: 'APP_USR-access-1',
  refreshToken: 'TG-refresh-1',
  mpUserId: '123456',
  publicKey: 'APP_USR-public-1',
  liveMode: true,
  lifetimeSeconds: 15552000,
};

const REFRESHED = {
  access_token: 'APP_USR-access-2',
  refresh_token: 'TG-refresh-2',
  user_id: 123456,
  public_key: 'APP_USR-public-2',
  live_mode: true,
  expires_in: 15552000,
};

describe('mercadopago-connect/connection-service', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const originalFetch = global.fetch;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    ['CREDENTIALS_ENCRYPTION_KEY', 'MERCADO_PAGO_CLIENT_ID', 'MERCADO_PAGO_CLIENT_SECRET', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET'].forEach(
      (k) => (savedEnv[k] = process.env[k])
    );
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.MERCADO_PAGO_CLIENT_ID = 'client-123';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-456';
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';

    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    Object.entries(savedEnv).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  });

  beforeEach(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
    global.fetch = originalFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('stores tokens encrypted and never in plaintext', async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const raw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: A.restaurantId } });
    expect(raw.accessToken.startsWith('v1:')).toBe(true);
    expect(raw.refreshToken.startsWith('v1:')).toBe(true);
    expect(raw.accessToken).not.toContain('APP_USR-access-1');
    expect(decryptSecret(raw.accessToken)).toBe('APP_USR-access-1');
    expect(decryptSecret(raw.refreshToken)).toBe('TG-refresh-1');
    expect(raw.status).toBe('ACTIVE');
    expect(raw.expiresAt.getTime()).toBeGreaterThan(Date.now() + 15000000 * 1000);
  });

  it('saveConnection on an existing restaurant replaces the tokens and reactivates it', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await markNeedsReconnect(A.restaurantId, 'test');
    await saveConnection(A.restaurantId, { ...TOKENS, accessToken: 'APP_USR-access-9' });

    const conn = await getActiveConnection(A.restaurantId);
    expect(conn).not.toBeNull();
    expect(decryptSecret(conn.accessToken)).toBe('APP_USR-access-9');
  });

  it('isolates connections between restaurants', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    expect(await hasActiveConnection(A.restaurantId)).toBe(true);
    expect(await hasActiveConnection(B.restaurantId)).toBe(false);
    expect(await getMpClientForRestaurant(B.restaurantId)).toBeNull();
  });

  it('getActiveConnection is null for NEEDS_RECONNECT, and disconnect removes only that restaurant', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    await markNeedsReconnect(A.restaurantId, 'revoked');

    expect(await getActiveConnection(A.restaurantId)).toBeNull();
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');

    await disconnect(A.restaurantId);
    expect(await getConnection(A.restaurantId)).toBeNull();
    expect(await hasActiveConnection(B.restaurantId)).toBe(true);
  });

  it('markNeedsReconnect notifies the owner only on the transition', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await markNeedsReconnect(A.restaurantId, 'first');
    await markNeedsReconnect(A.restaurantId, 'second');

    const notifications = await prisma.notification.findMany({
      where: { userId: A.ownerId, title: 'Reconecte seu Mercado Pago' },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].actionUrl).toBe('/dashboard/pagamentos/conectar');
  });

  it('refreshConnection stores the new tokens encrypted', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    expect(await refreshConnection(A.restaurantId)).toBe('refreshed');

    const raw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: A.restaurantId } });
    expect(decryptSecret(raw.accessToken)).toBe('APP_USR-access-2');
    expect(decryptSecret(raw.refreshToken)).toBe('TG-refresh-2');
    expect(raw.lastRefreshAt).not.toBeNull();
    expect(raw.lastRefreshError).toBeNull();
    expect(JSON.parse(global.fetch.mock.calls[0][1].body).refresh_token).toBe('TG-refresh-1');
  });

  it('two concurrent refreshes call Mercado Pago only once', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    const results = await Promise.all([refreshConnection(A.restaurantId), refreshConnection(A.restaurantId)]);

    expect(results.sort()).toEqual(['refreshed', 'skipped']);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('a revoked refresh token marks the connection NEEDS_RECONNECT', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', message: 'Refresh token invalid' }),
    });

    expect(await refreshConnection(A.restaurantId)).toBe('needs_reconnect');
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });

  it('a transient failure keeps the connection ACTIVE and records the error', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    expect(await refreshConnection(A.restaurantId)).toBe('failed');
    const conn = await getConnection(A.restaurantId);
    expect(conn.status).toBe('ACTIVE');
    expect(conn.lastRefreshError).toContain('503');
  });

  it('getMpClientForRestaurant returns a client built from the decrypted token', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const client = await getMpClientForRestaurant(A.restaurantId);
    expect(client).not.toBeNull();
    expect(client.accessToken).toBe('APP_USR-access-1');
  });

  it('getMpClientForRestaurant refreshes inline when the token expires within 24 hours', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId: A.restaurantId },
      data: { expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    const client = await getMpClientForRestaurant(A.restaurantId);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(client.accessToken).toBe('APP_USR-access-2');
  });

  it('getMpClientForRestaurant returns null when the token is expired and cannot be refreshed', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId: A.restaurantId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    expect(await getMpClientForRestaurant(A.restaurantId)).toBeNull();
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });

  it('refreshExpiringConnections only refreshes connections under 25% of their lifetime', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    await saveConnection(B.restaurantId, TOKENS);
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId: A.restaurantId },
      data: { expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) },
    });
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => REFRESHED });

    const summary = await refreshExpiringConnections();

    expect(summary.refreshed).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const bRaw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: B.restaurantId } });
    expect(decryptSecret(bRaw.accessToken)).toBe('APP_USR-access-1');
  });
});
```

- [ ] **Step 6: [DB] Run the test to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-connection-service.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/mercadopago-connect/connection-service'`.

- [ ] **Step 7: Implement `connection-service.ts`**

```typescript
import { MercadoPagoConfig } from 'mercadopago';
import { prisma } from '@/lib/prisma';
import { encryptSecret, decryptSecret } from '@/lib/security/credential-crypto';
import { createNotification } from '@/lib/notification-utils';
import { refreshTokens, MpOAuthError, type MpOAuthTokens } from './oauth-client';
import { shouldRefresh, isExpiredOrNear, isExpired } from './refresh-policy';

/**
 * Persistence and lifecycle of a restaurant's Mercado Pago OAuth connection.
 * Tokens are stored encrypted (AES-256-GCM) and only decrypted in memory to
 * build an SDK client for that one restaurant.
 */

export type RefreshOutcome = 'refreshed' | 'needs_reconnect' | 'failed' | 'skipped';

export async function saveConnection(restaurantId: string, tokens: MpOAuthTokens) {
  const data = {
    mpUserId: tokens.mpUserId,
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: encryptSecret(tokens.refreshToken),
    publicKey: tokens.publicKey,
    liveMode: tokens.liveMode,
    lifetimeSeconds: tokens.lifetimeSeconds,
    expiresAt: new Date(Date.now() + tokens.lifetimeSeconds * 1000),
    status: 'ACTIVE' as const,
    lastRefreshError: null,
  };
  return prisma.mercadoPagoConnection.upsert({
    where: { restaurantId },
    create: { restaurantId, ...data },
    update: { ...data, connectedAt: new Date() },
  });
}

export function getConnection(restaurantId: string) {
  return prisma.mercadoPagoConnection.findUnique({ where: { restaurantId } });
}

export async function getActiveConnection(restaurantId: string) {
  const conn = await getConnection(restaurantId);
  return conn && conn.status === 'ACTIVE' ? conn : null;
}

export async function hasActiveConnection(restaurantId: string): Promise<boolean> {
  const conn = await prisma.mercadoPagoConnection.findFirst({
    where: { restaurantId, status: 'ACTIVE' },
    select: { id: true },
  });
  return Boolean(conn);
}

async function notifyOwnerToReconnect(restaurantId: string): Promise<void> {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { ownerId: true },
    });
    if (!restaurant?.ownerId) return;
    await createNotification({
      userId: restaurant.ownerId,
      type: 'PAYMENT_FAILED',
      severity: 'HIGH',
      title: 'Reconecte seu Mercado Pago',
      message:
        'A conexão com o Mercado Pago expirou ou foi revogada. Enquanto isso, o PIX online fica indisponível para os seus clientes.',
      actionUrl: '/dashboard/pagamentos/conectar',
      actionLabel: 'Reconectar',
    });
  } catch (error) {
    console.error('[mp-connect] failed to notify owner:', error);
  }
}

export async function markNeedsReconnect(restaurantId: string, reason: string): Promise<void> {
  const result = await prisma.mercadoPagoConnection.updateMany({
    where: { restaurantId, status: 'ACTIVE' },
    data: { status: 'NEEDS_RECONNECT', lastRefreshError: reason.slice(0, 500) },
  });
  // Only notify on the ACTIVE -> NEEDS_RECONNECT transition, not on every failed call.
  if (result.count > 0) await notifyOwnerToReconnect(restaurantId);
}

export async function refreshConnection(restaurantId: string): Promise<RefreshOutcome> {
  const conn = await getActiveConnection(restaurantId);
  if (!conn) return 'skipped';

  // Claim the refresh: updateMany bumps updatedAt, so a concurrent caller that
  // read the same row matches zero rows and skips. Mercado Pago refresh tokens
  // are rotated, so refreshing twice with the same token would fail the second
  // time and wrongly mark a healthy connection as revoked.
  const claim = await prisma.mercadoPagoConnection.updateMany({
    where: { restaurantId, status: 'ACTIVE', updatedAt: conn.updatedAt },
    data: { lastRefreshError: null },
  });
  if (claim.count === 0) return 'skipped';

  try {
    const tokens = await refreshTokens(decryptSecret(conn.refreshToken));
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId },
      data: {
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptSecret(tokens.refreshToken),
        publicKey: tokens.publicKey ?? conn.publicKey,
        liveMode: tokens.liveMode,
        lifetimeSeconds: tokens.lifetimeSeconds,
        expiresAt: new Date(Date.now() + tokens.lifetimeSeconds * 1000),
        lastRefreshAt: new Date(),
        lastRefreshError: null,
      },
    });
    return 'refreshed';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof MpOAuthError && error.revoked) {
      await markNeedsReconnect(restaurantId, message);
      return 'needs_reconnect';
    }
    await prisma.mercadoPagoConnection.update({
      where: { restaurantId },
      data: { lastRefreshError: message.slice(0, 500) },
    });
    if (isExpired(conn)) {
      await markNeedsReconnect(restaurantId, message);
      return 'needs_reconnect';
    }
    return 'failed';
  }
}

/**
 * Builds a Mercado Pago SDK client for ONE restaurant, using that
 * restaurant's own token. Returns null when it has no usable connection;
 * callers must treat null as "online payment unavailable" and never fall back
 * to the platform token.
 */
export async function getMpClientForRestaurant(restaurantId: string): Promise<MercadoPagoConfig | null> {
  let conn = await getActiveConnection(restaurantId);
  if (!conn) return null;

  if (isExpiredOrNear(conn)) {
    await refreshConnection(restaurantId);
    conn = await getActiveConnection(restaurantId);
    if (!conn || isExpired(conn)) return null;
  }

  return new MercadoPagoConfig({
    accessToken: decryptSecret(conn.accessToken),
    options: { timeout: 8000 },
  });
}

export async function disconnect(restaurantId: string): Promise<void> {
  await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId } });
}

export async function refreshExpiringConnections(now: number = Date.now()) {
  const active = await prisma.mercadoPagoConnection.findMany({
    where: { status: 'ACTIVE' },
    select: { restaurantId: true, expiresAt: true, lifetimeSeconds: true },
  });

  const summary = { checked: active.length, refreshed: 0, needsReconnect: 0, failed: 0 };
  for (const conn of active) {
    if (!shouldRefresh(conn, now)) continue;
    const outcome = await refreshConnection(conn.restaurantId);
    if (outcome === 'refreshed') summary.refreshed++;
    else if (outcome === 'needs_reconnect') summary.needsReconnect++;
    else if (outcome === 'failed') summary.failed++;
  }
  return summary;
}
```

- [ ] **Step 8: [DB] Run the test to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-connection-service.test.ts`
Expected: PASS, 13 tests. If `client.accessToken` is `undefined`, the SDK stores the token under a different property name; check `node_modules/mercadopago/dist/mercadoPagoConfig.d.ts` and adjust the three `client.accessToken` assertions (keep the `not.toBeNull()` ones).

- [ ] **Step 9: Commit**

```bash
git add lib/mercadopago-connect/refresh-policy.ts lib/mercadopago-connect/connection-service.ts __tests__/unit/mp-refresh-policy.test.ts __tests__/integration/api/mp-connection-service.test.ts
git commit -m "feat: add Mercado Pago connection service with encrypted tokens and refresh"
```

---

## Task 5: Connect routes (status, start, callback, disconnect, refresh cron)

**Files:**
- Create: `lib/mercadopago-connect/guard.ts`
- Create: `app/api/pagamentos/mp/connect/route.ts`
- Create: `app/api/pagamentos/mp/connect/start/route.ts`
- Create: `app/api/pagamentos/mp/connect/callback/route.ts`
- Create: `app/api/pagamentos/mp/connect/refresh/route.ts`
- Test: `__tests__/integration/api/mp-connect-routes.test.ts` **[DB]**

**Interfaces:**
- Consumes: `requireAdminSession`, `getCurrentRestaurantId` (`lib/whatsapp/get-restaurant.ts`); Task 3 (`createOAuthState`, `verifyOAuthState`, `buildAuthorizationUrl`, `exchangeCodeForTokens`, `isConnectConfigured`); Task 4 (`saveConnection`, `getConnection`, `disconnect`, `refreshExpiringConnections`).
- Produces: `requireConnectManager(): Promise<{ ok: true; session: any; restaurantId: string; userId: string } | { ok: false; status: number; error: string }>`; HTTP contract:
  - `GET /api/pagamentos/mp/connect` → `{ configured: boolean; connected: boolean; needsReconnect: boolean; mpUserId: string | null; liveMode: boolean | null; connectedAt: string | null }` (never tokens); any admin-role user of the current restaurant.
  - `DELETE /api/pagamentos/mp/connect` → `{ ok: true }`; OWNER/ADMIN only.
  - `GET /api/pagamentos/mp/connect/start` → redirect to Mercado Pago; OWNER/ADMIN only.
  - `GET /api/pagamentos/mp/connect/callback?code&state` → redirect to `/dashboard/pagamentos/conectar?mp=<connected|denied|invalid_state|unauthorized|error>`.
  - `POST /api/pagamentos/mp/connect/refresh` (Bearer `CRON_SECRET`) → `{ checked, refreshed, needsReconnect, failed }`.

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-connect-routes.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));

import { getServerSession } from 'next-auth';
import { GET as getStatus, DELETE as disconnectRoute } from '../../../app/api/pagamentos/mp/connect/route';
import { GET as startRoute } from '../../../app/api/pagamentos/mp/connect/start/route';
import { GET as callbackRoute } from '../../../app/api/pagamentos/mp/connect/callback/route';
import { POST as refreshRoute } from '../../../app/api/pagamentos/mp/connect/refresh/route';
import { createOAuthState, verifyOAuthState } from '../../../lib/mercadopago-connect/oauth-state';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { decryptSecret } from '../../../lib/security/credential-crypto';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const ENV = ['CREDENTIALS_ENCRYPTION_KEY', 'MERCADO_PAGO_CLIENT_ID', 'MERCADO_PAGO_CLIENT_SECRET', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET', 'CRON_SECRET'];

describe('Mercado Pago connect routes', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const saved: Record<string, string | undefined> = {};
  const originalFetch = global.fetch;

  const session = (role: string, ownerId = A.ownerId, email = 'owner-a@integration.test') =>
    (getServerSession as jest.Mock).mockResolvedValue({ user: { id: ownerId, email, role } });

  beforeAll(async () => {
    ENV.forEach((k) => (saved[k] = process.env[k]));
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.MERCADO_PAGO_CLIENT_ID = 'client-123';
    process.env.MERCADO_PAGO_CLIENT_SECRET = 'secret-456';
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    process.env.NEXTAUTH_SECRET = 'nextauth-secret';
    process.env.CRON_SECRET = 'cron-secret';

    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    ENV.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  beforeEach(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    global.fetch = originalFetch;
  });

  afterEach(() => jest.restoreAllMocks());

  const callback = (query: string) =>
    callbackRoute(new Request(`https://gastrux.test/api/pagamentos/mp/connect/callback?${query}`) as any);
  const location = (res: Response) => res.headers.get('location') || '';

  describe('GET /connect (status)', () => {
    it('rejects unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect((await getStatus()).status).toBe(401);
    });

    it('reports not connected without leaking any token field', async () => {
      session('OWNER');
      const body = await (await getStatus()).json();
      expect(body).toMatchObject({ configured: true, connected: false, needsReconnect: false });
      expect(JSON.stringify(body)).not.toMatch(/accessToken|refreshToken|APP_USR/);
    });

    it('reports connected after a connection is saved', async () => {
      await saveConnection(A.restaurantId, {
        accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '77', publicKey: 'pk', liveMode: true, lifetimeSeconds: 15552000,
      });
      session('OWNER');
      const body = await (await getStatus()).json();
      expect(body).toMatchObject({ connected: true, needsReconnect: false, mpUserId: '77', liveMode: true });
    });
  });

  describe('GET /connect/start', () => {
    it('denies non owner/admin roles', async () => {
      session('MANAGER');
      expect((await startRoute()).status).toBe(403);
    });

    it('redirects an owner to Mercado Pago with a valid signed state', async () => {
      session('OWNER');
      const res = await startRoute();
      expect([302, 307]).toContain(res.status);
      const url = new URL(location(res));
      expect(url.origin).toBe('https://auth.mercadopago.com.br');
      const state = verifyOAuthState(url.searchParams.get('state'));
      expect(state).toMatchObject({ restaurantId: A.restaurantId, userId: A.ownerId });
    });
  });

  describe('GET /connect/callback', () => {
    it('redirects with mp=denied when the user cancels at Mercado Pago', async () => {
      session('OWNER');
      const res = await callback('error=access_denied');
      expect(location(res)).toContain('mp=denied');
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('rejects a tampered state without saving anything', async () => {
      session('OWNER');
      const res = await callback('code=abc&state=tampered.state');
      expect(location(res)).toContain('mp=invalid_state');
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('rejects a state minted for another restaurant', async () => {
      session('OWNER');
      const state = createOAuthState({ restaurantId: B.restaurantId, userId: A.ownerId });
      const res = await callback(`code=abc&state=${state}`);
      expect(location(res)).toContain('mp=invalid_state');
      expect(await getConnection(B.restaurantId)).toBeNull();
      expect(await getConnection(A.restaurantId)).toBeNull();
    });

    it('rejects a valid state when the session belongs to a different user', async () => {
      session('OWNER', 'someone-else');
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });
      const res = await callback(`code=abc&state=${state}`);
      expect(location(res)).toContain('mp=invalid_state');
    });

    it('exchanges the code and stores an encrypted connection on the happy path', async () => {
      session('OWNER');
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'APP_USR-live', refresh_token: 'TG-live', user_id: 4242,
          public_key: 'pk-live', live_mode: true, expires_in: 15552000,
        }),
      });
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });

      const res = await callback(`code=the-code&state=${state}`);

      expect(location(res)).toContain('mp=connected');
      const raw = await prisma.mercadoPagoConnection.findUnique({ where: { restaurantId: A.restaurantId } });
      expect(raw.status).toBe('ACTIVE');
      expect(raw.mpUserId).toBe('4242');
      expect(raw.accessToken).not.toContain('APP_USR-live');
      expect(decryptSecret(raw.accessToken)).toBe('APP_USR-live');
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toMatchObject({ grant_type: 'authorization_code', code: 'the-code' });
    });

    it('redirects with mp=error when the code exchange fails', async () => {
      session('OWNER');
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) });
      const state = createOAuthState({ restaurantId: A.restaurantId, userId: A.ownerId });
      const res = await callback(`code=bad&state=${state}`);
      expect(location(res)).toContain('mp=error');
      expect(await getConnection(A.restaurantId)).toBeNull();
    });
  });

  describe('DELETE /connect', () => {
    it('denies non owner/admin roles', async () => {
      session('MANAGER');
      expect((await disconnectRoute()).status).toBe(403);
    });

    it('removes only the caller restaurant connection', async () => {
      const tokens = { accessToken: 'a', refreshToken: 'r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
      await saveConnection(A.restaurantId, tokens);
      await saveConnection(B.restaurantId, tokens);
      session('OWNER');

      const res = await disconnectRoute();

      expect(res.status).toBe(200);
      expect(await getConnection(A.restaurantId)).toBeNull();
      expect(await getConnection(B.restaurantId)).not.toBeNull();
    });
  });

  describe('POST /connect/refresh (cron)', () => {
    it('rejects requests without the cron secret', async () => {
      const res = await refreshRoute(new Request('https://gastrux.test/x', { method: 'POST' }) as any);
      expect(res.status).toBe(401);
    });

    it('runs with the bearer secret', async () => {
      const res = await refreshRoute(
        new Request('https://gastrux.test/x', { method: 'POST', headers: { authorization: 'Bearer cron-secret' } }) as any
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ checked: expect.any(Number), refreshed: expect.any(Number) });
    });
  });
});
```

- [ ] **Step 2: [DB] Run the test to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-connect-routes.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 3: Implement the guard**

Create `lib/mercadopago-connect/guard.ts`:

```typescript
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';

/**
 * Managing the Mercado Pago connection (start, callback, disconnect) moves
 * money, so it is strictly OWNER or ADMIN of the CURRENT restaurant. Unlike
 * requireAdminSession, a missing role is denied (same rule as the Stripe
 * Connect route).
 */
export async function requireConnectManager(): Promise<
  | { ok: true; session: any; restaurantId: string; userId: string }
  | { ok: false; status: number; error: string }
> {
  const auth = await requireAdminSession();
  if (!auth.ok) return { ok: false, status: auth.status, error: auth.error };

  const user = auth.session.user as any;
  if (!['OWNER', 'ADMIN'].includes(user?.role || '')) {
    return { ok: false, status: 403, error: 'Apenas o dono ou administrador pode gerenciar pagamentos' };
  }
  if (!user?.id) return { ok: false, status: 403, error: 'Sessão inválida' };

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return { ok: false, status: 404, error: 'Restaurante não encontrado' };

  return { ok: true, session: auth.session, restaurantId, userId: user.id as string };
}
```

- [ ] **Step 4: Implement status and disconnect** — `app/api/pagamentos/mp/connect/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { getConnection, disconnect } from '@/lib/mercadopago-connect/connection-service';
import { isConnectConfigured } from '@/lib/mercadopago-connect/oauth-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const conn = await getConnection(restaurantId);
  // Never return tokens (encrypted or not) - only what the UI needs to render.
  return NextResponse.json({
    configured: isConnectConfigured(),
    connected: conn?.status === 'ACTIVE',
    needsReconnect: conn?.status === 'NEEDS_RECONNECT',
    mpUserId: conn?.mpUserId ?? null,
    liveMode: conn?.liveMode ?? null,
    connectedAt: conn?.connectedAt?.toISOString() ?? null,
  });
}

export async function DELETE() {
  const mgr = await requireConnectManager();
  if (!mgr.ok) return NextResponse.json({ error: mgr.error }, { status: mgr.status });

  await disconnect(mgr.restaurantId);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Implement start** — `app/api/pagamentos/mp/connect/start/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { createOAuthState } from '@/lib/mercadopago-connect/oauth-state';
import { buildAuthorizationUrl, isConnectConfigured } from '@/lib/mercadopago-connect/oauth-client';

export const dynamic = 'force-dynamic';

export async function GET() {
  const mgr = await requireConnectManager();
  if (!mgr.ok) return NextResponse.json({ error: mgr.error }, { status: mgr.status });

  if (!isConnectConfigured()) {
    return NextResponse.json({ error: 'Integração com o Mercado Pago não configurada' }, { status: 503 });
  }

  const state = createOAuthState({ restaurantId: mgr.restaurantId, userId: mgr.userId });
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
```

- [ ] **Step 6: Implement callback** — `app/api/pagamentos/mp/connect/callback/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireConnectManager } from '@/lib/mercadopago-connect/guard';
import { verifyOAuthState } from '@/lib/mercadopago-connect/oauth-state';
import { exchangeCodeForTokens } from '@/lib/mercadopago-connect/oauth-client';
import { saveConnection } from '@/lib/mercadopago-connect/connection-service';

export const dynamic = 'force-dynamic';

function back(req: NextRequest, result: string) {
  const base = process.env.NEXTAUTH_URL || req.url;
  return NextResponse.redirect(new URL(`/dashboard/pagamentos/conectar?mp=${result}`, base));
}

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;

  if (params.get('error')) return back(req, 'denied');

  const code = params.get('code');
  const payload = verifyOAuthState(params.get('state') || '');
  if (!code || !payload) return back(req, 'invalid_state');

  const mgr = await requireConnectManager();
  if (!mgr.ok) return back(req, 'unauthorized');

  // The state must have been minted for THIS user and THIS (current) restaurant.
  if (payload.restaurantId !== mgr.restaurantId || payload.userId !== mgr.userId) {
    return back(req, 'invalid_state');
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveConnection(mgr.restaurantId, tokens);
    return back(req, 'connected');
  } catch (error) {
    console.error('[mp-connect] callback failed:', error instanceof Error ? error.message : error);
    return back(req, 'error');
  }
}
```

- [ ] **Step 7: Implement the refresh cron** — `app/api/pagamentos/mp/connect/refresh/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { refreshExpiringConnections } from '@/lib/mercadopago-connect/connection-service';

export const dynamic = 'force-dynamic';

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Same authentication convention as the other cron endpoints (CRON_SECRET via
// `x-internal-trigger` or `Authorization: Bearer`).
function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const trigger = req.headers.get('x-internal-trigger');
  if (trigger && safeEqual(trigger, secret)) return true;

  const auth = req.headers.get('authorization');
  return Boolean(auth?.startsWith('Bearer ') && safeEqual(auth.slice(7), secret));
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(await refreshExpiringConnections());
}
```

- [ ] **Step 8: [DB] Run the test to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-connect-routes.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add lib/mercadopago-connect/guard.ts app/api/pagamentos/mp/connect __tests__/integration/api/mp-connect-routes.test.ts
git commit -m "feat: add Mercado Pago connect routes (status, start, callback, disconnect, refresh cron)"
```

---

## Task 6: Restaurant-token MP helpers, status transitions, and client parameters on the platform lib

**Files:**
- Create: `lib/mercadopago-connect/payments.ts`
- Create: `lib/mercadopago-connect/payment-status.ts`
- Modify: `lib/mercado-pago.ts` (optional `client` argument on `getPayment`, `createCheckoutPreference`, `createPixPreference`)
- Test: `__tests__/unit/mp-connect-payments.test.ts`
- Test: `__tests__/unit/mp-payment-status.test.ts`
- Test: `__tests__/unit/mp-lib-client-param.test.ts`

**Interfaces:**
- Consumes: `mercadopago` SDK (`Payment`, `PaymentRefund`, `MercadoPagoConfig`).
- Produces:
  - `payments.ts`: `interface CreateConnectPixInput { paymentId: string; restaurantId: string; amount: number; description: string; payer: { email: string; name?: string }; expiresInMinutes?: number }`; `interface PixData { qrCode: string; qrCodeBase64: string; ticketUrl: string; expirationDate: string | null }`; `toMpDate(date: Date): string`; `notificationUrlFor(restaurantId: string): string`; `createConnectPix(client: MercadoPagoConfig, input: CreateConnectPixInput): Promise<any>`; `extractPixData(mpPayment: any): PixData`; `getConnectPayment(client: MercadoPagoConfig, mpPaymentId: string): Promise<any>`; `refundConnectPayment(client: MercadoPagoConfig, mpPaymentId: string, amount?: number): Promise<any>`; `isUnauthorizedError(error: unknown): boolean`
  - `payment-status.ts`: `canTransition(from: string, to: string): boolean`
  - `lib/mercado-pago.ts`: `getPayment(paymentId: string, client?: MercadoPagoConfig)`, `createCheckoutPreference(input: CreatePreferenceInput, client?: MercadoPagoConfig)`, `createPixPreference(input, client?: MercadoPagoConfig)`; omitting `client` keeps today's behavior (platform token).

- [ ] **Step 1: Write the failing test for `payments.ts`**

Create `__tests__/unit/mp-connect-payments.test.ts`:

```typescript
// @ts-nocheck
jest.mock('mercadopago', () => {
  const paymentCreate = jest.fn();
  const paymentGet = jest.fn();
  const refundCreate = jest.fn();
  const refundTotal = jest.fn();
  return {
    __mocks: { paymentCreate, paymentGet, refundCreate, refundTotal },
    MercadoPagoConfig: jest.fn(),
    Payment: jest.fn(() => ({ create: paymentCreate, get: paymentGet })),
    PaymentRefund: jest.fn(() => ({ create: refundCreate, total: refundTotal })),
  };
});

import * as mp from 'mercadopago';
import {
  createConnectPix,
  extractPixData,
  getConnectPayment,
  refundConnectPayment,
  isUnauthorizedError,
  toMpDate,
  notificationUrlFor,
} from '../../lib/mercadopago-connect/payments';

const mocks = (mp as any).__mocks;
const client = { accessToken: 'restaurant-token' } as any;

describe('mercadopago-connect/payments', () => {
  const originalUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXTAUTH_URL = 'https://gastrux.test/';
  });

  afterAll(() => {
    process.env.NEXTAUTH_URL = originalUrl;
  });

  it('formats dates with the fixed -03:00 offset', () => {
    expect(toMpDate(new Date('2026-09-19T13:00:00.000Z'))).toBe('2026-09-19T10:00:00.000-03:00');
  });

  it('builds a notification URL carrying the restaurant id', () => {
    expect(notificationUrlFor('rest 1')).toBe('https://gastrux.test/api/pagamentos/mp/webhook?rid=rest%201');
  });

  it('creates a PIX payment with our payment id as reference and idempotency key', async () => {
    mocks.paymentCreate.mockResolvedValue({ id: 1 });

    await createConnectPix(client, {
      paymentId: 'pay_123',
      restaurantId: 'rest_9',
      amount: 57.9,
      description: 'Pedido 42',
      payer: { email: 'a@b.com', name: 'Maria da Silva' },
    });

    expect(mp.Payment).toHaveBeenCalledWith(client);
    const args = mocks.paymentCreate.mock.calls[0][0];
    expect(args.body).toMatchObject({
      transaction_amount: 57.9,
      description: 'Pedido 42',
      payment_method_id: 'pix',
      external_reference: 'pay_123',
      notification_url: 'https://gastrux.test/api/pagamentos/mp/webhook?rid=rest_9',
      payer: { email: 'a@b.com', first_name: 'Maria', last_name: 'da Silva' },
    });
    expect(args.body.date_of_expiration).toMatch(/-03:00$/);
    expect(args.body).not.toHaveProperty('marketplace_fee');
    expect(args.requestOptions).toEqual({ idempotencyKey: 'pay_123' });
  });

  it('extracts the PIX data from the Mercado Pago response', () => {
    expect(
      extractPixData({
        date_of_expiration: '2026-09-19T10:30:00.000-03:00',
        point_of_interaction: { transaction_data: { qr_code: 'QR', qr_code_base64: 'B64', ticket_url: 'https://t' } },
      })
    ).toEqual({ qrCode: 'QR', qrCodeBase64: 'B64', ticketUrl: 'https://t', expirationDate: '2026-09-19T10:30:00.000-03:00' });

    expect(extractPixData({})).toEqual({ qrCode: '', qrCodeBase64: '', ticketUrl: '', expirationDate: null });
  });

  it('fetches a payment with the given client', async () => {
    mocks.paymentGet.mockResolvedValue({ id: 5 });
    await getConnectPayment(client, '5');
    expect(mp.Payment).toHaveBeenCalledWith(client);
    expect(mocks.paymentGet).toHaveBeenCalledWith({ id: '5' });
  });

  it('refunds partially with create and fully with total (never with cancel)', async () => {
    mocks.refundCreate.mockResolvedValue({ id: 1 });
    mocks.refundTotal.mockResolvedValue({ id: 2 });

    await refundConnectPayment(client, '77', 10.5);
    expect(mocks.refundCreate).toHaveBeenCalledWith({ payment_id: '77', body: { amount: 10.5 } });

    await refundConnectPayment(client, '77');
    expect(mocks.refundTotal).toHaveBeenCalledWith({ payment_id: '77' });
  });

  it('detects unauthorized errors from the SDK shapes', () => {
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError({ statusCode: 401 })).toBe(true);
    expect(isUnauthorizedError({ cause: [{ code: 401 }] })).toBe(false);
    expect(isUnauthorizedError({ status: 500 })).toBe(false);
    expect(isUnauthorizedError(new Error('boom'))).toBe(false);
    expect(isUnauthorizedError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-connect-payments.test.ts`
Expected: FAIL — `Cannot find module '../../lib/mercadopago-connect/payments'`.

- [ ] **Step 3: Implement `payments.ts`**

```typescript
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';

/**
 * Mercado Pago calls made with a RESTAURANT's own client (built by
 * getMpClientForRestaurant). Nothing here reads the platform token.
 * No `marketplace_fee` is sent: the platform charges no fee for now.
 */

export interface CreateConnectPixInput {
  /** Our Payment.id: used as external_reference and as idempotency key. */
  paymentId: string;
  restaurantId: string;
  amount: number;
  description: string;
  payer: { email: string; name?: string };
  expiresInMinutes?: number;
}

export interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
  expirationDate: string | null;
}

/** Mercado Pago wants an offset date; Brazil has no DST, so -03:00 is fixed. */
export function toMpDate(date: Date): string {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00');
}

export function notificationUrlFor(restaurantId: string): string {
  const base = (process.env.NEXTAUTH_URL || '').replace(/\/+$/, '');
  return `${base}/api/pagamentos/mp/webhook?rid=${encodeURIComponent(restaurantId)}`;
}

export async function createConnectPix(client: MercadoPagoConfig, input: CreateConnectPixInput) {
  const [firstName, ...rest] = (input.payer.name || 'Cliente').trim().split(/\s+/);
  const expiresAt = new Date(Date.now() + (input.expiresInMinutes ?? 30) * 60_000);

  return new Payment(client).create({
    body: {
      transaction_amount: input.amount,
      description: input.description,
      payment_method_id: 'pix',
      payer: {
        email: input.payer.email,
        first_name: firstName,
        last_name: rest.join(' ') || undefined,
      },
      external_reference: input.paymentId,
      notification_url: notificationUrlFor(input.restaurantId),
      date_of_expiration: toMpDate(expiresAt),
    },
    requestOptions: { idempotencyKey: input.paymentId },
  });
}

export function extractPixData(mpPayment: any): PixData {
  const data = mpPayment?.point_of_interaction?.transaction_data;
  return {
    qrCode: data?.qr_code ?? '',
    qrCodeBase64: data?.qr_code_base64 ?? '',
    ticketUrl: data?.ticket_url ?? '',
    expirationDate: mpPayment?.date_of_expiration ?? null,
  };
}

export function getConnectPayment(client: MercadoPagoConfig, mpPaymentId: string) {
  return new Payment(client).get({ id: mpPaymentId });
}

/**
 * Refunds an APPROVED payment. Payment.cancel (used by the platform helper in
 * lib/mercado-pago.ts) only works for payments that are not yet approved.
 */
export function refundConnectPayment(client: MercadoPagoConfig, mpPaymentId: string, amount?: number) {
  const refunds = new PaymentRefund(client);
  return amount
    ? refunds.create({ payment_id: mpPaymentId, body: { amount } })
    : refunds.total({ payment_id: mpPaymentId });
}

export function isUnauthorizedError(error: unknown): boolean {
  const e = error as any;
  return e?.status === 401 || e?.statusCode === 401;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-connect-payments.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the failing test for `canTransition`**

Create `__tests__/unit/mp-payment-status.test.ts`:

```typescript
// @ts-nocheck
import { canTransition } from '../../lib/mercadopago-connect/payment-status';

describe('mercadopago-connect/payment-status canTransition', () => {
  it.each([
    ['PENDING', 'PROCESSING'],
    ['PENDING', 'APPROVED'],
    ['PENDING', 'DECLINED'],
    ['PENDING', 'CANCELLED'],
    ['PROCESSING', 'APPROVED'],
    ['PROCESSING', 'DECLINED'],
    ['DECLINED', 'APPROVED'],
    ['DECLINED', 'PROCESSING'],
    ['APPROVED', 'REFUNDED'],
    ['APPROVED', 'CHARGEBACK'],
    ['PARTIALLY_REFUNDED', 'REFUNDED'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ['APPROVED', 'APPROVED'],
    ['APPROVED', 'PENDING'],
    ['APPROVED', 'DECLINED'],
    ['REFUNDED', 'APPROVED'],
    ['CANCELLED', 'APPROVED'],
    ['CHARGEBACK', 'APPROVED'],
    ['PARTIALLY_REFUNDED', 'APPROVED'],
    ['PENDING', 'REFUNDED'],
    ['PENDING', 'PENDING'],
    ['SETTLED', 'APPROVED'],
    ['UNKNOWN', 'APPROVED'],
  ])('blocks %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
```

- [ ] **Step 6: Run to verify it fails, then implement**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-payment-status.test.ts`
Expected: FAIL — module not found.

Create `lib/mercadopago-connect/payment-status.ts`:

```typescript
/**
 * Allowed Payment status transitions for payments driven by Mercado Pago
 * notifications. A notification that would repeat the current status, go
 * backwards, or leave a terminal state is ignored, which makes duplicate and
 * out-of-order webhooks harmless (no double credit).
 *
 * DECLINED -> APPROVED/PROCESSING is allowed because Checkout Pro lets the
 * customer retry after a rejected attempt.
 */
const ALLOWED: Record<string, string[]> = {
  PENDING: ['PROCESSING', 'APPROVED', 'DECLINED', 'CANCELLED'],
  PROCESSING: ['APPROVED', 'DECLINED', 'CANCELLED'],
  DECLINED: ['PROCESSING', 'APPROVED'],
  APPROVED: ['REFUNDED', 'CHARGEBACK'],
  PARTIALLY_REFUNDED: ['REFUNDED', 'CHARGEBACK'],
};

export function canTransition(from: string, to: string): boolean {
  return from !== to && (ALLOWED[from] ?? []).includes(to);
}
```

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-payment-status.test.ts`
Expected: PASS, 22 tests.

- [ ] **Step 7: Write the failing test for the optional client argument**

Create `__tests__/unit/mp-lib-client-param.test.ts`:

```typescript
// @ts-nocheck
jest.mock('mercadopago', () => {
  // lib/mercado-pago.ts reads the platform token when it is imported, so the
  // variable must exist before that import. This factory runs first (the lib's
  // first import is 'mercadopago'), regardless of how imports are ordered.
  process.env.MERCADO_PAGO_ACCESS_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN || 'platform-token';
  const paymentGet = jest.fn().mockResolvedValue({ id: 1 });
  const preferenceCreate = jest.fn().mockResolvedValue({ id: 'pref' });
  return {
    __mocks: { paymentGet, preferenceCreate },
    MercadoPagoConfig: jest.fn((cfg) => ({ ...cfg, isPlatform: true })),
    Payment: jest.fn(() => ({ get: paymentGet })),
    Preference: jest.fn(() => ({ create: preferenceCreate })),
    PreApproval: jest.fn(),
    MerchantOrder: jest.fn(),
  };
});

import * as mp from 'mercadopago';
import { getPayment, createCheckoutPreference, createPixPreference } from '../../lib/mercado-pago';

const restaurantClient = { accessToken: 'restaurant-token', isPlatform: false } as any;

const preferenceInput = {
  orderId: 'o1',
  items: [{ id: 'i', title: 'Item', quantity: 1, unitPrice: 10 }],
  payer: { email: 'a@b.com' },
  backUrls: { success: 's', failure: 'f', pending: 'p' },
  notificationUrl: 'https://x/webhook?rid=r1',
  externalReference: 'pay1',
};

describe('lib/mercado-pago optional client argument', () => {
  // Order matters here: the platform client is a lazy singleton, so the test
  // that builds it ("without a client") runs before any test that asserts it
  // was NOT built, and jest.clearAllMocks() resets only the call history.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getPayment without a client still uses the platform client (billing keeps working)', async () => {
    await getPayment('1');
    expect(mp.MercadoPagoConfig).toHaveBeenCalledTimes(1);
    expect(mp.Payment.mock.calls[0][0].isPlatform).toBe(true);
  });

  it('getPayment uses the provided client and never builds the platform one', async () => {
    await getPayment('1', restaurantClient);
    expect(mp.Payment).toHaveBeenCalledWith(restaurantClient);
    expect(mp.MercadoPagoConfig).not.toHaveBeenCalled();
  });

  it('createCheckoutPreference uses the provided client', async () => {
    await createCheckoutPreference(preferenceInput, restaurantClient);
    expect(mp.Preference).toHaveBeenCalledWith(restaurantClient);
    expect(mp.MercadoPagoConfig).not.toHaveBeenCalled();
  });

  it('createPixPreference passes the provided client through', async () => {
    const { items, ...rest } = preferenceInput;
    await createPixPreference({ ...rest, amount: 10, description: 'PIX' }, restaurantClient);
    expect(mp.Preference).toHaveBeenCalledWith(restaurantClient);
    expect(mp.MercadoPagoConfig).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-lib-client-param.test.ts`
Expected: FAIL — the first test fails because `getPayment` ignores the second argument and builds the platform client.

- [ ] **Step 9: Add the optional argument in `lib/mercado-pago.ts`**

Edit 1 — `getPayment`. Replace:

```typescript
export async function getPayment(paymentId: string) {
  const client = getMercadoPagoClient();
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}
```

with:

```typescript
export async function getPayment(paymentId: string, client: MercadoPagoConfig = getMercadoPagoClient()) {
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}
```

Edit 2 — `createCheckoutPreference`. Replace:

```typescript
export async function createCheckoutPreference(input: CreatePreferenceInput) {
  const client = getMercadoPagoClient();

  const preference = new Preference(client);
```

with:

```typescript
export async function createCheckoutPreference(
  input: CreatePreferenceInput,
  client: MercadoPagoConfig = getMercadoPagoClient()
) {
  const preference = new Preference(client);
```

Edit 3 — `createPixPreference`. Replace:

```typescript
export async function createPixPreference(input: Omit<CreatePreferenceInput, 'items'> & { amount: number; description: string }) {
  return createCheckoutPreference({
    ...input,
    items: [{
      id: 'pix-payment',
      title: input.description,
      quantity: 1,
      unitPrice: input.amount,
    }],
  });
}
```

with:

```typescript
export async function createPixPreference(
  input: Omit<CreatePreferenceInput, 'items'> & { amount: number; description: string },
  client?: MercadoPagoConfig
) {
  return createCheckoutPreference(
    {
      ...input,
      items: [{
        id: 'pix-payment',
        title: input.description,
        quantity: 1,
        unitPrice: input.amount,
      }],
    },
    client
  );
}
```

(Passing `undefined` to `createCheckoutPreference` makes its default parameter apply, so calls without a client keep using the platform token.)

- [ ] **Step 10: Run all three unit tests and type-check**

Run: `npx jest --config jest.unit.config.js __tests__/unit/mp-lib-client-param.test.ts __tests__/unit/mp-connect-payments.test.ts __tests__/unit/mp-payment-status.test.ts`
Expected: PASS (4 + 7 + 22 tests).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add lib/mercadopago-connect/payments.ts lib/mercadopago-connect/payment-status.ts __tests__/unit/mp-connect-payments.test.ts __tests__/unit/mp-payment-status.test.ts __tests__/unit/mp-lib-client-param.test.ts
git add -p lib/mercado-pago.ts
git commit -m "feat: add restaurant-token MP helpers, status transitions and optional client args"
```

---

## Task 7: Payment sync (apply a Mercado Pago payment to our records)

**Files:**
- Create: `lib/mercadopago-connect/payment-sync.ts`
- Test: `__tests__/integration/api/mp-payment-sync.test.ts` **[DB]**

**Interfaces:**
- Consumes: `getMpClientForRestaurant`, `markNeedsReconnect` (Task 4); `getConnectPayment`, `isUnauthorizedError` (Task 6); `canTransition` (Task 6); `mapMPStatusToPaymentStatus` (existing, `lib/mercado-pago.ts`).
- Produces: `syncRestaurantPayment(restaurantId: string, mpPaymentId: string): Promise<{ updated: boolean; reason?: string; status?: string }>`. `reason` is one of `no-active-connection`, `unauthorized`, `no-external-reference`, `payment-not-found`, `mp-id-mismatch`, `no-transition`, `amount-mismatch`, `concurrent`. Used by the webhook (Task 9) and the PIX status route (Task 8).

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-payment-sync.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  getConnectPayment: jest.fn(),
}));

import { getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { syncRestaurantPayment } from '../../../lib/mercadopago-connect/payment-sync';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('mercadopago-connect/payment-sync', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  afterAll(async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
    await cleanupMultiTenantData(ids);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  let order: any;
  let payment: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });

    await saveConnection(A.restaurantId, TOKENS);
    order = await prisma.order.create({
      data: { restaurantId: A.restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total: 50, paymentStatus: 'PENDING' },
    });
    payment = await prisma.payment.create({
      data: {
        restaurantId: A.restaurantId,
        orderId: order.id,
        amount: 50,
        method: 'PIX',
        gateway: 'MERCADO_PAGO_CONNECT',
        status: 'PENDING',
        gatewayPaymentId: '555',
      },
    });
  });

  const mpPayment = (overrides = {}) => ({
    id: 555,
    status: 'approved',
    status_detail: 'accredited',
    external_reference: payment.id,
    transaction_amount: 50,
    fee_details: [{ amount: 1.5 }, { amount: 0.5 }],
    ...overrides,
  });

  const reload = async () => ({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    order: await prisma.order.findUnique({ where: { id: order.id } }),
  });

  it('approves the payment, records fees and marks the order paid', async () => {
    getConnectPayment.mockResolvedValue(mpPayment());

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: true, status: 'APPROVED' });
    const { payment: p, order: o } = await reload();
    expect(p.status).toBe('APPROVED');
    expect(p.processedAt).not.toBeNull();
    expect(Number(p.gatewayFee)).toBe(2);
    expect(Number(p.netAmount)).toBe(48);
    expect(p.platformFee).toBeNull();
    expect(o.paymentStatus).toBe('APPROVED');
  });

  it('is idempotent: a repeated notification changes nothing', async () => {
    getConnectPayment.mockResolvedValue(mpPayment());
    await syncRestaurantPayment(A.restaurantId, '555');
    const first = (await reload()).payment;

    const again = await syncRestaurantPayment(A.restaurantId, '555');

    expect(again).toMatchObject({ updated: false, reason: 'no-transition' });
    const second = (await reload()).payment;
    expect(second.processedAt.getTime()).toBe(first.processedAt.getTime());
  });

  it('refuses to approve when the paid amount differs from the payment amount', async () => {
    getConnectPayment.mockResolvedValue(mpPayment({ transaction_amount: 10 }));

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'amount-mismatch' });
    const { payment: p, order: o } = await reload();
    expect(p.status).toBe('PENDING');
    expect(o.paymentStatus).toBe('PENDING');
  });

  it('ignores a PIX whose Mercado Pago id differs from the recorded one', async () => {
    getConnectPayment.mockResolvedValue(mpPayment({ id: 999 }));

    const result = await syncRestaurantPayment(A.restaurantId, '999');

    expect(result).toMatchObject({ updated: false, reason: 'mp-id-mismatch' });
    expect((await reload()).payment.status).toBe('PENDING');
  });

  it('never applies a payment that belongs to another restaurant (tenant guard)', async () => {
    await saveConnection(B.restaurantId, TOKENS);
    getConnectPayment.mockResolvedValue(mpPayment());

    const result = await syncRestaurantPayment(B.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'payment-not-found' });
    expect((await reload()).payment.status).toBe('PENDING');
  });

  it('marks a rejected payment DECLINED and leaves the order pending', async () => {
    getConnectPayment.mockResolvedValue(mpPayment({ status: 'rejected', status_detail: 'cc_rejected_other_reason' }));

    await syncRestaurantPayment(A.restaurantId, '555');

    const { payment: p, order: o } = await reload();
    expect(p.status).toBe('DECLINED');
    expect(o.paymentStatus).toBe('PENDING');
  });

  it('moves an approved payment to REFUNDED', async () => {
    getConnectPayment.mockResolvedValueOnce(mpPayment());
    await syncRestaurantPayment(A.restaurantId, '555');
    getConnectPayment.mockResolvedValueOnce(mpPayment({ status: 'refunded' }));

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: true, status: 'REFUNDED' });
  });

  it('reports no-active-connection without calling Mercado Pago', async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: A.restaurantId } });

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'no-active-connection' });
    expect(getConnectPayment).not.toHaveBeenCalled();
  });

  it('marks the connection NEEDS_RECONNECT when Mercado Pago answers 401', async () => {
    getConnectPayment.mockRejectedValue({ status: 401, message: 'unauthorized' });

    const result = await syncRestaurantPayment(A.restaurantId, '555');

    expect(result).toMatchObject({ updated: false, reason: 'unauthorized' });
    expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-payment-sync.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/mercadopago-connect/payment-sync'`.

- [ ] **Step 3: Implement `payment-sync.ts`**

```typescript
import type { PaymentStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { mapMPStatusToPaymentStatus } from '@/lib/mercado-pago';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { getConnectPayment, isUnauthorizedError } from './payments';
import { canTransition } from './payment-status';

export interface SyncResult {
  updated: boolean;
  reason?: string;
  status?: string;
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Applies a Mercado Pago payment to OUR Payment (and Order) records, using the
 * restaurant's own token to fetch it. Used by the webhook and by the PIX
 * status reconciliation. Safe to call repeatedly and concurrently.
 */
export async function syncRestaurantPayment(restaurantId: string, mpPaymentId: string): Promise<SyncResult> {
  const client = await getMpClientForRestaurant(restaurantId);
  if (!client) return { updated: false, reason: 'no-active-connection' };

  let mp: any;
  try {
    mp = await getConnectPayment(client, mpPaymentId);
  } catch (error) {
    if (isUnauthorizedError(error)) {
      await markNeedsReconnect(restaurantId, 'Mercado Pago rejeitou o token (401)');
      return { updated: false, reason: 'unauthorized' };
    }
    throw error;
  }

  const paymentId: string | undefined = mp?.external_reference;
  if (!paymentId) return { updated: false, reason: 'no-external-reference' };

  // Tenant guard: the payment must belong to THIS restaurant and this gateway.
  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, restaurantId, gateway: 'MERCADO_PAGO_CONNECT' },
  });
  if (!payment) return { updated: false, reason: 'payment-not-found' };

  // For PIX we recorded the Mercado Pago id at creation; another MP payment
  // reusing the same external_reference must not be able to approve it.
  if (payment.method === 'PIX' && payment.gatewayPaymentId && payment.gatewayPaymentId !== String(mp.id)) {
    return { updated: false, reason: 'mp-id-mismatch' };
  }

  const mapped = mapMPStatusToPaymentStatus(mp.status) as PaymentStatus;
  if (!canTransition(payment.status, mapped)) return { updated: false, reason: 'no-transition' };

  if (mapped === 'APPROVED' && Number(mp.transaction_amount) !== Number(payment.amount)) {
    console.warn(
      `[mp-connect] amount mismatch for payment ${payment.id}: expected ${payment.amount}, MP reported ${mp.transaction_amount}`
    );
    return { updated: false, reason: 'amount-mismatch' };
  }

  const fee = ((mp.fee_details as Array<{ amount?: number }>) || []).reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0
  );
  const approved = mapped === 'APPROVED';

  // Optimistic concurrency: only apply if the status is still the one we read.
  const result = await prisma.payment.updateMany({
    where: { id: payment.id, restaurantId, status: payment.status },
    data: {
      status: mapped,
      gatewayPaymentId: String(mp.id),
      processedAt: approved ? new Date() : undefined,
      gatewayFee: approved ? fee : undefined,
      netAmount: approved ? Number(payment.amount) - fee : undefined,
      metadata: JSON.stringify({
        ...parseMetadata(payment.metadata),
        mpPaymentId: String(mp.id),
        mpStatus: mp.status,
        mpStatusDetail: mp.status_detail,
      }),
    },
  });
  if (result.count === 0) return { updated: false, reason: 'concurrent' };

  if (approved && payment.orderId) {
    await prisma.order.updateMany({
      where: { id: payment.orderId, restaurantId, paymentStatus: { not: 'APPROVED' } },
      data: { paymentStatus: 'APPROVED' },
    });
  }

  // Preference-based checkouts also keep a MercadoPagoTransaction row.
  await prisma.mercadoPagoTransaction.updateMany({
    where: { paymentId: payment.id },
    data: {
      mpPaymentId: String(mp.id),
      mpStatus: mp.status,
      mpStatusDetail: mp.status_detail,
      lastWebhookAt: new Date(),
    },
  });

  return { updated: true, status: mapped };
}
```

- [ ] **Step 4: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-payment-sync.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/mercadopago-connect/payment-sync.ts __tests__/integration/api/mp-payment-sync.test.ts
git commit -m "feat: add idempotent, tenant-guarded sync of Mercado Pago payments"
```

---

## Task 8: Public PIX creation and status (server-side amount)

**Files:**
- Create: `lib/mercadopago-connect/pix-target.ts`
- Create: `lib/mercadopago-connect/pix-service.ts`
- Rewrite: `app/api/pagamentos/mp/pix/route.ts` (replace the whole file; the `GET` handler is removed)
- Rewrite: `app/api/pagamentos/mp/pix/status/route.ts` (replace the whole file)
- Create: `app/api/pagamentos/mp/pix/manual/route.ts` (the dashboard's "PIX avulso": authenticated staff, typed amount, no order)
- Test: `__tests__/integration/api/mp-pix-route.test.ts` **[DB]**

**Interfaces:**
- Consumes: Task 4 (`getMpClientForRestaurant`, `markNeedsReconnect`), Task 6 (`createConnectPix`, `extractPixData`, `isUnauthorizedError`, `PixData`), Task 7 (`syncRestaurantPayment`).
- Produces:
  - `resolvePixTarget(input: { orderId?: unknown; qrToken?: unknown }): Promise<{ ok: true; target: ResolvedPixTarget } | { ok: false; status: number; error: string }>` where `ResolvedPixTarget = { restaurantId: string; amount: number; description: string; orderId: string | null; sessionId: string | null; metadata: Record<string, unknown> }`.
  - `createPixForTarget(target: ResolvedPixTarget, payer: { email: string; name?: string }): Promise<{ ok: true; pix: PixPayload } | { ok: false; status: number; error: string; code?: string }>` where `PixPayload = PixData & { paymentId: string; status: string; amount: number; description: string }`.
  - HTTP: `POST /api/pagamentos/mp/pix` body `{ orderId } | { qrToken }` plus optional `payerEmail`, `payerName` → `200 { success: true, paymentId, status, qrCode, qrCodeBase64, ticketUrl, expirationDate, amount, description }`, `409 { error, code: 'ONLINE_PAYMENT_UNAVAILABLE' }` when the restaurant has no usable connection. `GET /api/pagamentos/mp/pix/status?paymentId=<our Payment.id>` → `{ status: 'approved' | 'pending' | ..., approved: boolean }` (no payer data).
  - `normalizePayer(input: { payerEmail?: unknown; payerName?: unknown }): { email: string; name: string }` (in `pix-service.ts`), shared by both PIX routes.
  - `buildManualPixTarget(input: { restaurantId: string; amount: unknown; description?: unknown }): ResolveResult` (in `pix-target.ts`) and HTTP `POST /api/pagamentos/mp/pix/manual`: any signed-in staff member of the current restaurant (a cashier included), body `{ amount, description?, payerEmail?, payerName? }`, same success payload as the public route. The restaurant comes from the session; `restaurantId`/`orderId` in the body are ignored. This keeps the dashboard's "PIX avulso" page (`app/dashboard/pagamentos/checkout/page.tsx`) working: it has no order, and a logged-in staff member chooses the amount.

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-pix-route.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  createConnectPix: jest.fn(),
  getConnectPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { createConnectPix, getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection, getConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST as createPix } from '../../../app/api/pagamentos/mp/pix/route';
import { POST as createManualPix } from '../../../app/api/pagamentos/mp/pix/manual/route';
import { GET as pixStatus } from '../../../app/api/pagamentos/mp/pix/status/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

const MP_PIX_RESPONSE = {
  id: 4242,
  status: 'pending',
  date_of_expiration: '2026-09-19T10:30:00.000-03:00',
  point_of_interaction: { transaction_data: { qr_code: 'QR-CODE', qr_code_base64: 'QR-B64', ticket_url: 'https://ticket' } },
};

describe('public PIX routes', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  const savedUrl = process.env.NEXTAUTH_URL;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    process.env.NEXTAUTH_URL = 'https://gastrux.test';
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.orderSession.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: [A.ownerId, B.ownerId] } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
    process.env.NEXTAUTH_URL = savedUrl;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    createConnectPix.mockResolvedValue(MP_PIX_RESPONSE);
  });

  const makeOrder = (restaurantId: string, overrides = {}) =>
    prisma.order.create({
      data: { restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total: 57.9, paymentStatus: 'PENDING', ...overrides },
    });

  const post = (body: any) =>
    createPix(new Request('https://gastrux.test/api/pagamentos/mp/pix', { method: 'POST', body: JSON.stringify(body) }) as any);

  const status = (paymentId: string) =>
    pixStatus(new Request(`https://gastrux.test/api/pagamentos/mp/pix/status?paymentId=${paymentId}`) as any);

  describe('POST /pix (delivery order)', () => {
    it('requires orderId or qrToken', async () => {
      expect((await post({})).status).toBe(400);
    });

    it('404s for an unknown order', async () => {
      expect((await post({ orderId: 'does-not-exist' })).status).toBe(404);
    });

    it('answers 409 and creates nothing when the restaurant has no connection', async () => {
      const order = await makeOrder(A.restaurantId);

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(createConnectPix).not.toHaveBeenCalled();
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
    });

    it("never uses another restaurant's connection for this restaurant's order", async () => {
      await saveConnection(B.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(409);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it('computes the amount on the server, ignoring any amount sent by the browser', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);

      const res = await post({ orderId: order.id, amount: 1, payerEmail: 'cli@ex.com', payerName: 'Maria Souza' });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({ success: true, qrCode: 'QR-CODE', qrCodeBase64: 'QR-B64', ticketUrl: 'https://ticket', amount: 57.9 });

      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      expect(payment).toMatchObject({ restaurantId: A.restaurantId, orderId: order.id, gateway: 'MERCADO_PAGO_CONNECT', method: 'PIX', status: 'PENDING', gatewayPaymentId: '4242' });
      expect(Number(payment.amount)).toBe(57.9);
      expect(payment.platformFee).toBeNull();

      const call = createConnectPix.mock.calls[0];
      expect(call[1]).toMatchObject({ paymentId: body.paymentId, restaurantId: A.restaurantId, amount: 57.9, payer: { email: 'cli@ex.com', name: 'Maria Souza' } });
    });

    it('reuses the pending PIX for the same order instead of creating another', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);

      const first = await (await post({ orderId: order.id })).json();
      const second = await (await post({ orderId: order.id })).json();

      expect(second.paymentId).toBe(first.paymentId);
      expect(second.qrCode).toBe('QR-CODE');
      expect(createConnectPix).toHaveBeenCalledTimes(1);
      expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(1);
    });

    it('refuses an order that is already paid or cancelled', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const paid = await makeOrder(A.restaurantId, { paymentStatus: 'APPROVED' });
      const cancelled = await makeOrder(A.restaurantId, { status: 'CANCELLED' });

      expect((await post({ orderId: paid.id })).status).toBe(409);
      expect((await post({ orderId: cancelled.id })).status).toBe(409);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it('cancels the pending payment and asks to reconnect when Mercado Pago answers 401', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);
      createConnectPix.mockRejectedValue({ status: 401, message: 'unauthorized' });

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(409);
      expect((await getConnection(A.restaurantId)).status).toBe('NEEDS_RECONNECT');
      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      expect(payment.status).toBe('CANCELLED');
    });

    it('returns 502 and cancels the payment on other Mercado Pago errors', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const order = await makeOrder(A.restaurantId);
      createConnectPix.mockRejectedValue(new Error('MP down'));

      const res = await post({ orderId: order.id });

      expect(res.status).toBe(502);
      expect((await getConnection(A.restaurantId)).status).toBe('ACTIVE');
      expect((await prisma.payment.findFirst({ where: { orderId: order.id } })).status).toBe('CANCELLED');
    });
  });

  describe('POST /pix (table tab via qrToken)', () => {
    const makeTable = async (restaurantId: string, ownerId: string, items: Array<[number, number]>) => {
      const section = await prisma.tableSection.create({ data: { restaurantId, name: 'Salão', capacity: 20 } });
      const qrToken = `qr-${crypto.randomBytes(12).toString('hex')}`;
      const table = await prisma.table.create({ data: { restaurantId, number: 7, sectionId: section.id, capacity: 4, qrToken } });
      const recipe = await prisma.recipe.create({ data: { code: `R-${crypto.randomBytes(3).toString('hex')}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', restaurantId } });
      const session = await prisma.orderSession.create({ data: { restaurantId, userId: ownerId, tableId: table.id, tableNumber: 7, status: 'OPEN' } });
      for (const [quantity, price] of items) {
        await prisma.orderSessionItem.create({ data: { sessionId: session.id, recipeId: recipe.id, quantity, price } });
      }
      return { qrToken, table, session };
    };

    it("charges the sum of the open tab's items, computed on the server", async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken, session } = await makeTable(A.restaurantId, A.ownerId, [[2, 10.5], [1, 20]]);

      const res = await post({ qrToken, amount: 1 });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.amount).toBe(41);
      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      expect(payment.orderId).toBeNull();
      expect(payment.restaurantId).toBe(A.restaurantId);
      expect(JSON.parse(payment.metadata)).toMatchObject({ source: 'table', sessionId: session.id, tableNumber: 7 });
      expect(createConnectPix.mock.calls[0][1].description).toBe('Mesa 7');
    });

    it('reuses the pending PIX for the same tab and amount', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const { qrToken } = await makeTable(A.restaurantId, A.ownerId, [[1, 30]]);

      const first = await (await post({ qrToken })).json();
      const second = await (await post({ qrToken })).json();

      expect(second.paymentId).toBe(first.paymentId);
      expect(createConnectPix).toHaveBeenCalledTimes(1);
    });

    it('404s for an unknown table and 409s when there is no open tab', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      expect((await post({ qrToken: 'unknown-token-1234567890' })).status).toBe(404);

      const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: 'S2', capacity: 4 } });
      const qrToken = `qr-${crypto.randomBytes(12).toString('hex')}`;
      await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 8, sectionId: section.id, capacity: 2, qrToken } });
      expect((await post({ qrToken })).status).toBe(409);
    });
  });

  describe('GET /pix/status', () => {
    const makePayment = (overrides = {}) =>
      prisma.payment.create({
        data: { restaurantId: A.restaurantId, amount: 50, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING', gatewayPaymentId: '4242', ...overrides },
      });

    it('requires a payment id and 404s for unknown or non-Connect payments', async () => {
      expect((await pixStatus(new Request('https://gastrux.test/api/pagamentos/mp/pix/status') as any)).status).toBe(400);
      expect((await status('nope')).status).toBe(404);
      const manual = await makePayment({ gateway: 'MANUAL' });
      expect((await status(manual.id)).status).toBe(404);
    });

    it('reads our database and never returns payer data', async () => {
      const payment = await makePayment({ status: 'APPROVED', customerEmail: 'secret@payer.com' });

      const res = await status(payment.id);
      const body = await res.json();

      expect(body).toEqual({ status: 'approved', approved: true });
      expect(JSON.stringify(body)).not.toContain('secret@payer.com');
      expect(getConnectPayment).not.toHaveBeenCalled();
    });

    it('does not call Mercado Pago for a young pending payment', async () => {
      const payment = await makePayment();
      expect(await (await status(payment.id)).json()).toEqual({ status: 'pending', approved: false });
      expect(getConnectPayment).not.toHaveBeenCalled();
    });

    it('reconciles an old pending payment with Mercado Pago when the webhook is late', async () => {
      await saveConnection(A.restaurantId, TOKENS);
      const payment = await makePayment({ createdAt: new Date(Date.now() - 2 * 60 * 1000) });
      getConnectPayment.mockResolvedValue({ id: 4242, status: 'approved', status_detail: 'accredited', external_reference: payment.id, transaction_amount: 50, fee_details: [] });

      const body = await (await status(payment.id)).json();

      expect(body).toEqual({ status: 'approved', approved: true });
      expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
    });
  });

  describe('POST /pix/manual (staff, no order)', () => {
    const asStaff = () =>
      (getServerSession as jest.Mock).mockResolvedValue({
        user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'CASHIER' },
      });

    const manual = (body: any) =>
      createManualPix(
        new Request('https://gastrux.test/api/pagamentos/mp/pix/manual', { method: 'POST', body: JSON.stringify(body) }) as any
      );

    it('rejects unauthenticated requests', async () => {
      (getServerSession as jest.Mock).mockResolvedValue(null);
      expect((await manual({ amount: 10 })).status).toBe(401);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it.each([[0], [-5], ['abc'], [null], [1e9]])('rejects the invalid amount %p', async (amount) => {
      asStaff();
      await saveConnection(A.restaurantId, TOKENS);

      expect((await manual({ amount })).status).toBe(400);
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it('answers 409 when the restaurant has no connection', async () => {
      asStaff();

      const res = await manual({ amount: 10 });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(createConnectPix).not.toHaveBeenCalled();
    });

    it("creates the PIX for the session's own restaurant and ignores a restaurantId or orderId in the body", async () => {
      asStaff();
      await saveConnection(A.restaurantId, TOKENS);
      await saveConnection(B.restaurantId, TOKENS);

      const res = await manual({ amount: 12.34, description: 'Balcão', restaurantId: B.restaurantId, orderId: 'ignored' });
      const body = await res.json();

      expect(res.status).toBe(200);
      const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
      expect(payment).toMatchObject({ restaurantId: A.restaurantId, orderId: null, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' });
      expect(Number(payment.amount)).toBe(12.34);
      expect(JSON.parse(payment.metadata)).toMatchObject({ source: 'manual' });
      expect(createConnectPix.mock.calls[0][1]).toMatchObject({
        restaurantId: A.restaurantId,
        amount: 12.34,
        description: 'Balcão',
      });
    });

    it('creates a new PIX on every call, because there is no order or tab to reuse', async () => {
      asStaff();
      await saveConnection(A.restaurantId, TOKENS);

      const first = await (await manual({ amount: 10 })).json();
      const second = await (await manual({ amount: 10 })).json();

      expect(second.paymentId).not.toBe(first.paymentId);
      expect(createConnectPix).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-pix-route.test.ts`
Expected: FAIL — the new route/module imports do not resolve yet (or the old route ignores `orderId`).

- [ ] **Step 3: Implement `pix-target.ts`**

```typescript
import type { OrderSessionStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * Turns "what is the customer paying for" into a restaurant plus an amount
 * computed ON THE SERVER. The browser never decides the amount or the
 * restaurant.
 */

export interface ResolvedPixTarget {
  restaurantId: string;
  amount: number;
  description: string;
  orderId: string | null;
  sessionId: string | null;
  metadata: Record<string, unknown>;
}

export type ResolveResult =
  | { ok: true; target: ResolvedPixTarget }
  | { ok: false; status: number; error: string };

const OPEN_SESSION_STATUSES: OrderSessionStatus[] = ['OPEN', 'SENT_TO_KITCHEN', 'READY'];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function resolveOrder(orderId: string): Promise<ResolveResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, restaurantId: true, orderNumber: true, total: true, status: true, paymentStatus: true },
  });
  if (!order) return { ok: false, status: 404, error: 'Pedido não encontrado' };
  if (order.paymentStatus === 'APPROVED') return { ok: false, status: 409, error: 'Pedido já pago' };
  if (order.status === 'CANCELLED') return { ok: false, status: 409, error: 'Pedido cancelado' };

  const amount = round2(Number(order.total ?? 0));
  if (!(amount > 0)) return { ok: false, status: 400, error: 'Pedido sem valor a pagar' };

  return {
    ok: true,
    target: {
      restaurantId: order.restaurantId,
      amount,
      description: `Pedido ${order.orderNumber}`,
      orderId: order.id,
      sessionId: null,
      metadata: { source: 'delivery', orderNumber: order.orderNumber },
    },
  };
}

async function resolveTable(qrToken: string): Promise<ResolveResult> {
  const table = await prisma.table.findUnique({
    where: { qrToken },
    select: { id: true, number: true, restaurantId: true },
  });
  if (!table) return { ok: false, status: 404, error: 'Mesa não encontrada' };

  const session = await prisma.orderSession.findFirst({
    where: { tableId: table.id, restaurantId: table.restaurantId, status: { in: OPEN_SESSION_STATUSES } },
    orderBy: { openedAt: 'desc' },
    select: { id: true, items: { select: { price: true, quantity: true } } },
  });
  if (!session) return { ok: false, status: 409, error: 'Nenhuma comanda aberta nesta mesa' };

  const amount = round2(session.items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0));
  if (!(amount > 0)) return { ok: false, status: 409, error: 'A comanda está vazia' };

  return {
    ok: true,
    target: {
      restaurantId: table.restaurantId,
      amount,
      description: `Mesa ${table.number}`,
      orderId: null,
      sessionId: session.id,
      metadata: { source: 'table', sessionId: session.id, tableId: table.id, tableNumber: table.number },
    },
  };
}

export async function resolvePixTarget(input: { orderId?: unknown; qrToken?: unknown }): Promise<ResolveResult> {
  if (typeof input.orderId === 'string' && input.orderId) return resolveOrder(input.orderId);
  if (typeof input.qrToken === 'string' && input.qrToken) return resolveTable(input.qrToken);
  return { ok: false, status: 400, error: 'Informe orderId ou qrToken' };
}

/** Sanity cap (R$) for an amount typed by staff. */
export const MAX_MANUAL_AMOUNT = 100_000;

/**
 * The dashboard's "PIX avulso": there is no order, and a signed-in staff
 * member of the restaurant chooses the amount. The restaurant comes from the
 * session (the caller passes it), never from the request body.
 */
export function buildManualPixTarget(input: {
  restaurantId: string;
  amount: unknown;
  description?: unknown;
}): ResolveResult {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_MANUAL_AMOUNT) {
    return { ok: false, status: 400, error: 'Informe um valor válido' };
  }
  const description =
    typeof input.description === 'string' && input.description.trim()
      ? input.description.trim().slice(0, 100)
      : 'Pagamento PIX';

  return {
    ok: true,
    target: {
      restaurantId: input.restaurantId,
      amount,
      description,
      orderId: null,
      sessionId: null,
      metadata: { source: 'manual' },
    },
  };
}
```

- [ ] **Step 4: Implement `pix-service.ts`**

```typescript
import { prisma } from '@/lib/prisma';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { createConnectPix, extractPixData, isUnauthorizedError, type PixData } from './payments';
import type { ResolvedPixTarget } from './pix-target';

/** PIX expires in 30 minutes; reuse a pending one only while it is surely valid. */
const REUSE_WINDOW_MS = 25 * 60 * 1000;

export const ONLINE_PAYMENT_UNAVAILABLE = 'Este restaurante não aceita pagamento online no momento.';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Payer data typed by a customer or staff member: keep it short, fall back to safe defaults. */
export function normalizePayer(input: { payerEmail?: unknown; payerName?: unknown }): { email: string; name: string } {
  const email =
    typeof input.payerEmail === 'string' && EMAIL_RE.test(input.payerEmail) ? input.payerEmail : 'cliente@exemplo.com';
  const name =
    typeof input.payerName === 'string' && input.payerName.trim() ? input.payerName.trim().slice(0, 80) : 'Cliente';
  return { email, name };
}

export interface PixPayload extends PixData {
  paymentId: string;
  status: string;
  amount: number;
  description: string;
}

export type CreatePixResult =
  | { ok: true; pix: PixPayload }
  | { ok: false; status: number; error: string; code?: string };

function parseMetadata(raw: string | null): Record<string, any> {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// There is no generic rate limiter in this codebase; reusing the pending
// payment for the same target and amount stops repeated clicks (or abuse)
// from creating unbounded Mercado Pago payments.
async function findReusablePending(target: ResolvedPixTarget) {
  // A manual (staff-typed) PIX has no order or tab to match against: always create a new one.
  if (!target.orderId && !target.sessionId) return null;

  const scope = target.orderId
    ? { orderId: target.orderId }
    : { metadata: { contains: `"sessionId":"${target.sessionId}"` } };

  return prisma.payment.findFirst({
    where: {
      restaurantId: target.restaurantId,
      gateway: 'MERCADO_PAGO_CONNECT',
      status: 'PENDING',
      amount: target.amount,
      gatewayPaymentId: { not: null },
      createdAt: { gte: new Date(Date.now() - REUSE_WINDOW_MS) },
      ...scope,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPixForTarget(
  target: ResolvedPixTarget,
  payer: { email: string; name?: string }
): Promise<CreatePixResult> {
  const client = await getMpClientForRestaurant(target.restaurantId);
  if (!client) {
    return { ok: false, status: 409, code: 'ONLINE_PAYMENT_UNAVAILABLE', error: ONLINE_PAYMENT_UNAVAILABLE };
  }

  const reusable = await findReusablePending(target);
  const stored = reusable ? parseMetadata(reusable.metadata).pix : null;
  if (reusable && stored?.qrCode) {
    return {
      ok: true,
      pix: {
        paymentId: reusable.id,
        status: 'pending',
        qrCode: stored.qrCode,
        qrCodeBase64: stored.qrCodeBase64 ?? '',
        ticketUrl: stored.ticketUrl ?? '',
        expirationDate: stored.expirationDate ?? null,
        amount: target.amount,
        description: target.description,
      },
    };
  }

  const payment = await prisma.payment.create({
    data: {
      restaurantId: target.restaurantId,
      orderId: target.orderId,
      amount: target.amount,
      currency: 'BRL',
      method: 'PIX',
      gateway: 'MERCADO_PAGO_CONNECT',
      status: 'PENDING',
      description: target.description,
      customerEmail: payer.email,
      customerName: payer.name,
      metadata: JSON.stringify(target.metadata),
    },
  });

  try {
    const mpPayment = await createConnectPix(client, {
      paymentId: payment.id,
      restaurantId: target.restaurantId,
      amount: target.amount,
      description: target.description,
      payer,
    });
    const pix = extractPixData(mpPayment);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayPaymentId: String(mpPayment.id),
        metadata: JSON.stringify({ ...target.metadata, pix }),
      },
    });

    return {
      ok: true,
      pix: { paymentId: payment.id, status: 'pending', ...pix, amount: target.amount, description: target.description },
    };
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'CANCELLED' } }).catch(() => {});

    if (isUnauthorizedError(error)) {
      await markNeedsReconnect(target.restaurantId, 'Mercado Pago rejeitou o token (401)');
      return { ok: false, status: 409, code: 'ONLINE_PAYMENT_UNAVAILABLE', error: ONLINE_PAYMENT_UNAVAILABLE };
    }

    console.error('[mp-connect] PIX creation failed:', error);
    return { ok: false, status: 502, error: 'Não foi possível gerar o PIX. Tente novamente.' };
  }
}
```

- [ ] **Step 5: Rewrite the PIX route**

Replace the entire contents of `app/api/pagamentos/mp/pix/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { resolvePixTarget } from '@/lib/mercadopago-connect/pix-target';
import { createPixForTarget, normalizePayer } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pagamentos/mp/pix
 * Public (the end customer has no login). The browser only says WHAT it wants
 * to pay - `orderId` (delivery) or `qrToken` (table tab). The restaurant and
 * the amount are resolved on the server, and the PIX is created with the
 * restaurant's own Mercado Pago token, so the money lands in its account.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { orderId, qrToken, payerEmail, payerName } = body || {};

    const resolved = await resolvePixTarget({ orderId, qrToken });
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

    const result = await createPixForTarget(resolved.target, normalizePayer({ payerEmail, payerName }));
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ success: true, ...result.pix });
  } catch (error) {
    console.error('[PIX] Erro ao criar pagamento:', error);
    return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 500 });
  }
}
```

- [ ] **Step 6: Rewrite the status route**

Replace the entire contents of `app/api/pagamentos/mp/pix/status/route.ts` with:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { syncRestaurantPayment } from '@/lib/mercadopago-connect/payment-sync';

export const dynamic = 'force-dynamic';

/** Only ask Mercado Pago directly once the webhook has had time to arrive. */
const RECONCILE_AFTER_MS = 30 * 1000;

const SELECT = { id: true, status: true, restaurantId: true, gatewayPaymentId: true, createdAt: true } as const;

/**
 * GET /api/pagamentos/mp/pix/status?paymentId=<our Payment.id>
 * Reads OUR database (updated by the webhook). Returns only the status:
 * no payer data, and no Mercado Pago lookup by a caller-supplied id.
 */
export async function GET(request: NextRequest) {
  const paymentId = new URL(request.url).searchParams.get('paymentId');
  if (!paymentId) return NextResponse.json({ error: 'paymentId obrigatório' }, { status: 400 });

  let payment = await prisma.payment.findFirst({
    where: { id: paymentId, gateway: 'MERCADO_PAGO_CONNECT' },
    select: SELECT,
  });
  if (!payment) return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 });

  const webhookIsLate =
    payment.status === 'PENDING' &&
    payment.restaurantId &&
    payment.gatewayPaymentId &&
    Date.now() - payment.createdAt.getTime() > RECONCILE_AFTER_MS;

  if (webhookIsLate) {
    try {
      await syncRestaurantPayment(payment.restaurantId!, payment.gatewayPaymentId!);
      payment = (await prisma.payment.findUnique({ where: { id: payment.id }, select: SELECT })) ?? payment;
    } catch (error) {
      console.error('[mp-connect] status reconcile failed:', error);
    }
  }

  const approved = payment.status === 'APPROVED';
  return NextResponse.json({ status: approved ? 'approved' : payment.status.toLowerCase(), approved });
}
```

- [ ] **Step 6a: Add the staff "PIX avulso" route**

Create `app/api/pagamentos/mp/pix/manual/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { buildManualPixTarget } from '@/lib/mercadopago-connect/pix-target';
import { createPixForTarget, normalizePayer } from '@/lib/mercadopago-connect/pix-service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pagamentos/mp/pix/manual - the dashboard's "PIX avulso".
 * Any signed-in staff member of the restaurant may charge an amount they type
 * (for example a cashier at the counter), so this deliberately does not
 * require an admin role. The restaurant ALWAYS comes from the session:
 * `restaurantId` or `orderId` in the body are ignored.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) {
    return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 403 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) || {};
    const built = buildManualPixTarget({ restaurantId, amount: body.amount, description: body.description });
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: built.status });

    const result = await createPixForTarget(
      built.target,
      normalizePayer({ payerEmail: body.payerEmail, payerName: body.payerName })
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
    }
    return NextResponse.json({ success: true, ...result.pix });
  } catch (error) {
    console.error('[PIX manual] Erro ao criar pagamento:', error);
    return NextResponse.json({ error: 'Erro ao gerar PIX' }, { status: 500 });
  }
}
```

- [ ] **Step 7: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-pix-route.test.ts`
Expected: PASS, 25 tests.

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (The three existing pages that call these routes still use the old request shape; Task 11 updates them. They fail at runtime, not at type-check.)

- [ ] **Step 9: Commit**

```bash
git add lib/mercadopago-connect/pix-target.ts lib/mercadopago-connect/pix-service.ts app/api/pagamentos/mp/pix/route.ts app/api/pagamentos/mp/pix/status/route.ts app/api/pagamentos/mp/pix/manual/route.ts __tests__/integration/api/mp-pix-route.test.ts
git commit -m "feat: create PIX with the restaurant token and a server-computed amount"
```


---

## Task 9: Webhook — the `rid` branch

**Files:**
- Modify: `app/api/pagamentos/mp/webhook/route.ts` (one import, one branch before the `switch`)
- Test: `__tests__/integration/api/mp-webhook-connect.test.ts` **[DB]**

**Interfaces:**
- Consumes: `syncRestaurantPayment(restaurantId: string, mpPaymentId: string)` (Task 7).
- Produces: behavior only. A notification whose URL carries `?rid=<restaurantId>` is applied with that restaurant's token and never reaches the platform-billing handlers. A notification without `rid` behaves exactly as before.

Signature verification stays where it is (it runs first, for every notification). The MP webhook reads `topic`/`type` and `id`/`data.id` from the query string (see `POST` in the file), so `rid` is read from the same place.

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-webhook-connect.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  getConnectPayment: jest.fn(),
}));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  getPayment: jest.fn().mockResolvedValue(null),
}));

import { getConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { getPayment } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const SECRET = 'test-mp-secret';
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

function signed(dataId: string, query: string, secret = SECRET) {
  const ts = String(Date.now());
  const requestId = `req-${dataId}`;
  const v1 = crypto.createHmac('sha256', secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest('hex');
  return new Request(`https://gastrux.test/api/pagamentos/mp/webhook?${query}`, {
    method: 'POST',
    headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': requestId },
    body: '{}',
  });
}

describe('POST /api/pagamentos/mp/webhook - restaurant (rid) branch', () => {
  let POST: any;
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  const savedEnv: Record<string, string | undefined> = {};
  const ENV = ['MERCADO_PAGO_ENV', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_WEBHOOK_SECRET_PROD', 'CREDENTIALS_ENCRYPTION_KEY'];

  beforeAll(async () => {
    ENV.forEach((k) => (savedEnv[k] = process.env[k]));
    // The route reads the webhook secret at import time, so set env BEFORE requiring it.
    process.env.MERCADO_PAGO_ENV = 'test';
    process.env.MERCADO_PAGO_WEBHOOK_SECRET = SECRET;
    process.env.MERCADO_PAGO_WEBHOOK_SECRET_PROD = SECRET;
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    POST = require('../../../app/api/pagamentos/mp/webhook/route').POST;

    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;
  });

  const cleanRows = async () => {
    const ids = [A.restaurantId, B.restaurantId];
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.order.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    ENV.forEach((k) => {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    });
  });

  let order: any;
  let payment: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    getPayment.mockResolvedValue(null);
    await cleanRows();
    await saveConnection(A.restaurantId, TOKENS);
    order = await prisma.order.create({
      data: { restaurantId: A.restaurantId, orderNumber: `T-${crypto.randomBytes(4).toString('hex')}`, total: 50, paymentStatus: 'PENDING' },
    });
    payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, orderId: order.id, amount: 50, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING', gatewayPaymentId: '555' },
    });
    getConnectPayment.mockResolvedValue({
      id: 555, status: 'approved', status_detail: 'accredited', external_reference: payment.id, transaction_amount: 50, fee_details: [],
    });
  });

  const state = async () => ({
    payment: await prisma.payment.findUnique({ where: { id: payment.id } }),
    order: await prisma.order.findUnique({ where: { id: order.id } }),
  });

  it('rejects an invalid signature even when rid is present', async () => {
    const res = await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`, 'wrong-secret') as any);
    expect(res.status).toBe(401);
    expect(getConnectPayment).not.toHaveBeenCalled();
    expect((await state()).payment.status).toBe('PENDING');
  });

  it('applies the payment with the restaurant token: approves it and marks the order paid', async () => {
    const res = await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);

    expect(res.status).toBe(200);
    expect(getConnectPayment).toHaveBeenCalledTimes(1);
    expect(getConnectPayment.mock.calls[0][0].accessToken).toBe('APP_USR-a');
    expect(getConnectPayment.mock.calls[0][1]).toBe('555');
    const { payment: p, order: o } = await state();
    expect(p.status).toBe('APPROVED');
    expect(o.paymentStatus).toBe('APPROVED');
  });

  it('never calls the platform-billing lookup for a rid notification', async () => {
    await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('is idempotent when Mercado Pago repeats the notification', async () => {
    await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);
    const first = (await state()).payment;

    const res = await POST(signed('555', `topic=payment&id=555&rid=${A.restaurantId}`) as any);

    expect(res.status).toBe(200);
    const second = (await state()).payment;
    expect(second.status).toBe('APPROVED');
    expect(second.processedAt.getTime()).toBe(first.processedAt.getTime());
  });

  it("does not let another restaurant's rid approve this restaurant's payment", async () => {
    await saveConnection(B.restaurantId, TOKENS);

    await POST(signed('555', `topic=payment&id=555&rid=${B.restaurantId}`) as any);

    const { payment: p, order: o } = await state();
    expect(p.status).toBe('PENDING');
    expect(o.paymentStatus).toBe('PENDING');
  });

  it('ignores non-payment topics that carry a rid', async () => {
    const res = await POST(signed('555', `topic=merchant_order&id=555&rid=${A.restaurantId}`) as any);
    expect(res.status).toBe(200);
    expect(getConnectPayment).not.toHaveBeenCalled();
    expect(getPayment).not.toHaveBeenCalled();
  });

  it('keeps the platform-billing path for notifications WITHOUT rid', async () => {
    const res = await POST(signed('777', 'topic=payment&id=777') as any);

    expect(res.status).toBe(200);
    expect(getPayment).toHaveBeenCalledTimes(1);
    expect(getPayment).toHaveBeenCalledWith('777');
    expect(getConnectPayment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-webhook-connect.test.ts`
Expected: FAIL — the `rid` tests fail because the route ignores `rid` (the payment stays `PENDING` and `getPayment` is called).

- [ ] **Step 3: Add the import**

In `app/api/pagamentos/mp/webhook/route.ts`, after the line

```typescript
import { createPaymentAlert } from '@/lib/payment-alert-service';
```

add:

```typescript
import { syncRestaurantPayment } from '@/lib/mercadopago-connect/payment-sync';
```

- [ ] **Step 4: Add the branch**

In the same file, inside `POST`, replace:

```typescript
    switch (validTopic) {
      case 'payment':
        await handlePaymentNotification(id);
```

with:

```typescript
    // Payments received by a RESTAURANT through its own Mercado Pago account
    // carry ?rid=<restaurantId> (set in notification_url when the payment was
    // created). They are fetched with THAT restaurant's token and never touch
    // the platform-billing handlers below, which stay unchanged.
    const rid = url.searchParams.get('rid');
    if (rid) {
      if (validTopic === 'payment') {
        await syncRestaurantPayment(rid, id);
      }
      return NextResponse.json({ received: true });
    }

    switch (validTopic) {
      case 'payment':
        await handlePaymentNotification(id);
```

- [ ] **Step 5: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-webhook-connect.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add __tests__/integration/api/mp-webhook-connect.test.ts
git add -p app/api/pagamentos/mp/webhook/route.ts
git commit -m "feat: handle restaurant Mercado Pago notifications (rid) with the restaurant token"
```

---

## Task 10: Refund and card checkout use the restaurant token

**Files:**
- Modify: `app/api/pagamentos/mp/refund/route.ts`
- Modify: `app/api/pagamentos/mp/checkout/route.ts`
- Test: `__tests__/integration/api/mp-refund-route.test.ts` **[DB]**
- Test: `__tests__/integration/api/mp-checkout-route.test.ts` **[DB]**

**Interfaces:**
- Consumes: `getMpClientForRestaurant` (Task 4); `refundConnectPayment`, `notificationUrlFor` (Task 6); optional `client` argument of `createCheckoutPreference` / `createPixPreference` (Task 6).
- Produces: behavior only. Refunds of `MERCADO_PAGO_CONNECT` payments use `PaymentRefund` with the restaurant token; checkout creates `MERCADO_PAGO_CONNECT` payments and preferences with the restaurant token (and `409 ONLINE_PAYMENT_UNAVAILABLE` without a connection). Legacy `MERCADO_PAGO` rows keep the old refund path.

### Part A: refund

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-refund-route.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  refundConnectPayment: jest.fn(),
}));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  refundPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { refundConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { refundPayment } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST } from '../../../app/api/pagamentos/mp/refund/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('POST /api/pagamentos/mp/refund', () => {
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
    await prisma.paymentRefund.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
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
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
    refundConnectPayment.mockResolvedValue({ id: 9001 });
    refundPayment.mockResolvedValue({ id: 9002 });
  });

  const refund = (body: any) =>
    POST(new Request('https://gastrux.test/api/pagamentos/mp/refund', { method: 'POST', body: JSON.stringify(body) }) as any);

  const makeConnectPayment = (restaurantId = A.restaurantId) =>
    prisma.payment.create({
      data: { restaurantId, amount: 100, method: 'PIX', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
    });

  it("refunds a Connect payment fully with the restaurant's token and records the Connect gateway", async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(200);
    expect(refundConnectPayment).toHaveBeenCalledTimes(1);
    const [client, mpId, amount] = refundConnectPayment.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(mpId).toBe('4242');
    expect(amount).toBeUndefined();
    expect(refundPayment).not.toHaveBeenCalled();

    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('REFUNDED');
    const record = await prisma.paymentRefund.findFirst({ where: { paymentId: payment.id } });
    expect(record.gateway).toBe('MERCADO_PAGO_CONNECT');
    expect(record.gatewayRefundId).toBe('9001');
  });

  it('refunds partially', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id, amount: 30 });

    expect(res.status).toBe(200);
    expect(refundConnectPayment.mock.calls[0][2]).toBe(30);
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated.status).toBe('PARTIALLY_REFUNDED');
    expect(Number(updated.amountRefunded)).toBe(30);
  });

  it("404s for another restaurant's payment and never calls Mercado Pago", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    const payment = await makeConnectPayment(B.restaurantId);

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(404);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it('answers 409 and refunds nothing when the connection is unavailable', async () => {
    const payment = await makeConnectPayment();

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(409);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it('keeps the legacy path for platform MERCADO_PAGO payments', async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO', status: 'APPROVED' },
    });
    await prisma.mercadoPagoTransaction.create({
      data: { paymentId: payment.id, preferenceId: `pref-${crypto.randomBytes(4).toString('hex')}`, mpPaymentId: '888' },
    });

    const res = await refund({ paymentId: payment.id });

    expect(res.status).toBe(200);
    expect(refundPayment).toHaveBeenCalledWith('888', undefined);
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect((await prisma.paymentRefund.findFirst({ where: { paymentId: payment.id } })).gateway).toBe('MERCADO_PAGO');
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-refund-route.test.ts`
Expected: FAIL — the Connect payment has no `mercadoPagoData`, so the route answers `400 Mercado Pago payment ID not found`.

- [ ] **Step 3: Edit the refund route**

In `app/api/pagamentos/mp/refund/route.ts`:

Edit 1 — imports. Replace:

```typescript
import { refundPayment } from '@/lib/mercado-pago';
```

with:

```typescript
import { refundPayment } from '@/lib/mercado-pago';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { refundConnectPayment } from '@/lib/mercadopago-connect/payments';
```

Edit 2 — the payment id. Replace:

```typescript
    // Get MP payment ID
    const mpPaymentId = payment.mercadoPagoData?.mpPaymentId;
```

with:

```typescript
    // Get MP payment ID. Payments received by a restaurant through its own
    // Mercado Pago account (MERCADO_PAGO_CONNECT) keep it in gatewayPaymentId.
    const isConnect = payment.gateway === 'MERCADO_PAGO_CONNECT';
    const mpPaymentId = isConnect ? payment.gatewayPaymentId : payment.mercadoPagoData?.mpPaymentId;
```

Edit 3 — the refund call. Replace:

```typescript
    // Process refund via MP API
    const mpRefund = await refundPayment(
      mpPaymentId,
      amount ? Number(amount) : undefined
    );
```

with:

```typescript
    // Process refund via MP API - with the restaurant's own token for Connect payments.
    let mpRefund;
    if (isConnect) {
      const client = await getMpClientForRestaurant(restaurantId);
      if (!client) {
        return NextResponse.json(
          { error: 'Conexão com o Mercado Pago indisponível. Reconecte sua conta para reembolsar.' },
          { status: 409 }
        );
      }
      mpRefund = await refundConnectPayment(client, mpPaymentId, amount ? Number(amount) : undefined);
    } else {
      mpRefund = await refundPayment(mpPaymentId, amount ? Number(amount) : undefined);
    }
```

Edit 4 — the recorded gateway. Replace (this line appears once, inside `prisma.paymentRefund.create`):

```typescript
        gateway: 'MERCADO_PAGO',
```

with:

```typescript
        gateway: payment.gateway,
```

- [ ] **Step 4: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-refund-route.test.ts`
Expected: PASS, 5 tests.

### Part B: card checkout

- [ ] **Step 5: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-checkout-route.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
  createPixPreference: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { createCheckoutPreference, createPixPreference } from '../../../lib/mercado-pago';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { POST } from '../../../app/api/pagamentos/mp/checkout/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PREFERENCE = { id: 'pref-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

describe('POST /api/pagamentos/mp/checkout', () => {
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
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
  };

  afterAll(async () => {
    await cleanRows();
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    Object.entries(saved).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await cleanRows();
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
    createCheckoutPreference.mockResolvedValue(PREFERENCE);
    createPixPreference.mockResolvedValue(PREFERENCE);
  });

  const checkout = (body: any) =>
    POST(new Request('https://gastrux.test/api/pagamentos/mp/checkout', { method: 'POST', body: JSON.stringify(body) }) as any);

  const BODY = {
    orderId: 'order-1',
    items: [{ id: 'i1', title: 'Pizza', quantity: 2, unitPrice: 30 }],
    payer: { email: 'cli@ex.com', name: 'Cliente' },
  };

  it('rejects unauthenticated requests', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    expect((await checkout(BODY)).status).toBe(401);
  });

  it('answers 409 and creates nothing when the restaurant has no connection', async () => {
    const res = await checkout(BODY);

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
  });

  it("does not use another restaurant's connection", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    expect((await checkout(BODY)).status).toBe(409);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it("creates the payment and the preference with the restaurant's own token", async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const res = await checkout(BODY);
    const body = await res.json();

    expect(res.status).toBe(201);
    const payment = await prisma.payment.findUnique({ where: { id: body.paymentId } });
    expect(payment).toMatchObject({ restaurantId: A.restaurantId, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' });
    expect(Number(payment.amount)).toBe(60);

    const [input, client] = createCheckoutPreference.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(input.externalReference).toBe(payment.id);
    expect(input.notificationUrl).toBe(`https://gastrux.test/api/pagamentos/mp/webhook?rid=${A.restaurantId}`);

    const tx = await prisma.mercadoPagoTransaction.findFirst({ where: { paymentId: payment.id } });
    expect(tx.preferenceId).toBe('pref-1');
  });

  it('uses the PIX preference with the restaurant client when pixOnly is set', async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const res = await checkout({ ...BODY, pixOnly: true });

    expect(res.status).toBe(201);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(createPixPreference.mock.calls[0][1].accessToken).toBe('APP_USR-a');
  });
});
```

- [ ] **Step 6: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-checkout-route.test.ts`
Expected: FAIL — without a connection the current route still answers `201` using the platform token.

- [ ] **Step 7: Edit the checkout route**

In `app/api/pagamentos/mp/checkout/route.ts`:

Edit 1 — imports. Replace:

```typescript
import {
  createCheckoutPreference,
  createPixPreference,
  isMercadoPagoConfigured,
} from '@/lib/mercado-pago';
```

with:

```typescript
import {
  createCheckoutPreference,
  createPixPreference,
} from '@/lib/mercado-pago';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { getMpClientForRestaurant } from '@/lib/mercadopago-connect/connection-service';
import { notificationUrlFor } from '@/lib/mercadopago-connect/payments';
```

Edit 2 — remove the platform-token check (it no longer applies: this route never uses the platform token). Delete exactly this block:

```typescript
    if (!isMercadoPagoConfigured()) {
      return NextResponse.json(
        { error: 'Mercado Pago not configured' },
        { status: 500 }
      );
    }

```

Edit 3 — restaurant resolution and connection check. Replace:

```typescript
    const restaurantId = user.restaurants?.[0]?.restaurant?.id;
    const restaurant = user.restaurants?.[0]?.restaurant;
```

with:

```typescript
    // Use the CURRENT restaurant (not merely the first membership): the payment
    // must be created with, and land in, that restaurant's own Mercado Pago account.
    const restaurantId = await getCurrentRestaurantId();
    const restaurant = user.restaurants?.find((r: any) => r.restaurant?.id === restaurantId)?.restaurant;

    const mpClient = restaurantId ? await getMpClientForRestaurant(restaurantId) : null;
    if (!restaurantId || !mpClient) {
      return NextResponse.json(
        {
          error: 'Conecte sua conta do Mercado Pago para receber pagamentos online.',
          code: 'ONLINE_PAYMENT_UNAVAILABLE',
        },
        { status: 409 }
      );
    }
```

Edit 4 — gateway on the Payment row. Replace:

```typescript
        restaurantId: restaurantId || null,
        gateway: 'MERCADO_PAGO',
```

with:

```typescript
        restaurantId,
        gateway: 'MERCADO_PAGO_CONNECT',
```

Edit 5 — notification URL (use the configured base URL, not the client-supplied `Origin` header, and carry the restaurant id). Replace:

```typescript
      notificationUrl: `${origin}/api/pagamentos/mp/webhook`,
```

with:

```typescript
      notificationUrl: notificationUrlFor(restaurantId),
```

Edit 6 — create the preference with the restaurant client. Replace:

```typescript
    const preference = pixOnly
      ? await createPixPreference({
          ...preferenceInput,
          amount: totalAmount,
          description: items.map((i: any) => i.title).join(', '),
        })
      : await createCheckoutPreference(preferenceInput);
```

with:

```typescript
    const preference = pixOnly
      ? await createPixPreference(
          {
            ...preferenceInput,
            amount: totalAmount,
            description: items.map((i: any) => i.title).join(', '),
          },
          mpClient
        )
      : await createCheckoutPreference(preferenceInput, mpClient);
```

- [ ] **Step 8: [DB] Run both tests to verify they pass**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-refund-route.test.ts __tests__/integration/api/mp-checkout-route.test.ts`
Expected: PASS, 5 + 5 tests.

- [ ] **Step 9: Confirm nothing in the UI depends on the old checkout behavior**

Run: `grep -rn "mp/checkout" app components lib --include=*.ts --include=*.tsx`
Expected: matches only the route itself and `components/billing/gateway-choice-dialog.tsx`, which calls the different `/api/billing/mp/checkout-session` (platform billing). `POST /api/pagamentos/mp/checkout` has no UI caller today. If one is added later it must show `data.error` on a `409` ("Conecte sua conta do Mercado Pago...").

- [ ] **Step 10: Type-check and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add __tests__/integration/api/mp-refund-route.test.ts __tests__/integration/api/mp-checkout-route.test.ts
git add -p app/api/pagamentos/mp/refund/route.ts app/api/pagamentos/mp/checkout/route.ts
git commit -m "feat: refund and card checkout use the restaurant's own Mercado Pago token"
```

---

## Task 10b: Unified payments never use the platform token

Found while executing Task 10 (the implementer noticed it, the controller confirmed it): `lib/payment-unified.ts`, called by the authenticated routes under `app/api/pagamentos/unified/*`, still creates `MERCADO_PAGO` payments with the platform token, and syncs their status with it. That breaks the plan's core principle ("no restaurant payment uses the platform token"), so it is closed here with the same model as Tasks 8 and 10: the restaurant's own connection, and no fallback.

**Files:**
- Modify: `lib/payment-unified.ts`
- Modify: `app/api/pagamentos/unified/route.ts`
- Test: `__tests__/integration/api/mp-unified-payment.test.ts` **[DB]**

**Interfaces:**
- Consumes: `getMpClientForRestaurant` (`lib/mercadopago-connect/connection-service.ts`), `notificationUrlFor` and `refundConnectPayment` (`lib/mercadopago-connect/payments.ts`), the optional `client` argument of `createCheckoutPreference` (Task 6), `getCurrentRestaurantId` (`lib/whatsapp/get-restaurant.ts`).
- Produces:
  - `export class OnlinePaymentUnavailableError extends Error { code: 'ONLINE_PAYMENT_UNAVAILABLE' }` in `lib/payment-unified.ts`.
  - `createUnifiedPayment` with `gateway: 'MERCADO_PAGO'` now requires the restaurant's Mercado Pago connection (throws `OnlinePaymentUnavailableError` before creating any `Payment`), creates the `Payment` with gateway `MERCADO_PAGO_CONNECT`, creates the preference with the restaurant's client, and uses `notificationUrlFor(restaurantId)` as the notification URL (the client-supplied `webhookUrl` is ignored for Mercado Pago).
  - `syncPaymentStatus` treats `MERCADO_PAGO_CONNECT` as webhook-driven (returns the stored status; no Mercado Pago call, so no platform token).
  - `createUnifiedRefund` handles `MERCADO_PAGO_CONNECT` with `refundConnectPayment` and the restaurant's client (`409`-style error when the connection is unavailable, nothing recorded). The legacy `MERCADO_PAGO` cases stay for rows that already exist.
  - `POST /api/pagamentos/unified` resolves the CURRENT restaurant (`getCurrentRestaurantId()`), and answers `409 { error, code: 'ONLINE_PAYMENT_UNAVAILABLE' }` when the Mercado Pago connection is missing.

- [ ] **Step 1: Write the failing test** **[DB]**

Create `__tests__/integration/api/mp-unified-payment.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('../../../lib/mercado-pago', () => ({
  ...jest.requireActual('../../../lib/mercado-pago'),
  createCheckoutPreference: jest.fn(),
  getPayment: jest.fn(),
  refundPayment: jest.fn(),
}));
jest.mock('../../../lib/mercadopago-connect/payments', () => ({
  ...jest.requireActual('../../../lib/mercadopago-connect/payments'),
  refundConnectPayment: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { createCheckoutPreference, getPayment, refundPayment } from '../../../lib/mercado-pago';
import { refundConnectPayment } from '../../../lib/mercadopago-connect/payments';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import {
  createUnifiedPayment,
  createUnifiedRefund,
  syncPaymentStatus,
  OnlinePaymentUnavailableError,
} from '../../../lib/payment-unified';
import { POST as unifiedPost } from '../../../app/api/pagamentos/unified/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };
const PREFERENCE = { id: 'pref-unified-1', init_point: 'https://mp/init', sandbox_init_point: 'https://mp/sandbox' };

describe('unified payments - Mercado Pago never uses the platform token', () => {
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
    await prisma.paymentRefund.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.mercadoPagoTransaction.deleteMany({ where: { payment: { restaurantId: { in: ids } } } });
    await prisma.payment.deleteMany({ where: { restaurantId: { in: ids } } });
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: ids } } });
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
    refundConnectPayment.mockResolvedValue({ id: 9001 });
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { id: A.ownerId, email: 'owner-a@integration.test', role: 'OWNER' },
    });
  });

  const input = (restaurantId: string, extra = {}) => ({
    restaurantId,
    gateway: 'MERCADO_PAGO',
    amount: 60,
    items: [{ id: 'i1', title: 'Pizza', quantity: 2, unitPrice: 30 }],
    customer: { email: 'cli@ex.com', name: 'Cliente' },
    successUrl: 'https://gastrux.test/ok',
    failureUrl: 'https://gastrux.test/no',
    pendingUrl: 'https://gastrux.test/wait',
    webhookUrl: 'https://evil.example/hook',
    externalReference: 'ref-1',
    ...extra,
  });

  it('refuses and creates nothing when the restaurant has no Mercado Pago connection', async () => {
    await expect(createUnifiedPayment(input(A.restaurantId))).rejects.toBeInstanceOf(OnlinePaymentUnavailableError);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
    expect(await prisma.payment.count({ where: { restaurantId: A.restaurantId } })).toBe(0);
  });

  it("never uses another restaurant's connection", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    await expect(createUnifiedPayment(input(A.restaurantId))).rejects.toBeInstanceOf(OnlinePaymentUnavailableError);
    expect(createCheckoutPreference).not.toHaveBeenCalled();
  });

  it("creates a MERCADO_PAGO_CONNECT payment and the preference with the restaurant's own client", async () => {
    await saveConnection(A.restaurantId, TOKENS);

    const result = await createUnifiedPayment(input(A.restaurantId));

    const payment = await prisma.payment.findUnique({ where: { id: result.paymentId } });
    expect(payment).toMatchObject({ restaurantId: A.restaurantId, gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' });
    const [prefInput, client] = createCheckoutPreference.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(prefInput.externalReference).toBe(payment.id);
    expect(prefInput.notificationUrl).toBe(`https://gastrux.test/api/pagamentos/mp/webhook?rid=${A.restaurantId}`);
    expect(prefInput.notificationUrl).not.toContain('evil.example');
    expect(result.checkoutUrl).toBe('https://mp/init');
  });

  it('syncPaymentStatus for a Connect payment answers from our database and never calls Mercado Pago', async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 10, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'PENDING' },
    });

    expect(await syncPaymentStatus(payment.id)).toBe('PENDING');
    expect(getPayment).not.toHaveBeenCalled();
  });

  it("refunds a Connect payment with the restaurant's client and records the Connect gateway", async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
    });

    const result = await createUnifiedRefund(payment.id, 30);

    expect(result).toMatchObject({ status: 'PARTIALLY_REFUNDED', amount: 30 });
    const [client, mpId, amount] = refundConnectPayment.mock.calls[0];
    expect(client.accessToken).toBe('APP_USR-a');
    expect(mpId).toBe('4242');
    expect(amount).toBe(30);
    expect(refundPayment).not.toHaveBeenCalled();
    expect((await prisma.paymentRefund.findFirst({ where: { paymentId: payment.id } })).gateway).toBe('MERCADO_PAGO_CONNECT');
  });

  it('refuses to refund a Connect payment when the connection is unavailable, recording nothing', async () => {
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO_CONNECT', status: 'APPROVED', gatewayPaymentId: '4242' },
    });

    await expect(createUnifiedRefund(payment.id)).rejects.toThrow();
    expect(refundConnectPayment).not.toHaveBeenCalled();
    expect(await prisma.paymentRefund.count({ where: { paymentId: payment.id } })).toBe(0);
    expect((await prisma.payment.findUnique({ where: { id: payment.id } })).status).toBe('APPROVED');
  });

  it('keeps the legacy refund path for existing platform MERCADO_PAGO rows', async () => {
    refundPayment.mockResolvedValue({ id: 9002 });
    const payment = await prisma.payment.create({
      data: { restaurantId: A.restaurantId, amount: 100, method: 'MERCADO_PAGO', gateway: 'MERCADO_PAGO', status: 'APPROVED' },
    });
    await prisma.mercadoPagoTransaction.create({
      data: { paymentId: payment.id, preferenceId: `pref-${crypto.randomBytes(4).toString('hex')}`, mpPaymentId: '888' },
    });

    await createUnifiedRefund(payment.id);

    expect(refundPayment).toHaveBeenCalledWith('888', 100);
    expect(refundConnectPayment).not.toHaveBeenCalled();
  });

  describe('POST /api/pagamentos/unified', () => {
    const post = (body: any) =>
      unifiedPost(new Request('https://gastrux.test/api/pagamentos/unified', { method: 'POST', body: JSON.stringify(body) }) as any);

    it('answers 409 with ONLINE_PAYMENT_UNAVAILABLE for a restaurant without a connection', async () => {
      const res = await post({ gateway: 'MERCADO_PAGO', items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }] });

      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('ONLINE_PAYMENT_UNAVAILABLE');
      expect(createCheckoutPreference).not.toHaveBeenCalled();
    });

    it('creates the payment through the restaurant connection when there is one', async () => {
      await saveConnection(A.restaurantId, TOKENS);

      const res = await post({ gateway: 'MERCADO_PAGO', items: [{ id: 'i1', title: 'Pizza', quantity: 1, unitPrice: 30 }] });

      expect(res.status).toBe(201);
      expect(createCheckoutPreference.mock.calls[0][1].accessToken).toBe('APP_USR-a');
      expect((await prisma.payment.findFirst({ where: { restaurantId: A.restaurantId } })).gateway).toBe('MERCADO_PAGO_CONNECT');
    });
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-unified-payment.test.ts`
Expected: FAIL (`OnlinePaymentUnavailableError` is not exported; the payment is created with the platform client). Only after the DB gate is lifted.

- [ ] **Step 3: Edit `lib/payment-unified.ts`** (check line endings with `file` first and preserve them; use the CRLF-safe approach if the file is CRLF)

Edit A — imports. Replace:

```typescript
import { isMercadoPagoConfigured, createCheckoutPreference, getPayment as getMPPayment } from './mercado-pago';
```

with:

```typescript
import type { MercadoPagoConfig } from 'mercadopago';
import { createCheckoutPreference, getPayment as getMPPayment } from './mercado-pago';
import { getMpClientForRestaurant } from './mercadopago-connect/connection-service';
import { notificationUrlFor, refundConnectPayment } from './mercadopago-connect/payments';
```

(`isMercadoPagoConfigured` was only used by the check replaced in Edit C; if `grep -n isMercadoPagoConfigured lib/payment-unified.ts` shows another use after the edits, keep it imported and report it.)

Edit B — the error type. Insert directly above `export type UnifiedGateway = 'MERCADO_PAGO' | 'STRIPE_CONNECT' | 'MANUAL';`:

```typescript
/**
 * Thrown when a restaurant has not connected its own Mercado Pago account
 * (or the connection expired): online Mercado Pago payments are never created
 * with the platform token, and there is no fallback.
 */
export class OnlinePaymentUnavailableError extends Error {
  code = 'ONLINE_PAYMENT_UNAVAILABLE' as const;

  constructor() {
    super('Este restaurante não conectou o Mercado Pago. Conecte a conta para receber pagamentos online.');
    this.name = 'OnlinePaymentUnavailableError';
  }
}

```

Edit C — require the restaurant's connection. Replace:

```typescript
  // Validate gateway configuration
  if (input.gateway === 'MERCADO_PAGO' && !isMercadoPagoConfigured()) {
    throw new Error('Mercado Pago not configured');
  }
```

with:

```typescript
  // A restaurant's Mercado Pago payments go through THAT restaurant's own Mercado Pago account
  // (OAuth connection). The platform token is never used for them, and there is no fallback.
  let mpClient: MercadoPagoConfig | null = null;
  if (input.gateway === 'MERCADO_PAGO') {
    mpClient = await getMpClientForRestaurant(input.restaurantId);
    if (!mpClient) throw new OnlinePaymentUnavailableError();
  }
```

Edit D — the gateway stored on the row. Replace (inside `createUnifiedPayment`'s `prisma.payment.create`; the two lines together must match exactly once):

```typescript
      gateway: input.gateway,
      amount: totalAmount,
```

with:

```typescript
      gateway: input.gateway === 'MERCADO_PAGO' ? 'MERCADO_PAGO_CONNECT' : input.gateway,
      amount: totalAmount,
```

Edit E — pass the client. Replace:

```typescript
        result = await processMercadoPagoPayment(payment.id, input, totalAmount);
```

with:

```typescript
        result = await processMercadoPagoPayment(payment.id, input, totalAmount, mpClient!);
```

Edit F — the preference uses the restaurant client and OUR notification URL. Replace:

```typescript
async function processMercadoPagoPayment(
  paymentId: string,
  input: CreatePaymentInput,
  totalAmount: number
): Promise<PaymentResult> {
```

with:

```typescript
async function processMercadoPagoPayment(
  paymentId: string,
  input: CreatePaymentInput,
  totalAmount: number,
  client: MercadoPagoConfig
): Promise<PaymentResult> {
```

and replace:

```typescript
    notificationUrl: input.webhookUrl,
    externalReference: paymentId,
    autoReturn: 'approved',
    statementDescriptor: input.description?.substring(0, 21),
  });
```

with:

```typescript
    // The client-supplied webhookUrl is ignored: notifications must carry ?rid=<restaurantId>.
    notificationUrl: notificationUrlFor(input.restaurantId),
    externalReference: paymentId,
    autoReturn: 'approved',
    statementDescriptor: input.description?.substring(0, 21),
  }, client);
```

Edit G — refunds of Connect payments. Insert immediately before `    case 'STRIPE_CONNECT': {\n      const chargeId = payment.stripeData?.stripeChargeId;`:

```typescript
    case 'MERCADO_PAGO_CONNECT': {
      if (!payment.restaurantId) throw new Error('Payment has no restaurant');
      const mpPaymentId = payment.gatewayPaymentId;
      if (!mpPaymentId) throw new Error('Mercado Pago payment ID not found');
      const client = await getMpClientForRestaurant(payment.restaurantId);
      if (!client) throw new OnlinePaymentUnavailableError();
      const result = await refundConnectPayment(client, mpPaymentId, refundAmount);
      gatewayRefundId = String(result.id);
      break;
    }
```

(`refundAmount` is already guaranteed positive by the earlier `refundAmount <= 0` check.)

Edit H — status sync. Insert immediately before `    case 'STRIPE_CONNECT': {\n      if (payment.stripeData?.stripePaymentIntentId) {`:

```typescript
    case 'MERCADO_PAGO_CONNECT':
      // Restaurant payments are driven by the webhook (?rid=...), which fetches them with the
      // restaurant's own token. Nothing to do here, and never with the platform token.
      break;
```

- [ ] **Step 4: Edit `app/api/pagamentos/unified/route.ts`**

Edit 1 — imports. Replace:

```typescript
import { createUnifiedPayment, listPayments, syncPaymentStatus, getPaymentAnalytics } from '@/lib/payment-unified';
```

with:

```typescript
import {
  createUnifiedPayment,
  listPayments,
  syncPaymentStatus,
  getPaymentAnalytics,
  OnlinePaymentUnavailableError,
} from '@/lib/payment-unified';
```

and, only if `grep -n getCurrentRestaurantId app/api/pagamentos/unified/route.ts` shows it is not already imported, add after the `authOptions` import line:

```typescript
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
```

Edit 2 — the CURRENT restaurant (not merely the first membership), so the connection check applies to the right one. In `POST`, replace:

```typescript
    const restaurant = user.restaurants?.[0]?.restaurant;
    const restaurantId = restaurant?.id;
```

with:

```typescript
    const restaurantId = await getCurrentRestaurantId();
```

(If `restaurant` is used elsewhere in `POST`, `npx tsc --noEmit` will say so: replace those uses by reading what they need from the current restaurant, and report it.)

Edit 3 — answer 409 instead of 500 when the connection is missing. In `POST`'s `catch`, replace:

```typescript
    console.error('[Unified Payment] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment' },
```

with:

```typescript
    if (error instanceof OnlinePaymentUnavailableError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 409 });
    }
    console.error('[Unified Payment] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create payment' },
```

- [ ] **Step 5: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-unified-payment.test.ts`
Expected: PASS, 9 tests. (Only after the DB gate is lifted.)

- [ ] **Step 6: Type-check and audit**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `grep -rn "createCheckoutPreference\|createPixPreference\|getPayment(" app lib --include=*.ts --include=*.tsx | grep -v "__tests__"`
Expected: every remaining call either passes the restaurant client, is inside the platform-billing code (`app/api/billing/**`, `app/api/pagamentos/mp/preapproval`), is the webhook's platform branch, or is the legacy `getMPPayment` in `syncPaymentStatus`'s `MERCADO_PAGO` case (existing platform-billing rows only). Record the output in the report.

- [ ] **Step 7: Commit**

```bash
git add lib/payment-unified.ts app/api/pagamentos/unified/route.ts __tests__/integration/api/mp-unified-payment.test.ts
git commit -m "fix: unified payments use the restaurant's own Mercado Pago connection, never the platform token"
```

---

## Task 11: Public pages and listings (hide PIX when unavailable, send `orderId`/`qrToken`)

**Files:**
- Modify: `app/api/public/delivery/menu/[restaurantId]/route.ts`
- Modify: `app/api/public/menu/[qrToken]/route.ts`
- Modify: `app/delivery/[restaurantId]/page.tsx`
- Modify: `app/menu/[qrToken]/page.tsx`
- Modify: `app/dashboard/pagamentos/checkout/page.tsx` (the staff "PIX avulso" page)
- Modify: `app/api/pagamentos/route.ts`, `app/dashboard/pagamentos/page.tsx`, `app/dashboard/pagamentos/conciliacao/page.tsx`
- Test: `__tests__/integration/api/mp-public-flag.test.ts` **[DB]**

**Interfaces:**
- Consumes: `hasActiveConnection(restaurantId: string): Promise<boolean>` (Task 4); the PIX contract of Task 8.
- Produces: `restaurant.acceptsOnlinePayment: boolean` in the responses of `GET /api/public/delivery/menu/[restaurantId]` and `GET /api/public/menu/[qrToken]` (both are cached `max-age=60`; the PIX route re-checks the connection, so a stale `true` only leads to the 409 message).

- [ ] **Step 1: Write the failing test for the public flag** **[DB]**

Create `__tests__/integration/api/mp-public-flag.test.ts`:

```typescript
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';
import { saveConnection } from '../../../lib/mercadopago-connect/connection-service';
import { GET as deliveryMenu } from '../../../app/api/public/delivery/menu/[restaurantId]/route';
import { GET as qrMenu } from '../../../app/api/public/menu/[qrToken]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const TOKENS = { accessToken: 'APP_USR-a', refreshToken: 'TG-r', mpUserId: '1', publicKey: null, liveMode: true, lifetimeSeconds: 15552000 };

describe('acceptsOnlinePayment flag on the public menus', () => {
  let A: { restaurantId: string; ownerId: string };
  let B: { restaurantId: string; ownerId: string };
  let qrToken: string;
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;

  beforeAll(async () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    const scenario = await createMultiRestaurantScenario();
    A = scenario.restaurantA;
    B = scenario.restaurantB;

    const section = await prisma.tableSection.create({ data: { restaurantId: A.restaurantId, name: 'Salão', capacity: 10 } });
    qrToken = `qr-${crypto.randomBytes(12).toString('hex')}`;
    await prisma.table.create({ data: { restaurantId: A.restaurantId, number: 1, sectionId: section.id, capacity: 4, qrToken } });
  });

  afterAll(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
    await cleanupMultiTenantData([A.restaurantId, B.restaurantId]);
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
  });

  beforeEach(async () => {
    await prisma.mercadoPagoConnection.deleteMany({ where: { restaurantId: { in: [A.restaurantId, B.restaurantId] } } });
  });

  const delivery = async (restaurantId: string) =>
    (await deliveryMenu(new Request('https://gastrux.test/x') as any, { params: { restaurantId } })).json();
  const qr = async () => (await qrMenu(new Request('https://gastrux.test/x') as any, { params: { qrToken } })).json();

  it('is false without a connection and true with an active one (delivery menu)', async () => {
    expect((await delivery(A.restaurantId)).restaurant.acceptsOnlinePayment).toBe(false);
    await saveConnection(A.restaurantId, TOKENS);
    expect((await delivery(A.restaurantId)).restaurant.acceptsOnlinePayment).toBe(true);
  });

  it("does not leak another restaurant's connection", async () => {
    await saveConnection(B.restaurantId, TOKENS);
    expect((await delivery(A.restaurantId)).restaurant.acceptsOnlinePayment).toBe(false);
  });

  it('is exposed on the QR menu as well', async () => {
    expect((await qr()).restaurant.acceptsOnlinePayment).toBe(false);
    await saveConnection(A.restaurantId, TOKENS);
    expect((await qr()).restaurant.acceptsOnlinePayment).toBe(true);
  });

  it('never exposes token material', async () => {
    await saveConnection(A.restaurantId, TOKENS);
    const text = JSON.stringify(await delivery(A.restaurantId)) + JSON.stringify(await qr());
    expect(text).not.toMatch(/APP_USR|TG-r|accessToken|refreshToken|v1:/);
  });
});
```

- [ ] **Step 2: [DB] Run to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-public-flag.test.ts`
Expected: FAIL — `acceptsOnlinePayment` is `undefined`.

- [ ] **Step 3: Add the flag to the delivery menu route**

In `app/api/public/delivery/menu/[restaurantId]/route.ts`, after `import { prisma } from '@/lib/prisma';` add:

```typescript
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
```

and replace:

```typescript
    const filteredCategories = categories.filter((c) => c.items.length > 0);

    return NextResponse.json(
      { restaurant, categories: filteredCategories },
```

with:

```typescript
    const filteredCategories = categories.filter((c) => c.items.length > 0);
    const acceptsOnlinePayment = await hasActiveConnection(params.restaurantId);

    return NextResponse.json(
      { restaurant: { ...restaurant, acceptsOnlinePayment }, categories: filteredCategories },
```

- [ ] **Step 4: Add the flag to the QR menu route**

Run: `grep -n "^import" "app/api/public/menu/[qrToken]/route.ts"` and add, after the import of `prisma`:

```typescript
import { hasActiveConnection } from '@/lib/mercadopago-connect/connection-service';
```

Then replace:

```typescript
      restaurant: table.restaurant,
```

with:

```typescript
      restaurant: {
        ...table.restaurant,
        acceptsOnlinePayment: await hasActiveConnection(table.restaurant.id),
      },
```

- [ ] **Step 5: [DB] Run to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-public-flag.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: ON HOLD — DO NOT IMPLEMENT. Delivery page (`app/delivery/[restaurantId]/page.tsx`).** Product decision of 2026-09-19: delivery must offer every common payment method (PIX, credit, debit and more), not only PIX. This step is superseded by a new delivery payment-methods design that awaits the maintainer's approval. Skip the four edits below; leave the delivery page untouched.

  _(Original text, kept for reference only:)_

Edit 1 — the restaurant type. Replace:

```typescript
  businessHours?: any;
}

interface CartItem {
```

with:

```typescript
  businessHours?: any;
  acceptsOnlinePayment?: boolean;
}

interface CartItem {
```

Edit 2 — after the order is created, go to the PIX step only when the restaurant accepts online payment; otherwise show the confirmation screen ("Pagamento na entrega"). Replace:

```typescript
      setOrderData(data.order);
      setStep('payment');
      toast.success('Pedido criado! Realize o pagamento.');
```

with:

```typescript
      setOrderData(data.order);
      if (restaurant?.acceptsOnlinePayment) {
        setStep('payment');
        toast.success('Pedido criado! Realize o pagamento.');
      } else {
        // This restaurant has not connected Mercado Pago: no online PIX.
        setStep('success');
        toast.success('Pedido enviado! O pagamento será combinado na entrega.');
      }
```

Edit 3 — send only the order id; the server computes the amount. Replace:

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

Edit 4 — the confirmation screen must not claim payment when the customer pays on delivery. Replace:

```typescript
            <p className="text-sm"><span className="font-medium">Status:</span> Pagamento confirmado ✔</p>
```

with:

```typescript
            <p className="text-sm"><span className="font-medium">Status:</span> {pixPaid ? 'Pagamento confirmado ✔' : 'Pagamento na entrega'}</p>
```

(The existing polling already reads `data.status === 'approved'` and now polls with OUR payment id, which `POST /pix` returns as `paymentId`.)

- [ ] **Step 7: QR menu page — edits** (`app/menu/[qrToken]/page.tsx`)

Edit 1 — the restaurant type. Replace:

```typescript
  restaurant: { id: string; name: string };
```

with:

```typescript
  restaurant: { id: string; name: string; acceptsOnlinePayment?: boolean };
```

Edit 2 — `submitOrder` reports success (so "pay now" can chain it). Replace:

```typescript
  const submitOrder = async () => {
    if (cart.length === 0) return;
```

with:

```typescript
  const submitOrder = async (): Promise<boolean> => {
    if (cart.length === 0) return false;
```

Replace:

```typescript
        toast.error(err.error || 'Erro ao enviar pedido');
        return;
      }
```

with:

```typescript
        toast.error(err.error || 'Erro ao enviar pedido');
        return false;
      }
```

Replace:

```typescript
      toast.success('Pedido enviado para a cozinha!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar pedido');
    } finally {
```

with:

```typescript
      toast.success('Pedido enviado para a cozinha!');
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar pedido');
      return false;
    } finally {
```

Edit 3 — `generatePixPayment` sends the table token, not an amount. Replace:

```typescript
  const generatePixPayment = async (amount: number) => {
    setPixLoading(true);
    try {
      const tableInfo = menu?.table;
      const res = await fetch('/api/pagamentos/mp/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          description: `Mesa ${tableInfo?.number || '?'} - ${menu?.restaurant?.name || 'Restaurante'}`,
          payerEmail: 'cliente@restaurante.com',
          payerName: customerName || 'Cliente',
          externalReference: `mesa-${tableInfo?.id || 'unknown'}-${Date.now()}`,
        }),
      });
```

with:

```typescript
  // The server computes the amount from the table's open tab: the browser only
  // says which table it is (qrToken).
  const generatePixPayment = async () => {
    setPixLoading(true);
    try {
      const res = await fetch('/api/pagamentos/mp/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qrToken,
          payerName: customerName || 'Cliente',
        }),
      });
```

Replace:

```typescript
        setOrderTotal(amount);
        // Start polling for payment status
```

with:

```typescript
        setOrderTotal(Number(data.amount) || 0);
        // Start polling for payment status
```

Replace:

```typescript
        toast.error('Erro ao gerar QR Code Pix');
```

with:

```typescript
        toast.error(data.error || 'Erro ao gerar QR Code Pix');
```

Edit 4 — "pay now" from the cart submits the order first (so the tab has items for the server to total), then asks for the PIX. Insert immediately before `  const startPixPolling = (paymentId: string) => {`:

```typescript
  const payCartWithPix = async () => {
    if (cart.length === 0) return;
    const submitted = await submitOrder();
    if (submitted) await generatePixPayment();
  };

```

Edit 5 — the "Pagar com Pix" button on the confirmation screen, shown only when accepted. Replace:

```typescript
            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={() => generatePixPayment(cartTotal > 0 ? cartTotal : orderTotal)}
              disabled={pixLoading}
            >
              {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
              Pagar com Pix
            </Button>
```

with:

```typescript
            {menu?.restaurant?.acceptsOnlinePayment && (
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => generatePixPayment()}
                disabled={pixLoading}
              >
                {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Pagar com Pix
              </Button>
            )}
```

Edit 6 — the "Pagar com Pix agora" button in the cart, shown only when accepted. Replace:

```typescript
              <Button
                variant="outline"
                onClick={() => { setOrderTotal(cartTotal); generatePixPayment(cartTotal); }}
                disabled={pixLoading || cart.length === 0}
                className="w-full h-10 text-sm gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
              >
                {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                Pagar com Pix agora
              </Button>
              <p className="text-xs text-gray-500 text-center">
                Envie o pedido ou pague direto com Pix.
              </p>
```

with:

```typescript
              {menu?.restaurant?.acceptsOnlinePayment && (
                <>
                  <Button
                    variant="outline"
                    onClick={payCartWithPix}
                    disabled={pixLoading || submitting || cart.length === 0}
                    className="w-full h-10 text-sm gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                  >
                    {pixLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                    Pagar com Pix agora
                  </Button>
                  <p className="text-xs text-gray-500 text-center">
                    Envie o pedido ou pague direto com Pix.
                  </p>
                </>
              )}
```

- [ ] **Step 7a: Dashboard "PIX avulso" page** (`app/dashboard/pagamentos/checkout/page.tsx`)

The restaurant's staff use this page: they type an amount and the page polls until it is paid. It called the public route with an `amount` and polled `GET /pix?paymentId=` (removed in Task 8). Point it at the authenticated manual route and the new status route.

Edit 1 — create the PIX. Replace:

```typescript
      const response = await fetch('/api/pagamentos/mp/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description || 'Pagamento PIX',
          payerEmail: payerEmail || undefined,
          payerName: payerName || undefined,
          externalReference: `checkout-${Date.now()}`,
        }),
      });
```

with:

```typescript
      const response = await fetch('/api/pagamentos/mp/pix/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description || 'Pagamento PIX',
          payerEmail: payerEmail || undefined,
          payerName: payerName || undefined,
        }),
      });
```

Edit 2 — polling. Replace:

```typescript
      const response = await fetch(`/api/pagamentos/mp/pix?paymentId=${paymentId}`);
```

with:

```typescript
      const response = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${paymentId}`);
```

The page already shows `data.error` from a failed response (`throw new Error(data.error || 'Erro ao gerar PIX')`), so the `409` message "Este restaurante não aceita pagamento online no momento." reaches the user. It reads `paymentId`, `qrCode`, `qrCodeBase64`, `ticketUrl`, `expirationDate`, `amount`, `description` and `status === 'approved'`; the new responses carry all of them, and `paymentId` is now OUR payment id, which is what the status route expects.

- [ ] **Step 8: Make the new gateway visible in listings**

`app/api/pagamentos/route.ts` — the POST allow-list (`VALID_GATEWAYS`, used to validate manually created payments) must NOT gain the new value, so a user cannot fabricate a Connect payment; only the GET filter does. After the line

```typescript
const VALID_GATEWAYS = ['MERCADO_PAGO', 'STRIPE', 'STRIPE_CONNECT', 'MANUAL'] as const;
```

add:

```typescript
// Read-only filter values: MERCADO_PAGO_CONNECT rows are created only by the
// Mercado Pago connect flow, never by the manual-payment POST below.
const FILTER_GATEWAYS = [...VALID_GATEWAYS, 'MERCADO_PAGO_CONNECT'] as const;
```

and replace:

```typescript
    if (gateway !== 'all' && VALID_GATEWAYS.includes(gateway as any)) {
```

with:

```typescript
    if (gateway !== 'all' && (FILTER_GATEWAYS as readonly string[]).includes(gateway)) {
```

`app/dashboard/pagamentos/page.tsx` — replace:

```typescript
      case 'MERCADO_PAGO': return <QrCode className="w-4 h-4" />;
```

with:

```typescript
      case 'MERCADO_PAGO':
      case 'MERCADO_PAGO_CONNECT': return <QrCode className="w-4 h-4" />;
```

and replace:

```typescript
            <option value="MERCADO_PAGO">Mercado Pago</option>
            <option value="STRIPE_CONNECT">Stripe Connect</option>
```

with:

```typescript
            <option value="MERCADO_PAGO">Mercado Pago</option>
            <option value="MERCADO_PAGO_CONNECT">Mercado Pago (recebimentos)</option>
            <option value="STRIPE_CONNECT">Stripe Connect</option>
```

`app/dashboard/pagamentos/conciliacao/page.tsx` — replace:

```typescript
    MERCADO_PAGO: 'bg-blue-100 text-blue-700',
```

with:

```typescript
    MERCADO_PAGO: 'bg-blue-100 text-blue-700',
    MERCADO_PAGO_CONNECT: 'bg-sky-100 text-sky-700',
```

and replace:

```typescript
                  <option value="MERCADO_PAGO">Mercado Pago</option>
```

with:

```typescript
                  <option value="MERCADO_PAGO">Mercado Pago</option>
                  <option value="MERCADO_PAGO_CONNECT">Mercado Pago (recebimentos)</option>
```

- [ ] **Step 9: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add __tests__/integration/api/mp-public-flag.test.ts
git add -p "app/api/public/delivery/menu/[restaurantId]/route.ts" "app/api/public/menu/[qrToken]/route.ts" "app/delivery/[restaurantId]/page.tsx" "app/menu/[qrToken]/page.tsx" app/dashboard/pagamentos/checkout/page.tsx app/api/pagamentos/route.ts app/dashboard/pagamentos/page.tsx app/dashboard/pagamentos/conciliacao/page.tsx
git commit -m "feat: hide PIX when the restaurant is not connected; send orderId/qrToken; show the new gateway"
```

---

## Task 12: Dashboard connection UI and migration notice

**Files:**
- Create: `components/payments/mp-connect-card.tsx`
- Create: `components/payments/mp-connect-banner.tsx`
- Create: `app/dashboard/pagamentos/conectar/page.tsx`
- Modify: `app/dashboard/pagamentos/page.tsx` (render the banner)

**Interfaces:**
- Consumes: `GET|DELETE /api/pagamentos/mp/connect`, `GET /api/pagamentos/mp/connect/start` (Task 5). The callback redirects to `/dashboard/pagamentos/conectar?mp=<connected|denied|invalid_state|unauthorized|error>`.
- Produces: the page `/dashboard/pagamentos/conectar` and the reusable `MpConnectBanner` (the "Conecte seu Mercado Pago para continuar recebendo PIX online" notice).

There is no automated test for this task: `jest.integration.config.js` runs in a `node` environment with no DOM. Verify with the type-check and the manual steps below.

- [ ] **Step 1: Create the connection card**

Create `components/payments/mp-connect-card.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Loader2, Wallet } from 'lucide-react';

interface ConnectStatus {
  configured: boolean;
  connected: boolean;
  needsReconnect: boolean;
  mpUserId: string | null;
  liveMode: boolean | null;
  connectedAt: string | null;
}

// Result codes set by GET /api/pagamentos/mp/connect/callback.
const RESULT_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: 'Mercado Pago conectado! Seus clientes já podem pagar com PIX online.' },
  denied: { ok: false, text: 'Você cancelou a autorização no Mercado Pago.' },
  invalid_state: { ok: false, text: 'A sessão de conexão expirou. Tente conectar novamente.' },
  unauthorized: { ok: false, text: 'Apenas o dono ou administrador pode conectar o Mercado Pago.' },
  error: { ok: false, text: 'Não foi possível concluir a conexão. Tente novamente.' },
};

export function MpConnectCard() {
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/pagamentos/mp/connect');
      if (res.ok) setStatus(await res.json());
      else toast.error('Não foi possível carregar o status do Mercado Pago');
    } catch {
      toast.error('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const result = new URLSearchParams(window.location.search).get('mp');
    const message = result ? RESULT_MESSAGES[result] : undefined;
    if (message) {
      if (message.ok) toast.success(message.text);
      else toast.error(message.text);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const connect = () => {
    setBusy(true);
    window.location.href = '/api/pagamentos/mp/connect/start';
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar o Mercado Pago? Seus clientes deixarão de ver o PIX online.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pagamentos/mp/connect', { method: 'DELETE' });
      if (res.ok) {
        toast.success('Mercado Pago desconectado');
        await load();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Não foi possível desconectar');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
      </Card>
    );
  }

  if (!status?.configured) {
    return (
      <Card className="p-6">
        <p className="text-sm text-gray-600">
          A conexão com o Mercado Pago ainda não está disponível. Fale com o suporte do Gastrux.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-start gap-3">
        <Wallet className="h-6 w-6 text-sky-600 mt-0.5" />
        <div>
          <h2 className="text-lg font-semibold">Mercado Pago</h2>
          <p className="text-sm text-gray-600">
            Conecte a sua conta para receber os pagamentos PIX e de cartão dos seus clientes direto nela.
            O Gastrux não cobra taxa sobre esses pagamentos.
          </p>
        </div>
      </div>

      {status.connected && (
        <div className="flex items-center gap-2 text-green-700 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          Conectado{status.mpUserId ? ` (conta ${status.mpUserId})` : ''}
          {status.liveMode === false ? ' · modo de teste' : ''}
        </div>
      )}

      {status.needsReconnect && (
        <div className="flex items-start gap-2 text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>
            A conexão expirou ou foi revogada. Enquanto isso, o PIX online está indisponível para os seus clientes.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!status.connected && (
          <Button onClick={connect} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {status.needsReconnect ? 'Reconectar Mercado Pago' : 'Conectar Mercado Pago'}
          </Button>
        )}
        {(status.connected || status.needsReconnect) && (
          <Button variant="outline" onClick={disconnect} disabled={busy}>
            Desconectar
          </Button>
        )}
      </div>

      {status.connected && (
        <p className="text-xs text-gray-500">
          Desconectar aqui apenas remove o acesso guardado pelo Gastrux. Para revogar a autorização
          por completo, remova o aplicativo nas configurações da sua conta do Mercado Pago.
        </p>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Create the banner**

Create `components/payments/mp-connect-banner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown on the payments dashboard while the restaurant has no active Mercado
 * Pago connection: without it, online PIX is unavailable to its customers.
 */
export function MpConnectBanner() {
  const [state, setState] = useState<'hidden' | 'connect' | 'reconnect'>('hidden');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pagamentos/mp/connect')
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        if (cancelled || !status || !status.configured || status.connected) return;
        setState(status.needsReconnect ? 'reconnect' : 'connect');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'hidden') return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-900 flex-1">
        {state === 'reconnect'
          ? 'Sua conexão com o Mercado Pago expirou. Reconecte para voltar a receber PIX online.'
          : 'Conecte seu Mercado Pago para continuar recebendo PIX online dos seus clientes.'}
      </p>
      <Link href="/dashboard/pagamentos/conectar">
        <Button size="sm">{state === 'reconnect' ? 'Reconectar' : 'Conectar agora'}</Button>
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Create the page**

Create `app/dashboard/pagamentos/conectar/page.tsx`:

```tsx
'use client';

import { BackButton } from '@/components/ui/back-button';
import { MpConnectCard } from '@/components/payments/mp-connect-card';

export default function ConectarMercadoPagoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-6">
        <BackButton href="/dashboard/pagamentos" label="Voltar aos Pagamentos" />
        <h1 className="text-2xl font-bold">Receber pagamentos online</h1>
        <MpConnectCard />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Render the banner on the payments dashboard**

In `app/dashboard/pagamentos/page.tsx`, add the import after the `lucide-react` import block:

```typescript
import { MpConnectBanner } from '@/components/payments/mp-connect-banner';
```

Then, in the main `return (`, immediately after the opening container

```tsx
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
```

insert as the first child:

```tsx
        <MpConnectBanner />
```

(If that two-line container appears more than once in the file, use the one inside the main `return (` of `PagamentosDashboardPage`.)

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run `npm run dev` with Task 0 configured, log in as the restaurant OWNER, and check:
1. `/dashboard/pagamentos` shows the amber banner; **Conectar agora** opens `/dashboard/pagamentos/conectar`.
2. **Conectar Mercado Pago** redirects to the Mercado Pago authorization screen; approving returns to the page with the toast "Mercado Pago conectado!" and the card shows "Conectado (conta …)". The banner disappears on `/dashboard/pagamentos`.
3. Cancelling at Mercado Pago returns with the "cancelou" toast and nothing saved.
4. **Desconectar** asks for confirmation, then the card returns to "not connected" and the banner reappears.
5. Logged in as a MANAGER: the page loads, but **Conectar** ends with the "Apenas o dono ou administrador…" toast.

- [ ] **Step 7: Commit**

```bash
git add components/payments/mp-connect-card.tsx components/payments/mp-connect-banner.tsx app/dashboard/pagamentos/conectar/page.tsx
git add -p app/dashboard/pagamentos/page.tsx
git commit -m "feat: add Mercado Pago connection page and migration banner"
```

---

## Task 13: Final verification and rollout

**Files:**
- Modify: `docs/superpowers/specs/2026-09-19-mercadopago-connect-design.md` (record confirmed premises)

**Interfaces:** none.

- [ ] **Step 1: Run every unit test**

Run: `npm run test:unit`
Expected: PASS for all files under `__tests__/unit/` (crypto, oauth state/client, refresh policy, payments, payment status, lib client param).

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: [DB] Run the Mercado Pago integration tests**

Only after the maintainer confirms `DATABASE_URL` is a dedicated test database and both migrations were applied (Task 2, Step 8).

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/mp-connection-service.test.ts __tests__/integration/api/mp-connect-routes.test.ts __tests__/integration/api/mp-payment-sync.test.ts __tests__/integration/api/mp-pix-route.test.ts __tests__/integration/api/mp-webhook-connect.test.ts __tests__/integration/api/mp-refund-route.test.ts __tests__/integration/api/mp-checkout-route.test.ts __tests__/integration/api/mp-public-flag.test.ts`
Expected: PASS for all eight files.

- [ ] **Step 4: [DB] Run the existing suites to check for regressions**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api`
Expected: no previously passing test breaks.

- [ ] **Step 5: Audit that no restaurant payment path still uses the platform token**

Run: `grep -rn "MERCADO_PAGO_ACCESS_TOKEN" app lib --include=*.ts --include=*.tsx`
Expected: matches only in `lib/mercado-pago.ts` (the platform client used for subscription billing). The old `app/api/pagamentos/mp/pix/route.ts` and `.../pix/status/route.ts` must no longer appear.

Run: `grep -rn "from '@/lib/mercado-pago'" app --include=*.ts --include=*.tsx`
Expected: each remaining use is either platform billing (`billing/mp/*`, `pagamentos/mp/preapproval`, the webhook's branch without `rid`, the legacy refund branch for old `MERCADO_PAGO` rows) or a call that passes the restaurant client (`checkout`). Any other route that creates or fetches a restaurant's payment with the platform client is a bug: fix it before releasing.

- [ ] **Step 6: Manual end-to-end in the Mercado Pago sandbox**

Use a Mercado Pago **test seller** account and a test buyer. Confirm each item:
1. Connect the test seller from `/dashboard/pagamentos/conectar`.
2. Delivery: create an order on `/delivery/<restaurantId>`, request the PIX, pay it in the sandbox. The delivery page shows "Pagamento confirmado", the `Payment` row is `APPROVED` with `gateway = MERCADO_PAGO_CONNECT`, and `Order.paymentStatus` is `APPROVED`.
3. **The payment appears in the test seller's Mercado Pago account, not in the Gastrux platform account.**
4. QR table: open `/menu/<qrToken>`, submit an item, pay with PIX. The amount equals the tab total, and the `Payment` metadata carries the `sessionId`.
4a. Dashboard "PIX avulso" (`/dashboard/pagamentos/checkout`), logged in as a cashier: type an amount, generate the PIX and pay it in the sandbox. The page moves to the success screen, and the `Payment` appears in the payments dashboard with `metadata.source = "manual"`.
5. Webhook: in the server log, confirm the notification arrived with `rid=<restaurantId>` in the query. **If Mercado Pago drops or rewrites our query string,** the `rid` branch never runs: change `notificationUrlFor` to a path segment (`/api/pagamentos/mp/webhook/<rid>`, with a matching route) and update Task 9.
6. The PIX expiry is accepted with the `-03:00` offset (no 400 from Mercado Pago). If it is rejected, adjust `toMpDate`.
7. Refund the payment from the dashboard (full, then a partial on another payment). The `PaymentRefund` row has `gateway = MERCADO_PAGO_CONNECT` and the money returns in the sandbox.
8. Disconnect: the delivery page and the QR menu stop offering PIX (the menu response is cached for 60 s), and `POST /api/pagamentos/mp/pix` answers `409`.
9. Revoke the app in the seller's Mercado Pago account, then try a PIX: the response is `409`, the connection becomes `NEEDS_RECONNECT`, the owner gets the "Reconecte seu Mercado Pago" notification, and the banner shows "Reconectar".
10. Platform billing regression: complete a subscription checkout for Gastrux itself and confirm its webhook (no `rid`) still updates the subscription.

- [ ] **Step 7: Record the confirmed premises in the spec**

In `docs/superpowers/specs/2026-09-19-mercadopago-connect-design.md`, section 9, replace the "a confirmar" wording with the answers found in Task 0, Step 3 (endpoints and parameters, token validity, webhook secret, fee parameter), and note any adjustment made to `oauth-client.ts`.

- [ ] **Step 8: Rollout order**

1. Take a database backup or snapshot, then apply the two migrations (`npx prisma migrate deploy`) on the production database.
2. Deploy the code with the new environment variables (`MERCADO_PAGO_CLIENT_ID`, `MERCADO_PAGO_CLIENT_SECRET`, `CREDENTIALS_ENCRYPTION_KEY`).
3. Schedule the daily refresh cron (Task 0, Step 6).
4. From this moment **online PIX is off for every restaurant until it connects**. Tell restaurants before or right after the deploy (the dashboard banner appears automatically) and reach the active ones directly.
5. Repay any restaurant that received money in the Gastrux account before this release (Task 0, Step 5).
6. After a week, check `mercado_pago_connections` for rows in `NEEDS_RECONNECT` and contact those restaurants.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/specs/2026-09-19-mercadopago-connect-design.md
git commit -m "docs: record confirmed Mercado Pago OAuth premises"
```

