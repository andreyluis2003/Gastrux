# WhatsApp Embedded Signup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a restaurant owner connect their own WhatsApp Business number to Gastrux with a single "Conectar WhatsApp" button (Meta's Embedded Signup popup), instead of manually pasting a Phone Number ID / WABA ID / Access Token obtained by hand-configuring a Meta Developer app.

**Architecture:** The admin WhatsApp page loads the Facebook JS SDK and opens `FB.login({config_id, response_type: 'code'})`. On success, a `postMessage` event carries `phone_number_id` / `waba_id`, and the `FB.login` callback carries a short-lived `code`. The client posts both to a new API route, which exchanges the code for a business access token via the Graph API, subscribes the Gastrux app to that WABA's webhooks, registers the phone number for Cloud API messaging, and upserts the restaurant's existing `WhatsAppConfig` row — the same table and webhook route already used by the manual-entry flow, so nothing downstream (bot, templates, message sending) changes.

**Tech Stack:** Next.js 14 (App Router) API routes, Prisma 6.7 / PostgreSQL, NextAuth session (`getServerSession`), Meta Graph API v20.0, Facebook JavaScript SDK, Jest (`jest.integration.config.js`, real dev DB).

**Spec:** No separate spec document exists for this feature — the spec is this plan's Goal/Architecture section above, produced from a conversation on 2026-09-17 that manually walked through Meta's WhatsApp Business setup for Gastrux's own tenant and researched Meta's official Embedded Signup v4 docs (https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/implementation).

## Global Constraints

- Requires Gastrux's Meta Business Portfolio to have passed **Business Verification** and **Access (Tech Provider) Verification** — both were pending as of 2026-09-17. Do not schedule Task 0 until Business Verification shows "Aprovado" in Meta Business Settings → Segurança → Verificação da empresa.
- Every new/changed API route must scope all Prisma queries by `restaurantId` (existing multi-tenant convention in `lib/whatsapp/get-restaurant.ts`) — this app has had real cross-tenant data leak bugs fixed before; do not regress that.
- Meta API version: use `v20.0` (matches `lib/whatsapp/meta-client.ts` and `lib/messaging/meta-template-client.ts` — keep all three on the same version).
- Auth pattern: use `requireAdminSession()` + `getCurrentRestaurantId()` from `lib/whatsapp/get-restaurant.ts` exactly as the existing `app/api/admin/whatsapp/config/route.ts` does — do not invent a new auth check.
- Tests run against a real dev database via `npx jest --config jest.integration.config.js <path>` (no mocked Prisma in this codebase) and mock only `global.fetch` for outbound Meta API calls.
- Embedded Signup v2 retires 2026-10-15 — this plan targets **v4** only; do not implement v2.

---

## Task 0: Manual Meta Dashboard Configuration (prerequisite, no code)

**Files:** none — this is manual configuration in developers.facebook.com, done once by whoever administers the "Gastrux" Meta app.

**Interfaces:**
- Produces: a `WHATSAPP_APP_ID` (public) and a `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` value that Task 4 (frontend) hard-requires as env vars. Nothing in Tasks 1–3 depends on this.

- [ ] **Step 1: Enable Facebook Login for Business OAuth settings**

In the Gastrux app (`developers.facebook.com/apps/1956565491680423`) → **Facebook Login for Business** → **Settings** → Client OAuth settings, turn on:
- Client OAuth login
- Web OAuth login
- Enforce HTTPS
- Embedded Browser OAuth Login
- Use Strict Mode for redirect URIs
- Login with the JavaScript SDK

- [ ] **Step 2: Register the domain**

In the same settings screen, add `https://gastrux.com` to both **Allowed Domains for the JavaScript SDK** and **Valid OAuth Redirect URIs**.

- [ ] **Step 3: Create the Embedded Signup login configuration**

**Facebook Login for Business** → **Configurations** → **Create configuration** → name it `gastrux-whatsapp-embedded-signup` → choose the **WhatsApp Embedded Signup** variation → save. Copy the generated **Configuration ID**.

- [ ] **Step 4: Subscribe the app-level webhook to `account_update`**

**WhatsApp** → **Configuration** → Webhook fields → toggle **`account_update`** on (in addition to the already-subscribed `messages`). This is required by Meta for any Embedded Signup integration — it is how you learn a customer finished the flow if the client-side `postMessage` is ever missed (ad blockers, closed tab, etc.).

- [ ] **Step 5: Record the two IDs for Task 4**

Write down:
- `WHATSAPP_APP_ID` = the numeric App ID shown at the top of the App Dashboard (`1956565491680423`)
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` = the Configuration ID from Step 3

---

## Task 1: Prisma schema — store the Meta Business ID returned by signup

**Files:**
- Modify: `prisma/schema.prisma:3193-3213` (`WhatsAppConfig` model)
- Create: `prisma/migrations/20260917120000_add_whatsapp_meta_business_id/migration.sql`

**Interfaces:**
- Produces: `WhatsAppConfig.metaBusinessId` (`String?`), used by Task 3's upsert.

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, inside the `WhatsAppConfig` model, add one line after `businessAccountId`:

```prisma
model WhatsAppConfig {
  id                  String     @id @default(cuid())
  restaurantId        String     @unique
  phoneNumberId       String?
  businessAccountId   String?
  metaBusinessId      String?
  accessToken         String?
  verifyToken         String?
  displayPhoneNumber  String?
  isActive            Boolean    @default(false)
  greeting            String?    @default("Olá! 👋 Bem-vindo ao nosso restaurante. Digite *menu* para ver o cardápio ou *ajuda* para opções.")
  businessHours       String?
  outsideHoursMessage String?
  totalConversations  Int        @default(0)
  totalOrders         Int        @default(0)
  lastActivityAt      DateTime?
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
  restaurant          Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)

  @@map("whatsapp_configs")
}
```

- [ ] **Step 2: Write the migration SQL**

Create `prisma/migrations/20260917120000_add_whatsapp_meta_business_id/migration.sql`:

```sql
-- Stores the Meta "business_id" returned by WhatsApp Embedded Signup
-- (developers.facebook.com Embedded Signup v4 message event). Not used for
-- auth or messaging — kept for support/debugging when a restaurant's Meta
-- Business Manager needs to be looked up.
ALTER TABLE "whatsapp_configs" ADD COLUMN "metaBusinessId" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: completes without error, and `node_modules/.prisma/client/index.d.ts` now includes `metaBusinessId` on the `WhatsAppConfig` type (`grep -n "metaBusinessId" node_modules/.prisma/client/index.d.ts` returns at least one match).

- [ ] **Step 4: Apply the migration to the dev database**

Run: `npx prisma migrate deploy`
Expected: output lists `20260917120000_add_whatsapp_meta_business_id` as applied, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260917120000_add_whatsapp_meta_business_id
git commit -m "feat: add WhatsAppConfig.metaBusinessId for embedded signup"
```

---

## Task 2: Meta Graph API helpers for the signup exchange

**Files:**
- Create: `lib/whatsapp/embedded-signup.ts`
- Test: `__tests__/integration/api/whatsapp-embedded-signup-lib.test.ts`
- Modify: `.env.example` (document the two new required vars)

**Interfaces:**
- Consumes: `process.env.WHATSAPP_APP_ID`, `process.env.WHATSAPP_APP_SECRET` (already set in production per `app/api/whatsapp/webhook/route.ts:17`).
- Produces: `exchangeCodeForToken(code: string): Promise<{ accessToken: string }>`, `subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void>`, `registerPhoneNumber(phoneNumberId: string, accessToken: string, pin: string): Promise<void>` — all three consumed by Task 3's route.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/integration/api/whatsapp-embedded-signup-lib.test.ts`:

```typescript
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  registerPhoneNumber,
} from '../../../lib/whatsapp/embedded-signup';

describe('lib/whatsapp/embedded-signup', () => {
  const originalFetch = global.fetch;
  const originalAppId = process.env.WHATSAPP_APP_ID;
  const originalAppSecret = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_APP_ID = 'test-app-id';
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.WHATSAPP_APP_ID = originalAppId;
    process.env.WHATSAPP_APP_SECRET = originalAppSecret;
    jest.restoreAllMocks();
  });

  describe('exchangeCodeForToken', () => {
    it('calls /oauth/access_token with client_id, client_secret and code, and returns the access token', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'business-token-abc', token_type: 'bearer' }),
      });
      global.fetch = fetchMock as any;

      const result = await exchangeCodeForToken('short-lived-code');

      expect(result).toEqual({ accessToken: 'business-token-abc' });
      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('graph.facebook.com/v20.0/oauth/access_token');
      expect(calledUrl).toContain('client_id=test-app-id');
      expect(calledUrl).toContain('client_secret=test-app-secret');
      expect(calledUrl).toContain('code=short-lived-code');
    });

    it('throws with the Meta error message when the exchange fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid verification code format.' } }),
      }) as any;

      await expect(exchangeCodeForToken('bad-code')).rejects.toThrow(
        'Invalid verification code format.'
      );
    });
  });

  describe('subscribeAppToWaba', () => {
    it('POSTs to /{wabaId}/subscribed_apps with the business access token', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock as any;

      await subscribeAppToWaba('waba-123', 'business-token-abc');

      const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://graph.facebook.com/v20.0/waba-123/subscribed_apps');
      expect(calledOpts.method).toBe('POST');
      expect(calledOpts.headers.Authorization).toBe('Bearer business-token-abc');
    });

    it('throws with the Meta error message when the subscription fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Permission denied for this WABA.' } }),
      }) as any;

      await expect(subscribeAppToWaba('waba-123', 'bad-token')).rejects.toThrow(
        'Permission denied for this WABA.'
      );
    });
  });

  describe('registerPhoneNumber', () => {
    it('POSTs to /{phoneNumberId}/register with messaging_product and the given pin', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock as any;

      await registerPhoneNumber('phone-456', 'business-token-abc', '246810');

      const [calledUrl, calledOpts] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe('https://graph.facebook.com/v20.0/phone-456/register');
      const body = JSON.parse(calledOpts.body);
      expect(body).toEqual({ messaging_product: 'whatsapp', pin: '246810' });
    });

    it('throws with the Meta error message when registration fails', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Phone number already registered.' } }),
      }) as any;

      await expect(
        registerPhoneNumber('phone-456', 'business-token-abc', '246810')
      ).rejects.toThrow('Phone number already registered.');
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/whatsapp-embedded-signup-lib.test.ts`
Expected: FAIL — `Cannot find module '../../../lib/whatsapp/embedded-signup'`.

- [ ] **Step 3: Implement `lib/whatsapp/embedded-signup.ts`**

```typescript
/**
 * Meta Graph API calls used by WhatsApp Embedded Signup v4
 * (developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup).
 *
 * These are the three server-side calls Meta requires after the client-side
 * FB.login({config_id}) popup finishes: exchange the short-lived `code` for
 * a business access token, subscribe this app to the customer's WABA so we
 * receive their webhooks, then register their phone number for Cloud API
 * messaging (required once per number before it can send/receive).
 */

const META_API_VERSION = 'v20.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

async function parseMetaError(res: Response): Promise<string> {
  const data = await res.json().catch(() => ({}));
  return data?.error?.message || `Meta API error ${res.status}`;
}

export async function exchangeCodeForToken(code: string): Promise<{ accessToken: string }> {
  const appId = process.env.WHATSAPP_APP_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error('WHATSAPP_APP_ID / WHATSAPP_APP_SECRET não configurados');
  }

  const url = `${META_BASE_URL}/oauth/access_token?client_id=${encodeURIComponent(appId)}&client_secret=${encodeURIComponent(appSecret)}&code=${encodeURIComponent(code)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(await parseMetaError(res));

  const data = await res.json();
  if (!data?.access_token) throw new Error('Resposta da Meta sem access_token');
  return { accessToken: data.access_token as string };
}

export async function subscribeAppToWaba(wabaId: string, accessToken: string): Promise<void> {
  const url = `${META_BASE_URL}/${wabaId}/subscribed_apps`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(await parseMetaError(res));
}

export async function registerPhoneNumber(
  phoneNumberId: string,
  accessToken: string,
  pin: string
): Promise<void> {
  const url = `${META_BASE_URL}/${phoneNumberId}/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', pin }),
  });
  if (!res.ok) throw new Error(await parseMetaError(res));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/whatsapp-embedded-signup-lib.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Document the new env vars**

Add to `.env.example` (near the top, it's a Meta/WhatsApp var like the others referenced in code but currently undocumented there):

```
# WhatsApp Embedded Signup (Meta App Dashboard → Facebook Login for Business)
WHATSAPP_APP_ID=
WHATSAPP_APP_SECRET=
NEXT_PUBLIC_WHATSAPP_APP_ID=
NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID=
```

- [ ] **Step 6: Commit**

```bash
git add lib/whatsapp/embedded-signup.ts __tests__/integration/api/whatsapp-embedded-signup-lib.test.ts .env.example
git commit -m "feat: add Meta Graph API helpers for WhatsApp embedded signup"
```

---

## Task 3: `POST /api/admin/whatsapp/embedded-signup` route

**Files:**
- Create: `app/api/admin/whatsapp/embedded-signup/route.ts`
- Test: `__tests__/integration/api/whatsapp-embedded-signup-route.test.ts`

**Interfaces:**
- Consumes: `exchangeCodeForToken`, `subscribeAppToWaba`, `registerPhoneNumber` from `lib/whatsapp/embedded-signup.ts` (Task 2); `getCurrentRestaurantId`, `requireAdminSession` from `lib/whatsapp/get-restaurant.ts`; `prisma.whatsAppConfig` (Task 1's `metaBusinessId` field).
- Produces: `POST` handler at `app/api/admin/whatsapp/embedded-signup/route.ts`, request body `{ code: string; phoneNumberId: string; wabaId: string; businessId?: string }`, response `{ ok: true, config: { id, phoneNumberId, isActive } }` or `{ error: string }` — consumed by Task 5's frontend `fetch('/api/admin/whatsapp/embedded-signup', ...)`.

- [ ] **Step 1: Write the failing test**

Create `__tests__/integration/api/whatsapp-embedded-signup-route.test.ts`:

```typescript
// @ts-nocheck
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { createMultiRestaurantScenario, cleanupMultiTenantData } from '../helpers/multi-tenant';

const prisma = (global as any).__PRISMA__ || new PrismaClient();

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}));

import { getServerSession } from 'next-auth';
import { POST } from '../../../app/api/admin/whatsapp/embedded-signup/route';

describe('POST /api/admin/whatsapp/embedded-signup', () => {
  let restaurantA: { restaurantId: string; ownerId: string };
  let restaurantB: { restaurantId: string; ownerId: string };

  beforeAll(async () => {
    const scenario = await createMultiRestaurantScenario();
    restaurantA = scenario.restaurantA;
    restaurantB = scenario.restaurantB;
  });

  afterAll(async () => {
    await prisma.whatsAppConfig.deleteMany({
      where: { restaurantId: { in: [restaurantA.restaurantId, restaurantB.restaurantId] } },
    });
    await cleanupMultiTenantData([restaurantA.restaurantId, restaurantB.restaurantId]);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env.WHATSAPP_APP_ID = 'test-app-id';
    process.env.WHATSAPP_APP_SECRET = 'test-app-secret';
  });

  function mockSession(userEmail: string, role = 'OWNER') {
    (getServerSession as jest.Mock).mockResolvedValue({
      user: { email: userEmail, role },
    });
  }

  function mockMetaCallsSucceed() {
    global.fetch = jest
      .fn()
      // exchangeCodeForToken
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'biz-token-xyz' }) })
      // subscribeAppToWaba
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      // registerPhoneNumber
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }) as any;
  }

  it('rejects unauthenticated requests', async () => {
    (getServerSession as jest.Mock).mockResolvedValue(null);
    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'c', phoneNumberId: 'p', wabaId: 'w' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it('rejects requests missing required fields', async () => {
    mockSession('owner-a@integration.test');
    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'c' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('exchanges the code, subscribes the WABA, registers the number, and upserts WhatsAppConfig for the caller\'s own restaurant', async () => {
    mockSession('owner-a@integration.test');
    mockMetaCallsSucceed();

    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({
        code: 'short-lived-code',
        phoneNumberId: 'phone-a-1',
        wabaId: 'waba-a-1',
        businessId: 'biz-a-1',
      }),
    });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.config.phoneNumberId).toBe('phone-a-1');

    const saved = await prisma.whatsAppConfig.findUnique({
      where: { restaurantId: restaurantA.restaurantId },
    });
    expect(saved?.phoneNumberId).toBe('phone-a-1');
    expect(saved?.businessAccountId).toBe('waba-a-1');
    expect(saved?.metaBusinessId).toBe('biz-a-1');
    expect(saved?.accessToken).toBe('biz-token-xyz');
    expect(saved?.isActive).toBe(true);
  });

  it('never writes to another restaurant\'s WhatsAppConfig row', async () => {
    mockSession('owner-a@integration.test');
    mockMetaCallsSucceed();

    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'c2', phoneNumberId: 'phone-a-2', wabaId: 'waba-a-2' }),
    });
    await POST(req as any);

    const otherRestaurantConfig = await prisma.whatsAppConfig.findUnique({
      where: { restaurantId: restaurantB.restaurantId },
    });
    expect(otherRestaurantConfig).toBeNull();
  });

  it('returns 500 with the Meta error message when the code exchange fails, without writing WhatsAppConfig', async () => {
    mockSession('owner-a@integration.test');
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'This authorization code has expired.' } }),
    }) as any;

    const req = new Request('http://localhost/api/admin/whatsapp/embedded-signup', {
      method: 'POST',
      body: JSON.stringify({ code: 'expired', phoneNumberId: 'phone-a-3', wabaId: 'waba-a-3' }),
    });
    const res = await POST(req as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe('This authorization code has expired.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/whatsapp-embedded-signup-route.test.ts`
Expected: FAIL — `Cannot find module '../../../app/api/admin/whatsapp/embedded-signup/route'`.

- [ ] **Step 3: Implement the route**

Create `app/api/admin/whatsapp/embedded-signup/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { getCurrentRestaurantId, requireAdminSession } from '@/lib/whatsapp/get-restaurant';
import {
  exchangeCodeForToken,
  subscribeAppToWaba,
  registerPhoneNumber,
} from '@/lib/whatsapp/embedded-signup';

export const dynamic = 'force-dynamic';

/**
 * Completes the server-side half of WhatsApp Embedded Signup v4. The client
 * (app/admin/integrations/whatsapp/page.tsx) calls this right after
 * FB.login({config_id}) resolves, passing the short-lived `code` plus the
 * phone_number_id/waba_id read from the WA_EMBEDDED_SIGNUP postMessage event.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdminSession();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não encontrado' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { code, phoneNumberId, wabaId, businessId } = body || {};
  if (!code || !phoneNumberId || !wabaId) {
    return NextResponse.json(
      { error: 'code, phoneNumberId e wabaId são obrigatórios' },
      { status: 400 }
    );
  }

  try {
    const { accessToken } = await exchangeCodeForToken(code);
    await subscribeAppToWaba(wabaId, accessToken);

    // Two-step verification PIN required by /register. Not persisted: it's
    // only needed at registration time, and re-registration (rare — e.g.
    // after Meta unbans a number) goes through this same flow again.
    const pin = crypto.randomInt(100000, 999999).toString();
    await registerPhoneNumber(phoneNumberId, accessToken, pin);

    const config = await prisma.whatsAppConfig.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        phoneNumberId,
        businessAccountId: wabaId,
        metaBusinessId: businessId || null,
        accessToken,
        isActive: true,
      },
      update: {
        phoneNumberId,
        businessAccountId: wabaId,
        metaBusinessId: businessId || null,
        accessToken,
        isActive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      config: { id: config.id, phoneNumberId: config.phoneNumberId, isActive: config.isActive },
    });
  } catch (err: any) {
    console.error('[whatsapp-embedded-signup] error:', err?.message);
    return NextResponse.json({ error: err?.message || 'Falha ao conectar WhatsApp' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/whatsapp-embedded-signup-route.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/whatsapp/embedded-signup/route.ts __tests__/integration/api/whatsapp-embedded-signup-route.test.ts
git commit -m "feat: add embedded signup API route, upserts WhatsAppConfig per restaurant"
```

---

## Task 4: Webhook — explicit `account_update` handling

**Files:**
- Modify: `app/api/whatsapp/webhook/route.ts:85-145`
- Test: `__tests__/integration/api/whatsapp-webhook-account-update.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks — this is an observability/correctness improvement so `account_update` events (which Meta requires this app to be subscribed to per Task 0 Step 4) are recognized on purpose instead of silently falling through the existing `messages`-shaped parsing.

Today, `POST` loops `entry[].changes[]` and reads `change.value.metadata.phone_number_id` unconditionally. An `account_update` change has no `metadata.phone_number_id` (it has `value.event`, e.g. `PARTNER_ADDED`), so the existing `if (!phoneNumberId) continue;` already prevents a crash — but it does so by accident, and the event is dropped with no trace. Make the routing explicit.

- [ ] **Step 1: Write the failing test**

Create `__tests__/integration/api/whatsapp-webhook-account-update.test.ts`:

```typescript
// @ts-nocheck
import { describe, it, expect, jest } from '@jest/globals';
import crypto from 'crypto';
import { POST } from '../../../app/api/whatsapp/webhook/route';

function signedRequest(payload: any, secret: string) {
  const rawBody = JSON.stringify(payload);
  const signature =
    'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  return new Request('http://localhost/api/whatsapp/webhook', {
    method: 'POST',
    headers: { 'x-hub-signature-256': signature },
    body: rawBody,
  });
}

describe('POST /api/whatsapp/webhook - account_update events', () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  it('logs and acknowledges an account_update event without erroring', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const payload = {
      entry: [
        {
          id: 'waba-123',
          changes: [
            {
              field: 'account_update',
              value: { event: 'PARTNER_ADDED', waba_info: { waba_id: 'waba-123' } },
            },
          ],
        },
      ],
    };

    const res = await POST(signedRequest(payload, 'test-secret') as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[wa-webhook] account_update'),
      expect.objectContaining({ event: 'PARTNER_ADDED' })
    );

    logSpy.mockRestore();
  });

  it('still returns ok:true for a payload with no entries', async () => {
    const res = await POST(signedRequest({ entry: [] }, 'test-secret') as any);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/whatsapp-webhook-account-update.test.ts`
Expected: FAIL on the `logSpy` assertion — nothing is logged today for `account_update` (the loop silently `continue`s).

- [ ] **Step 3: Implement the routing**

In `app/api/whatsapp/webhook/route.ts`, inside the `for (const change of changes)` loop (currently starting at line 87), branch on `change.field` before the existing messages logic:

```typescript
      for (const change of changes) {
        const value = change?.value || {};

        if (change?.field === 'account_update') {
          console.log('[wa-webhook] account_update', {
            event: value?.event,
            wabaId: value?.waba_info?.waba_id,
          });
          continue;
        }

        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
```

(The rest of the loop body — everything from the existing `// Descobre o restaurante dono desse phoneNumberId` comment onward — stays exactly as-is.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api/whatsapp-webhook-account-update.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the full webhook test suite to check for regressions**

Run: `npx jest --config jest.integration.config.js __tests__/integration/api`
Expected: PASS, no existing test broken by the added branch.

- [ ] **Step 6: Commit**

```bash
git add app/api/whatsapp/webhook/route.ts __tests__/integration/api/whatsapp-webhook-account-update.test.ts
git commit -m "feat: log account_update webhook events explicitly instead of silently dropping them"
```

---

## Task 5: Frontend — "Conectar WhatsApp" button

**Files:**
- Modify: `app/admin/integrations/whatsapp/page.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/whatsapp/embedded-signup` (Task 3); env vars `NEXT_PUBLIC_WHATSAPP_APP_ID`, `NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` (Task 0 Step 5, documented in Task 2 Step 5).
- Produces: nothing consumed by other tasks — this is the last task.

No automated test: this step wires up Meta's `FB` global and a real Facebook OAuth popup, which cannot be exercised by Jest (`jest.integration.config.js` runs `testEnvironment: 'node'`, no DOM/browser). Verify manually per Step 5 below instead.

- [ ] **Step 1: Add the Facebook JS SDK loader**

In `app/admin/integrations/whatsapp/page.tsx`, add the import at the top:

```typescript
import Script from 'next/script';
```

- [ ] **Step 2: Add signup state and the FB SDK init + postMessage listener**

Inside the `WhatsAppIntegrationPage` component, alongside the existing `useState`/`useEffect` calls (after the `sendingTest` state, before the `load` function):

```typescript
  const [connectingMeta, setConnectingMeta] = useState(false);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;

      if (data.event === 'FINISH') {
        (window as any).__gastruxWaSignupPayload = {
          phoneNumberId: data.data?.phone_number_id,
          wabaId: data.data?.waba_id,
          businessId: data.data?.business_id,
        };
      } else if (data.event === 'CANCEL') {
        setConnectingMeta(false);
        if (data.data?.error_message) {
          toast.error(`Conexão cancelada: ${data.data.error_message}`);
        }
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const launchWhatsAppSignup = () => {
    const FB = (window as any).FB;
    if (!FB) {
      toast.error('SDK da Meta ainda não carregou, tente novamente em instantes');
      return;
    }
    setConnectingMeta(true);
    FB.login(
      async (response: any) => {
        const signupPayload = (window as any).__gastruxWaSignupPayload;
        const code = response?.authResponse?.code;

        if (!code || !signupPayload?.phoneNumberId || !signupPayload?.wabaId) {
          setConnectingMeta(false);
          toast.error('Não foi possível concluir a conexão com o WhatsApp');
          return;
        }

        try {
          const res = await fetch('/api/admin/whatsapp/embedded-signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              phoneNumberId: signupPayload.phoneNumberId,
              wabaId: signupPayload.wabaId,
              businessId: signupPayload.businessId,
            }),
          });
          const d = await res.json();
          if (res.ok && d.ok) {
            toast.success('WhatsApp conectado!');
            await load();
          } else {
            toast.error(d.error || 'Falha ao conectar WhatsApp');
          }
        } catch {
          toast.error('Falha ao conectar WhatsApp');
        } finally {
          setConnectingMeta(false);
          delete (window as any).__gastruxWaSignupPayload;
        }
      },
      {
        config_id: process.env.NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {} },
      }
    );
  };
```

- [ ] **Step 3: Render the SDK script and the button**

Immediately after the opening `<div className="min-h-screen bg-gray-50 p-4 sm:p-6">` in the JSX (found around line 166), add the SDK loader:

```tsx
      <Script
        src="https://connect.facebook.net/pt_BR/sdk.js"
        strategy="afterInteractive"
        onLoad={() => {
          (window as any).fbAsyncInit = () => {
            (window as any).FB.init({
              appId: process.env.NEXT_PUBLIC_WHATSAPP_APP_ID,
              autoLogAppEvents: true,
              xfbml: true,
              version: 'v20.0',
            });
          };
          (window as any).fbAsyncInit();
        }}
      />
```

Then, right before the existing `{/* Credentials */}` comment (around line 234), add a new card offering the one-click connect option ahead of the manual-entry fallback:

```tsx
        {/* Embedded Signup */}
        <Card className="p-6 border-gray-200 bg-green-50/40">
          <h2 className="text-lg font-semibold mb-2">Conectar seu número do WhatsApp</h2>
          <p className="text-sm text-gray-600 mb-4">
            Conecte o WhatsApp Business da sua conta Meta em menos de um minuto, sem precisar
            configurar nada manualmente.
          </p>
          <Button onClick={launchWhatsAppSignup} disabled={connectingMeta}>
            {connectingMeta ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Conectando...</>
            ) : (
              'Conectar WhatsApp'
            )}
          </Button>
        </Card>

```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors introduced by this file (pre-existing errors in unrelated files, if any, are out of scope).

- [ ] **Step 5: Manual verification in the browser**

1. Set `NEXT_PUBLIC_WHATSAPP_APP_ID` and `NEXT_PUBLIC_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID` locally (values from Task 0 Step 5) and restart `npm run dev`.
2. Open `/admin/integrations/whatsapp` logged in as a restaurant owner on a **different** test restaurant than the one already configured manually (to prove this is the new path, not reusing existing creds).
3. Click **Conectar WhatsApp** — a Facebook popup should open.
4. Complete the flow with a Meta test WhatsApp number.
5. Confirm the toast shows "WhatsApp conectado!" and the page's existing "Credenciais da Meta Cloud API" fields (Phone Number ID, WABA ID) now show the values from the popup, without having typed anything.
6. Send a WhatsApp message to that number from a phone and confirm it reaches the bot (existing webhook flow, unchanged).

- [ ] **Step 6: Commit**

```bash
git add app/admin/integrations/whatsapp/page.tsx
git commit -m "feat: add one-click WhatsApp Embedded Signup button to admin integration page"
```
