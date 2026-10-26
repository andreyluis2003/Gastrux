import type { Prisma } from '@prisma/client';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { CASH_METHODS } from './payment-methods';
import { CashRuleError, expectedByMethod, type EntryLike, type PaymentInput, type SettledPayment } from './rules';
import { ensureDefaultRegister, recalcClosedSession } from './sessions';

/** Sales paid on the spot enter the cash shift (spec §6). Every function runs inside the caller's transaction. */

const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// 422, not 409: the device outbox retries 409 forever ("still running"), and this refusal is final
const REQUIRED = () => new CashRuleError('Abra o caixa para receber', 422, 'CASH_SESSION_REQUIRED');

/**
 * Reads a shift of the restaurant and holds it (FOR SHARE) until the caller's transaction ends: a
 * close (FOR UPDATE in lib/caixa/sessions.ts) waits for this sale and counts it.
 */
async function lockShift(tx: Prisma.TransactionClient, restaurantId: string, cashSessionId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
    SELECT "id", "status"::text AS "status" FROM "cash_sessions"
    WHERE "id" = ${cashSessionId} AND "restaurantId" = ${restaurantId}
    FOR SHARE`;
  return rows[0] ?? null;
}

export async function comandaTotalCents(tx: Prisma.TransactionClient, orderSessionId: string) {
  const items = await tx.orderSessionItem.findMany({
    where: { sessionId: orderSessionId },
    select: { price: true, quantity: true, modifiers: { select: { priceAdjustment: true } } },
  });
  return items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0);
}

export function readPayments(body: any): { payments: PaymentInput[]; legacy: boolean } | null {
  if (Array.isArray(body?.payments)) return { payments: body.payments, legacy: false };
  if (body?.paymentMethod) return { payments: [{ method: body.paymentMethod, amount: null }], legacy: true };
  return null;
}

export interface SaleTarget { cashSessionId: string; late: boolean }

export async function resolveSaleShift(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; cashSessionId?: string | null; replay: boolean; legacy: boolean }
): Promise<SaleTarget | null> {
  const { restaurantId, replay } = input;
  const pick = async (id: string): Promise<SaleTarget> => {
    const s = await lockShift(tx, restaurantId, id);
    if (!s) throw REQUIRED();
    if (s.status === 'OPEN') return { cashSessionId: s.id, late: false };
    if (replay) return { cashSessionId: s.id, late: true };
    throw REQUIRED();
  };
  if (input.cashSessionId) return pick(String(input.cashSessionId));
  if (!input.legacy) throw REQUIRED();
  const register = await ensureDefaultRegister(restaurantId);
  const open = await tx.cashSession.findFirst({ where: { cashRegisterId: register.id, status: 'OPEN' }, select: { id: true } });
  if (open) return pick(open.id);
  if (!replay) throw REQUIRED();
  const last = await tx.cashSession.findFirst({ where: { cashRegisterId: register.id }, orderBy: { openedAt: 'desc' }, select: { id: true } });
  return last ? pick(last.id) : null;
}

export async function recordSaleEntries(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; target: SaleTarget; orderSessionId: string; settled: SettledPayment; createdById: string }
) {
  const { restaurantId, target, orderSessionId, settled, createdById } = input;
  const base = { restaurantId, cashSessionId: target.cashSessionId, orderSessionId, createdById, afterClose: target.late };
  // Spec rule 12: change above the cash the drawer should have before this sale is allowed, with a warning. It
  // never says how much the drawer should have (a cashier closes blind)
  let changeWarning: string | null = null;
  if (settled.changeCents > 0 && !target.late) {
    const shift = await tx.cashSession.findUnique({ where: { id: target.cashSessionId }, select: { openingFloatCents: true, entries: { select: { type: true, method: true, amountCents: true, direction: true } } } });
    const cash = shift ? expectedByMethod(shift.openingFloatCents, shift.entries as EntryLike[]).CASH : 0;
    if (settled.changeCents > cash) {
      changeWarning = `O troco de ${brl(settled.changeCents)} é maior que o dinheiro que deveria haver na gaveta antes desta venda. Confira o troco; se faltar dinheiro, lance um suprimento.`;
    }
  }
  const rows: Prisma.CashSessionEntryCreateManyInput[] = CASH_METHODS
    .filter((m) => settled.receipts[m] > 0)
    .map((m) => ({ ...base, type: 'RECEIPT', method: m, amountCents: settled.receipts[m] }));
  if (settled.changeCents > 0) rows.push({ ...base, type: 'CHANGE', method: 'CASH', amountCents: settled.changeCents });
  if (rows.length) await tx.cashSessionEntry.createMany({ data: rows });
  if (target.late) {
    await tx.cashSession.update({ where: { id: target.cashSessionId }, data: { lateEntries: { increment: 1 } } });
    await recalcClosedSession(tx, target.cashSessionId);
  }
  return { changeWarning };
}

/** Every payment given back by a reopening or a cancellation starts with one of these (bill and merge read them). */
export const REVERSAL_PREFIXES = { reopen: 'Reabertura da comanda', cancel: 'Cancelamento da comanda' } as const;
export const isReversal = (description: string | null | undefined) =>
  Object.values(REVERSAL_PREFIXES).some((p) => (description ?? '').startsWith(p));

export async function reverseSaleEntries(
  tx: Prisma.TransactionClient,
  input: { restaurantId: string; orderSessionId: string; cashSessionId: string; createdById: string; reason: string; kind?: keyof typeof REVERSAL_PREFIXES }
) {
  const shift = input.cashSessionId ? await lockShift(tx, input.restaurantId, input.cashSessionId) : null;
  if (!shift || shift.status !== 'OPEN') throw REQUIRED();
  const lines = await tx.cashSessionEntry.findMany({ where: { orderSessionId: input.orderSessionId, restaurantId: input.restaurantId } });
  // Net what is still in the drawer for this comanda per method (an earlier reopen already reversed some)
  const net: Record<string, { receipt: number; change: number }> = {};
  for (const l of lines) {
    const n = (net[l.method] ??= { receipt: 0, change: 0 });
    if (l.type === 'RECEIPT') n.receipt += l.amountCents;
    if (l.type === 'REFUND') n.receipt -= l.amountCents;
    if (l.type === 'CHANGE') n.change += l.amountCents;
    if (l.type === 'ADJUSTMENT' && l.direction === 'IN') n.change -= l.amountCents;
  }
  const description = `${REVERSAL_PREFIXES[input.kind ?? 'reopen']}: ${input.reason}`.slice(0, 200);
  const base = { restaurantId: input.restaurantId, cashSessionId: shift.id, orderSessionId: input.orderSessionId, createdById: input.createdById, description };
  const rows: Prisma.CashSessionEntryCreateManyInput[] = [];
  for (const [method, n] of Object.entries(net)) {
    if (n.receipt > 0) rows.push({ ...base, type: 'REFUND', method: method as any, amountCents: n.receipt });
    if (n.change > 0) rows.push({ ...base, type: 'ADJUSTMENT', method: method as any, amountCents: n.change, direction: 'IN' });
  }
  if (rows.length) await tx.cashSessionEntry.createMany({ data: rows });
  return rows.length;
}

