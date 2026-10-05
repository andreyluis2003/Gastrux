import { Prisma, type CashSession, type CashSessionEntry } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { summarizeReceipts } from '@/lib/payments/receipts-summary';
import { fromKeyed, toCashMethod, toKeyed, type ByMethod, type CashMethod, type Keyed, type MethodKey } from './payment-methods';
import {
  CashRuleError, EXPENSE_CATEGORIES, differenceByMethod, expectedByMethod, methodsOverAlert, parseAmountCents,
  parseCountedCents, salesSummary, type EntryLike, type EntryType, type SalesSummary,
} from './rules';
import { isManager } from './roles';
import { alertCashDifference } from './alerts';

/**
 * Cash register shifts (spec docs/superpowers/specs/2026-10-04-caixa-turnos-design.md §4-§5).
 * Every function is scoped to the member's restaurant; another restaurant's record is a 404.
 */

const notFound = () => new CashRuleError('Caixa não encontrado', 404);

export async function ensureDefaultRegister(restaurantId: string) {
  const existing = await prisma.cashRegister.findFirst({
    where: { restaurantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, isDefault: true },
  });
  if (existing) {
    if (!existing.isDefault) await prisma.cashRegister.update({ where: { id: existing.id }, data: { isDefault: true } });
    return { id: existing.id, name: existing.name };
  }
  const created = await prisma.cashRegister.create({ data: { restaurantId, name: 'Caixa principal', isDefault: true }, select: { id: true, name: true } });
  return created;
}

async function userNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!unique.length) return new Map<string, string>();
  const users = await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, u.name || u.email]));
}

export async function listRegisters(restaurantId: string) {
  await ensureDefaultRegister(restaurantId);
  const registers = await prisma.cashRegister.findMany({
    where: { restaurantId, active: true },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    include: { sessions: { where: { status: 'OPEN' }, select: { id: true, openedAt: true, openedById: true } } },
  });
  const names = await userNames(registers.flatMap((r) => r.sessions.map((s) => s.openedById)));
  return registers.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.isDefault,
    openSession: r.sessions[0]
      ? { id: r.sessions[0].id, openedAt: r.sessions[0].openedAt, openedByName: names.get(r.sessions[0].openedById) ?? null }
      : null,
  }));
}

export async function openSession(member: RestaurantMember, input: { cashRegisterId: string; openingFloat: unknown }) {
  const register = await prisma.cashRegister.findFirst({ where: { id: String(input.cashRegisterId ?? ''), restaurantId: member.restaurantId } });
  if (!register) throw notFound();
  if (!register.active) throw new CashRuleError('Este caixa está desativado', 409);
  const openingFloatCents = input.openingFloat === undefined || input.openingFloat === '' ? 0 : parseCountedCents(input.openingFloat, 'Troco inicial');
  try {
    const session = await prisma.cashSession.create({
      data: { restaurantId: member.restaurantId, cashRegisterId: register.id, openedById: member.userId, openingFloatCents },
    });
    await recordAudit(member, { action: 'CREATE', entityType: 'CashSession', entityId: session.id, changes: { register: register.name, openingFloatCents } });
    return { session, alreadyOpen: false };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    const session = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' } });
    if (!session) throw error;
    return { session, alreadyOpen: true };
  }
}

async function loadSession(member: RestaurantMember, sessionId: string) {
  const session = await prisma.cashSession.findFirst({
    where: { id: String(sessionId ?? ''), restaurantId: member.restaurantId },
    include: { cashRegister: { select: { id: true, name: true } }, entries: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) throw notFound();
  return session;
}

const asLike = (e: CashSessionEntry): EntryLike => ({
  type: e.type as EntryType, method: e.method as CashMethod, amountCents: e.amountCents, direction: e.direction as any, orderSessionId: e.orderSessionId,
});

/** Recomputes expected and difference of a closed shift after a late or adjustment line. */
export async function recalcClosedSession(tx: Prisma.TransactionClient, sessionId: string) {
  const s = await tx.cashSession.findUnique({ where: { id: sessionId }, include: { entries: true } });
  if (!s || s.status !== 'CLOSED' || !s.countedCents) return null;
  const expected = expectedByMethod(s.openingFloatCents, s.entries.map(asLike));
  const counted = fromKeyed(s.countedCents as any, (v) => Number(v) || 0);
  const difference = differenceByMethod(counted, expected);
  await tx.cashSession.update({ where: { id: sessionId }, data: { expectedCents: toKeyed(expected), differenceCents: toKeyed(difference) } });
  return { expected, difference };
}

/** Locks a shift row until the transaction ends and returns its current status. */
async function lockShiftForUpdate(tx: Prisma.TransactionClient, sessionId: string) {
  const rows = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT "status"::text AS "status" FROM "cash_sessions" WHERE "id" = ${sessionId} FOR UPDATE`;
  return rows[0]?.status ?? null;
}

type ManualType = 'WITHDRAWAL' | 'SUPPLY' | 'EXPENSE' | 'ADJUSTMENT';
const MANUAL: ManualType[] = ['WITHDRAWAL', 'SUPPLY', 'EXPENSE', 'ADJUSTMENT'];
const NEEDS_REASON: Record<ManualType, number> = { WITHDRAWAL: 1, SUPPLY: 0, EXPENSE: 1, ADJUSTMENT: 3 };

export async function addEntry(
  member: RestaurantMember,
  sessionId: string,
  input: { type: ManualType; amount: unknown; method?: unknown; category?: unknown; description?: unknown; direction?: unknown; force?: boolean }
) {
  if (!MANUAL.includes(input.type)) throw new CashRuleError('Tipo de lançamento inválido');
  const managerOnly = input.type === 'EXPENSE' || input.type === 'ADJUSTMENT';
  if (managerOnly && !isManager(member.role)) throw new CashRuleError('Despesa e ajuste exigem um gerente', 403);
  const amountCents = parseAmountCents(input.amount);
  const description = String(input.description ?? '').trim().slice(0, 200) || null;
  const method: CashMethod = input.type === 'ADJUSTMENT' ? toCashMethod(input.method) ?? (() => { throw new CashRuleError('Forma de pagamento inválida'); })() : 'CASH';
  let category: string | null = null;
  if (input.type === 'EXPENSE') {
    category = String(input.category ?? '');
    if (!(EXPENSE_CATEGORIES as readonly string[]).includes(category)) throw new CashRuleError('Categoria de despesa inválida');
  }
  let direction: 'IN' | 'OUT' | null = null;
  if (input.type === 'ADJUSTMENT') {
    if (input.direction !== 'IN' && input.direction !== 'OUT') throw new CashRuleError('Ajuste sem direção (entrada ou saída)');
    direction = input.direction;
  }
  if ((description?.length ?? 0) < NEEDS_REASON[input.type]) throw new CashRuleError('Informe o motivo do lançamento');

  const found = await loadSession(member, sessionId);

  let warning: string | undefined;
  // Status and cash checked under the shift lock: a close or another withdrawal cannot slip in between
  const entry = await prisma.$transaction(async (tx) => {
    const status = await lockShiftForUpdate(tx, found.id);
    if (status === 'CLOSED' && input.type !== 'ADJUSTMENT') throw new CashRuleError('Este caixa já foi fechado', 409);
    if (input.type === 'WITHDRAWAL' || input.type === 'EXPENSE') {
      const entries = await tx.cashSessionEntry.findMany({ where: { cashSessionId: found.id } });
      const cash = expectedByMethod(found.openingFloatCents, entries.map(asLike)).CASH;
      if (amountCents > cash) {
        if (!isManager(member.role) || !input.force) {
          throw new CashRuleError('O caixa não tem esse valor em dinheiro. Um gerente pode confirmar mesmo assim.', 409, 'CASH_NOT_ENOUGH');
        }
        warning = 'Retirada maior que o dinheiro esperado no caixa';
      }
    }
    const created = await tx.cashSessionEntry.create({
      data: { restaurantId: member.restaurantId, cashSessionId: found.id, type: input.type, method, amountCents, direction, category, description, createdById: member.userId },
    });
    if (status === 'CLOSED') await recalcClosedSession(tx, found.id);
    return created;
  });
  if (input.type === 'EXPENSE' || input.type === 'ADJUSTMENT' || warning) {
    await recordAudit(member, { action: 'CREATE', entityType: 'CashSessionEntry', entityId: entry.id, changes: { type: input.type, amountCents, method, direction, description, forced: Boolean(warning) } });
  }
  return { entry, warning };
}

export interface CloseResult { sessionId: string; alreadyClosed: boolean; counted: Keyed; expected: Keyed; difference: Keyed; alertMethods: CashMethod[] }

export async function closeSession(member: RestaurantMember, sessionId: string, input: { counted: Partial<Record<MethodKey, unknown>>; notes?: unknown }): Promise<CloseResult> {
  const counted = fromKeyed(input.counted ?? {}, (v) => (v === undefined || v === '' ? 0 : parseCountedCents(v)));
  const notes = String(input.notes ?? '').trim().slice(0, 500) || null;
  const session = await loadSession(member, sessionId);

  if (session.status === 'CLOSED') {
    return {
      sessionId: session.id, alreadyClosed: true,
      counted: session.countedCents as Keyed, expected: session.expectedCents as Keyed, difference: session.differenceCents as Keyed, alertMethods: [],
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Waits for sales and entries holding this shift (FOR SHARE in lib/caixa/sale.ts), then counts them
    await lockShiftForUpdate(tx, session.id);
    const entries = await tx.cashSessionEntry.findMany({ where: { cashSessionId: session.id } });
    const expected = expectedByMethod(session.openingFloatCents, entries.map(asLike));
    const difference = differenceByMethod(counted, expected);
    // Only the first close of the shift writes (two devices closing at once)
    const updated = await tx.cashSession.updateMany({
      where: { id: session.id, status: 'OPEN' },
      data: {
        status: 'CLOSED', closedAt: new Date(), closedById: member.userId, closingNotes: notes,
        countedCents: toKeyed(counted), expectedCents: toKeyed(expected), differenceCents: toKeyed(difference),
      },
    });
    return { written: updated.count === 1, expected, difference };
  });

  if (!result.written) return closeSession(member, sessionId, input);

  const alertMethods = methodsOverAlert(result.expected, result.difference);
  await alertCashDifference(member.restaurantId, session.id, session.cashRegister.name, alertMethods, result.difference);
  await recordAudit(member, { action: 'STATUS_CHANGE', entityType: 'CashSession', entityId: session.id, changes: { to: 'CLOSED', counted: toKeyed(counted), difference: toKeyed(result.difference) } });
  return { sessionId: session.id, alreadyClosed: false, counted: toKeyed(counted), expected: toKeyed(result.expected), difference: toKeyed(result.difference), alertMethods };
}

export interface SessionView {
  session: { id: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; openingFloatCents: number; lateEntries: number; closingNotes: string | null };
  register: { id: string; name: string };
  openedByName: string | null;
  closedByName: string | null;
  entries: Array<{ id: string; type: EntryType; method: CashMethod; amountCents: number; direction: 'IN' | 'OUT' | null; category: string | null; description: string | null; orderSessionId: string | null; createdByName: string | null; afterClose: boolean; createdAt: string }>;
  sales: SalesSummary;
  online: { revenue: number; paidCount: number };
  expected: Keyed | null;
  counted: Keyed | null;
  difference: Keyed | null;
  hoursOpen: number;
}

async function onlineDuring(restaurantId: string, from: Date, to: Date) {
  const groups = await prisma.payment.groupBy({
    by: ['status'],
    where: { restaurantId, createdAt: { gte: from, lte: to } },
    _count: { _all: true },
    _sum: { amount: true, amountRefunded: true },
  });
  const s = summarizeReceipts(groups.map((g: any) => ({ status: g.status, count: g._count._all, amount: g._sum.amount, amountRefunded: g._sum.amountRefunded })));
  return { revenue: s.revenue, paidCount: s.paidCount };
}

export async function getSessionView(member: RestaurantMember, sessionId: string): Promise<SessionView | null> {
  let session;
  try { session = await loadSession(member, sessionId); } catch (e) { if (e instanceof CashRuleError && e.status === 404) return null; throw e; }
  const names = await userNames([session.openedById, session.closedById, ...session.entries.map((e) => e.createdById)]);
  const likes = session.entries.map(asLike);
  const open = session.status === 'OPEN';
  // Blind close (spec rule 5): a cashier never sees the expected amounts of an open shift
  const showExpected = !open || isManager(member.role);
  const end = session.closedAt ?? new Date();
  return {
    session: { id: session.id, status: session.status, openedAt: session.openedAt.toISOString(), closedAt: session.closedAt?.toISOString() ?? null, openingFloatCents: session.openingFloatCents, lateEntries: session.lateEntries, closingNotes: session.closingNotes },
    register: session.cashRegister,
    openedByName: names.get(session.openedById) ?? null,
    closedByName: session.closedById ? names.get(session.closedById) ?? null : null,
    entries: session.entries.slice().reverse().map((e) => ({
      id: e.id, type: e.type as EntryType, method: e.method as CashMethod, amountCents: e.amountCents, direction: e.direction as any,
      category: e.category, description: e.description, orderSessionId: e.orderSessionId, createdByName: names.get(e.createdById) ?? null,
      afterClose: e.afterClose, createdAt: e.createdAt.toISOString(),
    })),
    sales: salesSummary(likes),
    online: await onlineDuring(member.restaurantId, session.openedAt, end),
    expected: showExpected ? (open ? toKeyed(expectedByMethod(session.openingFloatCents, likes)) : (session.expectedCents as Keyed)) : null,
    counted: (session.countedCents as Keyed) ?? null,
    difference: (session.differenceCents as Keyed) ?? null,
    hoursOpen: Math.floor((end.getTime() - session.openedAt.getTime()) / 3600_000),
  };
}

export async function currentSessionView(member: RestaurantMember, cashRegisterId: string) {
  const register = await prisma.cashRegister.findFirst({ where: { id: String(cashRegisterId ?? ''), restaurantId: member.restaurantId } });
  if (!register) throw notFound();
  const open = await prisma.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' }, select: { id: true } });
  return open ? getSessionView(member, open.id) : null;
}

export async function listSessions(restaurantId: string, filter: { from?: Date; to?: Date; cashRegisterId?: string }) {
  const sessions = await prisma.cashSession.findMany({
    where: {
      restaurantId,
      ...(filter.cashRegisterId ? { cashRegisterId: filter.cashRegisterId } : {}),
      ...(filter.from || filter.to ? { openedAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    },
    orderBy: { openedAt: 'desc' },
    take: 200,
    include: { cashRegister: { select: { name: true } }, entries: true },
  });
  const names = await userNames(sessions.flatMap((s) => [s.openedById, s.closedById]));
  return sessions.map((s) => ({
    id: s.id,
    registerName: s.cashRegister.name,
    status: s.status,
    openedAt: s.openedAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    openedByName: names.get(s.openedById) ?? null,
    closedByName: s.closedById ? names.get(s.closedById) ?? null : null,
    salesCents: salesSummary(s.entries.map(asLike)).totalCents,
    differenceCents: (s.differenceCents as Keyed) ?? null,
    lateEntries: s.lateEntries,
  }));
}

export type { CashSession, CashSessionEntry, ByMethod };
