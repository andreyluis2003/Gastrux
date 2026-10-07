# Tela Vender — Etapa 1 (mapa de mesas e comanda rápida) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela `/vender` com o mapa de mesas e comandas (1 toque abre a mesa) e uma comanda `/vender/[sessionId]` onde 1 toque lança 1 unidade, com categorias, ficha do item (quantidade, adicionais, observação) e barra fixa no celular.

**Architecture:** Regras puras em `lib/vender/rules.ts` (testadas em unidade); um carregador `lib/vender/salao.ts` atrás de `GET /api/vender/salao` (uma chamada para o mapa); a comanda reaproveita as rotas existentes de `app/api/comanda/*` por um hook `useComanda` que mantém a fila offline (`useOutbox`). O diálogo atual de fechar conta e NFC-e é movido, sem mudar o comportamento, para `components/vender/close-bill-dialog.tsx` (a Conta nova é a etapa 2). `/comanda` e `/comanda/[id]` passam a redirecionar.

**Tech Stack:** Next.js 14 App Router, React client components, Prisma/Postgres, Tailwind, shadcn/ui (`components/ui/*`), sonner (toasts), lucide-react, Jest (`jest.unit.config.js`, `jest.integration.config.js`).

**Spec:** `docs/superpowers/specs/2026-10-07-tela-vender-design.md` (seções 4.1, 4.2, 6 etapa 1, 7, 9, 10 etapa 1).

## Global Constraints

- Repositório `C:\Users\andre\gastrux-fix-delivery`, branch `fix/delivery-public`. Publicar com `git fetch -q https://github.com/andreyluis2003/Gastrux.git main && git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Textos da interface em **português do Brasil**; código e comentários em inglês, no estilo do repositório (comentário explica o porquê).
- **Etapa 1 não muda o banco** (sem migração).
- Toda consulta com `restaurantId` do membro logado (`getCurrentRestaurantId()` ou `requireRestaurantRole`).
- Dinheiro em **centavos inteiros** (`lineTotalCents` de `lib/comanda/line-total.ts`).
- Alvo de toque ≥ 64 px nas mesas e nos itens do cardápio.
- Corte de layout: **1024 px** (`lg:` no Tailwind). Abaixo: barra fixa e comanda por cima; acima: duas colunas.
- Mapa atualiza a cada **10 s** com a aba visível. Desfazer fica **5 s**. Segurar para abrir a ficha: **500 ms**. Observação até **140** caracteres.
- Testes: `npx jest --config jest.unit.config.js <arquivo>`; integração precisa do banco de teste (`npm run test:db:start`) e `npx jest --config jest.integration.config.js --testPathPatterns '<padrão>'`. Tipos: `npx tsc --noEmit -p .`. A máquina tem pouca memória: rode uma suíte de integração por vez.

## Review Focus

1. **Dois garçons tocam na mesma mesa livre ao mesmo tempo** → os dois entram na mesma comanda (nunca duas comandas na mesma mesa). Teste em Task 3.
2. **Tocar várias vezes rápido no mesmo item** → uma linha com a quantidade somada, sem linhas duplicadas por corrida; offline, cada toque vira uma linha pendente (aceitável) e nada se perde. Teste em Task 1 (`mergeTarget`) e conferência em Task 9.
3. **Desfazer depois que a linha já foi enviada à cozinha** → não apaga em silêncio; cai na regra de remover com motivo (gerente). Teste em Task 4 (PUT recusa reduzir item enviado sem gerente) e regra no hook (Task 7).
4. **Editar adicionais/observação de item já enviado** → 409 com mensagem clara; quantidade continua com a regra atual. Teste em Task 4.
5. **Restaurante sem mesas cadastradas, ou item do cardápio sem categoria** → mapa mostra só comandas e um atalho para cadastrar mesas; itens sem categoria aparecem em "Outros". Teste em Task 1 (`groupByCategory`) e Task 2 (salão sem mesas).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/vender/rules.ts` (novo) | Regras puras: agrupar cardápio, item novo × enviado, linha onde somar, contagem de novos, tempo aberto, rótulo da comanda |
| `lib/vender/salao.ts` (novo) | Carrega mesas, salões, comandas abertas com total e contagem, pedidos de delivery novos |
| `app/api/vender/salao/route.ts` (novo) | `GET` do mapa |
| `app/api/comanda/sessions/route.ts` | `POST` abre **ou devolve** a comanda aberta da mesa (com trava) |
| `app/api/comanda/sessions/[id]/items/[itemId]/route.ts` | `PUT` aceita `modifierIds`; recusa editar item enviado |
| `lib/caixa/use-device-shift.ts` | Devolve também `shiftOpenedAt` |
| `lib/navigation/entry.ts`, `middleware.ts`, `app/auth/signin/page.tsx` | Caixa cai em `/vender` ao entrar |
| `lib/navigation/app-nav.ts`, `app/dashboard/page.tsx`, `public/sw.js` | Menu, atalho do dashboard e cache offline apontam para `/vender` |
| `app/vender/page.tsx` (novo) | Tela do mapa |
| `components/vender/cash-bar.tsx` (novo) | Barra do caixa |
| `components/vender/salao-grid.tsx` (novo) | Quadrados de mesas e comandas |
| `components/vender/use-comanda.ts` (novo) | Estado e ações da comanda (fila offline incluída) |
| `components/vender/menu-panel.tsx` (novo) | Abas por categoria, busca, botões de item com toque e segurar |
| `components/vender/item-sheet.tsx` (novo) | Ficha do item |
| `components/vender/comanda-panel.tsx` (novo) | Lista, total, Enviar e Conta |
| `components/vender/close-bill-dialog.tsx` (novo) | Fechar conta + NFC-e, movidos sem mudança de regra |
| `app/vender/[sessionId]/page.tsx` (novo) | Monta a comanda |
| `app/comanda/page.tsx`, `app/comanda/[sessionId]/page.tsx` | Viram redirecionamentos |

---

### Task 1: Regras puras da tela Vender

**Files:**
- Create: `lib/vender/rules.ts`
- Test: `__tests__/unit/vender-rules.test.ts`

**Interfaces:**
- Produces:
  - `interface MenuEntry { id: string; name: string; price: number | string; recipeId: string | null; recipe?: { id: string } | null; available?: boolean; category?: { id: string; name: string; position: number; emoji?: string | null } | null }`
  - `interface MenuGroup { id: string; name: string; emoji: string | null; items: MenuEntry[] }`
  - `groupByCategory(items: MenuEntry[]): MenuGroup[]`
  - `entryRecipeId(entry: MenuEntry): string | null`
  - `interface LineLike { id: string; recipeId: string; price: number | string; quantity: number; addedAt?: string; specialInstructions?: string | null; modifiers?: unknown[]; pending?: boolean }`
  - `isUnsent(line: { addedAt?: string; pending?: boolean }, sentToKitchenAt: string | null | undefined): boolean`
  - `unsentCount(lines: Array<{ addedAt?: string; pending?: boolean }>, sentToKitchenAt: string | null | undefined): number`
  - `mergeTarget(lines: LineLike[], sentToKitchenAt: string | null | undefined, entry: MenuEntry): LineLike | null`
  - `openFor(openedAt: string | Date, now: Date): string`
  - `sessionLabel(s: { table?: { number: number } | null; tableNumber?: number | null; customerName?: string | null }): string`

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/unit/vender-rules.test.ts
import { groupByCategory, isUnsent, unsentCount, mergeTarget, openFor, sessionLabel, entryRecipeId, type MenuEntry, type LineLike } from '../../lib/vender/rules';

const cat = (id: string, name: string, position: number) => ({ id, name, position, emoji: null });
const entry = (id: string, over: Partial<MenuEntry> = {}): MenuEntry => ({ id, name: id, price: 10, recipeId: `r-${id}`, available: true, category: cat('c1', 'Pizzas', 0), ...over });

describe('groupByCategory', () => {
  it('keeps the menu order, drops unavailable items and empty groups, puts items without category in "Outros" last', () => {
    const groups = groupByCategory([
      entry('a', { category: cat('c2', 'Bebidas', 1) }),
      entry('b'),
      entry('c', { available: false }),
      entry('d', { category: null }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Pizzas', 'Bebidas', 'Outros']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['b']);
    expect(groups[2].items.map((i) => i.id)).toEqual(['d']);
  });
});

describe('new and sent lines', () => {
  const sent = '2026-10-07T20:00:00.000Z';
  it('a line added after the last send, or with no send yet, or pending offline, is new', () => {
    expect(isUnsent({ addedAt: '2026-10-07T20:05:00.000Z' }, sent)).toBe(true);
    expect(isUnsent({ addedAt: '2026-10-07T19:55:00.000Z' }, sent)).toBe(false);
    expect(isUnsent({ addedAt: '2026-10-07T19:55:00.000Z' }, null)).toBe(true);
    expect(isUnsent({ pending: true }, sent)).toBe(true);
    expect(unsentCount([{ addedAt: '2026-10-07T20:05:00.000Z' }, { addedAt: '2026-10-07T19:00:00.000Z' }, { pending: true }], sent)).toBe(2);
  });
});

describe('mergeTarget: a tap adds to the same new line', () => {
  const sent = '2026-10-07T20:00:00.000Z';
  const line = (id: string, over: Partial<LineLike> = {}): LineLike => ({ id, recipeId: 'r-a', price: '10', quantity: 1, addedAt: '2026-10-07T20:05:00.000Z', modifiers: [], specialInstructions: null, ...over });
  it('same recipe and price, new, plain: merge into the latest one', () => {
    expect(mergeTarget([line('1'), line('2', { addedAt: '2026-10-07T20:06:00.000Z' })], sent, entry('a'))?.id).toBe('2');
  });
  it('never into a sent line, a line with modifiers or a note, a pending line, or another price', () => {
    expect(mergeTarget([line('1', { addedAt: '2026-10-07T19:00:00.000Z' })], sent, entry('a'))).toBeNull();
    expect(mergeTarget([line('1', { modifiers: [{}] })], sent, entry('a'))).toBeNull();
    expect(mergeTarget([line('1', { specialInstructions: 'sem cebola' })], sent, entry('a'))).toBeNull();
    expect(mergeTarget([line('1', { pending: true })], sent, entry('a'))).toBeNull();
    expect(mergeTarget([line('1', { price: '12' })], sent, entry('a'))).toBeNull();
  });
  it('uses the recipe of the menu item (recipeId, else recipe.id)', () => {
    expect(entryRecipeId(entry('a', { recipeId: null, recipe: { id: 'r-x' } }))).toBe('r-x');
  });
});

describe('labels', () => {
  const now = new Date('2026-10-07T21:00:00.000Z');
  it('time open', () => {
    expect(openFor('2026-10-07T20:59:30.000Z', now)).toBe('agora');
    expect(openFor('2026-10-07T20:13:00.000Z', now)).toBe('47 min');
    expect(openFor('2026-10-07T19:55:00.000Z', now)).toBe('1 h 05');
  });
  it('a comanda is its table, else its name, else Balcão', () => {
    expect(sessionLabel({ table: { number: 5 } })).toBe('Mesa 5');
    expect(sessionLabel({ tableNumber: 7 })).toBe('Mesa 7');
    expect(sessionLabel({ customerName: 'João' })).toBe('João');
    expect(sessionLabel({})).toBe('Balcão');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.unit.config.js __tests__/unit/vender-rules.test.ts`
Expected: FAIL with "Cannot find module '../../lib/vender/rules'"

- [ ] **Step 3: Write the implementation**

```ts
// lib/vender/rules.ts
/**
 * Rules of the Vender screen (spec docs/superpowers/specs/2026-10-07-tela-vender-design.md, 4.1 and
 * 4.2). Pure, so the screen and the tests share them.
 */

export interface MenuEntry {
  id: string;
  name: string;
  price: number | string;
  recipeId: string | null;
  recipe?: { id: string } | null;
  available?: boolean;
  category?: { id: string; name: string; position: number; emoji?: string | null } | null;
}

export interface MenuGroup { id: string; name: string; emoji: string | null; items: MenuEntry[] }

const OTHERS = { id: '__outros', name: 'Outros', emoji: null };

/** The menu by category, in the order the API sends it (category position, then item position) */
export function groupByCategory(items: MenuEntry[]): MenuGroup[] {
  const groups = new Map<string, MenuGroup>();
  for (const item of items) {
    if (item.available === false) continue;
    const c = item.category ?? null;
    const key = c ? c.id : OTHERS.id;
    if (!groups.has(key)) groups.set(key, c ? { id: c.id, name: c.name, emoji: c.emoji ?? null, items: [] } : { ...OTHERS, items: [] });
    groups.get(key)!.items.push(item);
  }
  const list = [...groups.values()];
  return [...list.filter((g) => g.id !== OTHERS.id), ...list.filter((g) => g.id === OTHERS.id)];
}

export function entryRecipeId(entry: MenuEntry): string | null {
  return entry.recipeId || entry.recipe?.id || null;
}

export interface LineLike {
  id: string;
  recipeId: string;
  price: number | string;
  quantity: number;
  addedAt?: string;
  specialInstructions?: string | null;
  modifiers?: unknown[];
  /** Made offline, still in this device's outbox */
  pending?: boolean;
}

/** Same rule as lib/kds/send-session.ts: new = added after the last send (or never sent) */
export function isUnsent(line: { addedAt?: string; pending?: boolean }, sentToKitchenAt: string | null | undefined): boolean {
  if (line.pending) return true;
  if (!sentToKitchenAt || !line.addedAt) return true;
  return new Date(line.addedAt) > new Date(sentToKitchenAt);
}

export function unsentCount(lines: Array<{ addedAt?: string; pending?: boolean }>, sentToKitchenAt: string | null | undefined): number {
  return lines.filter((l) => isUnsent(l, sentToKitchenAt)).length;
}

/**
 * The line a one-tap add goes into: a new (not sent), plain (no modifiers, no note) line of the same
 * recipe and price, already on the server. None: the tap creates a new line.
 */
export function mergeTarget(lines: LineLike[], sentToKitchenAt: string | null | undefined, entry: MenuEntry): LineLike | null {
  const recipeId = entryRecipeId(entry);
  const candidates = lines.filter(
    (l) =>
      !l.pending &&
      l.recipeId === recipeId &&
      Number(l.price) === Number(entry.price) &&
      !(l.modifiers?.length) &&
      !l.specialInstructions &&
      isUnsent(l, sentToKitchenAt)
  );
  if (!candidates.length) return null;
  return candidates.reduce((a, b) => (new Date(b.addedAt ?? 0) > new Date(a.addedAt ?? 0) ? b : a));
}

/** "agora", "47 min", "1 h 05" */
export function openFor(openedAt: string | Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(openedAt).getTime()) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`;
}

export function sessionLabel(s: { table?: { number: number } | null; tableNumber?: number | null; customerName?: string | null }): string {
  const n = s.table?.number ?? s.tableNumber;
  if (n) return `Mesa ${n}`;
  return s.customerName || 'Balcão';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.unit.config.js __tests__/unit/vender-rules.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/vender/rules.ts __tests__/unit/vender-rules.test.ts
git commit -m "Vender: pure rules (menu by category, new lines, one-tap merge, labels)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `GET /api/vender/salao` — o mapa numa chamada

**Files:**
- Create: `lib/vender/salao.ts`, `app/api/vender/salao/route.ts`
- Modify: `public/sw.js` (lista `OFFLINE_API_PREFIXES`)
- Test: `__tests__/integration/vender/salao.test.ts`

**Interfaces:**
- Produces:
  - `interface SalaoSession { id: string; label: string; tableId: string | null; customerName: string | null; openedAt: string; openedBy: string | null; totalCents: number; itemCount: number; newCount: number; status: string }`
  - `interface SalaoTable { id: string; number: number; sectionId: string | null; sectionName: string | null; capacity: number | null; session: SalaoSession | null }`
  - `interface Salao { sections: Array<{ id: string; name: string }>; tables: SalaoTable[]; others: SalaoSession[]; deliveryNew: number }`
  - `loadSalao(restaurantId: string): Promise<Salao>`
  - `GET /api/vender/salao` → `Salao` (401 sem login, 403 sem restaurante)

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/salao.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { loadSalao } from '../../../lib/vender/salao';
import { GET } from '../../../app/api/vender/salao/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');

describe('GET /api/vender/salao', () => {
  let rid: string, otherRid: string, ownerId: string, t1: string, t2: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `salao-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Salao ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    t1 = (await prisma.table.create({ data: { restaurantId: rid, number: 1, sectionId: sec.id, capacity: 4, qrToken: `a${tag}` } })).id;
    t2 = (await prisma.table.create({ data: { restaurantId: rid, number: 2, sectionId: sec.id, capacity: 4, qrToken: `b${tag}` } })).id;
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `R${tag}`, name: 'Pizza', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 50 } });
    const s = await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t1, status: 'SENT_TO_KITCHEN', openedAt: new Date(Date.now() - 30 * 60_000), sentToKitchenAt: new Date(Date.now() - 10 * 60_000) } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 50, quantity: 2, addedAt: new Date(Date.now() - 20 * 60_000) } });
    await prisma.orderSessionItem.create({ data: { sessionId: s.id, recipeId: recipe.id, price: 7.5, quantity: 1, addedAt: new Date() } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, customerName: 'João', status: 'OPEN' } });
    await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, tableId: t2, status: 'CLOSED', closedAt: new Date() } });
    await prisma.orderSession.create({ data: { restaurantId: otherRid, userId: ownerId, customerName: `Vazou ${tag}`, status: 'OPEN' } });
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('tables with their open comanda, totals in cents, new lines counted; closed comandas free the table', async () => {
    const salao = await loadSalao(rid);
    expect(salao.sections.map((s) => s.name)).toEqual(['Salão']);
    const [one, two] = salao.tables;
    expect(one).toMatchObject({ id: t1, number: 1, sectionName: 'Salão' });
    expect(one.session).toMatchObject({ label: 'Mesa 1', totalCents: 10750, itemCount: 2, newCount: 1, openedBy: 'Ana' });
    expect(two).toMatchObject({ id: t2, session: null });
    expect(salao.others.map((o) => o.label)).toEqual(['João']);
  });

  it('only the logged-in restaurant', async () => {
    const session = { user: { id: ownerId, email: `salao-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
    const res = await GET(new NextRequest('http://x/api/vender/salao'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(`Vazou ${tag}`);
  });

  it('a restaurant without tables still lists its comandas', async () => {
    const salao = await loadSalao(otherRid);
    expect(salao.tables).toEqual([]);
    expect(salao.others.map((o) => o.label)).toEqual([`Vazou ${tag}`]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db:start; npx jest --config jest.integration.config.js --testPathPatterns 'vender/salao'`
Expected: FAIL with "Cannot find module '../../../lib/vender/salao'"

- [ ] **Step 3: Write the implementation**

```ts
// lib/vender/salao.ts
import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { isUnsent, sessionLabel } from './rules';

/**
 * Everything the Vender map shows, in one round trip (spec 4.1): tables with their open comanda,
 * the open comandas without a table (by name, counter), and how many delivery orders are new.
 */

export interface SalaoSession {
  id: string;
  label: string;
  tableId: string | null;
  customerName: string | null;
  openedAt: string;
  openedBy: string | null;
  totalCents: number;
  itemCount: number;
  newCount: number;
  status: string;
}
export interface SalaoTable { id: string; number: number; sectionId: string | null; sectionName: string | null; capacity: number | null; session: SalaoSession | null }
export interface Salao { sections: Array<{ id: string; name: string }>; tables: SalaoTable[]; others: SalaoSession[]; deliveryNew: number }

const OPEN = ['OPEN', 'SENT_TO_KITCHEN', 'READY'] as const;

export async function loadSalao(restaurantId: string): Promise<Salao> {
  const [tables, sessions, deliveryNew] = await Promise.all([
    prisma.table.findMany({
      where: { restaurantId, isAvailable: true },
      select: { id: true, number: true, capacity: true, section: { select: { id: true, name: true } } },
      orderBy: { number: 'asc' },
    }),
    prisma.orderSession.findMany({
      where: { restaurantId, status: { in: [...OPEN] } },
      select: {
        id: true, tableId: true, tableNumber: true, customerName: true, openedAt: true, sentToKitchenAt: true, status: true,
        table: { select: { number: true } },
        user: { select: { name: true } },
        items: { select: { price: true, quantity: true, addedAt: true, modifiers: { select: { priceAdjustment: true } } } },
      },
      orderBy: { openedAt: 'asc' },
    }),
    prisma.externalOrder.count({ where: { restaurantId, status: 'PENDING' } }),
  ]);

  const toSession = (s: (typeof sessions)[number]): SalaoSession => {
    const sent = s.sentToKitchenAt?.toISOString() ?? null;
    return {
      id: s.id,
      label: sessionLabel(s),
      tableId: s.tableId,
      customerName: s.customerName,
      openedAt: s.openedAt.toISOString(),
      openedBy: s.user?.name ?? null,
      totalCents: s.items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0),
      itemCount: s.items.length,
      newCount: s.items.filter((i) => isUnsent({ addedAt: i.addedAt.toISOString() }, sent)).length,
      status: s.status,
    };
  };

  // The oldest open comanda of a table wins (there should be one; Task 3 stops new duplicates)
  const byTable = new Map<string, SalaoSession>();
  const others: SalaoSession[] = [];
  for (const s of sessions) {
    if (s.tableId && !byTable.has(s.tableId)) byTable.set(s.tableId, toSession(s));
    else if (!s.tableId) others.push(toSession(s));
  }

  const sections = new Map<string, string>();
  for (const t of tables) if (t.section) sections.set(t.section.id, t.section.name);

  return {
    sections: [...sections].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    tables: tables.map((t) => ({
      id: t.id,
      number: t.number,
      sectionId: t.section?.id ?? null,
      sectionName: t.section?.name ?? null,
      capacity: t.capacity ?? null,
      session: byTable.get(t.id) ?? null,
    })),
    others,
    deliveryNew,
  };
}
```

```ts
// app/api/vender/salao/route.ts
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentRestaurantId } from '@/lib/whatsapp/get-restaurant';
import { loadSalao } from '@/lib/vender/salao';

export const dynamic = 'force-dynamic';

/** GET /api/vender/salao: the Vender map (tables, open comandas, new delivery orders) */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const restaurantId = await getCurrentRestaurantId();
  if (!restaurantId) return NextResponse.json({ error: 'Restaurante não identificado' }, { status: 403 });
  try {
    return NextResponse.json(await loadSalao(restaurantId), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[vender/salao]', error);
    return NextResponse.json({ error: 'Erro ao carregar o salão' }, { status: 500 });
  }
}
```

In `public/sw.js`, add `'/api/vender/salao',` as the first entry of `OFFLINE_API_PREFIXES` (the map keeps showing the last state offline, spec 4.1).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/salao'`
Expected: PASS (3 tests). If `prisma.table` has no `capacity` or `isAvailable`, check `awk '/^model Table \{/,/^\}/' prisma/schema.prisma` and use the field names there (the current `/api/comanda/tables` filters `isAvailable: true`).

- [ ] **Step 5: Commit**

```bash
git add lib/vender/salao.ts app/api/vender/salao/route.ts public/sw.js __tests__/integration/vender/salao.test.ts
git commit -m "Vender: GET /api/vender/salao (tables, open comandas, new delivery orders)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Abrir comanda da mesa devolve a que já está aberta

**Files:**
- Modify: `app/api/comanda/sessions/route.ts` (handler `POST`)
- Test: `__tests__/integration/vender/open-table.test.ts`

**Interfaces:**
- Produces: `POST /api/comanda/sessions` com `{ tableId }` → **200** e a comanda aberta da mesa, se houver; **201** e a nova, se não. Sem `tableId`: como hoje (201).

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/open-table.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { POST } from '../../../app/api/comanda/sessions/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const open = (body: any) => POST(new NextRequest('http://x/api/comanda/sessions', { method: 'POST', body: JSON.stringify(body) }));

describe('opening a table that is already open', () => {
  let rid: string, ownerId: string, tableId: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `mesa-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Mesa ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const sec = await prisma.tableSection.create({ data: { restaurantId: rid, name: 'Salão', capacity: 20 } });
    tableId = (await prisma.table.create({ data: { restaurantId: rid, number: 9, sectionId: sec.id, capacity: 4, qrToken: `m${tag}` } })).id;
    const session = { user: { id: ownerId, email: `mesa-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    try { await prisma.restaurant.delete({ where: { id: rid } }); } catch {}
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('two waiters tapping the same free table at once get the same comanda', async () => {
    const [a, b] = await Promise.all([open({ tableId }), open({ tableId })]);
    const [ja, jb] = [await a.json(), await b.json()];
    expect(ja.id).toBe(jb.id);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await prisma.orderSession.count({ where: { tableId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } } })).toBe(1);
  });

  it('after the table is closed, a tap opens a new comanda', async () => {
    await prisma.orderSession.updateMany({ where: { tableId }, data: { status: 'CLOSED', closedAt: new Date() } });
    const res = await open({ tableId });
    expect(res.status).toBe(201);
  });

  it('a comanda by name always opens a new one', async () => {
    const [a, b] = await Promise.all([open({ customerName: 'João' }), open({ customerName: 'João' })]);
    expect((await a.json()).id).not.toBe((await b.json()).id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/open-table'`
Expected: FAIL on the first test (two different ids, both 201)

- [ ] **Step 3: Write the implementation**

In `app/api/comanda/sessions/route.ts`, replace the block from `const newSession = await prisma.orderSession.create({` through `return NextResponse.json(newSession, { status: 201 });` with:

```ts
    const include = {
      user: { select: { name: true } },
      table: { include: { section: { select: { name: true } } } },
      items: { include: { recipe: { select: { name: true, sellingPrice: true } } } },
    };

    // A table has one open comanda: tapping it opens that one. Two waiters tapping a free table at the
    // same time must not open two (spec 7): a per-table lock serialises them inside the transaction.
    const result = await prisma.$transaction(async (tx) => {
      if (tableId) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-table:' + tableId}))`;
        const existing = await tx.orderSession.findFirst({
          where: { restaurantId, tableId, status: { in: ['OPEN', 'SENT_TO_KITCHEN', 'READY'] } },
          include,
          orderBy: { openedAt: 'asc' },
        });
        if (existing) return { session: existing, created: false };
      }
      const created = await tx.orderSession.create({
        data: {
          restaurantId,
          userId: session.user.id,
          tableId: tableId || null,
          customerName: customerName || null,
          tableNumber: tableNumber || null,
          notes: notes || null,
          status: 'OPEN',
        },
        include,
      });
      return { session: created, created: true };
    });

    return NextResponse.json(result.session, { status: result.created ? 201 : 200 });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/open-table'`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/api/comanda/sessions/route.ts __tests__/integration/vender/open-table.test.ts
git commit -m "Comanda: opening a table returns its open comanda (per-table lock)

Two waiters tapping the same free table opened two comandas.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Editar adicionais e observação de item novo

**Files:**
- Modify: `app/api/comanda/sessions/[id]/items/[itemId]/route.ts` (handler `PUT`)
- Test: `__tests__/integration/vender/edit-line.test.ts`

**Interfaces:**
- Produces: `PUT /api/comanda/sessions/[id]/items/[itemId]` com `{ quantity?, specialInstructions?, modifierIds?, reason? }`:
  - item **novo**: muda quantidade, observação (até 140 caracteres) e adicionais (troca a lista inteira, preço de cada adicional lido do cadastro); 200 com o item e seus adicionais.
  - item **enviado**: `modifierIds` ou `specialInstructions` → **409** `{ error: 'A cozinha já recebeu este item: não dá para mudar adicionais ou observação' }`; quantidade segue a regra atual (reduzir exige gerente e motivo).
  - adicional de outro restaurante → 404.

- [ ] **Step 1: Write the failing test**

```ts
// __tests__/integration/vender/edit-line.test.ts
// @ts-nocheck
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }));
jest.mock('next-auth/next', () => ({ getServerSession: jest.fn() }));
import { getServerSession } from 'next-auth';
import { getServerSession as getServerSessionNext } from 'next-auth/next';
import { PUT } from '../../../app/api/comanda/sessions/[id]/items/[itemId]/route';

const prisma = (global as any).__PRISMA__ || new PrismaClient();
const tag = crypto.randomBytes(4).toString('hex');
const put = (sid: string, iid: string, body: any) =>
  PUT(new NextRequest('http://x', { method: 'PUT', body: JSON.stringify(body), headers: { 'Idempotency-Key': crypto.randomUUID() } }), { params: { id: sid, itemId: iid } });

describe('editing a comanda line', () => {
  let rid: string, otherRid: string, ownerId: string, sid: string, newLine: string, sentLine: string, bacon: string, foreign: string;

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `linha-${tag}@gastrux.test`, name: 'Ana', password: 'x', role: 'OWNER' } });
    ownerId = u.id;
    rid = (await prisma.restaurant.create({ data: { name: `Linha ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    otherRid = (await prisma.restaurant.create({ data: { name: `Outro ${tag}`, ownerId, status: 'ACTIVE' } })).id;
    await prisma.user.update({ where: { id: ownerId }, data: { currentRestaurantId: rid } });
    await prisma.restaurantUser.create({ data: { restaurantId: rid, userId: ownerId, role: 'OWNER', permissions: ['ALL'], acceptedAt: new Date() } });
    const recipe = await prisma.recipe.create({ data: { restaurantId: rid, code: `L${tag}`, name: 'Burger', baseYield: 1, yieldUnit: 'un', portionUnit: 'un', sellingPrice: 30 } });
    bacon = (await prisma.itemModifier.create({ data: { restaurantId: rid, name: 'Bacon', priceAdjustment: 4 } })).id;
    foreign = (await prisma.itemModifier.create({ data: { restaurantId: otherRid, name: 'Alheio', priceAdjustment: 1 } })).id;
    const sent = new Date(Date.now() - 5 * 60_000);
    sid = (await prisma.orderSession.create({ data: { restaurantId: rid, userId: ownerId, status: 'SENT_TO_KITCHEN', sentToKitchenAt: sent } })).id;
    sentLine = (await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 30, quantity: 1, addedAt: new Date(sent.getTime() - 60_000) } })).id;
    newLine = (await prisma.orderSessionItem.create({ data: { sessionId: sid, recipeId: recipe.id, price: 30, quantity: 1, addedAt: new Date() } })).id;
    const session = { user: { id: ownerId, email: `linha-${tag}@gastrux.test` }, expires: '2099-01-01' };
    (getServerSession as jest.Mock).mockResolvedValue(session);
    (getServerSessionNext as jest.Mock).mockResolvedValue(session);
  }, 60000);

  afterAll(async () => {
    for (const id of [rid, otherRid]) { try { await prisma.restaurant.delete({ where: { id } }); } catch {} }
    try { await prisma.user.delete({ where: { id: ownerId } }); } catch {}
  });

  it('a new line takes quantity, note and modifiers (price from the modifier record)', async () => {
    const res = await put(sid, newLine, { quantity: 2, specialInstructions: 'sem cebola', modifierIds: [bacon] });
    expect(res.status).toBe(200);
    const line = await prisma.orderSessionItem.findUnique({ where: { id: newLine }, include: { modifiers: true } });
    expect(line).toMatchObject({ quantity: 2, specialInstructions: 'sem cebola' });
    expect(line.modifiers.map((m) => [m.modifierId, Number(m.priceAdjustment)])).toEqual([[bacon, 4]]);

    expect((await put(sid, newLine, { modifierIds: [] })).status).toBe(200);
    expect(await prisma.orderSessionItemModifier.count({ where: { sessionItemId: newLine } })).toBe(0);
  });

  it('a line the kitchen has: modifiers and note are refused', async () => {
    expect((await put(sid, sentLine, { modifierIds: [bacon] })).status).toBe(409);
    expect((await put(sid, sentLine, { specialInstructions: 'x' })).status).toBe(409);
  });

  it('another restaurant\'s modifier is not found; a note over 140 characters is refused', async () => {
    expect((await put(sid, newLine, { modifierIds: [foreign] })).status).toBe(404);
    expect((await put(sid, newLine, { specialInstructions: 'x'.repeat(141) })).status).toBe(400);
  });
});
```

Before running, check the modifier join's foreign key name: `awk '/^model OrderSessionItemModifier \{/,/^\}/' prisma/schema.prisma`. If it is not `sessionItemId`, use the real name in the test and in Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/edit-line'`
Expected: FAIL (modifiers not saved; sent line returns 200)

- [ ] **Step 3: Write the implementation**

In `handlePUT`, replace `const { quantity, specialInstructions, reason } = await request.json();` and everything after it up to (not including) `if (quantity !== undefined && quantity !== line.quantity) {` with:

```ts
    const { quantity, specialInstructions, modifierIds, reason } = await request.json();

    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1)) {
      return NextResponse.json({ error: 'Quantidade inválida: use um número inteiro a partir de 1' }, { status: 400 });
    }
    if (specialInstructions !== undefined && specialInstructions !== null && String(specialInstructions).length > 140) {
      return NextResponse.json({ error: 'Observação longa demais (máx. 140 caracteres)' }, { status: 400 });
    }
    // What the kitchen already has is not changed under it (spec 4.2): only the quantity rule below
    if (kitchenHasIt(line) && (modifierIds !== undefined || specialInstructions !== undefined)) {
      return NextResponse.json({ error: 'A cozinha já recebeu este item: não dá para mudar adicionais ou observação' }, { status: 409 });
    }
    const reducing = quantity !== undefined && quantity < line.quantity;
    if (reducing && kitchenHasIt(line)) {
      if (!isManager(member)) {
        return NextResponse.json({ error: 'Reduzir um item que a cozinha já recebeu exige um gerente' }, { status: 403 });
      }
      if (String(reason ?? '').trim().length < 3) {
        return NextResponse.json({ error: 'Informe o motivo da redução' }, { status: 400 });
      }
    }

    let modifiers: Array<{ id: string; priceAdjustment: any }> | null = null;
    if (modifierIds !== undefined) {
      const ids = [...new Set((Array.isArray(modifierIds) ? modifierIds : []).map(String))];
      modifiers = ids.length
        ? await prisma.itemModifier.findMany({ where: { id: { in: ids }, restaurantId: member.restaurantId }, select: { id: true, priceAdjustment: true } })
        : [];
      if (modifiers.length !== ids.length) return NextResponse.json({ error: 'Adicional não encontrado' }, { status: 404 });
    }

    const item = await prisma.$transaction(async (tx) => {
      if (modifiers) {
        await tx.orderSessionItemModifier.deleteMany({ where: { sessionItemId: params.itemId } });
        if (modifiers.length) {
          await tx.orderSessionItemModifier.createMany({
            data: modifiers.map((m) => ({ sessionItemId: params.itemId, modifierId: m.id, priceAdjustment: m.priceAdjustment })),
          });
        }
      }
      return tx.orderSessionItem.update({
        where: { id: params.itemId },
        data: {
          quantity: quantity !== undefined ? quantity : undefined,
          specialInstructions: specialInstructions !== undefined ? (String(specialInstructions ?? '').trim() || null) : undefined,
        },
        include: {
          recipe: { select: { name: true, sellingPrice: true } },
          modifiers: { include: { modifier: { select: { name: true } } } },
        },
      });
    });

```

(The existing `if (quantity !== undefined && quantity !== line.quantity) { recordAudit ... }` and `return NextResponse.json(item);` stay after it. Remove the old duplicated quantity/reducing checks and the old `prisma.orderSessionItem.update` that this block replaces.)

- [ ] **Step 4: Run tests**

Run: `npx jest --config jest.integration.config.js --testPathPatterns 'vender/edit-line'`
Expected: PASS (3 tests). Then the existing comanda item tests: `npx jest --config jest.integration.config.js --testPathPatterns 'comanda'` — Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/comanda/sessions/[id]/items/[itemId]/route.ts" __tests__/integration/vender/edit-line.test.ts
git commit -m "Comanda: edit modifiers and note of a line the kitchen does not have yet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Entrada, menu e redirecionamentos

**Files:**
- Modify: `lib/navigation/entry.ts`, `middleware.ts:120`, `app/auth/signin/page.tsx` (função `destinationAfterLogin`), `lib/navigation/app-nav.ts:41` e `DRAWER_PREFIXES`, `app/dashboard/page.tsx:91`, `lib/caixa/use-device-shift.ts`
- Test: `__tests__/unit/entry-redirect.test.ts`, `__tests__/unit/app-nav.test.ts`

> Os redirecionamentos de `/comanda` ficam na Task 8 (só quando `/vender/[sessionId]` existe). O teste do menu "every link opens a page that exists" passa depois da Task 6, que cria `app/vender/page.tsx`.

**Interfaces:**
- Produces: `homeFor(role: string | null | undefined): string` em `lib/navigation/entry.ts` (`CASHIER` → `/vender`, outros → `/dashboard`); `entryRedirect(pathname, callbackUrl, loggedIn, role?)`; `useDeviceShift()` devolve também `shiftOpenedAt: string | null`.

- [ ] **Step 1: Write the failing tests**

In `__tests__/unit/entry-redirect.test.ts`, add inside the `describe`:

```ts
  it('a cashier goes straight to the sales screen; the others to the dashboard', () => {
    expect(entryRedirect('/', null, true, 'CASHIER')).toBe('/vender');
    expect(entryRedirect('/auth/signin', null, true, 'OWNER')).toBe('/dashboard');
    expect(entryRedirect('/auth/signin', '/caixa', true, 'CASHIER')).toBe('/caixa');
  });
```

In `__tests__/unit/app-nav.test.ts`, change the cashier expectation and the drawer check:

```ts
    expect(hrefs(navFor('CASHIER', false))).toEqual(['/dashboard', '/vender', '/admin/integrations/orders', '/caixa']);
```
```ts
    expect(shellMode('/vender')).toBe('drawer');
    expect(shellMode('/vender/abc')).toBe('drawer');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config jest.unit.config.js __tests__/unit/entry-redirect.test.ts __tests__/unit/app-nav.test.ts`
Expected: FAIL (role ignored; `/comanda` in the cashier menu; `/vender` is `sidebar`)

- [ ] **Step 3: Implement**

`lib/navigation/entry.ts` — replace `entryRedirect` and add `homeFor`:

```ts
/** Where each person starts (spec 4.1): the counter goes straight to the sales screen */
export function homeFor(role: string | null | undefined): string {
  return role === 'CASHIER' ? '/vender' : HOME_AFTER_LOGIN;
}

/** Where a logged-in person on an entry page goes, or null to stay */
export function entryRedirect(pathname: string, callbackUrl: string | null, loggedIn: boolean, role?: string | null): string | null {
  if (!loggedIn || !ENTRY_PAGES.has(pathname)) return null;
  return safeCallback(callbackUrl) || homeFor(role);
}
```

`middleware.ts` line 120: `const to = entryRedirect(pathname, request.nextUrl.searchParams.get('callbackUrl'), !!token, (token as any)?.role);`

`app/auth/signin/page.tsx` — `destinationAfterLogin` returns `'/'` instead of `HOME_AFTER_LOGIN` when there is no callback (the middleware then sends the person to `homeFor(role)`, which the login page does not know yet):

```ts
/** The page the person was trying to open, else "/" (the middleware sends each role to its start page) */
function destinationAfterLogin(): string {
  if (typeof window === 'undefined') return '/';
  return safeCallback(new URLSearchParams(window.location.search).get('callbackUrl')) || '/';
}
```
and remove `HOME_AFTER_LOGIN` from that file's import if it is no longer used.

`lib/navigation/app-nav.ts`: line 41 becomes `{ label: 'Mesas e balcão', href: '/vender', roles: FRONT },` and `const DRAWER_PREFIXES = ['/vender', '/comanda', '/cozinha'];`.

`app/dashboard/page.tsx` line 91: `href: '/vender'`.

`lib/caixa/use-device-shift.ts`: add `const [shiftOpenedAt, setShiftOpenedAt] = useState<string | null>(null);`, after `setShiftId(...)` add `setShiftOpenedAt(listed?.openSession?.openedAt ?? null);`, and return `{ loading, register, shiftId, shiftOpenedAt, refresh }`.

- [ ] **Step 4: Run tests**

Run: `npx jest --config jest.unit.config.js __tests__/unit/entry-redirect.test.ts __tests__/unit/app-nav.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors. The nav test "every link opens a page that exists" fails until `app/vender/page.tsx` exists — run Task 6 first if executing strictly, or accept that this one test passes after Task 6.

- [ ] **Step 5: Commit**

```bash
git add lib/navigation/entry.ts middleware.ts app/auth/signin/page.tsx lib/navigation/app-nav.ts app/dashboard/page.tsx lib/caixa/use-device-shift.ts __tests__/unit/entry-redirect.test.ts __tests__/unit/app-nav.test.ts
git commit -m "Vender: cashier starts on /vender; menu and dashboard point to it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Tela `/vender` (mapa)

**Files:**
- Create: `components/vender/cash-bar.tsx`, `components/vender/salao-grid.tsx`, `app/vender/page.tsx`

**Interfaces:**
- Consumes: `Salao`, `SalaoTable`, `SalaoSession` (Task 2); `openFor` (Task 1); `useDeviceShift().{ loading, register, shiftId, shiftOpenedAt, refresh }` (Task 5); `OpenShiftCard` (`components/caixa/open-shift-card.tsx`); `CounterSale` (`components/comanda/counter-sale.tsx`); `useOutbox().online`; `brl(cents)` (`components/caixa/money.ts`).
- Produces: `CashBar` (sem props), `SalaoGrid({ salao, section, onOpenTable, onOpenSession })`.

- [ ] **Step 1: `components/vender/cash-bar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { Button } from '@/components/ui/button';

/** Always-visible cash register status on the Vender screen (spec 4.1, item 1) */
export function CashBar() {
  const shift = useDeviceShift();
  const { data } = useSession();
  const [opening, setOpening] = useState(false);
  const role = (data?.user as any)?.role as string | undefined;
  const canOpen = ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'].includes(role ?? '');

  if (shift.loading || !shift.register) return null;
  if (shift.shiftId) {
    const since = shift.shiftOpenedAt ? new Date(shift.shiftOpenedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
    return (
      <Link href="/caixa" className="block rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-800">
        Caixa aberto · {shift.register.name}{since ? ` · desde ${since}` : ''}
      </Link>
    );
  }
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-900 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span>Caixa fechado{canOpen ? '' : ': peça para abrir o caixa antes de receber'}</span>
        {canOpen && !opening && <Button size="sm" onClick={() => setOpening(true)}>Abrir caixa</Button>}
      </div>
      {opening && (
        <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => { setOpening(false); shift.refresh(); }} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: `components/vender/salao-grid.tsx`**

```tsx
'use client';

import { brl } from '@/components/caixa/money';
import { openFor } from '@/lib/vender/rules';
import type { Salao, SalaoSession, SalaoTable } from '@/lib/vender/salao';

function Tile({ title, session, onClick }: { title: string; session: SalaoSession | null; onClick: () => void }) {
  const busy = !!session;
  return (
    <button
      onClick={onClick}
      className={`min-h-[88px] rounded-xl border-2 p-3 text-left transition active:scale-[0.98] ${
        busy ? 'bg-emerald-50 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'
      }`}
    >
      <div className="text-lg font-bold">{title}</div>
      {busy ? (
        <div className="text-sm">
          {brl(session!.totalCents)} · {openFor(session!.openedAt, new Date())}
          {session!.newCount > 0 && <span className="ml-1 text-amber-700">· {session!.newCount} a enviar</span>}
        </div>
      ) : (
        <div className="text-sm">Livre</div>
      )}
    </button>
  );
}

/** The tables of the chosen section, then the comandas without a table (spec 4.1, items 5 and 6) */
export function SalaoGrid({ salao, section, onOpenTable, onOpenSession }: {
  salao: Salao;
  section: string | null;
  onOpenTable: (table: SalaoTable) => void;
  onOpenSession: (session: SalaoSession) => void;
}) {
  const tables = section ? salao.tables.filter((t) => t.sectionId === section) : salao.tables;
  return (
    <div className="space-y-6">
      {tables.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {tables.map((t) => (
            <Tile key={t.id} title={`Mesa ${t.number}`} session={t.session} onClick={() => onOpenTable(t)} />
          ))}
        </div>
      )}
      {salao.others.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 mb-2">Comandas e balcão</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {salao.others.map((s) => (
              <Tile key={s.id} title={s.label} session={s} onClick={() => onOpenSession(s)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `app/vender/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CashBar } from '@/components/vender/cash-bar';
import { SalaoGrid } from '@/components/vender/salao-grid';
import { CounterSale } from '@/components/comanda/counter-sale';
import { useOutbox } from '@/components/offline/outbox-provider';
import type { Salao, SalaoTable } from '@/lib/vender/salao';

/**
 * Vender: the room at a glance (spec 4.1). One tap on a free table opens its comanda; on a busy one,
 * goes into it. Refreshes every 10 s while visible, so waiters see each other's tables.
 */
export default function VenderPage() {
  const router = useRouter();
  const { online } = useOutbox();
  const [salao, setSalao] = useState<Salao | null>(null);
  const [stale, setStale] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [byName, setByName] = useState(false);
  const [name, setName] = useState('');
  const [counter, setCounter] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vender/salao', { cache: 'no-store' });
      if (!res.ok) return;
      setSalao(await res.json());
      setStale(res.headers.get('x-gastrux-cache') === 'stale');
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  async function openSession(body: { tableId?: string; customerName?: string }) {
    if (!online) {
      toast.error('Sem internet: não dá para abrir uma comanda nova agora. Use a Venda balcão, que fica guardada neste aparelho.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/comanda/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao abrir a comanda');
      router.push(`/vender/${data.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onTable(t: SalaoTable) {
    if (t.session) router.push(`/vender/${t.session.id}`);
    else if (!busy) openSession({ tableId: t.id });
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <CashBar />

      {(stale || !online) && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm">
          Sem internet: mostrando o salão como estava na última atualização.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={() => setByName((v) => !v)} className="gap-2"><Plus className="h-5 w-5" /> Comanda por nome</Button>
        <Button size="lg" variant="outline" onClick={() => setCounter((v) => !v)} className="gap-2"><ShoppingBag className="h-5 w-5" /> Venda balcão</Button>
      </div>

      {byName && (
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) openSession({ customerName: name.trim() }); }}
        >
          <Input autoFocus placeholder="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim() || busy}>Abrir</Button>
        </form>
      )}

      {counter && <CounterSale onDone={() => { setCounter(false); load(); }} />}

      <div className="flex items-center gap-2 border-b">
        <span className="px-3 py-2 font-semibold border-b-2 border-blue-600">Mesas</span>
        <Link href="/admin/integrations/orders" className="px-3 py-2 text-slate-600">
          Delivery{salao?.deliveryNew ? <span className="ml-1 rounded-full bg-red-600 text-white text-xs px-2">{salao.deliveryNew}</span> : null}
        </Link>
      </div>

      {salao && salao.sections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {[{ id: null as string | null, name: 'Todas' }, ...salao.sections].map((s) => (
            <button
              key={s.id ?? 'all'}
              onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${section === s.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!salao ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <div key={i} className="h-[88px] rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
        <>
          <SalaoGrid salao={salao} section={section} onOpenTable={onTable} onOpenSession={(s) => router.push(`/vender/${s.id}`)} />
          {salao.tables.length === 0 && (
            <p className="text-sm text-slate-500">
              Nenhuma mesa cadastrada. <Link className="underline" href="/admin/tables">Cadastrar mesas</Link> ou use Comanda por nome.
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type check and the nav test**

Run: `npx tsc --noEmit -p . && npx jest --config jest.unit.config.js __tests__/unit/app-nav.test.ts`
Expected: no errors; PASS (the "every link opens a page that exists" test now finds `/vender`).

- [ ] **Step 5: Commit**

```bash
git add components/vender/cash-bar.tsx components/vender/salao-grid.tsx app/vender/page.tsx
git commit -m "Vender: the room map (tables, comandas, cash bar, delivery tab)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Hook `useComanda`

**Files:**
- Create: `components/vender/use-comanda.ts`

**Interfaces:**
- Consumes: `useOutbox().{ send, pendingFor, online }` (`components/offline/outbox-provider.tsx`); `mergeTarget`, `isUnsent`, `unsentCount`, `groupByCategory`, `entryRecipeId`, `MenuEntry` (Task 1); `lineTotalCents` (`lib/comanda/line-total.ts`).
- Produces:
  - `interface ComandaLine { id: string; recipeId: string; addedAt?: string; pending?: boolean; quantity: number; price: string | number; specialInstructions?: string | null; recipe: { name: string }; modifiers?: Array<{ modifierId?: string; priceAdjustment: string | number; modifier?: { name: string } }> }`
  - `interface ComandaSession { id: string; status?: string; sentToKitchenAt?: string | null; openedAt?: string; customerName?: string | null; tableNumber?: number | null; table?: { number: number; section?: { name: string } } | null; user?: { name: string | null } | null; items: ComandaLine[] }`
  - `interface Modifier { id: string; name: string; category?: string | null; priceAdjustment: number }`
  - `interface LineDetails { quantity: number; modifierIds: string[]; notes: string }`
  - `useComanda(sessionId: string)` returns `{ session, menu, groups, modifiers, loading, staleSince, online, lines, isClosed, totalCents, newCount, quickAdd(entry: MenuEntry): Promise<void>, addWithDetails(entry: MenuEntry, d: LineDetails): Promise<boolean>, saveLine(line: ComandaLine, d: LineDetails): Promise<boolean>, removeLine(line: ComandaLine): Promise<void>, sendToKitchen(): Promise<boolean>, refresh(): Promise<void>, mutate }`
  - `mutate(method, url, body, label, display?)`: same contract as today's comanda page (returns `Response | null`, `null` = queued offline).

- [ ] **Step 1: Write the hook**

```ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useOutbox } from '@/components/offline/outbox-provider';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { entryRecipeId, groupByCategory, isUnsent, mergeTarget, unsentCount, type MenuEntry } from '@/lib/vender/rules';

export interface ComandaLine {
  id: string;
  recipeId: string;
  addedAt?: string;
  pending?: boolean;
  quantity: number;
  price: string | number;
  specialInstructions?: string | null;
  recipe: { name: string };
  modifiers?: Array<{ modifierId?: string; priceAdjustment: string | number; modifier?: { name: string } }>;
}
export interface ComandaSession {
  id: string;
  status?: string;
  sentToKitchenAt?: string | null;
  openedAt?: string;
  customerName?: string | null;
  tableNumber?: number | null;
  table?: { number: number; section?: { name: string } } | null;
  user?: { name: string | null } | null;
  items: ComandaLine[];
}
export interface Modifier { id: string; name: string; category?: string | null; priceAdjustment: number }
export interface LineDetails { quantity: number; modifierIds: string[]; notes: string }

/**
 * State and actions of one comanda (spec 4.2). Every change goes through the device outbox, as the
 * old comanda screen did: offline it waits on this device and is sent once, in order, later.
 */
export function useComanda(sessionId: string) {
  const { send, pendingFor, online } = useOutbox();
  const [session, setSession] = useState<ComandaSession | null>(null);
  const [menu, setMenu] = useState<MenuEntry[]>([]);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [staleSince, setStaleSince] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}`);
      if (res.ok) {
        setSession(await res.json());
        setStaleSince(res.headers.get('x-gastrux-cache') === 'stale' ? res.headers.get('x-gastrux-cached-at') : null);
      } else if (res.status === 503) {
        toast.error('Sem internet e esta comanda não está guardada neste aparelho.');
      }
    } catch {
      toast.error('Erro ao carregar a comanda');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    fetch('/api/cardapio/itens').then((r) => (r.ok ? r.json() : [])).then((items) => setMenu(items || [])).catch(() => {});
    fetch('/api/modifiers').then((r) => (r.ok ? r.json() : {})).then((d) => setModifiers(d.modifiers || [])).catch(() => {});
  }, [refresh]);

  // A change made offline reached the server: show the comanda as the server has it now
  useEffect(() => {
    const onSent = (event: Event) => { if ((event as CustomEvent).detail?.scope === sessionId) refresh(); };
    window.addEventListener('gastrux:outbox-sent', onSent);
    return () => window.removeEventListener('gastrux:outbox-sent', onSent);
  }, [sessionId, refresh]);

  const mutate = useCallback(async (
    method: 'POST' | 'PUT' | 'DELETE', url: string, body: unknown, label: string, display?: Record<string, unknown>,
  ): Promise<Response | null> => {
    const result = await send({ method, url, body, label, scope: sessionId, queueable: true, display });
    if (result.queued) {
      toast.info(`Sem internet: "${label}" ficou guardado neste aparelho e será enviado quando a conexão voltar.`);
      return null;
    }
    return result.response;
  }, [send, sessionId]);

  // What this device still has to send for this comanda (made offline)
  const pendingOps = pendingFor(sessionId);
  const pendingRemovals = new Set(pendingOps.filter((e) => e.method === 'DELETE').map((e) => e.url.split('/').pop()));
  const pendingLines: ComandaLine[] = pendingOps
    .filter((e) => e.method === 'POST' && e.url.endsWith('/items'))
    .map((e) => ({
      id: e.id,
      recipeId: String((e.display as any)?.recipeId ?? ''),
      pending: true,
      quantity: Number((e.display as any)?.quantity ?? 1),
      price: Number((e.display as any)?.unitPrice ?? 0),
      recipe: { name: String((e.display as any)?.name ?? 'Item') },
      modifiers: ((e.display as any)?.modifiers ?? []) as ComandaLine['modifiers'],
      specialInstructions: ((e.display as any)?.notes as string) || null,
    }));
  const lines: ComandaLine[] = [...(session?.items ?? []).filter((i) => !pendingRemovals.has(i.id)), ...pendingLines];
  const closePending = pendingOps.some((e) => e.method === 'PUT' && (e.body as any)?.status === 'CLOSED');
  const isClosed = session?.status === 'CLOSED' || session?.status === 'CANCELLED' || closePending;
  const sent = session?.sentToKitchenAt ?? null;
  const totalCents = lines.reduce((s, l) => s + lineTotalCents(l.price, l.quantity, (l.modifiers ?? []).map((m) => m.priceAdjustment)), 0);
  const newCount = unsentCount(lines, sent);
  const groups = useMemo(() => groupByCategory(menu), [menu]);

  async function postLine(entry: MenuEntry, d: LineDetails): Promise<Response | null> {
    const chosen = modifiers.filter((m) => d.modifierIds.includes(m.id));
    return mutate(
      'POST',
      `/api/comanda/sessions/${sessionId}/items`,
      { menuItemId: entry.id, recipeId: entryRecipeId(entry), quantity: d.quantity, modifierIds: d.modifierIds, specialInstructions: d.notes.trim() || null },
      `${d.quantity}x ${entry.name}`,
      {
        name: entry.name, recipeId: entryRecipeId(entry), quantity: d.quantity, unitPrice: Number(entry.price), notes: d.notes.trim(),
        modifiers: chosen.map((m) => ({ priceAdjustment: m.priceAdjustment, modifier: { name: m.name } })),
      },
    );
  }

  /** One tap = one unit (spec 4.2): into the same new plain line when there is one, with Desfazer */
  async function quickAdd(entry: MenuEntry) {
    if (isClosed) return;
    const target = online ? mergeTarget(lines as any, sent, entry) : null;
    if (target) {
      const res = await mutate('PUT', `/api/comanda/sessions/${sessionId}/items/${target.id}`, { quantity: target.quantity + 1 }, `+1 ${entry.name}`);
      if (res && !res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Erro ao lançar'); return; }
      await refresh();
      toast.success(`${entry.name} +1`, {
        duration: 5000,
        action: { label: 'Desfazer', onClick: () => undo({ ...target, quantity: target.quantity + 1 } as ComandaLine, target.quantity) },
      });
      return;
    }
    const res = await postLine(entry, { quantity: 1, modifierIds: [], notes: '' });
    if (res && !res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Erro ao lançar'); return; }
    const created = res ? await res.json().catch(() => null) : null;
    await refresh();
    toast.success(`${entry.name} +1`, {
      duration: 5000,
      ...(created?.id ? { action: { label: 'Desfazer', onClick: () => undo(created as ComandaLine, 0) } } : {}),
    });
  }

  /** Undo of a tap: back to the previous quantity, or remove the line; a line the kitchen got in the
   *  meantime follows the normal removal (a manager, with a reason) — never a silent removal */
  async function undo(line: ComandaLine, previousQuantity: number) {
    const fresh = await fetch(`/api/comanda/sessions/${sessionId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const sentNow = fresh?.sentToKitchenAt ?? sent;
    if (!isUnsent({ addedAt: line.addedAt }, sentNow)) {
      toast.warning('A cozinha já recebeu este item: para tirar, toque nele e use "Remover com motivo".');
      return;
    }
    const res = previousQuantity > 0
      ? await mutate('PUT', `/api/comanda/sessions/${sessionId}/items/${line.id}`, { quantity: previousQuantity }, 'Desfazer')
      : await mutate('DELETE', `/api/comanda/sessions/${sessionId}/items/${line.id}`, {}, 'Desfazer');
    if (res && !res.ok) toast.error((await res.json().catch(() => ({}))).error || 'Não foi possível desfazer');
    await refresh();
  }

  async function addWithDetails(entry: MenuEntry, d: LineDetails): Promise<boolean> {
    const res = await postLine(entry, d);
    if (res && !res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Erro ao lançar'); return false; }
    await refresh();
    return true;
  }

  async function saveLine(line: ComandaLine, d: LineDetails): Promise<boolean> {
    const res = await mutate(
      'PUT',
      `/api/comanda/sessions/${sessionId}/items/${line.id}`,
      { quantity: d.quantity, modifierIds: d.modifierIds, specialInstructions: d.notes.trim() || null },
      `Alterar ${line.recipe.name}`,
    );
    if (res && !res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Erro ao salvar'); return false; }
    await refresh();
    return true;
  }

  // An item the kitchen already has is a cancellation: a manager, with a reason (rule of the API)
  async function removeLine(line: ComandaLine) {
    let reason: string | undefined;
    if (!isUnsent(line, sent)) {
      const asked = window.prompt('A cozinha já recebeu este item (exige gerente). Motivo do cancelamento:');
      if (!asked || !asked.trim()) return;
      reason = asked.trim();
    }
    const res = await mutate('DELETE', `/api/comanda/sessions/${sessionId}/items/${line.id}`, reason ? { reason } : {}, `Remover ${line.recipe.name}`);
    if (res && !res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Erro ao remover'); return; }
    if (res) toast.success('Item removido');
    await refresh();
  }

  async function sendToKitchen(): Promise<boolean> {
    if (newCount === 0) return false;
    const res = await mutate('POST', `/api/comanda/sessions/${sessionId}/send-to-kitchen`, {}, 'Enviar para a cozinha');
    if (!res) {
      toast.warning('A cozinha só recebe este pedido quando a internet voltar: avise a cozinha agora.', { duration: 10000 });
      return false;
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Erro ao enviar'); return false; }
    toast.success(`Enviado para a cozinha${data.order?.orderNumber ? ` (pedido ${data.order.orderNumber})` : ''}`);
    await refresh();
    return true;
  }

  return { session, menu, groups, modifiers, loading, staleSince, online, lines, isClosed, totalCents, newCount, quickAdd, addWithDetails, saveLine, removeLine, sendToKitchen, refresh, mutate };
}
```

Check: the session GET (`app/api/comanda/sessions/[id]/route.ts`) includes `items.modifiers.modifier`; confirm it also returns `items[].recipeId`, `items[].specialInstructions` and `items[].modifiers[].modifierId` (Prisma `include` returns all scalar fields, so yes) and `user.name` (included).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/vender/use-comanda.ts
git commit -m "Vender: useComanda hook (one-tap add with undo, edit, remove, send; offline outbox)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Comanda rápida `/vender/[sessionId]` e redirecionamentos

**Files:**
- Create: `components/vender/menu-panel.tsx`, `components/vender/item-sheet.tsx`, `components/vender/comanda-panel.tsx`, `components/vender/close-bill-dialog.tsx`, `app/vender/[sessionId]/page.tsx`
- Replace: `app/comanda/page.tsx`, `app/comanda/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `useComanda` and its types (Task 7); `MenuEntry`, `MenuGroup`, `isUnsent`, `openFor`, `sessionLabel` (Task 1); `useDeviceShift` (Task 5); `PaymentPanel`, `panelState`, `PanelPayment` (`components/caixa/payment-panel`); `toApiAmount` (`components/caixa/panel-state`); `OpenShiftCard`; `brl`; `printInHiddenFrame` (`lib/print/print-frame`); `useOutbox().send`; `OfflineUnavailableError` (`lib/offline/outbox`).
- Produces: `MenuPanel({ groups, disabled, onTap, onDetails })`, `ItemSheet({ title, modifiers, initial, sent, onSave, onRemove, onClose })`, `ComandaPanel({ lines, sentToKitchenAt, totalCents, newCount, isClosed, onLine, onSend, onConta })`, `CloseBillDialog({ sessionId, totalCents, status, hasItems, mutate, onClosed, onCancel })`.

- [ ] **Step 1: `components/vender/menu-panel.tsx`**

```tsx
'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { brl } from '@/components/caixa/money';
import { toCents } from '@/lib/comanda/line-total';
import type { MenuEntry, MenuGroup } from '@/lib/vender/rules';

const HOLD_MS = 500;

/** Menu by category (spec 4.2): a tap adds one unit; holding or "⋯" opens the item sheet first */
export function MenuPanel({ groups, disabled, onTap, onDetails }: {
  groups: MenuGroup[];
  disabled: boolean;
  onTap: (entry: MenuEntry) => void;
  onDetails: (entry: MenuEntry) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const query = q.trim().toLowerCase();
  const shown = query
    ? groups.map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(query)) })).filter((g) => g.items.length)
    : groups.filter((g) => g.id === (active ?? groups[0]?.id));

  const press = (entry: MenuEntry) => {
    held.current = false;
    holdTimer.current = setTimeout(() => { held.current = true; onDetails(entry); }, HOLD_MS);
  };
  const release = (entry: MenuEntry) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!held.current && !disabled) onTap(entry);
  };
  const cancel = () => { if (holdTimer.current) clearTimeout(holdTimer.current); held.current = true; };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar no cardápio" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!query && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setActive(g.id)}
              className={`px-3 py-2 rounded-full text-sm whitespace-nowrap ${(active ?? groups[0]?.id) === g.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {g.emoji ? `${g.emoji} ` : ''}{g.name}
            </button>
          ))}
        </div>
      )}
      {shown.map((g) => (
        <div key={g.id}>
          {query && <h3 className="text-xs font-semibold text-slate-500 mb-1">{g.name}</h3>}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {g.items.map((entry) => (
              <div key={entry.id} className="relative">
                <button
                  disabled={disabled}
                  onPointerDown={() => press(entry)}
                  onPointerUp={() => release(entry)}
                  onPointerLeave={cancel}
                  onContextMenu={(e) => e.preventDefault()}
                  className="w-full min-h-[72px] rounded-xl border bg-white p-3 pr-9 text-left active:bg-blue-50 disabled:opacity-50 select-none"
                >
                  <div className="font-semibold text-sm leading-tight line-clamp-2">{entry.name}</div>
                  <div className="text-sm text-emerald-700 mt-1">{brl(toCents(entry.price))}</div>
                </button>
                <button
                  aria-label={`Detalhes de ${entry.name}`}
                  disabled={disabled}
                  onClick={() => onDetails(entry)}
                  className="absolute top-1 right-1 p-2 text-slate-400 hover:text-slate-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-slate-500">Cardápio vazio. Cadastre os itens em Cardápio digital.</p>}
    </div>
  );
}
```

Check `toCents` signature in `lib/comanda/line-total.ts` (`toCents(value: unknown): number`) — it exists there.

- [ ] **Step 2: `components/vender/item-sheet.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import type { LineDetails, Modifier } from '@/components/vender/use-comanda';

/**
 * The item sheet (spec 4.2): quantity, modifiers, note. For a line the kitchen already has, only the
 * details and "Remover com motivo".
 */
export function ItemSheet({ title, modifiers, initial, sent, saveLabel, onSave, onRemove, onClose }: {
  title: string;
  modifiers: Modifier[];
  initial: LineDetails;
  sent: boolean;
  saveLabel: string;
  onSave: (d: LineDetails) => Promise<boolean>;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<LineDetails>(initial);
  const [saving, setSaving] = useState(false);
  const byCategory = modifiers.reduce((acc, m) => {
    const c = m.category || 'Adicionais';
    (acc[c] ||= []).push(m);
    return acc;
  }, {} as Record<string, Modifier[]>);
  const toggle = (id: string) => setD((x) => ({ ...x, modifierIds: x.modifierIds.includes(id) ? x.modifierIds.filter((i) => i !== id) : [...x.modifierIds, id] }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[85vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold">{title}</h2>

        {sent ? (
          <p className="text-sm text-slate-600">A cozinha já recebeu este item. Para tirar da conta, use “Remover com motivo”.</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" aria-label="Menos" onClick={() => setD((x) => ({ ...x, quantity: Math.max(1, x.quantity - 1) }))}><Minus className="h-4 w-4" /></Button>
              <span className="text-2xl font-bold w-10 text-center">{d.quantity}</span>
              <Button variant="outline" size="icon" aria-label="Mais" onClick={() => setD((x) => ({ ...x, quantity: x.quantity + 1 }))}><Plus className="h-4 w-4" /></Button>
            </div>

            {Object.entries(byCategory).map(([cat, mods]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-500 mb-1">{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {mods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`px-3 py-2 rounded-lg text-sm border ${d.modifierIds.includes(m.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
                    >
                      {m.name}{Number(m.priceAdjustment) ? ` +${brl(Math.round(Number(m.priceAdjustment) * 100))}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <label htmlFor="item-notes" className="text-xs font-semibold text-slate-500">Observação</label>
              <textarea
                id="item-notes"
                maxLength={140}
                className="w-full border rounded-md p-2 text-sm"
                placeholder="Ex.: sem cebola, bem passado"
                value={d.notes}
                onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))}
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {onRemove && <Button variant="outline" className="text-red-600 mr-auto" onClick={onRemove}>{sent ? 'Remover com motivo' : 'Remover'}</Button>}
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          {!sent && (
            <Button disabled={saving} onClick={async () => { setSaving(true); const ok = await onSave(d); setSaving(false); if (ok) onClose(); }}>
              {saveLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `components/vender/comanda-panel.tsx`**

```tsx
'use client';

import { Send, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { isUnsent } from '@/lib/vender/rules';
import type { ComandaLine } from '@/components/vender/use-comanda';

/** The comanda list with total, "Enviar para cozinha (N)" and "Conta" (spec 4.2) */
export function ComandaPanel({ lines, sentToKitchenAt, totalCents, newCount, isClosed, onLine, onSend, onConta }: {
  lines: ComandaLine[];
  sentToKitchenAt: string | null | undefined;
  totalCents: number;
  newCount: number;
  isClosed: boolean;
  onLine: (line: ComandaLine) => void;
  onSend: () => void;
  onConta: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum item. Toque no cardápio para lançar.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => {
            const fresh = isUnsent(l, sentToKitchenAt);
            return (
              <li key={l.id}>
                <button onClick={() => !l.pending && onLine(l)} className={`w-full text-left rounded-lg p-3 border ${fresh ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-sm">{l.quantity}x {l.recipe.name}</span>
                    <span className="text-sm">{brl(lineTotalCents(l.price, l.quantity, (l.modifiers ?? []).map((m) => m.priceAdjustment)))}</span>
                  </div>
                  {(l.modifiers ?? []).map((m, i) => <div key={i} className="text-xs text-slate-500">+ {m.modifier?.name ?? 'Adicional'}</div>)}
                  {l.specialInstructions && <div className="text-xs text-slate-700 italic">“{l.specialInstructions}”</div>}
                  <div className="text-xs mt-1 text-slate-500">{l.pending ? 'guardado neste aparelho' : fresh ? 'a enviar' : 'na cozinha'}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-between items-center border-t pt-3">
        <span className="font-semibold">Total</span>
        <span className="text-2xl font-bold text-emerald-700">{brl(totalCents)}</span>
      </div>
      <Button size="lg" className="gap-2" disabled={newCount === 0 || isClosed} onClick={onSend}>
        <Send className="h-5 w-5" /> Enviar para cozinha{newCount ? ` (${newCount})` : ''}
      </Button>
      <Button size="lg" variant="outline" className="gap-2" disabled={lines.length === 0} onClick={onConta}>
        <Receipt className="h-5 w-5" /> Conta
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: `components/vender/close-bill-dialog.tsx`** — the current close-bill and NFC-e dialogs, moved from `app/comanda/[sessionId]/page.tsx` with the same rules (spec 10, etapa 1: "o fechamento de conta continua o diálogo atual até a etapa 2"). NFC-e becomes a button inside this dialog (spec 4.5).

```tsx
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Printer, Receipt, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PaymentPanel, panelState, type PanelPayment } from '@/components/caixa/payment-panel';
import { toApiAmount } from '@/components/caixa/panel-state';
import { OpenShiftCard } from '@/components/caixa/open-shift-card';
import { brl } from '@/components/caixa/money';
import { useDeviceShift } from '@/lib/caixa/use-device-shift';
import { useOutbox } from '@/components/offline/outbox-provider';
import { OfflineUnavailableError } from '@/lib/offline/outbox';
import { printInHiddenFrame } from '@/lib/print/print-frame';

type Mutate = (method: 'POST' | 'PUT' | 'DELETE', url: string, body: unknown, label: string) => Promise<Response | null>;

/**
 * Closing the bill (caixa spec 2026-10-04, §8.3) and the NFC-e, moved from the old comanda screen
 * unchanged. Replaced by the Conta screen in stage 2 (spec 2026-10-07, 4.3).
 */
export function CloseBillDialog({ sessionId, totalCents, status, hasItems, mutate, onClosed, onCancel }: {
  sessionId: string;
  totalCents: number;
  status?: string;
  hasItems: boolean;
  mutate: Mutate;
  onClosed: () => void;
  onCancel: () => void;
}) {
  const shift = useDeviceShift();
  const { send } = useOutbox();
  const [cpf, setCpf] = useState('');
  const [payments, setPayments] = useState<PanelPayment[]>([]);
  const [closing, setClosing] = useState(false);
  const [nfceOpen, setNfceOpen] = useState(false);
  const [nfceName, setNfceName] = useState('');
  const [emitting, setEmitting] = useState(false);
  const [emittedDoc, setEmittedDoc] = useState<{ id: string; documentNumber: number } | null>(null);
  const closed = status === 'CLOSED';

  async function close() {
    try {
      setClosing(true);
      const res = await mutate(
        'PUT',
        `/api/comanda/sessions/${sessionId}`,
        {
          status: 'CLOSED',
          customerCPF: cpf.replace(/\D/g, '') || undefined,
          cashSessionId: shift.shiftId,
          payments: payments.map((p) => ({ method: p.method, amount: toApiAmount(p.amount) })),
          ...(typeof navigator !== 'undefined' && !navigator.onLine ? { queuedAt: new Date().toISOString() } : {}),
        },
        'Fechar conta',
      );
      if (!res) {
        toast.warning('A NFC-e será emitida quando a internet voltar.', { duration: 8000 });
        onClosed();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'CASH_SESSION_REQUIRED') shift.refresh();
        toast.error(data.error || 'Erro ao fechar a conta');
        return;
      }
      if (data.changeCents > 0) toast.success(`Troco: ${brl(data.changeCents)}`, { duration: 15000 });
      toast.success('Conta fechada', {
        action: { label: 'Imprimir cupom', onClick: () => printInHiddenFrame(`/imprimir/cupom/${sessionId}`) },
        duration: 15000,
      });
      const nfce = data.nfce;
      if (nfce?.nfce?.status === 'authorized') {
        toast.success(nfce.message);
        setEmittedDoc({ id: nfce.nfce.id, documentNumber: nfce.nfce.number });
      } else if (nfce?.nfce) toast.warning(nfce.message, { duration: 10000 });
      else if (nfce?.message) toast.info(nfce.message);
      setPayments([]);
      onClosed();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao fechar a conta');
    } finally {
      setClosing(false);
    }
  }

  async function emit() {
    try {
      setEmitting(true);
      // Needs the internet (a note cannot be signed on this device): refused offline, never queued
      const result = await send({
        method: 'POST', url: '/api/nfe/emit', label: 'Emitir NFC-e', queueable: false,
        body: { orderSessionId: sessionId, customerCPF: cpf.replace(/\D/g, '') || undefined, customerName: nfceName.trim() || undefined },
      });
      if (result.queued) return;
      const data = await result.response.json();
      if (!result.response.ok || !data.success) toast.error(data.rejectionReason || data.error || 'Erro ao emitir NFC-e');
      else { toast.success('NFC-e emitida!'); setEmittedDoc(data.document); setNfceOpen(false); }
    } catch (e: any) {
      toast.error(e instanceof OfflineUnavailableError ? e.message : e?.message || 'Erro');
    } finally {
      setEmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-2 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" /> Conta</h2>
        <p className="text-sm text-gray-600 mb-4">
          Total: <strong>{brl(totalCents)}</strong>. A NFC-e é emitida ao fechar, se a emissão automática estiver ligada.
        </p>

        {!closed && (
          <div className="space-y-3">
            <div>
              <label htmlFor="close-cpf" className="text-sm font-semibold block mb-1">CPF na nota?</label>
              <Input id="close-cpf" placeholder="Opcional. Ex: 123.456.789-09" value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={closing} />
            </div>
            {shift.loading ? (
              <p className="text-sm">Carregando caixa...</p>
            ) : !shift.shiftId && shift.register ? (
              <div className="rounded-md bg-amber-50 p-3 space-y-2">
                <p className="text-sm font-semibold">Abra o caixa para receber</p>
                <OpenShiftCard registerId={shift.register.id} registerName={shift.register.name} onOpened={() => shift.refresh()} />
              </div>
            ) : (
              <PaymentPanel totalCents={totalCents} payments={payments} onChange={setPayments} disabled={closing} />
            )}
          </div>
        )}

        {closed && (
          <div className="space-y-2">
            <Button variant="outline" className="w-full gap-2" onClick={() => printInHiddenFrame(`/imprimir/cupom/${sessionId}`)}>
              <Printer className="w-4 h-4" /> Imprimir cupom
            </Button>
            {emittedDoc ? (
              <a href={`/admin/nfe/documents/${emittedDoc.id}`} target="_blank" rel="noopener" className="inline-flex items-center justify-center w-full text-sm font-semibold gap-1 underline">
                <FileText className="w-4 h-4" /> Ver NFC-e #{String(emittedDoc.documentNumber).padStart(6, '0')}
              </a>
            ) : nfceOpen ? (
              <div className="space-y-2 rounded-md border p-3">
                <Input placeholder="CPF do cliente (opcional)" value={cpf} onChange={(e) => setCpf(e.target.value)} disabled={emitting} />
                <Input placeholder="Nome do cliente (opcional)" value={nfceName} onChange={(e) => setNfceName(e.target.value)} disabled={emitting} />
                <Button className="w-full" onClick={emit} disabled={emitting}>{emitting ? 'Emitindo...' : 'Emitir NFC-e'}</Button>
              </div>
            ) : (
              <Button variant="outline" className="w-full gap-2" disabled={!hasItems} onClick={() => setNfceOpen(true)}>
                <Receipt className="w-4 h-4" /> Emitir NFC-e
              </Button>
            )}
          </div>
        )}

        <div className="flex gap-2 mt-4 justify-end">
          <Button variant="outline" onClick={() => { setPayments([]); onCancel(); }} disabled={closing}>Voltar</Button>
          {!closed && (
            <Button
              onClick={close}
              disabled={closing || !shift.shiftId || !panelState(totalCents, payments).valid}
              className="bg-green-600"
            >
              {closing ? 'Fechando...' : 'Fechar conta'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: `app/vender/[sessionId]/page.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { useComanda, type ComandaLine } from '@/components/vender/use-comanda';
import { MenuPanel } from '@/components/vender/menu-panel';
import { ItemSheet } from '@/components/vender/item-sheet';
import { ComandaPanel } from '@/components/vender/comanda-panel';
import { CloseBillDialog } from '@/components/vender/close-bill-dialog';
import { isUnsent, openFor, sessionLabel, type MenuEntry } from '@/lib/vender/rules';

const DESKTOP = '(min-width: 1024px)';

/** The quick comanda (spec 4.2) */
export default function ComandaRapidaPage() {
  const router = useRouter();
  const sessionId = String(useParams().sessionId);
  const c = useComanda(sessionId);
  const [sheet, setSheet] = useState<{ entry?: MenuEntry; line?: ComandaLine } | null>(null);
  const [showList, setShowList] = useState(false);
  const [showConta, setShowConta] = useState(false);
  const [desktop, setDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const set = () => setDesktop(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  if (c.loading) return <div className="p-6">Carregando...</div>;
  if (!c.session) return <div className="p-6">Comanda não encontrada. <Button variant="link" onClick={() => router.push('/vender')}>Voltar ao salão</Button></div>;

  const s = c.session;
  async function onSend() {
    const ok = await c.sendToKitchen();
    // On a phone the waiter's next step is another table; on the counter computer, stay (spec 4.2)
    if (ok && !desktop) router.push('/vender');
  }

  const panel = (
    <ComandaPanel
      lines={c.lines}
      sentToKitchenAt={s.sentToKitchenAt}
      totalCents={c.totalCents}
      newCount={c.newCount}
      isClosed={c.isClosed}
      onLine={(line) => setSheet({ line })}
      onSend={onSend}
      onConta={() => setShowConta(true)}
    />
  );

  const sheetLine = sheet?.line;
  const sheetSent = sheetLine ? !isUnsent(sheetLine, s.sentToKitchenAt) : false;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto pb-28 lg:pb-6">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" aria-label="Voltar ao salão" onClick={() => router.push('/vender')}><ArrowLeft className="h-6 w-6" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{sessionLabel(s)}</h1>
          <p className="text-sm text-slate-500">
            {s.openedAt ? `aberta há ${openFor(s.openedAt, new Date())}` : ''}{s.user?.name ? ` · ${s.user.name}` : ''}
          </p>
        </div>
      </div>

      {(c.staleSince || !c.online) && (
        <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          Sem internet: esta é a comanda como estava
          {c.staleSince ? ` às ${new Date(c.staleSince).toLocaleTimeString('pt-BR')}` : ' na última atualização'}. O que você
          fizer agora fica guardado neste aparelho e é enviado quando a conexão voltar.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MenuPanel groups={c.groups} disabled={c.isClosed} onTap={c.quickAdd} onDetails={(entry) => setSheet({ entry })} />
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-4 rounded-xl border bg-white p-4">{panel}</div>
        </div>
      </div>

      {/* Phone: fixed bar (spec 4.2) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t p-3 flex items-center gap-2">
        <button className="flex-1 text-left" onClick={() => setShowList(true)}>
          <div className="text-xs text-slate-500 flex items-center gap-1">{c.lines.length} itens <ChevronUp className="h-3 w-3" /></div>
          <div className="text-lg font-bold">{brl(c.totalCents)}</div>
        </button>
        <Button disabled={c.newCount === 0 || c.isClosed} onClick={onSend}>Enviar{c.newCount ? ` (${c.newCount})` : ''}</Button>
        <Button variant="outline" onClick={() => setShowList(true)}>Ver comanda</Button>
      </div>

      {showList && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setShowList(false)}>
          <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>{panel}</div>
        </div>
      )}

      {sheet?.entry && (
        <ItemSheet
          title={sheet.entry.name}
          modifiers={c.modifiers}
          initial={{ quantity: 1, modifierIds: [], notes: '' }}
          sent={false}
          saveLabel="Lançar"
          onSave={(d) => c.addWithDetails(sheet.entry!, d)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheetLine && (
        <ItemSheet
          title={sheetLine.recipe.name}
          modifiers={c.modifiers}
          initial={{
            quantity: sheetLine.quantity,
            modifierIds: (sheetLine.modifiers ?? []).map((m) => m.modifierId).filter((x): x is string => !!x),
            notes: sheetLine.specialInstructions ?? '',
          }}
          sent={sheetSent}
          saveLabel="Salvar"
          onSave={(d) => c.saveLine(sheetLine, d)}
          onRemove={c.isClosed ? undefined : async () => { await c.removeLine(sheetLine); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}

      {showConta && (
        <CloseBillDialog
          sessionId={sessionId}
          totalCents={c.totalCents}
          status={s.status}
          hasItems={c.lines.length > 0}
          mutate={c.mutate}
          onClosed={async () => { await c.refresh(); }}
          onCancel={() => setShowConta(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Redirect the old addresses**

`app/comanda/page.tsx` (replace the whole file):

```tsx
import { redirect } from 'next/navigation';

/** The comanda list became the Vender screen (spec 2026-10-07, 4.1); old links and installed apps land there */
export default function ComandaRedirect() {
  redirect('/vender');
}
```

`app/comanda/[sessionId]/page.tsx` (replace the whole file):

```tsx
import { redirect } from 'next/navigation';

/** A comanda opens on the quick comanda screen (spec 2026-10-07, 4.2) */
export default function ComandaSessionRedirect({ params }: { params: { sessionId: string } }) {
  redirect(`/vender/${params.sessionId}`);
}
```

Then search for links to the old screens and point them to `/vender`: `grep -rn "'/comanda\|\`/comanda\|\"/comanda" app components lib --include=*.tsx --include=*.ts | grep -v "api/comanda"` — update each hit (keep `/api/comanda/*` untouched).

- [ ] **Step 7: Type check and all unit tests**

Run: `npx tsc --noEmit -p . && npx jest --config jest.unit.config.js`
Expected: no type errors; all PASS.

- [ ] **Step 8: Commit**

```bash
git add components/vender app/vender app/comanda
git commit -m "Vender: quick comanda (categories, one tap adds, item sheet with note, phone bar)

/comanda and /comanda/[id] now redirect to /vender. The close-bill dialog
moved unchanged into components/vender/close-bill-dialog.tsx, with NFC-e
inside it; the Conta screen replaces it in stage 2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Conferência, publicação e manual

**Files:**
- Modify: Claude Doc manual (https://claude.ai/code/artifact/e47fd4d1-0a3f-4e2b-a96d-86475da2833e, project `e47fd4d1-0a3f-4e2b-a96d-86475da2833e`, body node `e2518129-7231`)

- [ ] **Step 1: Full checks**

Run, one at a time (low memory): `npx tsc --noEmit -p .`, `npx jest --config jest.unit.config.js`, `npx jest --config jest.integration.config.js --testPathPatterns 'vender'`, `npx jest --config jest.integration.config.js --testPathPatterns 'comanda'`, `npx jest --config jest.integration.config.js --testPathPatterns 'caixa'`.
Expected: all PASS.

- [ ] **Step 2: Isolation sweep on the new route**

Run: `ISOLATION_SHARD=1/1 npx jest --config jest.integration.config.js --testPathPatterns 'read-isolation' -t 'no GET route'` only if free memory is above ~1.5 GB; otherwise rely on the `only the logged-in restaurant` test of Task 2 and say so in the report.

- [ ] **Step 3: Publish**

```bash
git fetch -q https://github.com/andreyluis2003/Gastrux.git main && git merge-base --is-ancestor FETCH_HEAD HEAD && git push -q https://github.com/andreyluis2003/Gastrux.git fix/delivery-public:main
```
Ask the owner to deploy **homolog** (no migration in this stage).

- [ ] **Step 4: Browser check on homolog** (Playwright, test account)

At 390×844 and at 1280×800:
1. `/comanda` lands on `/vender`; the cash bar shows the register state.
2. Tap a free table → its comanda opens; back → the table is green with total and time.
3. Tap an item 3 times → one line "3x"; Desfazer → "2x".
4. Hold an item (or "⋯") → sheet; add a modifier and "sem cebola" → line shows both.
5. Enviar → toast; on 390 px it returns to `/vender`, on 1280 px it stays.
6. Tap the sent line → only "Remover com motivo".
7. Conta → close with PIX (open the shift first if closed) → table becomes free on the map.
8. Delivery tab opens the orders screen.
Report anything that does not match spec 4.1/4.2.

- [ ] **Step 5: Manual**

Update the "Vendas" section of the manual: the Vender screen (map, one tap opens a table, one tap adds an item, hold for details and note, Enviar, Conta), the cashier starts on Vender, and the onboarding script step "abrir a primeira mesa".

- [ ] **Step 6: Production**

After the owner approves homolog: owner deploys **app** (no migration). Check `https://gastrux.com/api/health` uptime reset.
