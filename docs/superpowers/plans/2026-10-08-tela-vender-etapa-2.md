# Tela Vender — Etapa 2 (Conta) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela **Conta** da comanda: taxa de serviço (sugerida, removível), pré-conta impressa (mesa amarela no mapa), dividir igualmente ou por item, e pagamentos parciais que fecham a comanda sozinhos quando o total é pago — com estorno de pagamento parcial pelo gerente.

**Architecture:** Regras de dinheiro puras em `lib/comanda/bill.ts` (centavos inteiros); o serviço `lib/comanda/bill-service.ts` lê a conta (itens, taxa, pagamentos do caixa ligados à comanda) e grava pagamentos/estornos dentro de uma transação com a trava da comanda (`lockComanda`, etapa 1) e a trava do turno (`resolveSaleShift`, caixa). Rotas finas em `app/api/comanda/sessions/[id]/{bill,payments,pre-bill}`. A tela `components/vender/conta-dialog.tsx` substitui o diálogo provisório `close-bill-dialog.tsx` da etapa 1.

**Tech Stack:** Next.js 14 App Router, Prisma/Postgres, Tailwind, shadcn/ui, sonner, Jest (`jest.unit.config.js`, `jest.integration.config.js`).

**Spec:** `docs/superpowers/specs/2026-10-07-tela-vender-design.md` (4.3, 4.5, 5 etapa 2, 6 etapa 2, 7, 9, 10 etapa 2). Etapa 1: `docs/superpowers/plans/2026-10-07-tela-vender-etapa-1.md` (em produção).

## Global Constraints

- Repositório `C:\Users\andre\gastrux-fix-delivery`, branch `fix/delivery-public`; publicar com `git fetch -q https://github.com/andreyluis2003/Gastrux.git main && git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main`. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Interface em português do Brasil; código e comentários em inglês, comentário explica o porquê.
- **Esta etapa tem migração** (`20261008120000_bill_service_charge`): o dono roda `npx prisma migrate deploy` no Console de cada serviço **depois** que o deploy terminar.
- Dinheiro em **centavos inteiros**. Taxa: `Math.round(subtotal * percent / 100)`.
- `Restaurant.serviceChargePercent` padrão **10**; **0 desliga** e esconde a linha; aceita inteiros de **0 a 30**.
- Taxa **só para mesa e comanda por nome**; balcão e delivery **nunca** (balcão fecha pela venda rápida, que não passa pela Conta).
- Taxa **fora da NFC-e** e **fora da comissão** (os dois já calculam só sobre os itens; não mudar).
- Dividir igualmente: **2 a 20** pessoas; o último absorve o centavo que sobra.
- Receber exige **caixa aberto** e **internet** (pagamento nunca vai para a fila offline: `queueable: false`).
- Estorno de pagamento parcial: **gerente**, motivo com **3+ caracteres**, lançamento `REFUND` no turno aberto, auditoria.
- Toda escrita de pagamento roda com `lockComanda(tx, sessionId)` (de `lib/comanda/add-item.ts`) para dois aparelhos nunca pagarem o mesmo "falta" duas vezes.
- Testes: unitários `npx jest --config jest.unit.config.js <arquivo>`; integração com banco de teste (`npm run test:db:start`), **uma suíte por vez** (pouca memória). Banco de teste precisa de `DATABASE_URL` e `DIRECT_URL` do `.env.test` para `prisma migrate deploy`.

## Review Focus

1. **Dois aparelhos recebem o mesmo "falta" ao mesmo tempo** → só um é aceito; nunca fica pago a mais. Teste na Task 4 (`two devices pay the remainder at once`).
2. **Cartão/PIX acima do que falta** → recusado com mensagem; **dinheiro acima** → troco. Teste na Task 2 (`settlePartial`) e Task 4.
3. **Tirar a taxa depois de pagamentos parciais que já passam do novo total** → recusado com mensagem clara (estornar antes). Teste na Task 3.
4. **Dividir R$ 100,00 por 3** → 33,33 + 33,33 + 33,34 (soma exata). Teste na Task 2.
5. **Fechamento antigo (`PUT ... status CLOSED`, da fila offline) numa comanda que já tem pagamento parcial** → recusado (422), nunca cobra de novo o total. Teste na Task 4.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261008120000_bill_service_charge/migration.sql` | `Restaurant.serviceChargePercent`; `OrderSession.serviceChargeCents`, `serviceChargeWaived`, `preBillPrintedAt` |
| `lib/comanda/bill.ts` (novo) | Regras puras: taxa, total, pago líquido, dividir igual, parte por itens, liquidação parcial |
| `lib/comanda/bill-service.ts` (novo) | `loadBill`, `setServiceWaived`, `recordBillPayment`, `refundBillPayment`, `markPreBill` |
| `app/api/comanda/sessions/[id]/bill/route.ts` (novo) | `GET` conta, `PATCH` taxa sim/não |
| `app/api/comanda/sessions/[id]/payments/route.ts` (novo) | `POST` pagamento parcial (fecha quando quita) |
| `app/api/comanda/sessions/[id]/payments/[entryId]/refund/route.ts` (novo) | `POST` estorno (gerente) |
| `app/api/comanda/sessions/[id]/pre-bill/route.ts` (novo) | `POST` marca pré-conta |
| `app/api/comanda/sessions/[id]/route.ts` | Fechamento antigo: taxa opcional, recusa com pagamento parcial |
| `lib/comanda/add-item.ts`, `app/api/public/orders/[qrToken]/route.ts` | Item novo limpa a pré-conta |
| `lib/vender/salao.ts`, `components/vender/salao-grid.tsx` | Mesa amarela (pediu a conta) |
| `lib/print/tickets.ts`, `app/imprimir/cupom/[sessionId]/page.tsx`, `app/imprimir/pre-conta/[sessionId]/page.tsx` (novo) | Taxa no cupom; página da pré-conta |
| `app/api/admin/restaurant/settings/route.ts`, `app/admin/settings/page.tsx` | Percentual da taxa |
| `components/vender/conta-dialog.tsx` (novo), `app/vender/[sessionId]/page.tsx`; remove `components/vender/close-bill-dialog.tsx` | A tela Conta |
| `public/manifest.json`, `app/conta/trocar-senha/page.tsx`, `components/vender/menu-panel.tsx`, `lib/comanda/add-item.ts` | Ajustes adiados da etapa 1 (Task 9) |

---

### Task 1: Migração da taxa e da pré-conta

**Files:**
- Modify: `prisma/schema.prisma` (models `Restaurant`, `OrderSession`)
- Create: `prisma/migrations/20261008120000_bill_service_charge/migration.sql`

**Interfaces:**
- Produces: `Restaurant.serviceChargePercent: Int @default(10)`; `OrderSession.serviceChargeCents: Int @default(0)`, `OrderSession.serviceChargeWaived: Boolean @default(false)`, `OrderSession.preBillPrintedAt: DateTime?`.

> `serviceChargeWaived` não está na seção 5 da spec: é preciso para que todos os aparelhos, a pré-conta e o total "falta" concordem enquanto a conta está aberta (a spec só grava `serviceChargeCents` ao fechar). Registrar como Ruling no ledger.

- [ ] **Step 1: Schema**

In `model Restaurant`, after `commissionPayPeriod`:
```prisma
  /// Service charge suggested on the bill (tables and named comandas); 0 turns it off (spec 2026-10-07, 4.3)
  serviceChargePercent Int @default(10)
```
In `model OrderSession`, after `notes`:
```prisma
  /// Service charge charged, written when the bill closes (0 = not charged)
  serviceChargeCents  Int       @default(0)
  /// The customer declined the service charge (every device and the pre-bill agree while the bill is open)
  serviceChargeWaived Boolean   @default(false)
  /// Pre-bill printed: the table "asked for the bill"; cleared when a new item is added
  preBillPrintedAt    DateTime?
```

- [ ] **Step 2: Migration SQL**

```sql
-- Bill (tela Vender, etapa 2): service charge and pre-bill
ALTER TABLE "restaurants" ADD COLUMN "serviceChargePercent" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "order_sessions" ADD COLUMN "serviceChargeCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "order_sessions" ADD COLUMN "serviceChargeWaived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "order_sessions" ADD COLUMN "preBillPrintedAt" TIMESTAMP(3);
```
Check the table names first: `grep -n '@@map("restaurants")\|@@map("order_sessions")' prisma/schema.prisma` (use the names found).

- [ ] **Step 3: Apply to the test DB and check drift**

```bash
U=$(grep -h "^DATABASE_URL" .env.test | head -1 | cut -d= -f2- | tr -d '"'); export DATABASE_URL="$U" DIRECT_URL="$U"
npm run test:db:start; npx prisma migrate deploy; npx prisma migrate diff --from-url "$U" --to-schema-datamodel prisma/schema.prisma --script; npx prisma generate
```
Expected: `Applying migration 20261008120000_bill_service_charge`; the diff prints `-- This is an empty migration.`

- [ ] **Step 4: Type check and commit**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
```bash
git add prisma/schema.prisma prisma/migrations/20261008120000_bill_service_charge
git commit -m "Bill: service charge percent, charged amount, waived flag and pre-bill time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Regras puras da conta

**Files:**
- Create: `lib/comanda/bill.ts`
- Test: `__tests__/unit/bill-rules.test.ts`

**Interfaces:**
- Consumes: `entryEffect`, `parseAmountCents`, `CashRuleError`, `PaymentInput`, `SettledPayment` (`lib/caixa/rules.ts`); `CASH_METHODS`, `emptyByMethod`, `toCashMethod`, `CashMethod` (`lib/caixa/payment-methods.ts`).
- Produces:
  - `serviceApplies(s: { tableId?: string | null; tableNumber?: number | null; customerName?: string | null }): boolean`
  - `billTotals(subtotalCents: number, percent: number, opts: { applies: boolean; waived: boolean }): { subtotalCents: number; serviceCents: number; totalCents: number }`
  - `paidNetCents(entries: Array<{ type: string; method: string; amountCents: number; direction?: 'IN' | 'OUT' | null }>): number`
  - `splitEqually(totalCents: number, people: number): number[]`
  - `shareForItems(selectedCents: number, subtotalCents: number, serviceCents: number): number`
  - `settlePartial(remainingCents: number, payments: PaymentInput[]): SettledPayment`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/unit/bill-rules.test.ts
import { billTotals, paidNetCents, serviceApplies, settlePartial, shareForItems, splitEqually } from '../../lib/comanda/bill';

describe('service charge', () => {
  it('tables and named comandas only', () => {
    expect(serviceApplies({ tableId: 't1' })).toBe(true);
    expect(serviceApplies({ tableNumber: 4 })).toBe(true);
    expect(serviceApplies({ customerName: 'João' })).toBe(true);
    expect(serviceApplies({})).toBe(false);
  });
  it('10% rounded to the cent; waived, off (0%) or not applicable = no charge', () => {
    expect(billTotals(23_995, 10, { applies: true, waived: false })).toEqual({ subtotalCents: 23_995, serviceCents: 2_400, totalCents: 26_395 });
    expect(billTotals(23_995, 10, { applies: true, waived: true }).serviceCents).toBe(0);
    expect(billTotals(23_995, 0, { applies: true, waived: false }).serviceCents).toBe(0);
    expect(billTotals(23_995, 10, { applies: false, waived: false }).serviceCents).toBe(0);
  });
});

describe('paid so far', () => {
  it('receipts minus change minus refunds', () => {
    expect(paidNetCents([
      { type: 'RECEIPT', method: 'CASH', amountCents: 5_000 },
      { type: 'CHANGE', method: 'CASH', amountCents: 380 },
      { type: 'RECEIPT', method: 'PIX', amountCents: 2_000 },
      { type: 'REFUND', method: 'PIX', amountCents: 2_000 },
    ])).toBe(4_620);
  });
});

describe('split', () => {
  it('equally: the last one takes the leftover cent', () => {
    expect(splitEqually(10_000, 3)).toEqual([3_333, 3_333, 3_334]);
    expect(splitEqually(10_000, 3).reduce((a, b) => a + b, 0)).toBe(10_000);
  });
  it('2 to 20 people only', () => {
    expect(() => splitEqually(10_000, 1)).toThrow();
    expect(() => splitEqually(10_000, 21)).toThrow();
  });
  it('by item: the items plus their share of the service charge', () => {
    expect(shareForItems(5_800, 23_000, 2_300)).toBe(6_380);
    expect(shareForItems(5_800, 23_000, 0)).toBe(5_800);
  });
});

describe('settlePartial: one payment towards what is left', () => {
  it('a part of what is left is fine', () => {
    const s = settlePartial(10_000, [{ method: 'pix', amount: '40,00' }]);
    expect(s.paidCents).toBe(4_000);
    expect(s.changeCents).toBe(0);
  });
  it('cash over what is left gives change; card or PIX over it is refused', () => {
    expect(settlePartial(4_620, [{ method: 'dinheiro', amount: '50,00' }]).changeCents).toBe(380);
    expect(() => settlePartial(4_620, [{ method: 'pix', amount: '50,00' }])).toThrow('não podem passar do que falta');
  });
  it('nothing left to pay, or no amount, is refused', () => {
    expect(() => settlePartial(0, [{ method: 'pix', amount: '1,00' }])).toThrow('já está paga');
    expect(() => settlePartial(1_000, [])).toThrow('Informe as formas de pagamento');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/bill-rules.test.ts`
Expected: FAIL with "Cannot find module '../../lib/comanda/bill'"

- [ ] **Step 3: Implement**

```ts
// lib/comanda/bill.ts
import { CASH_METHODS, emptyByMethod, toCashMethod, type CashMethod } from '@/lib/caixa/payment-methods';
import { CashRuleError, entryEffect, parseAmountCents, type PaymentInput, type SettledPayment } from '@/lib/caixa/rules';

/**
 * Money rules of the bill (spec 2026-10-07, 4.3), pure and in integer cents.
 */

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');

/** Service charge only for tables and named comandas: the counter and delivery never have it */
export function serviceApplies(s: { tableId?: string | null; tableNumber?: number | null; customerName?: string | null }): boolean {
  return !!(s.tableId || s.tableNumber || s.customerName);
}

export function billTotals(subtotalCents: number, percent: number, opts: { applies: boolean; waived: boolean }) {
  const serviceCents = opts.applies && !opts.waived && percent > 0 ? Math.round((subtotalCents * percent) / 100) : 0;
  return { subtotalCents, serviceCents, totalCents: subtotalCents + serviceCents };
}

/** What the cash register holds for this bill: receipts, minus change given back, minus refunds */
export function paidNetCents(entries: Array<{ type: string; method: string; amountCents: number; direction?: 'IN' | 'OUT' | null }>): number {
  return entries.reduce((sum, e) => sum + entryEffect(e as any), 0);
}

export function splitEqually(totalCents: number, people: number): number[] {
  if (!Number.isInteger(people) || people < 2 || people > 20) throw new CashRuleError('Divida entre 2 e 20 pessoas');
  const base = Math.floor(totalCents / people);
  return Array.from({ length: people }, (_, i) => (i === people - 1 ? totalCents - base * (people - 1) : base));
}

/** One person's part when splitting by item: their items plus the same share of the service charge */
export function shareForItems(selectedCents: number, subtotalCents: number, serviceCents: number): number {
  if (subtotalCents <= 0) return selectedCents;
  return selectedCents + Math.round((serviceCents * selectedCents) / subtotalCents);
}

/**
 * One payment towards what is left (spec 4.3): it may be a part; only cash may go over what is left,
 * and the excess is the change. Card, PIX and others never go over (nothing to give back).
 */
export function settlePartial(remainingCents: number, payments: PaymentInput[]): SettledPayment {
  if (remainingCents <= 0) throw new CashRuleError('Esta conta já está paga', 422, 'ALREADY_PAID');
  if (!Array.isArray(payments) || payments.length === 0) throw new CashRuleError('Informe as formas de pagamento');
  const receipts = emptyByMethod();
  for (const [i, p] of payments.entries()) {
    const method = toCashMethod(p?.method);
    if (!method) throw new CashRuleError(`Pagamento ${i + 1}: forma de pagamento inválida`);
    receipts[method] += parseAmountCents(p?.amount, `Pagamento ${i + 1}`);
  }
  const paidCents = CASH_METHODS.reduce((sum, m) => sum + receipts[m], 0);
  const nonCash = paidCents - receipts.CASH;
  if (nonCash > remainingCents) {
    throw new CashRuleError(`Cartão, PIX e outros não podem passar do que falta (${brl(remainingCents)}): troco só em dinheiro`);
  }
  const changeCents = Math.max(0, paidCents - remainingCents);
  const primaryMethod = CASH_METHODS.reduce((best, m) => (receipts[m] > receipts[best] ? m : best), 'CASH' as CashMethod);
  return { receipts, changeCents, paidCents, primaryMethod };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/bill-rules.test.ts`
Expected: PASS (9 tests). If `toCashMethod('dinheiro')` returns null, read `lib/caixa/payment-methods.ts` `toCashMethod` for the accepted spellings and use those in the test (the payment panel sends `dinheiro`, `pix`, `cartao de credito`, `cartao de debito`).

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/bill.ts __tests__/unit/bill-rules.test.ts
git commit -m "Bill: pure rules (service charge, paid so far, split, partial payment)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ler a conta e tirar/pôr a taxa

**Files:**
- Create: `lib/comanda/bill-service.ts`, `app/api/comanda/sessions/[id]/bill/route.ts`
- Test: `__tests__/integration/vender/bill.test.ts`

**Interfaces:**
- Consumes: Task 2 functions; `lockComanda` (`lib/comanda/add-item.ts`); `lineTotalCents` (`lib/comanda/line-total.ts`); `requireRestaurantRole`, `recordAudit`, `type RestaurantMember` (`lib/auth/restaurant-role.ts`); `CashRuleError`.
- Produces:
  - `interface BillPayment { id: string; method: string; amountCents: number; changeCents: number; createdAt: string; refunded: boolean }`
  - `interface Bill { sessionId: string; status: string; label: string; items: Array<{ id: string; name: string; quantity: number; totalCents: number }>; percent: number; applies: boolean; waived: boolean; subtotalCents: number; serviceCents: number; totalCents: number; paidCents: number; remainingCents: number; payments: BillPayment[]; preBillPrintedAt: string | null; customerName: string | null }`
  - `loadBill(db: Prisma.TransactionClient | typeof prisma, restaurantId: string, sessionId: string): Promise<Bill | null>`
  - `setServiceWaived(member: RestaurantMember, sessionId: string, waived: boolean): Promise<Bill>` (throws `CashRuleError`)
  - `REFUND_TAG(entryId: string): string` = `` `Estorno de pagamento parcial (${entryId})` ``
  - `GET /api/comanda/sessions/[id]/bill` → `Bill`; `PATCH` `{ serviceChargeWaived: boolean }` → `Bill`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/bill.test.ts
// @ts-nocheck
/** The bill (spec 2026-10-07, 4.3): totals with service charge, payments so far, waiving the charge */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET, PATCH } from '../../../app/api/comanda/sessions/[id]/bill/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('the bill', () => {
  let rid: string, otherRid: string, ownerId: string, sid: string, shiftId: string, recipeId: string;
  const get = async (id = sid) => GET(new NextRequest('http://x'), { params: { id } });
  const patch = (body: any) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: { id: sid } });

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `conta-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Conta ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `C${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 58 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    const table = await prisma.table.create({ data: { restaurantId: rid, number: 7, sectionId: sec.id, capacity: 4, qrToken: `c${tag}` } });
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: table.id, status: 'OPEN' } })).id;
    await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId, price: 58, quantity: 2 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const session = { user: { id: ownerId, email: `conta-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('shows subtotal, 10% service charge, total and what is left', async () => {
    const bill = await (await get()).json();
    expect(bill).toMatchObject({ label: 'Mesa 7', percent: 10, applies: true, waived: false, subtotalCents: 11_600, serviceCents: 1_160, totalCents: 12_760, paidCents: 0, remainingCents: 12_760 });
    expect(bill.items).toEqual([expect.objectContaining({ name: 'Pizza', quantity: 2, totalCents: 11_600 })]);
  });

  it('a payment already made is listed and counted', async () => {
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'PIX', amountCents: 6_000, orderSessionId: sid, createdById: ownerId } });
    const bill = await (await get()).json();
    expect(bill.paidCents).toBe(6_000);
    expect(bill.remainingCents).toBe(6_760);
    expect(bill.payments).toEqual([expect.objectContaining({ method: 'PIX', amountCents: 6_000, changeCents: 0, refunded: false })]);
  });

  it('the customer declines the charge: every device sees it; it comes back when asked', async () => {
    expect((await patch({ serviceChargeWaived: true })).status).toBe(200);
    expect(await (await get()).json()).toMatchObject({ waived: true, serviceCents: 0, totalCents: 11_600, remainingCents: 5_600 });
    expect((await patch({ serviceChargeWaived: false })).status).toBe(200);
  });

  it('declining the charge when more than the new total is already paid is refused', async () => {
    await prisma.cashSessionEntry.create({ data: { restaurantId: rid, cashSessionId: shiftId, type: 'RECEIPT', method: 'PIX', amountCents: 6_000, orderSessionId: sid, createdById: ownerId } });
    const res = await patch({ serviceChargeWaived: true });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('estorne');
  });

  it('another restaurant\'s comanda is not found', async () => {
    const foreign = await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: ownerId, customerName: 'X', status: 'OPEN' } });
    expect((await get(foreign.id)).status).toBe(404);
  });
});
```

Check the cash models' required fields before running: `awk '/^model CashRegister \{/,/^\}/' prisma/schema.prisma` and `awk '/^model CashSession \{/,/^\}/' prisma/schema.prisma`; adjust the two `create` calls to the real required fields (e.g. `openingFloatCents`).

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/bill'`
Expected: FAIL with "Cannot find module '../../../app/api/comanda/sessions/[id]/bill/route'"

- [ ] **Step 3: Implement `lib/comanda/bill-service.ts` (read + waive) and the route**

```ts
// lib/comanda/bill-service.ts
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { lockComanda } from '@/lib/comanda/add-item';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { billTotals, paidNetCents, serviceApplies } from './bill';

/**
 * The bill of a comanda (spec 2026-10-07, 4.3): items, service charge, what the cash register already
 * holds for it, what is left. Payments are the cash entries linked to the comanda (lib/caixa).
 */

type Db = Prisma.TransactionClient | typeof prisma;

export interface BillPayment { id: string; method: string; amountCents: number; changeCents: number; createdAt: string; refunded: boolean }
export interface Bill {
  sessionId: string;
  status: string;
  label: string;
  items: Array<{ id: string; name: string; quantity: number; totalCents: number }>;
  percent: number;
  applies: boolean;
  waived: boolean;
  subtotalCents: number;
  serviceCents: number;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  payments: BillPayment[];
  preBillPrintedAt: string | null;
  customerName: string | null;
}

/** The description of a partial refund, also how a payment is known to be refunded already */
export const REFUND_TAG = (entryId: string) => `Estorno de pagamento parcial (${entryId})`;

export async function loadBill(db: Db, restaurantId: string, sessionId: string): Promise<Bill | null> {
  const s = await db.orderSession.findFirst({
    where: { id: sessionId, restaurantId },
    select: {
      id: true, status: true, tableId: true, tableNumber: true, customerName: true, serviceChargeCents: true, serviceChargeWaived: true, preBillPrintedAt: true,
      table: { select: { number: true } },
      restaurant: { select: { serviceChargePercent: true } },
      items: {
        select: { id: true, quantity: true, price: true, recipe: { select: { name: true } }, modifiers: { select: { priceAdjustment: true } } },
        orderBy: { addedAt: 'asc' },
      },
    },
  });
  if (!s) return null;
  const entries = await db.cashSessionEntry.findMany({
    where: { orderSessionId: sessionId, restaurantId },
    select: { id: true, type: true, method: true, amountCents: true, direction: true, description: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const items = s.items.map((i) => ({
    id: i.id,
    name: i.recipe?.name ?? 'Item',
    quantity: i.quantity,
    totalCents: lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)),
  }));
  const subtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
  const applies = serviceApplies(s);
  const percent = s.restaurant.serviceChargePercent;
  // A closed bill keeps the charge it was closed with; an open one follows the current choice
  const totals = s.status === 'CLOSED'
    ? { subtotalCents, serviceCents: s.serviceChargeCents, totalCents: subtotalCents + s.serviceChargeCents }
    : billTotals(subtotalCents, percent, { applies, waived: s.serviceChargeWaived });
  const paidCents = paidNetCents(entries);

  const refunds = entries.filter((e) => e.type === 'REFUND').map((e) => e.description ?? '');
  const payments: BillPayment[] = entries
    .filter((e) => e.type === 'RECEIPT')
    .map((e) => ({
      id: e.id,
      method: e.method,
      amountCents: e.amountCents,
      // Change given back in the same payment (same transaction time, cash)
      changeCents: entries.filter((c) => c.type === 'CHANGE' && c.createdAt.getTime() === e.createdAt.getTime()).reduce((n, c) => n + c.amountCents, 0),
      createdAt: e.createdAt.toISOString(),
      refunded: refunds.some((d) => d.startsWith(REFUND_TAG(e.id))),
    }));

  return {
    sessionId: s.id,
    status: s.status,
    label: s.table?.number ? `Mesa ${s.table.number}` : s.tableNumber ? `Mesa ${s.tableNumber}` : s.customerName || 'Balcão',
    items,
    percent,
    applies,
    waived: s.serviceChargeWaived,
    ...totals,
    paidCents,
    remainingCents: Math.max(0, totals.totalCents - paidCents),
    payments,
    preBillPrintedAt: s.preBillPrintedAt?.toISOString() ?? null,
    customerName: s.customerName,
  };
}

/** The customer declines (or accepts again) the service charge, for every device (spec 4.3) */
export async function setServiceWaived(member: RestaurantMember, sessionId: string, waived: boolean): Promise<Bill> {
  return prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const bill = await loadBill(tx, member.restaurantId, sessionId);
    if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
    if (bill.status === 'CLOSED' || bill.status === 'CANCELLED') throw new CashRuleError('Comanda fechada ou cancelada', 409);
    if (waived && bill.paidCents > bill.subtotalCents) {
      throw new CashRuleError('Já foi pago mais do que o total sem a taxa: estorne um pagamento antes de tirar a taxa', 409);
    }
    await tx.orderSession.update({ where: { id: sessionId }, data: { serviceChargeWaived: waived } });
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sessionId, changes: { serviceChargeWaived: waived } });
    return (await loadBill(tx, member.restaurantId, sessionId))!;
  });
}
```

```ts
// app/api/comanda/sessions/[id]/bill/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { loadBill, setServiceWaived } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

const FRONT = ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'] as const;

/** GET: the bill (items, service charge, payments, what is left) */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...FRONT]);
  if (!auth.ok) return auth.response;
  const bill = await loadBill(prisma, auth.member.restaurantId, params.id);
  if (!bill) return NextResponse.json({ error: 'Comanda não encontrada' }, { status: 404 });
  return NextResponse.json(bill, { headers: { 'Cache-Control': 'private, no-store' } });
}

/** PATCH { serviceChargeWaived }: the customer declines or accepts the service charge */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole([...FRONT]);
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  if (typeof body?.serviceChargeWaived !== 'boolean') return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  try {
    return NextResponse.json(await setServiceWaived(auth.member, params.id, body.serviceChargeWaived));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/bill'`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/bill-service.ts "app/api/comanda/sessions/[id]/bill/route.ts" __tests__/integration/vender/bill.test.ts
git commit -m "Bill: read the bill (service charge, payments, what is left) and waive the charge

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pagamento parcial que fecha a conta

**Files:**
- Modify: `lib/comanda/bill-service.ts` (add `recordBillPayment`)
- Create: `app/api/comanda/sessions/[id]/payments/route.ts`
- Modify: `app/api/comanda/sessions/[id]/route.ts` (legacy close)
- Test: `__tests__/integration/vender/bill-payments.test.ts`

**Interfaces:**
- Consumes: `loadBill`, `settlePartial`, `lockComanda`, `resolveSaleShift`, `recordSaleEntries`, `SaleTarget` (`lib/caixa/sale.ts`), `toNfcePaymentMethod` (`lib/caixa/payment-methods.ts`), `autoEmitNFCe` (`lib/nfe/emit-session.ts`), `CASHIER_PLUS` (`lib/caixa/roles.ts`).
- Produces:
  - `recordBillPayment(member: RestaurantMember, sessionId: string, input: { payments: PaymentInput[]; cashSessionId?: string | null; customerCPF?: string | null }): Promise<{ bill: Bill; changeCents: number; closed: boolean; nfce: unknown }>` (throws `CashRuleError`)
  - `POST /api/comanda/sessions/[id]/payments` `{ payments: [{ method, amount }], cashSessionId, customerCPF? }` → `{ bill, changeCents, closed, nfce }`; errors `{ error, code? }` with 400/409/422.
  - Legacy `PUT /api/comanda/sessions/[id]` `{ status: 'CLOSED', payments, serviceCharge?: boolean }` adds the charge when `serviceCharge === true`; refuses with **422 `PARTIAL_PAYMENTS`** if the comanda already has cash entries.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/bill-payments.test.ts
// @ts-nocheck
/** Partial payments (spec 2026-10-07, 4.3): each person pays a part; the bill closes itself when paid */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { PUT as CLOSE_LEGACY } from '../../../app/api/comanda/sessions/[id]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('partial payments', () => {
  let rid: string, ownerId: string, shiftId: string, recipeId: string, tableId: string;
  const pay = (sid: string, payments: any[], extra: any = {}) =>
    PAY(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ payments, cashSessionId: shiftId, ...extra }) }), { params: { id: sid } });
  const newBill = async (qty = 2) => {
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId, status: 'OPEN' } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId, price: 50, quantity: qty } });
    return s.id; // subtotal 100,00 x qty/2, +10%
  };

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `pag-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Pag ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    recipeId = (await prisma.recipe.create({ data: { restaurantId: rid, code: `P${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 5, sectionId: sec.id, capacity: 4, qrToken: `p${tag}` } })).id;
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
    const session = { user: { id: ownerId, email: `pag-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('two people pay their half; the second one closes the bill with the service charge recorded', async () => {
    const sid = await newBill(); // 100,00 + 10,00
    const first = await (await pay(sid, [{ method: 'pix', amount: '55,00' }])).json();
    expect(first).toMatchObject({ closed: false, bill: { paidCents: 5_500, remainingCents: 5_500 } });
    const second = await (await pay(sid, [{ method: 'dinheiro', amount: '60,00' }])).json();
    expect(second).toMatchObject({ closed: true, changeCents: 500, bill: { status: 'CLOSED', paidCents: 11_000, remainingCents: 0 } });
    const s = await prisma.orderSession.findUnique({ where: { id: sid } });
    expect(s).toMatchObject({ status: 'CLOSED', serviceChargeCents: 1_000 });
  });

  it('card or PIX over what is left is refused; a closed bill takes no more payments', async () => {
    const sid = await newBill();
    expect((await pay(sid, [{ method: 'pix', amount: '200,00' }])).status).toBe(400);
    await pay(sid, [{ method: 'pix', amount: '110,00' }]);
    const again = await pay(sid, [{ method: 'pix', amount: '1,00' }]);
    expect(again.status).toBe(422);
  });

  it('two devices pay the remainder at once: only one is accepted', async () => {
    const sid = await newBill();
    const res = await Promise.all([pay(sid, [{ method: 'pix', amount: '110,00' }]), pay(sid, [{ method: 'pix', amount: '110,00' }])]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 422]);
    const paid = await prisma.cashSessionEntry.aggregate({ where: { orderSessionId: sid, type: 'RECEIPT' }, _sum: { amountCents: true } });
    expect(paid._sum.amountCents).toBe(11_000);
  });

  it('without an open cash shift nothing is received', async () => {
    const sid = await newBill();
    const res = await PAY(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ payments: [{ method: 'pix', amount: '10,00' }] }) }), { params: { id: sid } });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('CASH_SESSION_REQUIRED');
  });

  it('the old close (offline queue) charges the service only when asked, and never over partial payments', async () => {
    const plain = await newBill();
    const r1 = await CLOSE_LEGACY(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status: 'CLOSED', cashSessionId: shiftId, payments: [{ method: 'pix', amount: '110,00' }], serviceCharge: true }) }), { params: { id: plain } });
    expect(r1.status).toBe(200);
    expect((await prisma.orderSession.findUnique({ where: { id: plain } })).serviceChargeCents).toBe(1_000);

    const partial = await newBill();
    await pay(partial, [{ method: 'pix', amount: '10,00' }]);
    const r2 = await CLOSE_LEGACY(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify({ status: 'CLOSED', cashSessionId: shiftId, payments: [{ method: 'pix', amount: '100,00' }] }) }), { params: { id: partial } });
    expect(r2.status).toBe(422);
    expect((await r2.json()).code).toBe('PARTIAL_PAYMENTS');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/bill-payments'`
Expected: FAIL with "Cannot find module '../../../app/api/comanda/sessions/[id]/payments/route'"

- [ ] **Step 3: Implement**

Append to `lib/comanda/bill-service.ts`:

```ts
import { recordSaleEntries, resolveSaleShift } from '@/lib/caixa/sale';
import { CASH_METHODS, toNfcePaymentMethod, type CashMethod } from '@/lib/caixa/payment-methods';
import type { PaymentInput } from '@/lib/caixa/rules';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { settlePartial } from './bill';

/**
 * One payment towards the bill (spec 4.3): recorded at once in the open shift, linked to the comanda.
 * When what was paid reaches the total, the bill closes in the same transaction (status, service charge
 * written, table free) and the NFC-e is issued afterwards if the restaurant turned it on. Under the
 * comanda lock: two devices paying the same remainder at once never both get in.
 */
export async function recordBillPayment(
  member: RestaurantMember,
  sessionId: string,
  input: { payments: PaymentInput[]; cashSessionId?: string | null; customerCPF?: string | null },
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const bill = await loadBill(tx, member.restaurantId, sessionId);
    if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
    if (bill.status === 'CANCELLED') throw new CashRuleError('Comanda cancelada', 409);
    if (bill.status === 'CLOSED') throw new CashRuleError('Esta conta já foi fechada', 422, 'ALREADY_CLOSED');
    const settled = settlePartial(bill.remainingCents, input.payments);
    const target = await resolveSaleShift(tx, { restaurantId: member.restaurantId, cashSessionId: input.cashSessionId, replay: false, legacy: false });
    await recordSaleEntries(tx, { restaurantId: member.restaurantId, target: target!, orderSessionId: sessionId, settled, createdById: member.userId });
    const paidNow = settled.paidCents - settled.changeCents;
    const closed = bill.paidCents + paidNow >= bill.totalCents;
    if (closed) {
      const guard = await tx.orderSession.updateMany({
        where: { id: sessionId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: bill.serviceCents },
      });
      if (guard.count === 0) throw new CashRuleError('Esta conta já foi fechada', 422, 'ALREADY_CLOSED');
    }
    return { closed, changeCents: settled.changeCents, customerName: bill.customerName };
  });

  let nfce: unknown = null;
  if (result.closed) {
    // The method that paid the most goes on the note (same rule as the old close)
    const entries = await prisma.cashSessionEntry.findMany({ where: { orderSessionId: sessionId, restaurantId: member.restaurantId, type: 'RECEIPT' }, select: { method: true, amountCents: true } });
    const byMethod = new Map<CashMethod, number>();
    for (const e of entries) byMethod.set(e.method as CashMethod, (byMethod.get(e.method as CashMethod) ?? 0) + e.amountCents);
    const primary = CASH_METHODS.reduce((best, m) => ((byMethod.get(m) ?? 0) > (byMethod.get(best) ?? 0) ? m : best), 'CASH' as CashMethod);
    nfce = await autoEmitNFCe({
      restaurantId: member.restaurantId,
      orderSessionId: sessionId,
      customerCPF: input.customerCPF ? String(input.customerCPF).replace(/\D/g, '') || undefined : undefined,
      customerName: result.customerName ?? undefined,
      paymentMethod: toNfcePaymentMethod(primary),
      onlyIfEnabled: true,
    });
  }
  const bill = (await loadBill(prisma, member.restaurantId, sessionId))!;
  return { bill, changeCents: result.changeCents, closed: result.closed, nfce };
}
```

(Move the new imports to the top of the file with the others.)

```ts
// app/api/comanda/sessions/[id]/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CASHIER_PLUS } from '@/lib/caixa/roles';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordBillPayment } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/**
 * POST { payments: [{ method, amount }], cashSessionId, customerCPF? }: one payment towards the bill;
 * closes it when paid (spec 2026-10-07, 4.3). Needs the internet: never queued offline.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(CASHIER_PLUS, 'Receber exige o caixa');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await recordBillPayment(auth.member, params.id, {
      payments: body?.payments,
      cashSessionId: body?.cashSessionId ?? null,
      customerCPF: body?.customerCPF ?? null,
    }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
```

Legacy close in `app/api/comanda/sessions/[id]/route.ts`, inside `if (closing) {` in the transaction, replace `const total = await comandaTotalCents(tx, params.id);` with:

```ts
          // The bill screen pays in parts (POST .../payments); an old close from a device queue must
          // never charge the whole total again over those parts (spec 2026-10-07, 4.3)
          const partial = await tx.cashSessionEntry.count({ where: { orderSessionId: params.id, restaurantId } });
          if (partial > 0) throw new CashRuleError('Esta conta já tem pagamentos: feche pela tela Conta', 422, 'PARTIAL_PAYMENTS');
          const itemsTotal = await comandaTotalCents(tx, params.id);
          const restaurant = await tx.restaurant.findUnique({ where: { id: restaurantId }, select: { serviceChargePercent: true } });
          const sessionRow = await tx.orderSession.findUnique({ where: { id: params.id }, select: { tableId: true, tableNumber: true, customerName: true } });
          const { serviceCents } = billTotals(itemsTotal, restaurant?.serviceChargePercent ?? 0, { applies: serviceApplies(sessionRow ?? {}), waived: body?.serviceCharge !== true });
          const total = itemsTotal + serviceCents;
```
and in the `guard` `updateMany` data add `serviceChargeCents: serviceCents`. Import `billTotals, serviceApplies` from `@/lib/comanda/bill`.

- [ ] **Step 4: Run tests**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/bill-payments'` — Expected: PASS (5 tests).
Then: `npx jest --config jest.integration.config.js --testPathPatterns 'caixa'` — Expected: all PASS (the old close kept its behaviour without `serviceCharge`).

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/bill-service.ts "app/api/comanda/sessions/[id]/payments/route.ts" "app/api/comanda/sessions/[id]/route.ts" __tests__/integration/vender/bill-payments.test.ts
git commit -m "Bill: partial payments that close the bill when paid (service charge recorded)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Estorno de pagamento parcial

**Files:**
- Modify: `lib/comanda/bill-service.ts` (add `refundBillPayment`)
- Create: `app/api/comanda/sessions/[id]/payments/[entryId]/refund/route.ts`
- Test: `__tests__/integration/vender/bill-refund.test.ts`

**Interfaces:**
- Consumes: `loadBill`, `REFUND_TAG`, `lockComanda`, `resolveSaleShift`, `isManager` (`lib/auth/restaurant-role.ts`).
- Produces: `refundBillPayment(member: RestaurantMember, sessionId: string, entryId: string, input: { reason: string; cashSessionId?: string | null }): Promise<Bill>`; `POST /api/comanda/sessions/[id]/payments/[entryId]/refund` `{ reason, cashSessionId }` → `Bill`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/bill-refund.test.ts
// @ts-nocheck
/** Refunding a partial payment (spec 2026-10-07, 4.3): manager, reason, once, net of the change */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PAY } from '../../../app/api/comanda/sessions/[id]/payments/route';
import { POST as REFUND } from '../../../app/api/comanda/sessions/[id]/payments/[entryId]/refund/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('refunding a partial payment', () => {
  let rid: string, ownerId: string, cashierId: string, shiftId: string, sid: string;
  const as = (id: string, email: string) => {
    const s = { user: { id, email }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  };
  const refund = (entryId: string, reason: string) =>
    REFUND(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ reason, cashSessionId: shiftId }) }), { params: { id: sid, entryId } });

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `est-${tag}@gastrux.test`, name: 'Dona', password: 'x', role: 'OWNER' } })).id;
    cashierId = (await prisma.user.create({ data: { email: `cx-${tag}@gastrux.test`, name: 'Caixa', password: 'x', role: 'CASHIER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Est ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    for (const [uid, role] of [[ownerId, 'OWNER'], [cashierId, 'CASHIER']] as const) {
      await prisma.user.update({ where: { id: uid }, data: { currentRestaurantId: rid } });
      await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: uid, role, permissions: [], acceptedAt: new Date() } });
    }
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `E${tag}`, name: 'Prato', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 100 } });
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN' } })).id;
    await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 100, quantity: 1 } });
    const reg = await prisma.cashRegister.create({ data: { restaurantId: rid, name: 'Caixa', isDefault: true } });
    shiftId = (await prisma.cashSession.create({ data: { restaurantId: rid, cashRegisterId: reg.id, openedById: ownerId, openingFloatCents: 0, status: 'OPEN' } })).id;
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    for (const id of [ownerId, cashierId]) { try { await prisma.user.delete({ where: { id } }); } catch {} }
  });

  it('a cashier cannot refund; a manager refunds once, net of the change, and the amount is owed again', async () => {
    as(ownerId, `est-${tag}@gastrux.test`);
    const paid = await (await PAY(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ payments: [{ method: 'dinheiro', amount: '50,00' }], cashSessionId: shiftId }) }), { params: { id: sid } })).json();
    const entryId = paid.bill.payments[0].id;

    as(cashierId, `cx-${tag}@gastrux.test`);
    expect((await refund(entryId, 'lançado errado')).status).toBe(403);

    as(ownerId, `est-${tag}@gastrux.test`);
    expect((await refund(entryId, 'x')).status).toBe(400);
    const ok = await refund(entryId, 'lançado errado');
    expect(ok.status).toBe(200);
    const bill = await ok.json();
    expect(bill.paidCents).toBe(0);
    expect(bill.payments[0].refunded).toBe(true);
    const refundRow = await prisma.cashSessionEntry.findFirst({ where: { orderSessionId: sid, type: 'REFUND' } });
    expect(refundRow).toMatchObject({ method: 'CASH', amountCents: 5_000 });

    expect((await refund(entryId, 'de novo')).status).toBe(422);
  });
});
```

(The comanda is 100,00 + 10% = 110,00, so the 50,00 cash payment has no change and the refund is 50,00. The "net of the change" rule is exercised by `loadBill` reading `changeCents`; the refund amount is `amountCents - changeCents`.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/bill-refund'`
Expected: FAIL with "Cannot find module ... refund/route"

- [ ] **Step 3: Implement**

Append to `lib/comanda/bill-service.ts`:

```ts
/**
 * Gives back one partial payment (a PIX typed by mistake) while the bill is open (spec 4.3): a manager,
 * with a reason; a REFUND line in the open shift for what that payment left in the drawer (what was
 * handed over minus its change); once. A closed bill is reopened instead (the existing manager flow).
 */
export async function refundBillPayment(member: RestaurantMember, sessionId: string, entryId: string, input: { reason: string; cashSessionId?: string | null }): Promise<Bill> {
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3) throw new CashRuleError('Informe o motivo do estorno');
  return prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const bill = await loadBill(tx, member.restaurantId, sessionId);
    if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
    if (bill.status === 'CLOSED') throw new CashRuleError('Conta fechada: para devolver, reabra a conta (gerente)', 409);
    const payment = bill.payments.find((p) => p.id === entryId);
    if (!payment) throw new CashRuleError('Pagamento não encontrado', 404);
    if (payment.refunded) throw new CashRuleError('Este pagamento já foi estornado', 422, 'ALREADY_REFUNDED');
    const target = await resolveSaleShift(tx, { restaurantId: member.restaurantId, cashSessionId: input.cashSessionId, replay: false, legacy: false });
    const amountCents = payment.amountCents - payment.changeCents;
    await tx.cashSessionEntry.create({
      data: {
        restaurantId: member.restaurantId,
        cashSessionId: target!.cashSessionId,
        orderSessionId: sessionId,
        type: 'REFUND',
        method: payment.method as any,
        amountCents,
        description: `${REFUND_TAG(entryId)}: ${reason}`.slice(0, 200),
        createdById: member.userId,
      },
    });
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sessionId, changes: { refundedPayment: entryId, amountCents, reason } });
    return (await loadBill(tx, member.restaurantId, sessionId))!;
  });
}
```

```ts
// app/api/comanda/sessions/[id]/payments/[entryId]/refund/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { MANAGER_ROLES, requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { refundBillPayment } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/** POST { reason, cashSessionId }: refund one partial payment of an open bill (manager) */
export async function POST(req: NextRequest, { params }: { params: { id: string; entryId: string } }) {
  const auth = await requireRestaurantRole(MANAGER_ROLES, 'Estornar um pagamento exige um gerente');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await refundBillPayment(auth.member, params.id, params.entryId, { reason: body?.reason, cashSessionId: body?.cashSessionId ?? null }));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status });
    throw e;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/bill-refund'`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add lib/comanda/bill-service.ts "app/api/comanda/sessions/[id]/payments/[entryId]/refund/route.ts" __tests__/integration/vender/bill-refund.test.ts
git commit -m "Bill: refund a partial payment (manager, reason, once)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Pré-conta, mesa amarela e taxa no cupom

**Files:**
- Modify: `lib/comanda/bill-service.ts` (add `markPreBill`)
- Create: `app/api/comanda/sessions/[id]/pre-bill/route.ts`, `app/imprimir/pre-conta/[sessionId]/page.tsx`
- Modify: `lib/comanda/add-item.ts` (`addComandaItem` and the merge branch of `addOrMergeComandaItem`), `app/api/public/orders/[qrToken]/route.ts`, `lib/vender/salao.ts`, `components/vender/salao-grid.tsx`, `lib/print/tickets.ts`, `app/imprimir/cupom/[sessionId]/page.tsx`
- Test: `__tests__/integration/vender/pre-bill.test.ts`

**Interfaces:**
- Produces:
  - `markPreBill(member: RestaurantMember, sessionId: string): Promise<Bill>`; `POST /api/comanda/sessions/[id]/pre-bill` → `Bill`.
  - `SalaoSession.billRequested: boolean` (true when `preBillPrintedAt` is set).
  - `Receipt.serviceCharge: number` (reais) and `Receipt.grandTotal: number` (`total + serviceCharge`).
  - Page `/imprimir/pre-conta/[sessionId]?people=N&auto=1`.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/pre-bill.test.ts
// @ts-nocheck
/** Pre-bill (spec 2026-10-07, 4.3): marks the table yellow; a new item turns it green again */
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as PRE_BILL } from '../../../app/api/comanda/sessions/[id]/pre-bill/route';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';
import { loadSalao } from '../../../lib/vender/salao';
import { buildReceipt } from '../../../lib/print/tickets';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('pre-bill', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string;

  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `pre-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Pre ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Coca', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca', price: 6, recipeId: recipe.id, position: 0 } })).id;
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 10 } });
    const table = await prisma.table.create({ data: { restaurantId: rid, number: 3, sectionId: sec.id, capacity: 4, qrToken: `pr${tag}` } });
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: table.id, status: 'OPEN' } })).id;
    await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 6, quantity: 2 } });
    const s = { user: { id: ownerId, email: `pre-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('printing the pre-bill turns the table yellow; a new item turns it green again', async () => {
    expect((await PRE_BILL(new NextRequest('http://x', { method: 'POST' }), { params: { id: sid } })).status).toBe(200);
    expect((await loadSalao(rid)).tables[0].session.billRequested).toBe(true);
    await ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ menuItemId, quantity: 1, merge: true }) }), { params: { id: sid } });
    expect((await loadSalao(rid)).tables[0].session.billRequested).toBe(false);
  });

  it('the receipt shows the service charge apart from the items total', async () => {
    await prisma.orderSession.update({ where: { id: sid }, data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: 180 } });
    const r = await buildReceipt(rid, sid);
    expect(r).toMatchObject({ total: 18, serviceCharge: 1.8, grandTotal: 19.8 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/pre-bill'`
Expected: FAIL with "Cannot find module ... pre-bill/route"

- [ ] **Step 3: Implement the server part**

Append to `lib/comanda/bill-service.ts`:
```ts
/** The pre-bill was printed: the table "asked for the bill" (yellow on the map) until a new item comes */
export async function markPreBill(member: RestaurantMember, sessionId: string): Promise<Bill> {
  const updated = await prisma.orderSession.updateMany({
    where: { id: sessionId, restaurantId: member.restaurantId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    data: { preBillPrintedAt: new Date() },
  });
  if (updated.count === 0) throw new CashRuleError('Comanda não encontrada ou já fechada', 404);
  return (await loadBill(prisma, member.restaurantId, sessionId))!;
}
```

```ts
// app/api/comanda/sessions/[id]/pre-bill/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { requireRestaurantRole } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { markPreBill } from '@/lib/comanda/bill-service';

export const dynamic = 'force-dynamic';

/** POST: the pre-bill is being printed (any front-of-house member, the waiter included) */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRestaurantRole(['OWNER', 'MANAGER', 'CASHIER', 'ADMIN']);
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await markPreBill(auth.member, params.id));
  } catch (e) {
    if (e instanceof CashRuleError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
```

In `lib/comanda/add-item.ts`: add a helper and call it after creating a line (in `addComandaItem`, before `return`, keep the created item in a `const`) and after the increment in `addOrMergeComandaItem`:
```ts
/** A new item after the pre-bill: the table is ordering again, not waiting for the bill */
async function clearPreBill(db: Db, sessionId: string) {
  await db.orderSession.updateMany({ where: { id: sessionId, preBillPrintedAt: { not: null } }, data: { preBillPrintedAt: null } });
}
```
In `app/api/public/orders/[qrToken]/route.ts`, after the items loop: `await prisma.orderSession.updateMany({ where: { id: orderSession.id, preBillPrintedAt: { not: null } }, data: { preBillPrintedAt: null } });`

In `lib/vender/salao.ts`: add `billRequested: boolean` to `SalaoSession`, `preBillPrintedAt: true` to the session `select`, and `billRequested: !!s.preBillPrintedAt` in `toSession`.

In `components/vender/salao-grid.tsx` `Tile`: when `session?.billRequested`, use `bg-amber-50 border-amber-400 text-amber-900` and add `<div className="text-xs font-semibold">Pediu a conta</div>`.

In `lib/print/tickets.ts`: add `serviceCharge: number; grandTotal: number;` to `Receipt`; in `buildReceipt` select `serviceChargeCents` (it is a scalar, included by `include`), and return `serviceCharge: session.serviceChargeCents / 100, grandTotal: total + session.serviceChargeCents / 100`.

In `app/imprimir/cupom/[sessionId]/page.tsx`, after the TOTAL row:
```tsx
        {receipt.serviceCharge > 0 && (
          <>
            <div className="row"><span>Taxa de serviço (fora da nota)</span><span>{money(receipt.serviceCharge)}</span></div>
            <div className="row big"><span>TOTAL PAGO</span><span>{money(receipt.grandTotal)}</span></div>
          </>
        )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/pre-bill'` — Expected: PASS (2 tests). Then `--testPathPatterns 'vender/'` — all PASS.

- [ ] **Step 5: The pre-bill print page**

```tsx
// app/imprimir/pre-conta/[sessionId]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { printWhenReady } from '@/lib/print/print-frame';
import { splitEqually } from '@/lib/comanda/bill';
import type { Bill } from '@/lib/comanda/bill-service';
import '../../print.css';

const money = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** The pre-bill in 80 mm (spec 2026-10-07, 4.3): items, subtotal, service charge, total, per person */
export default function PreBillPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [people, setPeople] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setPeople(Number(q.get('people')) || 0);
    fetch(`/api/comanda/sessions/${sessionId}/bill`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar a conta');
        setBill(data);
        if (q.get('auto') === '1') printWhenReady();
      })
      .catch((e) => setError(e.message));
  }, [sessionId]);

  if (error) return <p className="p-4 text-red-700">{error}</p>;
  if (!bill) return <p className="p-4">Carregando...</p>;
  const shares = people >= 2 && people <= 20 ? splitEqually(bill.remainingCents, people) : null;

  return (
    <div className="p-4">
      <div className="print-ticket">
        <h1>{bill.label}</h1>
        <div className="center" style={{ fontWeight: 700 }}>NÃO É DOCUMENTO FISCAL</div>
        <div className="center muted">Pré-conta · {new Date().toLocaleString('pt-BR')}</div>
        <hr />
        {bill.items.map((i) => (
          <div key={i.id} className="row"><span>{i.quantity} x {i.name}</span><span>{money(i.totalCents)}</span></div>
        ))}
        <hr />
        <div className="row"><span>Subtotal</span><span>{money(bill.subtotalCents)}</span></div>
        {bill.serviceCents > 0 && <div className="row"><span>Taxa de serviço ({bill.percent}%)</span><span>{money(bill.serviceCents)}</span></div>}
        <div className="row big"><span>TOTAL</span><span>{money(bill.totalCents)}</span></div>
        {bill.paidCents > 0 && (
          <>
            <div className="row"><span>Já pago</span><span>{money(bill.paidCents)}</span></div>
            <div className="row big"><span>FALTA</span><span>{money(bill.remainingCents)}</span></div>
          </>
        )}
        {shares && <div className="row"><span>Dividido por {people}</span><span>{money(shares[0])} cada</span></div>}
      </div>
    </div>
  );
}
```
`lib/comanda/bill-service.ts` imports Prisma; this page imports only its **type** (`import type`) — check that, then `npx tsc --noEmit -p .`.

- [ ] **Step 6: Commit**

```bash
git add lib/comanda/bill-service.ts lib/comanda/add-item.ts "app/api/comanda/sessions/[id]/pre-bill/route.ts" "app/imprimir/pre-conta" "app/api/public/orders/[qrToken]/route.ts" lib/vender/salao.ts components/vender/salao-grid.tsx lib/print/tickets.ts "app/imprimir/cupom/[sessionId]/page.tsx" __tests__/integration/vender/pre-bill.test.ts
git commit -m "Bill: pre-bill (yellow table until a new item), service charge on the receipt

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Percentual da taxa nas configurações

**Files:**
- Modify: `app/api/admin/restaurant/settings/route.ts`, `app/admin/settings/page.tsx`
- Test: `__tests__/integration/vender/service-setting.test.ts`

**Interfaces:**
- Produces: settings `GET` returns `restaurant.serviceChargePercent`; `PATCH` accepts `serviceChargePercent` (integer 0–30, else 400).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/service-setting.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { GET, PATCH } from '../../../app/api/admin/restaurant/settings/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('service charge setting', () => {
  let rid: string, ownerId: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `tx-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Tx ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const s = { user: { id: ownerId, email: `tx-${tag}@gastrux.test`, role: 'OWNER' }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  const patch = (body: any) => PATCH(new NextRequest('http://x', { method: 'PATCH', body: JSON.stringify(body) }));

  it('10% by default; 0 turns it off; 0 to 30 only', async () => {
    expect((await (await GET()).json()).restaurant.serviceChargePercent).toBe(10);
    expect((await patch({ serviceChargePercent: 0 })).status).toBe(200);
    expect((await prisma.restaurant.findUnique({ where: { id: rid } })).serviceChargePercent).toBe(0);
    expect((await patch({ serviceChargePercent: 31 })).status).toBe(400);
    expect((await patch({ serviceChargePercent: 12.5 })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/service-setting'`
Expected: FAIL (`serviceChargePercent` undefined in GET)

- [ ] **Step 3: Implement**

In the route: add `serviceChargePercent: true` to both `select` blocks; add `'serviceChargePercent'` to `allowedFields`; before the string normalisation loop skip it, and after building `updateData` add:
```ts
  if (updateData.serviceChargePercent !== undefined) {
    const p = updateData.serviceChargePercent;
    if (!Number.isInteger(p) || p < 0 || p > 30) {
      return NextResponse.json({ error: 'Taxa de serviço: um número inteiro de 0 a 30 (%)' }, { status: 400 });
    }
  }
```
(the normalisation only touches strings, so a number passes through unchanged).

In the page: add `serviceChargePercent: 10` to the `form` state; when loading set `serviceChargePercent: r.serviceChargePercent ?? 10`; send it as a number (`Number(form.serviceChargePercent)`) in the PATCH body; add a card before "Horário de Funcionamento":
```tsx
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-2">Taxa de serviço</h2>
        <p className="text-sm text-gray-500 mb-3">Sugerida na conta das mesas e comandas por nome. O cliente pode recusar. 0 desliga.</p>
        <div className="flex items-center gap-2 max-w-[10rem]">
          <Input type="number" min={0} max={30} step={1} value={form.serviceChargePercent} onChange={(e) => updateField('serviceChargePercent', e.target.value)} />
          <span>%</span>
        </div>
      </Card>
```
(check `updateField`'s signature in the page and the `Input` import; adapt the value type if `form` is typed as strings).

- [ ] **Step 4: Run tests and type check**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/service-setting'` — PASS (1 test); `npx tsc --noEmit -p .` — no errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/restaurant/settings/route.ts app/admin/settings/page.tsx __tests__/integration/vender/service-setting.test.ts
git commit -m "Settings: service charge percent (0 to 30, 0 turns it off)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A tela Conta

**Files:**
- Create: `components/vender/conta-dialog.tsx`
- Modify: `app/vender/[sessionId]/page.tsx`
- Delete: `components/vender/close-bill-dialog.tsx`

**Interfaces:**
- Consumes: `Bill`, `BillPayment` (type only, from `lib/comanda/bill-service.ts`); `splitEqually`, `shareForItems` (`lib/comanda/bill.ts`); `PaymentPanel`, `panelState`, `PanelPayment` (`components/caixa/payment-panel`); `toApiAmount` (`components/caixa/panel-state`); `OpenShiftCard`; `useDeviceShift`; `useOutbox().{ send, online }`; `printInHiddenFrame`; `brl`; `reaisToCents` (`components/caixa/money.ts`); routes of Tasks 3–6.
- Produces: `ContaDialog({ sessionId, onClosed, onCancel }: { sessionId: string; onClosed: () => void; onCancel: () => void })`.

- [ ] **Step 1: Write the component**

```tsx
// components/vender/conta-dialog.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { FileText, Printer, Receipt, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PaymentPanel, panelState, type PanelPayment } from '@/components/caixa/payment-panel';
import { toApiAmount } from '@/components/caixa/panel-state';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { brl, reaisToCents } from '@/components/caixa/money';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { useOutbox } from '@/components/offline/outbox-provider';
import { printInHiddenFrame } from '@/lib/print/print-frame';
import { shareForItems, splitEqually } from '@/lib/comanda/bill';
import type { Bill } from '@/lib/comanda/bill-service';

const METHOD: Record<string, string> = { CASH: 'Dinheiro', PIX: 'PIX', CREDIT: 'Crédito', DEBIT: 'Débito', OTHER: 'Outro' };

/**
 * The Conta (spec 2026-10-07, 4.3): subtotal, service charge (suggested, removable), total, payments
 * so far, what is left; split equally or by item; one payment at a time; the bill closes itself when
 * paid. Needs the internet (never queued). Replaces the stage-1 close dialog.
 */
export function ContaDialog({ sessionId, onClosed, onCancel }: { sessionId: string; onClosed: () => void; onCancel: () => void }) {
  const shift = useDeviceShift();
  const { online, send } = useOutbox();
  const { data } = useSession();
  const role = (data?.user as any)?.role as string | undefined;
  const manager = ['OWNER', 'MANAGER', 'ADMIN'].includes(role ?? '');
  const [bill, setBill] = useState<Bill | null>(null);
  const [people, setPeople] = useState(2);
  const [mode, setMode] = useState<'all' | 'equal' | 'items'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [amountText, setAmountText] = useState('');
  const [payments, setPayments] = useState<PanelPayment[]>([]);
  const [cpf, setCpf] = useState('');
  const [busy, setBusy] = useState(false);
  const [emittedDoc, setEmittedDoc] = useState<{ id: string; documentNumber: number } | null>(null);
  const [nfceOpen, setNfceOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/comanda/sessions/${sessionId}/bill`, { cache: 'no-store' });
    if (res.ok) setBill(await res.json());
    else toast.error('Não foi possível carregar a conta');
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  if (!bill) return <Shell onCancel={onCancel}><p>Carregando...</p></Shell>;
  const closed = bill.status === 'CLOSED';

  // What to receive now: the whole remainder, one person's equal share, or the picked items' share
  const suggested = mode === 'equal'
    ? Math.min(bill.remainingCents, splitEqually(bill.totalCents, people)[0])
    : mode === 'items'
      ? Math.min(bill.remainingCents, shareForItems(bill.items.filter((i) => picked.includes(i.id)).reduce((n, i) => n + i.totalCents, 0), bill.subtotalCents, bill.serviceCents))
      : bill.remainingCents;
  const typed = amountText.trim() ? reaisToCents(amountText) : null;
  const dueNow = typed && typed > 0 ? Math.min(typed, bill.remainingCents) : suggested;

  async function toggleService(charge: boolean) {
    const res = await fetch(`/api/comanda/sessions/${sessionId}/bill`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ serviceChargeWaived: !charge }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error || 'Não foi possível mudar a taxa'); return; }
    setBill(out);
  }

  async function receive() {
    setBusy(true);
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payments: payments.map((p) => ({ method: p.method, amount: toApiAmount(p.amount) })), cashSessionId: shift.shiftId, customerCPF: cpf.replace(/\D/g, '') || undefined }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (out.code === 'CASH_SESSION_REQUIRED') shift.refresh();
        toast.error(out.error || 'Não foi possível receber');
        return;
      }
      if (out.changeCents > 0) toast.success(`Troco: ${brl(out.changeCents)}`, { duration: 15000 });
      setPayments([]); setAmountText(''); setPicked([]);
      setBill(out.bill);
      if (out.closed) {
        toast.success('Conta fechada', { action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${sessionId}`) }, duration: 15000 });
        const n = out.nfce as any;
        if (n?.nfce?.status === 'authorized') { toast.success(n.message); setEmittedDoc({ id: n.nfce.id, documentNumber: n.nfce.number }); }
        else if (n?.nfce) toast.warning(n.message, { duration: 10000 });
        else if (n?.message) toast.info(n.message);
        onClosed();
      } else {
        toast.success(`Recebido. Falta ${brl(out.bill.remainingCents)}`);
      }
    } finally {
      setBusy(false);
    }
  }

  async function refund(entryId: string) {
    const reason = window.prompt('Motivo do estorno deste pagamento:');
    if (!reason || reason.trim().length < 3) return;
    const res = await fetch(`/api/comanda/sessions/${sessionId}/payments/${entryId}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim(), cashSessionId: shift.shiftId }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(out.error || 'Não foi possível estornar'); return; }
    setBill(out);
    toast.success('Pagamento estornado');
  }

  async function preBill() {
    const res = await fetch(`/api/comanda/sessions/${sessionId}/pre-bill`, { method: 'POST' });
    if (!res.ok) { toast.error('Não foi possível imprimir a pré-conta'); return; }
    printInHiddenFrame(`/imprimir/pre-conta/${sessionId}${mode === 'equal' ? `?people=${people}` : ''}`);
    load();
  }

  async function emitNfce() {
    setBusy(true);
    try {
      // Needs the internet (a note cannot be signed on this device): refused offline, never queued
      const result = await send({ method: 'POST', url: '/api/nfe/emit', label: 'Emitir NFC-e', queueable: false, body: { orderSessionId: sessionId, customerCPF: cpf.replace(/\D/g, '') || undefined } });
      if (result.queued) return;
      const d = await result.response.json();
      if (!result.response.ok || !d.success) toast.error(d.rejectionReason || d.error || 'Erro ao emitir NFC-e');
      else { toast.success('NFC-e emitida!'); setEmittedDoc(d.document); setNfceOpen(false); }
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell onCancel={onCancel}>
      <h2 className="text-xl font-bold">{bill.label} · Conta</h2>

      <ul className="text-sm space-y-1 max-h-48 overflow-y-auto">
        {bill.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2">
            {mode === 'items' && !closed ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={picked.includes(i.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, i.id] : p.filter((x) => x !== i.id)))} />
                {i.quantity}x {i.name}
              </label>
            ) : <span>{i.quantity}x {i.name}</span>}
            <span>{brl(i.totalCents)}</span>
          </li>
        ))}
      </ul>

      <div className="border-t pt-2 space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span>{brl(bill.subtotalCents)}</span></div>
        {bill.applies && bill.percent > 0 && (
          <label className="flex justify-between items-center gap-2">
            <span className="flex items-center gap-2">
              <input type="checkbox" disabled={closed} checked={!bill.waived} onChange={(e) => toggleService(e.target.checked)} />
              Taxa de serviço ({bill.percent}%){bill.waived ? ' — cliente não quis pagar' : ''}
            </span>
            <span>{brl(bill.serviceCents)}</span>
          </label>
        )}
        <div className="flex justify-between text-lg font-bold"><span>Total</span><span>{brl(bill.totalCents)}</span></div>
        {bill.payments.map((p) => (
          <div key={p.id} className={`flex justify-between items-center ${p.refunded ? 'line-through text-slate-400' : 'text-emerald-700'}`}>
            <span>{METHOD[p.method] ?? p.method} · {new Date(p.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}{p.changeCents ? ` (troco ${brl(p.changeCents)})` : ''}</span>
            <span className="flex items-center gap-2">
              {brl(p.amountCents - p.changeCents)}
              {manager && !closed && !p.refunded && <button aria-label="Estornar pagamento" onClick={() => refund(p.id)}><Undo2 className="h-4 w-4" /></button>}
            </span>
          </div>
        ))}
        {!closed && <div className="flex justify-between font-semibold"><span>Falta</span><span>{brl(bill.remainingCents)}</span></div>}
      </div>

      {closed ? (
        <div className="space-y-2">
          <p className="font-semibold text-emerald-700">Conta fechada.</p>
          <Button variant="outline" className="w-full gap-2" onClick={() => printInHiddenFrame(`/imprimir/cupom/${sessionId}`)}><Printer className="h-4 w-4" /> Imprimir cupom</Button>
          {emittedDoc ? (
            <a href={`/admin/nfe/documents/${emittedDoc.id}`} target="_blank" rel="noopener" className="inline-flex items-center justify-center w-full text-sm font-semibold gap-1 underline">
              <FileText className="w-4 h-4" /> Ver NFC-e #{String(emittedDoc.documentNumber).padStart(6, '0')}
            </a>
          ) : nfceOpen ? (
            <div className="space-y-2 rounded-md border p-3">
              <Input placeholder="CPF do cliente (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
              <Button className="w-full" disabled={busy} onClick={emitNfce}>Emitir NFC-e</Button>
            </div>
          ) : (
            <Button variant="outline" className="w-full gap-2" onClick={() => setNfceOpen(true)}><Receipt className="h-4 w-4" /> Emitir NFC-e</Button>
          )}
        </div>
      ) : !online ? (
        <p className="rounded-md bg-amber-50 p-3 text-sm">Sem internet: receber pagamentos precisa de conexão. Lançar itens e enviar à cozinha continuam funcionando.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {(['all', 'equal', 'items'] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setAmountText(''); }} className={`px-3 py-1.5 rounded-full ${mode === m ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>
                {m === 'all' ? 'Tudo' : m === 'equal' ? 'Dividir igual' : 'Por item'}
              </button>
            ))}
            {mode === 'equal' && (
              <span className="flex items-center gap-1">
                por <Input className="w-16 h-8" type="number" min={2} max={20} value={people} onChange={(e) => setPeople(Math.min(20, Math.max(2, Number(e.target.value) || 2)))} />
                = {brl(splitEqually(bill.totalCents, people)[0])} cada
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span>Receber agora</span>
            <Input className="w-32" inputMode="decimal" placeholder={(suggested / 100).toFixed(2).replace('.', ',')} value={amountText} onChange={(e) => setAmountText(e.target.value)} />
          </div>
          <Input placeholder="CPF na nota? (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} />
          {shift.loading ? <p className="text-sm">Carregando caixa...</p> : !shift.shiftId && shift.register ? (
            <div className="rounded-md bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold">Abra o caixa para receber</p>
              <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => shift.refresh()} />
            </div>
          ) : (
            <PaymentPanel totalCents={dueNow} payments={payments} onChange={setPayments} disabled={busy} />
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        {!closed && <Button variant="outline" className="gap-2 mr-auto" onClick={preBill}><Printer className="h-4 w-4" /> Pré-conta</Button>}
        <Button variant="ghost" onClick={onCancel}>Voltar</Button>
        {!closed && online && (
          <Button className="bg-green-600" disabled={busy || !shift.shiftId || dueNow <= 0 || !panelState(dueNow, payments).valid} onClick={receive}>
            {dueNow >= bill.remainingCents ? 'Receber e fechar' : `Receber ${brl(dueNow)}`}
          </Button>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end lg:items-center justify-center" onClick={onCancel}>
      <div className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[92vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
```

Check `reaisToCents` returns `number | null` (`components/caixa/money.ts:4`); if `panelState(dueNow, payments).valid` requires payments to cover `dueNow`, that is the intended rule (the panel's total is what is received now).

- [ ] **Step 2: Wire it in the comanda page**

In `app/vender/[sessionId]/page.tsx`: replace the `CloseBillDialog` import with `import { ContaDialog } from '@/components/vender/conta-dialog';` and the `{showConta && (<CloseBillDialog ... />)}` block with:
```tsx
      {showConta && (
        <ContaDialog sessionId={sessionId} onClosed={() => { c.refresh(); }} onCancel={() => { setShowConta(false); c.refresh(); }} />
      )}
```
Delete `components/vender/close-bill-dialog.tsx` (`git rm`).

- [ ] **Step 3: Type check and unit tests**

Run: `npx tsc --noEmit -p .` and `npx jest --config jest.unit.config.js`
Expected: no type errors; all PASS.

- [ ] **Step 4: Commit**

```bash
git add components/vender/conta-dialog.tsx "app/vender/[sessionId]/page.tsx"
git rm components/vender/close-bill-dialog.tsx
git commit -m "Vender: the Conta screen (service charge, split, partial payments, pre-bill, refund)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ajustes adiados da etapa 1

**Files:**
- Modify: `public/manifest.json`, `app/conta/trocar-senha/page.tsx`, `components/vender/menu-panel.tsx`, `lib/comanda/add-item.ts`
- Test: `__tests__/integration/vender/add-item-limits.test.ts`, `__tests__/unit/vender-rules.test.ts`

**Interfaces:**
- Produces: `POST .../items` refuses a note over 140 characters (400); `groupByCategory` drops menu items without a recipe (`entryRecipeId(item) === null`).

- [ ] **Step 1: Write the failing tests**

Add to `__tests__/unit/vender-rules.test.ts`:
```ts
describe('menu items without a recipe', () => {
  it('are not offered (adding them fails on the server)', () => {
    const groups = groupByCategory([entry('a'), entry('b', { recipeId: null, recipe: null })]);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a']);
  });
});
```

```ts
// __tests__/integration/vender/add-item-limits.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST as ADD } from '../../../app/api/comanda/sessions/[id]/items/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('adding an item: the note limit', () => {
  let rid: string, ownerId: string, sid: string, menuItemId: string;
  beforeAll(async () => {
    ownerId = (await prisma.user.create({ data: { email: `lim-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } })).id;
    rid = (await prisma.restaurant.create({ data: { name: `Lim ${tag}`, ownerId, status: 'ACTIVE', subscriptionTier: 'enterprise' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `L${tag}`, name: 'Coca', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 6 } });
    const cat = await prisma.menuCategory.create({ data: { restaurantId: rid, name: 'Bebidas', position: 0, active: true } });
    menuItemId = (await prisma.menuItem.create({ data: { restaurantId: rid, categoryId: cat.id, name: 'Coca', price: 6, recipeId: recipe.id, position: 0 } })).id;
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN' } })).id;
    const s = { user: { id: ownerId, email: `lim-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(s);
    (getServerSessionNext as jest.Mock).mockResolvedValue(s);
  }, 60000);
  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a note over 140 characters is refused, as when editing', async () => {
    const res = await ADD(new NextRequest('http://x', { method: 'POST', body: JSON.stringify({ menuItemId, quantity: 1, specialInstructions: 'x'.repeat(141) }) }), { params: { id: sid } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest --config jest.unit.config.js __tests__/unit/vender-rules.test.ts` and `npx jest --config jest.integration.config.js --testPathPatterns 'vender/add-item-limits'`
Expected: FAIL (item without recipe still listed; long note accepted with 201)

- [ ] **Step 3: Implement**

- `lib/vender/rules.ts` `groupByCategory`: `if (item.available === false || !entryRecipeId(item)) continue;`
- `lib/comanda/add-item.ts` `addComandaItem`, after the quantity check:
  ```ts
  if (input.specialInstructions && String(input.specialInstructions).length > 140) {
    throw new AddItemError('Observação longa demais (máx. 140 caracteres)', 400);
  }
  ```
- `public/manifest.json`: `"start_url": "/auth/signin"` (the login page sends a logged-in person to their start screen — a cashier to Vender — and shows the login otherwise; `/dashboard` sent the counter tablet to the owner's home).
- `app/conta/trocar-senha/page.tsx` line ~44: after the forced password change go to `'/'` instead of `'/dashboard'` (the middleware sends each role to its start screen).

- [ ] **Step 4: Run tests**

Run the two commands of Step 2 — Expected: PASS. Then `npx jest --config jest.unit.config.js` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/vender/rules.ts lib/comanda/add-item.ts public/manifest.json app/conta/trocar-senha/page.tsx __tests__/unit/vender-rules.test.ts __tests__/integration/vender/add-item-limits.test.ts
git commit -m "Vender: stage 1 leftovers (note limit on add, no recipe-less items, cashier start screen)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Conferência, publicação e manual

- [ ] **Step 1: Full checks** (one at a time): `npx tsc --noEmit -p .`; `npx jest --config jest.unit.config.js`; integration `--testPathPatterns` `vender`, `comanda`, `caixa`, `bad-day`, `staff`. Expected: all PASS.
- [ ] **Step 2: Publish** (command in Global Constraints). Tell the owner: deploy **homolog**, then, **after it finishes**, run `npx prisma migrate deploy` in its Console — expected "Applying migration `20261008120000_bill_service_charge`".
- [ ] **Step 3: Browser check on homolog** (Playwright, test account, 390×844 and 1280×800):
  1. Open a table, add 2 items, Conta: subtotal, "Taxa de serviço (10%)" checked, total.
  2. Pré-conta prints (frame opens) and the table is **yellow** on the map; add an item → green.
  3. Uncheck the charge → total drops; check it again.
  4. Dividir igual por 2 → "Receber R$ x" → PIX → "Falta" shows the other half; second payment in cash with change → "Conta fechada", cupom shows "Taxa de serviço (fora da nota)".
  5. As owner: a partial payment, then refund it → crossed out, "Falta" back.
  6. Settings → Taxa de serviço 0 → the bill shows no charge line.
- [ ] **Step 4: Production**: after the owner approves homolog, deploy **app** and run `npx prisma migrate deploy` there after the deploy finishes.
- [ ] **Step 5: Manual**: in the Claude Doc manual (project `e47fd4d1-0a3f-4e2b-a96d-86475da2833e`, node `e2518129-7231`), the Vendas paragraph: Conta (taxa sugerida e removível, configurável em Configurações; pré-conta deixa a mesa amarela; dividir igual ou por item; pagamentos parciais fecham sozinhos; estorno pelo gerente; taxa fora da NFC-e e da comissão).
