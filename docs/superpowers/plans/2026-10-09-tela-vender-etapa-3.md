# Tela Vender — Etapa 3 (transferir e juntar mesas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No menu ⋯ da comanda: **Transferir mesa** (a comanda inteira vai para outra mesa), **Juntar** (outra comanda vem para esta) e **Transferir itens** (itens escolhidos vão para outra mesa ou comanda), sem a cozinha receber de novo o que já fez e com tudo auditado.

**Architecture:** Cada item passa a guardar **quando a cozinha o recebeu** (`OrderSessionItem.sentAt`): a regra "item novo" deixa de depender da comanda (`addedAt > sentToKitchenAt`) e um item movido leva o seu estado. Cada pedido da cozinha passa a apontar para a comanda (`Order.orderSessionId`), então todos os pedidos de uma comanda mostram a mesa certa no KDS, inclusive depois de transferir. As operações ficam em `lib/comanda/transfer.ts`, sob as travas já usadas (comanda e mesa), com rotas finas em `app/api/comanda/sessions/[id]/{transfer,merge,move-items}`.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, Tailwind, shadcn/ui, sonner, Jest.

**Spec:** `docs/superpowers/specs/2026-10-07-tela-vender-design.md` (4.4, 5 etapa 3, 6 etapa 3, 7 "Itens enviados ao transferir", 9, 10 etapa 3). Etapas 1 e 2 em produção.

## Global Constraints

- Repositório `C:\Users\andre\gastrux-fix-delivery`, branch `fix/delivery-public`; publicar com `git fetch -q https://github.com/andreyluis2003/Gastrux.git main && git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Interface em português do Brasil; código e comentários em inglês, comentário explica o porquê.
- **Esta etapa tem migração** (`20261009120000_transfer_merge`): o dono roda `npx prisma migrate deploy` **depois** que o deploy terminar.
- Quem pode: qualquer pessoa do atendimento — papéis `OWNER`, `MANAGER`, `CASHIER`, `ADMIN` (`COOK` não).
- Toda operação: escopo pelo `restaurantId` do membro; comanda de origem e destino **abertas** (`OPEN`, `SENT_TO_KITCHEN`, `READY`); `recordAudit` com origem, destino, itens e quem.
- Travas: `lockComanda(tx, sessionId)` (de `lib/comanda/add-item.ts`) para cada comanda tocada, **sempre na ordem crescente de id** (duas junções cruzadas nunca travam uma à outra); trava da mesa `pg_advisory_xact_lock(hashtext('comanda-table:' + tableId))` (a mesma de abrir mesa, `app/api/comanda/sessions/route.ts`) ao ocupar uma mesa.
- **Itens enviados nunca são reenviados**: o `sentAt` vai junto com o item.
- **Comanda com pagamento parcial não perde itens**: transferir itens **para fora** dela é recusado (estornar antes), como já acontece ao remover itens (etapa 2). Transferir a mesa e juntar levam os pagamentos junto.
- Juntar: a comanda de origem fica `CANCELLED` com `mergedIntoId` = destino (histórico "juntada à mesa N"); a mesa dela fica livre.
- Fora: desfazer junção automaticamente; pedido do WhatsApp que não chega ao KDS (problema anterior, relatado ao dono à parte).
- Testes: unitários `npx jest --config jest.unit.config.js <arquivo>`; integração uma suíte por vez (pouca memória); banco de teste com `DATABASE_URL`/`DIRECT_URL` do `.env.test`.

## Review Focus

1. **Juntar A em B e B em A ao mesmo tempo** → uma junção vence, a outra é recusada; nenhuma trava eterna. Teste na Task 5.
2. **Transferir para uma mesa livre que outro garçom abre no mesmo instante** → nunca duas comandas na mesa (a segunda operação vê a mesa ocupada). Teste na Task 4.
3. **Transferir itens já enviados** → o destino não os mostra como "a enviar" e o próximo envio não os repete. Teste na Task 6.
4. **Juntar uma comanda com pagamento parcial** → os pagamentos vêm junto e o "falta" do destino desconta; o turno do caixa não muda. Teste na Task 5.
5. **Depois de transferir a mesa, o cartão da cozinha** de um pedido antigo (primeiro envio) mostra a mesa nova. Teste na Task 3.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261009120000_transfer_merge/migration.sql` | `OrderSessionItem.sentAt`, `OrderSession.mergedIntoId`, `Order.orderSessionId` (+ preenchimento dos dados antigos) |
| `lib/kds/send-session.ts` | Envia os itens com `sentAt` nulo, marca `sentAt`, liga o pedido à comanda |
| `lib/comanda/add-item.ts` | Soma de um toque só em item com `sentAt` nulo |
| `app/api/comanda/sessions/[id]/items/[itemId]/route.ts` | "A cozinha já recebeu" = `sentAt` preenchido |
| `lib/vender/rules.ts`, `lib/vender/salao.ts`, `components/vender/use-comanda.ts`, `components/vender/comanda-panel.tsx`, `app/vender/[sessionId]/page.tsx` | "Item novo" pelo `sentAt` |
| `app/api/kds/orders/route.ts`, `lib/print/tickets.ts` | Pedido da cozinha lê a comanda por `Order.orderSessionId` |
| `lib/comanda/transfer.ts` (novo) | `transferTable`, `mergeSessions`, `moveItems` |
| `app/api/comanda/sessions/[id]/transfer/route.ts`, `.../merge/route.ts`, `.../move-items/route.ts` (novos) | Rotas |
| `components/vender/mesa-actions.tsx` (novo), `app/vender/[sessionId]/page.tsx` | Menu ⋯ da comanda e as três ações |

---

### Task 1: Migração (enviado por item, junção, pedido ligado à comanda)

**Files:** Modify `prisma/schema.prisma`; Create `prisma/migrations/20261009120000_transfer_merge/migration.sql`

**Interfaces:**
- Produces: `OrderSessionItem.sentAt: DateTime?`; `OrderSession.mergedIntoId: String?`; `Order.orderSessionId: String?` with relation `comanda OrderSession? @relation("OrderComanda", ...)` and back relation `OrderSession.kitchenOrders Order[] @relation("OrderComanda")`.

- [ ] **Step 1: Schema**

In `model OrderSessionItem`, after `addedAt`:
```prisma
  /// When the kitchen got this line (null = new, "a enviar"); moves with the line (spec 2026-10-07, 7)
  sentAt              DateTime?
```
In `model OrderSession`, after `preBillPrintedAt`:
```prisma
  /// Merged into another comanda (it stays CANCELLED, for the history)
  mergedIntoId          String?
  /// Every kitchen order of this comanda (orderId above keeps only the latest)
  kitchenOrders         Order[]                @relation("OrderComanda")
```
In `model Order`, next to the other relations:
```prisma
  /// The comanda this kitchen order came from (any send, not only the latest)
  orderSessionId String?
  comanda        OrderSession? @relation("OrderComanda", fields: [orderSessionId], references: [id], onDelete: SetNull)

  @@index([orderSessionId])
```
(If `model Order` already has `@@index` lines, add this one beside them.)

- [ ] **Step 2: Migration**

Check table names first: `grep -n '@@map("orders")\|@@map("order_sessions")\|@@map("order_session_items")' prisma/schema.prisma` (use the names found).
```sql
-- Tela Vender, etapa 3: per-line kitchen state, merge history, every kitchen order linked to its comanda
ALTER TABLE "order_session_items" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "order_sessions" ADD COLUMN "mergedIntoId" TEXT;
ALTER TABLE "orders" ADD COLUMN "orderSessionId" TEXT;
CREATE INDEX "orders_orderSessionId_idx" ON "orders"("orderSessionId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_orderSessionId_fkey" FOREIGN KEY ("orderSessionId") REFERENCES "order_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lines the kitchen already had under the old rule (addedAt <= sentToKitchenAt)
UPDATE "order_session_items" i SET "sentAt" = s."sentToKitchenAt"
FROM "order_sessions" s
WHERE i."sessionId" = s."id" AND s."sentToKitchenAt" IS NOT NULL AND i."addedAt" <= s."sentToKitchenAt";

-- The latest kitchen order of each comanda (the only link that existed)
UPDATE "orders" o SET "orderSessionId" = s."id" FROM "order_sessions" s WHERE s."orderId" = o."id";
```

- [ ] **Step 3: Apply to the test DB, check drift, generate**

```bash
U=$(grep -h "^DATABASE_URL" .env.test | head -1 | cut -d= -f2- | tr -d '"'); export DATABASE_URL="$U" DIRECT_URL="$U"
npm run test:db:start; npx prisma migrate deploy; npx prisma migrate diff --from-url "$U" --to-schema-datamodel prisma/schema.prisma --script; npx prisma generate
```
Expected: `Applying migration 20261009120000_transfer_merge`; diff `-- This is an empty migration.` If the diff shows the FK or index named differently, align the migration with what `prisma migrate diff` prints.

- [ ] **Step 4: Type check and commit**

`npx tsc --noEmit -p .` — no errors.
```bash
git add prisma/schema.prisma prisma/migrations/20261009120000_transfer_merge
git commit -m "Comanda: per-line kitchen state, merge history, kitchen orders linked to the comanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: "Item novo" passa a ser `sentAt` nulo

**Files:**
- Modify: `lib/kds/send-session.ts`, `lib/comanda/add-item.ts` (merge branch), `app/api/comanda/sessions/[id]/items/[itemId]/route.ts` (`loadLine`, `kitchenHasIt`), `lib/vender/salao.ts`, `lib/vender/rules.ts`, `components/vender/use-comanda.ts`, `components/vender/comanda-panel.tsx`, `app/vender/[sessionId]/page.tsx`
- Test: `__tests__/integration/vender/sent-at.test.ts`, `__tests__/unit/vender-rules.test.ts`

**Interfaces:**
- Produces:
  - `isUnsent(line: { sentAt?: string | null; pending?: boolean }): boolean` (no second argument) and `unsentCount(lines: Array<{ sentAt?: string | null; pending?: boolean }>): number`.
  - `ComandaLine.sentAt?: string | null` (from the session GET, a scalar of the item).
  - `ComandaPanel` loses the `sentToKitchenAt` prop.
  - `sendSessionToKitchen` writes `sentAt` on the lines it sends and `orderSessionId` on the kitchen order.

- [ ] **Step 1: Write the failing tests**

`__tests__/unit/vender-rules.test.ts` — replace the `describe('new and sent lines', ...)` block with:
```ts
describe('new and sent lines', () => {
  it('a line without sentAt, or pending offline, is new; one the kitchen got is not', () => {
    expect(isUnsent({ sentAt: null })).toBe(true);
    expect(isUnsent({})).toBe(true);
    expect(isUnsent({ sentAt: '2026-10-07T20:00:00.000Z' })).toBe(false);
    expect(isUnsent({ pending: true, sentAt: '2026-10-07T20:00:00.000Z' })).toBe(true);
    expect(unsentCount([{ sentAt: null }, { sentAt: '2026-10-07T20:00:00.000Z' }, { pending: true }])).toBe(2);
  });
});
```

```ts
// __tests__/integration/vender/sent-at.test.ts
// @ts-nocheck
/** Each line knows when the kitchen got it (spec 2026-10-07, 7); every kitchen order points to its comanda */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { PUT } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) => new NextRequest('http://x', { method, body: JSON.stringify(body) });

describe('kitchen state per line', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `sent-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Sent ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `S${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pratos', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Prato', price: 30, recipeId: recipe.id, position: 0 } })).id;
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN', serviceChargeEligible: true } })).id;
    const s = { user: { id: ownerId, email: `sent-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a send marks its lines and links its kitchen order; the next send takes only new lines', async () => {
    await ADD(req('POST', { menuItemId, quantity: 1, merge: true }), { params: { id: sid } });
    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    const [first] = await prisma.orderSessionItem.findMany({ where: { sessionId: sid } });
    expect(first.sentAt).not.toBeNull();

    // a tap after the send is a new line (never merged into the sent one)
    await ADD(req('POST', { menuItemId, quantity: 1, merge: true }), { params: { id: sid } });
    const lines = await prisma.orderSessionItem.findMany({ where: { sessionId: sid }, orderBy: { addedAt: 'asc' } });
    expect(lines.map((l) => [l.quantity, !!l.sentAt])).toEqual([[1, true], [1, false]]);

    expect((await SEND(req('POST', {}), { params: { id: sid } })).status).toBe(200);
    const orders = await prisma.order.findMany({ where: { orderSessionId: sid }, include: { items: true } });
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.items.reduce((n, i) => n + i.quantity, 0))).toEqual([1, 1]);
  });

  it('a sent line keeps its note and modifiers (409)', async () => {
    const [sent] = await prisma.orderSessionItem.findMany({ where: { sessionId: sid, sentAt: { not: null } } });
    expect((await PUT(req('PUT', { specialInstructions: 'x' }), { params: { id: sid, itemId: sent.id } })).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

`npx jest --config jest.unit.config.js __tests__/unit/vender-rules.test.ts` → FAIL (isUnsent takes the old arguments).
`npx jest --config jest.integration.config.js --testPathPatterns 'vender/sent-at'` → FAIL (`sentAt` stays null; `orderSessionId` null).

- [ ] **Step 3: Implement**

`lib/kds/send-session.ts` (inside `sendUnlocked`):
- `const newItems = orderSession.items.filter((item) => !item.sentAt);` (replace the `lastSent` lines and their comment with: `// What the kitchen does not have yet: lines with no sentAt (each line keeps its own state, so a line moved from another comanda is never sent twice)`).
- In `prisma.order.create({ data: { ... } })` add `orderSessionId: sessionId,`.
- Replace the `sentUpTo` block with:
```ts
  const sentAt = new Date();
  await prisma.orderSessionItem.updateMany({ where: { id: { in: newItems.map((i) => i.id) } }, data: { sentAt } });
  await prisma.orderSession.update({
    where: { id: sessionId },
    data: { orderId: order.id, status: 'SENT_TO_KITCHEN', sentToKitchenAt: sentAt },
  });
```

`lib/comanda/add-item.ts` merge branch: drop the `session` lookup's use for `addedAt` and filter `sentAt: null` instead of `...(session.sentToKitchenAt ? { addedAt: { gt: session.sentToKitchenAt } } : {})` (keep the `session` existence check).

`app/api/comanda/sessions/[id]/items/[itemId]/route.ts`: `loadLine` keeps `session: { select: { status: true } }`; replace `kitchenHasIt` with
```ts
const kitchenHasIt = (line: { sentAt: Date | null }) => !!line.sentAt;
```
(`snapshot` uses `kitchenHasIt(line)` unchanged.)

`lib/vender/salao.ts`: select `items: { select: { price, quantity, sentAt, modifiers } }` (drop `addedAt` and `sentToKitchenAt`), `newCount: s.items.filter((i) => !i.sentAt).length`, remove the `sent` const.

`lib/vender/rules.ts`:
```ts
/** A line the kitchen does not have yet: no sentAt (each line keeps its own state), or made offline */
export function isUnsent(line: { sentAt?: string | null; pending?: boolean }): boolean {
  return !!line.pending || !line.sentAt;
}

export function unsentCount(lines: Array<{ sentAt?: string | null; pending?: boolean }>): number {
  return lines.filter((l) => isUnsent(l)).length;
}
```

`components/vender/use-comanda.ts`: add `sentAt?: string | null;` to `ComandaLine`; `const newCount = unsentCount(lines);`; remove `const sent = ...` if no longer used.
`components/vender/comanda-panel.tsx`: remove the `sentToKitchenAt` prop; `const fresh = isUnsent(l);`.
`app/vender/[sessionId]/page.tsx`: drop `sentToKitchenAt={...}` from `ComandaPanel`; `const sheetSent = sheetLine ? !isUnsent(sheetLine) : false;`.

Search for any other caller: `grep -rn "isUnsent\|unsentCount\|sentToKitchenAt" app components lib --include=*.ts --include=*.tsx` and update each to the new rule (the WhatsApp bot's `sentToKitchenAt` stays as it is: it is the comanda's timestamp, not the lines').

- [ ] **Step 4: Run tests**

The two commands of Step 2 → PASS. Then `npx jest --config jest.integration.config.js --testPathPatterns 'vender/'` and `--testPathPatterns 'comanda'` and `--testPathPatterns 'bad-day'` → all PASS (`quick-add.test.ts` sends to the kitchen between taps: its expectations hold with `sentAt`). `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/kds/send-session.ts lib/comanda/add-item.ts "app/api/comanda/sessions/[id]/items/[itemId]/route.ts" lib/vender/salao.ts lib/vender/rules.ts components/vender/use-comanda.ts components/vender/comanda-panel.tsx "app/vender/[sessionId]/page.tsx" __tests__/unit/vender-rules.test.ts __tests__/integration/vender/sent-at.test.ts
git commit -m "Comanda: each line knows when the kitchen got it; every kitchen order points to its comanda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: A cozinha lê a mesa de todos os pedidos da comanda

**Files:** Modify `app/api/kds/orders/route.ts:77`, `lib/print/tickets.ts:34-40`; Test `__tests__/integration/vender/kds-table.test.ts`

**Interfaces:**
- Produces: the KDS orders API keeps its response shape (`order.orderSession` with `tableNumber`, `customerName`, `table.number`), now filled from `Order.comanda` (any send) with the old `orderSession` link as fallback.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/kds-table.test.ts
// @ts-nocheck
/** Every kitchen order of a comanda shows its table, also after the table changes (spec 2026-10-07, 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET as KDS } from '../../../app/api/kds/orders/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (method: string, body: any) => new NextRequest('http://x', { method, body: JSON.stringify(body) });

describe('KDS table label', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string, t9: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `kds-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Kds ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `K${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Pratos', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Prato', price: 30, recipeId: recipe.id, position: 0 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    const t5 = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `k5${tag}` } })).id;
    t9 = (await prisma.table.create({ data: { restaurantId: rid, number: 9, sectionId: sec.id, capacity: 4, qrToken: `k9${tag}` } })).id;
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t5, status: 'OPEN', serviceChargeEligible: true } })).id;
    const s = { user: { id: ownerId, email: `kds-${tag}@gastrux.test`, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('two sends, then the comanda moves to table 9: both kitchen cards say table 9', async () => {
    await ADD(req('POST', { menuItemId, quantity: 1 }), { params: { id: sid } });
    await SEND(req('POST', {}), { params: { id: sid } });
    await ADD(req('POST', { menuItemId, quantity: 1 }), { params: { id: sid } });
    await SEND(req('POST', {}), { params: { id: sid } });
    await prisma.orderSession.update({ where: { id: sid }, data: { tableId: t9, tableNumber: 9 } });
    const body = await (await KDS(new NextRequest('http://x/api/kds/orders'))).json();
    const orders = (body.orders ?? body).filter((o) => o.orderSession);
    expect(orders.length).toBeGreaterThanOrEqual(2);
    expect(orders.every((o) => (o.orderSession.table?.number ?? o.orderSession.tableNumber) === 9)).toBe(true);
  });
});
```
Check the KDS route's response shape first (`sed -n 60,110p app/api/kds/orders/route.ts`): if it returns `{ orders: [...] }` or a bare array, the test above handles both; if it requires a `?stationId=`, add it to the URL.

- [ ] **Step 2: Run to verify it fails**

`npx jest --config jest.integration.config.js --testPathPatterns 'vender/kds-table'` → FAIL (the first order has no `orderSession`).

- [ ] **Step 3: Implement**

`app/api/kds/orders/route.ts`: in the `include`, next to `orderSession: {...}` add
```ts
        comanda: { select: { tableNumber: true, customerName: true, table: { select: { number: true } } } },
```
and before returning, map each order so `orderSession` is the comanda of any send (the old one-to-one link only knew the latest):
```ts
    const withComanda = orders.map(({ comanda, ...o }: any) => ({ ...o, orderSession: comanda ?? o.orderSession ?? null }));
```
(return `withComanda` where `orders` was returned; keep the response shape).

`lib/print/tickets.ts` `buildKitchenTicket`: add the same `comanda` select and `const session = order.comanda ?? order.orderSession;`.

- [ ] **Step 4: Run tests**

`--testPathPatterns 'vender/kds-table'` → PASS; `--testPathPatterns 'bad-day'` → all PASS (kitchen screen and printing scenarios).

- [ ] **Step 5: Commit**

```bash
git add app/api/kds/orders/route.ts lib/print/tickets.ts __tests__/integration/vender/kds-table.test.ts
git commit -m "KDS: every kitchen order of a comanda shows its current table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Transferir mesa

**Files:** Create `lib/comanda/transfer.ts`, `app/api/comanda/sessions/[id]/transfer/route.ts`; Test `__tests__/integration/vender/transfer.test.ts`

**Interfaces:**
- Consumes: `lockComanda` (`lib/comanda/add-item.ts`); `recordAudit`, `RestaurantMember` (`lib/auth/restaurant-role.ts`); `CashRuleError` (`lib/caixa/rules.ts`, reused as the "rule error with status and code").
- Produces:
  - `const OPEN_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const`
  - `lockTable(tx: Prisma.TransactionClient, tableId: string): Promise<void>`
  - `transferTable(member: RestaurantMember, sessionId: string, tableId: string): Promise<{ sessionId: string; tableNumber: number }>` — throws `CashRuleError` 404 (comanda or table not found), 409 `CLOSED` (comanda not open), `TableBusyError` (409 `TABLE_BUSY`, carrying `targetSessionId` = the busy table's comanda), 400 (same table).
  - `POST /api/comanda/sessions/[id]/transfer` `{ tableId }` → `{ sessionId, tableNumber }`; on a busy table → 409 `{ error, code: 'TABLE_BUSY', targetSessionId }`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/transfer.test.ts
// @ts-nocheck
/** Transferring a comanda to another table (spec 2026-10-07, 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as TRANSFER } from '../../../app/api/comanda/sessions/[id]/transfer/route';
import { POST as OPEN } from '../../../app/api/comanda/sessions/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('transfer a table', () => {
  let rid: string, otherRid: string, ownerId: string, t: Record<number, string> = {}, foreignTable: string;
  const open = async (n: number) => (await (await OPEN(req({ tableId: t[n] }))).json()).id;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `tr-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Tr ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    for (const n of [1, 2, 3, 4]) t[n] = (await prisma.table.create({ data: { restaurantId: rid, number: n, sectionId: sec.id, capacity: 4, qrToken: `t${n}${tag}` } })).id;
    const osec = await prisma.tableSection.create({ data: { restaurantId: otherRid, name: 'Outro', capacity: 20 } });
    foreignTable = (await prisma.table.create({ data: { restaurantId: otherRid, number: 1, sectionId: osec.id, capacity: 4, qrToken: `f${tag}` } })).id;
    const s = { user: { id: ownerId, email: `tr-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('moves the whole comanda to a free table; the old table is free', async () => {
    const sid = await open(1);
    const res = await TRANSFER(req({ tableId: t[2] }), { params: { id: sid } });
    expect(res.status).toBe(200);
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    expect([s.tableId, s.tableNumber]).toEqual([t[2], 2]);
    const reopened = await open(1);
    expect(reopened).not.toBe(sid);
  });

  it('a busy table answers TABLE_BUSY with its comanda (the screen offers to merge)', async () => {
    const a = await open(3);
    const b = await open(4);
    const res = await TRANSFER(req({ tableId: t[4] }), { params: { id: a } });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'TABLE_BUSY', targetSessionId: b });
  });

  it('another restaurant\'s table is not found; the audit records the move', async () => {
    const sid = (await prisma.orderSession.findFirst({ where: { tableId: t[2], status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).id;
    expect((await TRANSFER(req({ tableId: foreignTable }), { params: { id: sid } })).status).toBe(404);
    const log = await prisma.auditLog.findFirst({ where: { entityId: sid, entityType: 'OrderSession' }, orderBy: { createdAt: 'desc' } });
    expect(JSON.stringify(log?.changes ?? {})).toContain('transfer');
  });

  it('two comandas moved to the same free table at once: only one gets it', async () => {
    const free = (await prisma.table.create({ data: { restaurantId: rid, number: 10, sectionId: (await prisma.table.findUnique({ where: { id: t[1] } })).sectionId, capacity: 4, qrToken: `t10${tag}` } })).id;
    const x = await open(1);
    const y = (await (await OPEN(req({ customerName: 'João' }))).json()).id;
    const res = await Promise.all([TRANSFER(req({ tableId: free }), { params: { id: x } }), TRANSFER(req({ tableId: free }), { params: { id: y } })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.orderSession.count({ where: { tableId: free, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).toBe(1);
  });
});
```
Check the audit model and field names first: `awk '/^model AuditLog \{/,/^\}/' prisma/schema.prisma` and adapt `prisma.auditLog` / `changes` to the names there (what `recordAudit` writes).

- [ ] **Step 2: Run to verify it fails**

`--testPathPatterns 'vender/transfer'` → FAIL (route missing).

- [ ] **Step 3: Implement**

```ts
// lib/comanda/transfer.ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lockComanda } from '@/lib/comanda/add-item';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';

/**
 * Moving comandas around the room (spec 2026-10-07, 4.4): transfer a comanda to another table, merge
 * another comanda into this one, move some lines. Under the same locks as opening a table and as the
 * bill, so a waiter, the cashier and the kitchen send never see half a move.
 */

export const OPEN_STATUSES = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;

/** The same per-table lock as opening a table (app/api/comanda/sessions/route.ts) */
export async function lockTable(tx: Prisma.TransactionClient, tableId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-table:' + tableId}))`;
}

export class TableBusyError extends CashRuleError {
  constructor(readonly targetSessionId: string, tableNumber: number) {
    super(`A mesa ${tableNumber} já tem comanda`, 409, 'TABLE_BUSY');
  }
}

async function openSession(tx: Prisma.TransactionClient, restaurantId: string, id: string) {
  const s = await tx.orderSession.findFirst({ where: { id, restaurantId }, select: { id: true, status: true, tableId: true, tableNumber: true } });
  if (!s) throw new CashRuleError('Comanda não encontrada', 404);
  if (!(OPEN_STATUSES as readonly string[]).includes(s.status)) throw new CashRuleError('Comanda fechada ou cancelada', 409, 'CLOSED');
  return s;
}

export async function transferTable(member: RestaurantMember, sessionId: string, tableId: string) {
  return prisma.$transaction(async (tx) => {
    const table = await tx.table.findFirst({ where: { id: tableId, restaurantId: member.restaurantId }, select: { id: true, number: true } });
    if (!table) throw new CashRuleError('Mesa não encontrada', 404);
    await lockTable(tx, table.id);
    await lockComanda(tx, sessionId);
    const s = await openSession(tx, member.restaurantId, sessionId);
    if (s.tableId === table.id) throw new CashRuleError('A comanda já está nesta mesa', 400);
    const busy = await tx.orderSession.findFirst({
      where: { restaurantId: member.restaurantId, tableId: table.id, status: { in: [...OPEN_STATUSES] } },
      select: { id: true },
    });
    if (busy) throw new TableBusyError(busy.id, table.number);
    await tx.orderSession.update({ where: { id: sessionId }, data: { tableId: table.id, tableNumber: table.number, serviceChargeEligible: true } });
    await recordAudit(member, {
      action: 'UPDATE',
      entityType: 'OrderSession',
      entityId: sessionId,
      changes: { transfer: { fromTableId: s.tableId, fromTableNumber: s.tableNumber, toTableId: table.id, toTableNumber: table.number } },
    });
    return { sessionId, tableNumber: table.number };
  });
}
```

```ts
// app/api/comanda/sessions/[id]/transfer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { TableBusyError, transferTable } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST { tableId }: the whole comanda goes to that table (spec 2026-10-07, 4.4) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.tableId !== 'string') return NextResponse.json({ error: 'Escolha a mesa' }, { status: 400 });
  try {
    return NextResponse.json(await transferTable(auth.member, params.id, body.tableId));
  } catch (e) {
    if (e instanceof TableBusyError) return NextResponse.json({ error: e.message, code: e.code, targetSessionId: e.targetSessionId }, { status: 409 });
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 4: Run tests** — `--testPathPatterns 'vender/transfer'` → PASS (4 tests). `npx tsc --noEmit -p .` → no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/transfer.ts "app/api/comanda/sessions/[id]/transfer" __tests__/integration/vender/transfer.test.ts
git commit -m "Comanda: transfer a comanda to another table (table lock, audited)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Juntar comandas

**Files:** Modify `lib/comanda/transfer.ts` (add `mergeSessions`); Create `app/api/comanda/sessions/[id]/merge/route.ts`; Test `__tests__/integration/vender/merge.test.ts`

**Interfaces:**
- Produces: `mergeSessions(member: RestaurantMember, targetSessionId: string, sourceSessionId: string): Promise<{ sessionId: string; movedItems: number; movedPayments: number }>`; `POST /api/comanda/sessions/[id]/merge` `{ sourceSessionId }` (`[id]` = target).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/merge.test.ts
// @ts-nocheck
/** Merging another comanda into this one (spec 2026-10-07, 4.4) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as MERGE } from '../../../app/api/comanda/sessions/[id]/merge/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { loadBill } from '../../../lib/comanda/bill-service';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('merge comandas', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, sec: string;
  let n = 1;
  const table = async () => (await prisma.table.create({ data: { restaurantId: rid, number: n++, sectionId: sec, capacity: 4, qrToken: `m${n}${tag}` } })).id;
  const comanda = async (qty: number) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: await table(), status: 'OPEN', serviceChargeEligible: true } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: qty } });
    return s.id;
  };
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `mg-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Mg ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `M${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `mg-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('items and partial payments come over; the source is kept as merged and its table is free', async () => {
    const target = await comanda(1); // 50 + 5
    const source = await comanda(2); // 100 + 10
    await PAY(req({ payments: [{ method: 'pix', amount: '30,00' }], cashSessionId: shiftId }), { params: { id: source } });
    const res = await MERGE(req({ sourceSessionId: source }), { params: { id: target } });
    expect(res.status).toBe(200);
    const bill = await loadBill(prisma, rid, target);
    expect(bill).toMatchObject({ subtotalCents: 15_000, serviceCents: 1_500, paidCents: 3_000, remainingCents: 13_500 });
    const src = await prisma.orderSession.findUnique({ where: { id: source } });
    expect([src.status, src.mergedIntoId]).toEqual(['CANCELLED', target]);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: source } })).toBe(0);
  });

  it('A into B and B into A at once: one wins, the other is refused, nothing hangs', async () => {
    const a = await comanda(1);
    const b = await comanda(1);
    const res = await Promise.all([MERGE(req({ sourceSessionId: b }), { params: { id: a } }), MERGE(req({ sourceSessionId: a }), { params: { id: b } })]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
  }, 30000);

  it('a comanda cannot be merged into itself; a closed one cannot take part', async () => {
    const a = await comanda(1);
    expect((await MERGE(req({ sourceSessionId: a }), { params: { id: a } })).status).toBe(400);
    const closed = await comanda(1);
    await prisma.orderSession.update({ where: { id: closed }, data: { status: 'CLOSED', closedAt: new Date() } });
    expect((await MERGE(req({ sourceSessionId: closed }), { params: { id: a } })).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `--testPathPatterns 'vender/merge'` → FAIL (route missing).

- [ ] **Step 3: Implement**

Append to `lib/comanda/transfer.ts`:
```ts
/** Two comandas locked in id order, so A-into-B and B-into-A at once never wait on each other forever */
async function lockBoth(tx: Prisma.TransactionClient, a: string, b: string) {
  const [first, second] = [a, b].sort();
  await lockComanda(tx, first);
  await lockComanda(tx, second);
}

/**
 * Merge (spec 4.4): the source's lines, payments and kitchen orders move to the target; the source is
 * kept CANCELLED with mergedIntoId (history "juntada à mesa N") and its table is free. Payments keep
 * their cash shift: only the comanda they belong to changes, so the shift totals do not move.
 */
export async function mergeSessions(member: RestaurantMember, targetSessionId: string, sourceSessionId: string) {
  if (targetSessionId === sourceSessionId) throw new CashRuleError('Escolha outra comanda para juntar', 400);
  return prisma.$transaction(async (tx) => {
    await lockBoth(tx, targetSessionId, sourceSessionId);
    const target = await openSession(tx, member.restaurantId, targetSessionId);
    const source = await openSession(tx, member.restaurantId, sourceSessionId);
    const items = await tx.orderSessionItem.updateMany({ where: { sessionId: source.id }, data: { sessionId: target.id } });
    const payments = await tx.cashSessionEntry.updateMany({ where: { orderSessionId: source.id, restaurantId: member.restaurantId }, data: { orderSessionId: target.id } });
    await tx.order.updateMany({ where: { orderSessionId: source.id, restaurantId: member.restaurantId }, data: { orderSessionId: target.id } });
    await tx.orderSession.update({ where: { id: source.id }, data: { status: 'CANCELLED', mergedIntoId: target.id } });
    // New lines on the target: it is ordering again, not waiting for the bill
    await tx.orderSession.update({ where: { id: target.id }, data: { preBillPrintedAt: null } });
    await recordAudit(member, {
      action: 'UPDATE',
      entityType: 'OrderSession',
      entityId: target.id,
      changes: { merge: { from: source.id, fromTableNumber: source.tableNumber, items: items.count, payments: payments.count } },
    });
    return { sessionId: target.id, movedItems: items.count, movedPayments: payments.count };
  });
}
```
(Check `model Order` has `restaurantId`; if not, drop it from that `where`.)

```ts
// app/api/comanda/sessions/[id]/merge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { mergeSessions } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST { sourceSessionId }: that comanda comes into this one (spec 2026-10-07, 4.4) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.sourceSessionId !== 'string') return NextResponse.json({ error: 'Escolha a comanda para juntar' }, { status: 400 });
  try {
    return NextResponse.json(await mergeSessions(auth.member, params.id, body.sourceSessionId));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 4: Run tests** — `--testPathPatterns 'vender/merge'` → PASS (3 tests); `--testPathPatterns 'caixa'` → PASS (shift totals untouched).

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/transfer.ts "app/api/comanda/sessions/[id]/merge" __tests__/integration/vender/merge.test.ts
git commit -m "Comanda: merge another comanda into this one (lines, payments, kitchen orders)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Transferir itens

**Files:** Modify `lib/comanda/transfer.ts` (add `moveItems`); Create `app/api/comanda/sessions/[id]/move-items/route.ts`; Test `__tests__/integration/vender/move-items.test.ts`

**Interfaces:**
- Consumes: `paidNetCents` (`lib/comanda/bill.ts`).
- Produces: `moveItems(member: RestaurantMember, sourceSessionId: string, input: { itemIds: string[]; tableId?: string; targetSessionId?: string }): Promise<{ sessionId: string; moved: number }>`; `POST /api/comanda/sessions/[id]/move-items` `{ itemIds, tableId? | targetSessionId? }` → `{ sessionId, moved }`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/move-items.test.ts
// @ts-nocheck
/** Moving some lines to another table or comanda (spec 2026-10-07, 4.4 and 7) */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as MOVE } from '../../../app/api/comanda/sessions/[id]/move-items/route';
import { POST as SEND } from '../../../app/api/comanda/sessions/[id]/send-to-kitchen/route';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const req = (body: any) => new NextRequest('http://x', { method: 'POST', body: JSON.stringify(body) });

describe('move items', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, sec: string;
  let n = 1;
  const table = async () => (await prisma.table.create({ data: { restaurantId: rid, number: n++, sectionId: sec, capacity: 4, qrToken: `mv${n}${tag}` } })).id;
  const comanda = async () => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: await table(), status: 'OPEN', serviceChargeEligible: true } });
    const a = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: 1, sentAt: new Date() } });
    const b = await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 20, quantity: 1 } });
    return { id: s.id, sentLine: a.id, newLine: b.id };
  };
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `mv-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Mv ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `MV${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    sec = (await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `mv-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('to a free table: a comanda is opened there; a sent line stays sent and is never sent again', async () => {
    const src = await comanda();
    const free = await table();
    const res = await MOVE(req({ itemIds: [src.sentLine], tableId: free }), { params: { id: src.id } });
    expect(res.status).toBe(200);
    const { sessionId } = await res.json();
    const moved = await prisma.orderSessionItem.findUnique({ where: { id: src.sentLine } });
    expect([moved.sessionId, !!moved.sentAt]).toEqual([sessionId, true]);
    const send = await SEND(req({}), { params: { id: sessionId } });
    expect(send.status).toBe(400); // nothing new for the kitchen
  });

  it('to another open comanda', async () => {
    const src = await comanda();
    const dst = await comanda();
    const res = await MOVE(req({ itemIds: [src.newLine], targetSessionId: dst.id }), { params: { id: src.id } });
    expect(res.status).toBe(200);
    expect(await prisma.orderSessionItem.count({ where: { sessionId: dst.id } })).toBe(3);
  });

  it('lines of another comanda, or out of a bill with payments, are refused', async () => {
    const a = await comanda();
    const b = await comanda();
    expect((await MOVE(req({ itemIds: [b.newLine], targetSessionId: b.id }), { params: { id: a.id } })).status).toBe(404);
    await PAY(req({ payments: [{ method: 'pix', amount: '10,00' }], cashSessionId: shiftId }), { params: { id: a.id } });
    expect((await MOVE(req({ itemIds: [a.newLine], targetSessionId: b.id }), { params: { id: a.id } })).status).toBe(409);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `--testPathPatterns 'vender/move-items'` → FAIL (route missing).

- [ ] **Step 3: Implement**

Append to `lib/comanda/transfer.ts` (import `paidNetCents` from `./bill`):
```ts
/**
 * Moves some lines (spec 4.4): to an open comanda, or to a table (its open comanda, or a new one).
 * Each line keeps its sentAt, so what the kitchen already has is never sent again (spec 7). Lines
 * never leave a bill that already has payments: give a payment back first (stage 2 rule).
 */
export async function moveItems(
  member: RestaurantMember,
  sourceSessionId: string,
  input: { itemIds: string[]; tableId?: string; targetSessionId?: string },
) {
  const itemIds = [...new Set((input.itemIds ?? []).map(String))];
  if (!itemIds.length) throw new CashRuleError('Escolha os itens', 400);
  return prisma.$transaction(async (tx) => {
    let targetId = input.targetSessionId ?? null;
    if (!targetId) {
      const table = input.tableId ? await tx.table.findFirst({ where: { id: input.tableId, restaurantId: member.restaurantId }, select: { id: true, number: true } }) : null;
      if (!table) throw new CashRuleError('Mesa não encontrada', 404);
      await lockTable(tx, table.id);
      const busy = await tx.orderSession.findFirst({ where: { restaurantId: member.restaurantId, tableId: table.id, status: { in: [...OPEN_STATUSES] } }, select: { id: true } });
      targetId = busy?.id ?? (await tx.orderSession.create({
        data: { restaurantId: member.restaurantId, userId: member.userId, tableId: table.id, tableNumber: table.number, status: 'OPEN', serviceChargeEligible: true },
        select: { id: true },
      })).id;
    }
    if (targetId === sourceSessionId) throw new CashRuleError('Escolha outra mesa ou comanda', 400);
    await lockBoth(tx, sourceSessionId, targetId);
    await openSession(tx, member.restaurantId, sourceSessionId);
    await openSession(tx, member.restaurantId, targetId);
    const lines = await tx.cashSessionEntry.findMany({ where: { orderSessionId: sourceSessionId, restaurantId: member.restaurantId }, select: { type: true, method: true, amountCents: true, direction: true } });
    if (paidNetCents(lines) > 0) throw new CashRuleError('Esta conta já tem pagamentos: estorne um pagamento antes de tirar itens', 409);
    const owned = await tx.orderSessionItem.count({ where: { id: { in: itemIds }, sessionId: sourceSessionId } });
    if (owned !== itemIds.length) throw new CashRuleError('Item não encontrado nesta comanda', 404);
    await tx.orderSessionItem.updateMany({ where: { id: { in: itemIds } }, data: { sessionId: targetId } });
    await tx.orderSession.update({ where: { id: targetId }, data: { preBillPrintedAt: null } });
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sourceSessionId, changes: { moveItems: { to: targetId, itemIds } } });
    return { sessionId: targetId, moved: itemIds.length };
  });
}
```
Note: when the destination table was free, the new comanda is created **before** the comanda locks; the table lock is held, so no other device opens the same table meanwhile.

```ts
// app/api/comanda/sessions/[id]/move-items/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { moveItems } from '@/lib/comanda/transfer';

export const dynamic = 'force-dynamic';

/** POST { itemIds, tableId? | targetSessionId? }: those lines go to that table or comanda (spec 4.4) */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body?.itemIds) || (!body?.tableId && !body?.targetSessionId)) {
    return NextResponse.json({ error: 'Escolha os itens e o destino' }, { status: 400 });
  }
  try {
    return NextResponse.json(await moveItems(auth.member, params.id, { itemIds: body.itemIds, tableId: body.tableId, targetSessionId: body.targetSessionId }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 4: Run tests** — `--testPathPatterns 'vender/move-items'` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/transfer.ts "app/api/comanda/sessions/[id]/move-items" __tests__/integration/vender/move-items.test.ts
git commit -m "Comanda: move some lines to another table or comanda (sent lines never resent)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: O menu ⋯ da comanda

**Files:** Create `components/vender/mesa-actions.tsx`; Modify `app/vender/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `Salao`, `SalaoTable`, `SalaoSession` (type only, `lib/vender/salao.ts`); routes of Tasks 4–6; `ComandaLine` (`components/vender/use-comanda.ts`).
- Produces: `MesaActions({ sessionId, lines, onDone }: { sessionId: string; lines: ComandaLine[]; onDone: (goTo?: string) => void })` — a button "⋯" that opens a sheet with three choices.

- [ ] **Step 1: Write the component**

```tsx
// components/vender/mesa-actions.tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Salao } from '@/lib/vender/salao';
import type { ComandaLine } from '@/components/vender/use-comanda';

type Mode = 'menu' | 'transfer' | 'merge' | 'move';

/**
 * The comanda's ⋯ menu (spec 2026-10-07, 4.4): transfer the table, merge another comanda here, move
 * some lines. Needs the internet (a move is never queued).
 */
export function MesaActions({ sessionId, lines, onDone }: { sessionId: string; lines: ComandaLine[]; onDone: (goTo?: string) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [salao, setSalao] = useState<Salao | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function openMode(m: Mode) {
    setMode(m);
    if (m !== 'menu' && !salao) {
      const res = await fetch('/api/vender/salao', { cache: 'no-store' });
      if (res.ok) setSalao(await res.json());
    }
  }

  async function post(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/comanda/sessions/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { res, out: await res.json().catch(() => ({})) };
    } finally {
      setBusy(false);
    }
  }

  async function transfer(tableId: string, tableNumber: number) {
    const { res, out } = await post(`${sessionId}/transfer`, { tableId });
    if (res.ok) { toast.success(`Comanda transferida para a mesa ${tableNumber}`); setMode(null); onDone(); return; }
    if (out.code === 'TABLE_BUSY' && window.confirm(`A mesa ${tableNumber} já tem comanda. Juntar as duas?`)) {
      const merged = await post(`${out.targetSessionId}/merge`, { sourceSessionId: sessionId });
      if (merged.res.ok) { toast.success(`Comandas juntadas na mesa ${tableNumber}`); setMode(null); onDone(`/vender/${out.targetSessionId}`); return; }
      toast.error(merged.out.error || 'Não foi possível juntar');
      return;
    }
    toast.error(out.error || 'Não foi possível transferir');
  }

  async function merge(sourceSessionId: string, label: string) {
    if (!window.confirm(`Juntar ${label} nesta comanda?`)) return;
    const { res, out } = await post(`${sessionId}/merge`, { sourceSessionId });
    if (res.ok) { toast.success(`${label} juntada nesta comanda`); setMode(null); onDone(); return; }
    toast.error(out.error || 'Não foi possível juntar');
  }

  async function move(target: { tableId?: string; targetSessionId?: string }, label: string) {
    const { res, out } = await post(`${sessionId}/move-items`, { itemIds: picked, ...target });
    if (res.ok) { toast.success(`${picked.length} ${picked.length === 1 ? 'item transferido' : 'itens transferidos'} para ${label}`); setPicked([]); setMode(null); onDone(); return; }
    toast.error(out.error || 'Não foi possível transferir os itens');
  }

  const others = salao ? [...salao.tables.filter((t) => t.session && t.session.id !== sessionId).map((t) => t.session!), ...salao.others.filter((s) => s.id !== sessionId)] : [];

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Mais ações da mesa" onClick={() => openMode('menu')}><MoreHorizontal className="h-6 w-6" /></Button>
      {mode && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={() => setMode(null)}>
          <div role="dialog" aria-label="Ações da mesa" className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            {mode === 'menu' && (
              <>
                <h2 className="text-lg font-bold">Mesa</h2>
                <Button variant="outline" className="w-full justify-start" onClick={() => openMode('transfer')}>Transferir mesa</Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => openMode('merge')}>Juntar outra mesa ou comanda aqui</Button>
                <Button variant="outline" className="w-full justify-start" disabled={!lines.length} onClick={() => openMode('move')}>Transferir itens</Button>
              </>
            )}
            {mode === 'transfer' && (
              <>
                <h2 className="text-lg font-bold">Transferir para qual mesa?</h2>
                {!salao ? <p>Carregando...</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {salao.tables.filter((t) => t.session?.id !== sessionId).map((t) => (
                      <button key={t.id} disabled={busy} onClick={() => transfer(t.id, t.number)} className={`min-h-[64px] rounded-xl border-2 p-2 text-left ${t.session ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="font-bold">Mesa {t.number}</div>
                        <div className="text-xs">{t.session ? 'Ocupada (juntar)' : 'Livre'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {mode === 'merge' && (
              <>
                <h2 className="text-lg font-bold">Juntar qual comanda aqui?</h2>
                {!salao ? <p>Carregando...</p> : others.length === 0 ? <p className="text-sm text-slate-500">Nenhuma outra comanda aberta.</p> : (
                  <div className="grid grid-cols-2 gap-2">
                    {others.map((s) => (
                      <button key={s.id} disabled={busy} onClick={() => merge(s.id, s.label)} className="min-h-[64px] rounded-xl border-2 border-emerald-300 bg-emerald-50 p-2 text-left">
                        <div className="font-bold">{s.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {mode === 'move' && (
              <>
                <h2 className="text-lg font-bold">Quais itens?</h2>
                <ul className="space-y-1">
                  {lines.filter((l) => !l.pending).map((l) => (
                    <li key={l.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={picked.includes(l.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
                        {l.quantity}x {l.recipe.name}
                      </label>
                    </li>
                  ))}
                </ul>
                <h3 className="font-semibold pt-2">Para onde?</h3>
                {!salao ? <p>Carregando...</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {salao.tables.filter((t) => t.session?.id !== sessionId).map((t) => (
                      <button key={t.id} disabled={busy || !picked.length} onClick={() => move({ tableId: t.id }, `a mesa ${t.number}`)} className="min-h-[56px] rounded-xl border-2 border-slate-200 p-2 text-left disabled:opacity-50">
                        <div className="font-bold">Mesa {t.number}</div>
                        <div className="text-xs">{t.session ? 'Ocupada' : 'Livre'}</div>
                      </button>
                    ))}
                    {salao.others.filter((s) => s.id !== sessionId).map((s) => (
                      <button key={s.id} disabled={busy || !picked.length} onClick={() => move({ targetSessionId: s.id }, s.label)} className="min-h-[56px] rounded-xl border-2 border-slate-200 p-2 text-left disabled:opacity-50">
                        <div className="font-bold">{s.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="flex justify-end"><Button variant="ghost" onClick={() => (mode === 'menu' ? setMode(null) : setMode('menu'))}>Voltar</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Wire it in the comanda header**

In `app/vender/[sessionId]/page.tsx`, import `MesaActions` and, in the header `div` after the title block, add (only while the comanda is open):
```tsx
        {!c.isClosed && (
          <div className="ml-auto">
            <MesaActions sessionId={sessionId} lines={c.lines} onDone={(goTo) => (goTo ? router.push(goTo) : c.refresh())} />
          </div>
        )}
```

- [ ] **Step 3: Type check and unit tests** — `npx tsc --noEmit -p .`; `npx jest --config jest.unit.config.js` → all PASS.

- [ ] **Step 4: Commit**

```bash
git add components/vender/mesa-actions.tsx "app/vender/[sessionId]/page.tsx"
git commit -m "Vender: the comanda's ⋯ menu (transfer table, merge, move items)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Conferência, publicação e manual

- [ ] **Step 1: Full checks** (one at a time): `npx tsc --noEmit -p .`; unit; integration `vender`, `comanda`, `caixa`, `bad-day`, `staff`. All PASS.
- [ ] **Step 2: Final review** (subagent, most capable model) with the plan's Review Focus; fix Critical/Important with RED→GREEN tests.
- [ ] **Step 3: Publish**; owner deploys **homolog** and runs `npx prisma migrate deploy` **after** the deploy finishes (expected: `Applying migration 20261009120000_transfer_merge`).
- [ ] **Step 4: Browser check on homolog** (1280×800 and 390×844): open Mesa 1 and Mesa 2 with items (one sent); Mesa 1 ⋯ → Transferir para mesa livre → map shows it moved; ⋯ → Transferir para a Mesa 2 (ocupada) → "Juntar as duas?" → a single comanda with all lines; Transferir itens of one sent line to a free table → "na cozinha" there and "Enviar" disabled; KDS (`/cozinha`) shows the new table on the old cards.
- [ ] **Step 5: Production**: owner deploys **app** and runs the migration after the deploy.
- [ ] **Step 6: Manual**: Vendas paragraph — ⋯ da comanda: transferir mesa, juntar, transferir itens; itens enviados não voltam para a cozinha; pagamentos vão junto ao juntar; com pagamento não dá para tirar itens.
