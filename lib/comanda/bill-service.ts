import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { settleSessionStock } from '@/lib/stock/session-stock';
import { lineTotalCents, toCents } from '@/lib/comanda/line-total';
import { lockComanda } from '@/lib/comanda/add-item';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { isReversal, recordSaleEntries, resolveSaleShift } from '@/lib/caixa/sale';
import { CASH_METHODS, toNfcePaymentMethod, type CashMethod } from '@/lib/caixa/payment-methods';
import type { PaymentInput } from '@/lib/caixa/rules';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { noteSalesThresholds } from '@/lib/plans/monthly-sales';
import { billTotals, onlinePaidCents, paidNetCents, serviceApplies, settlePartial } from './bill';
import { balanceCents } from '@/lib/cashback/service';
import { onBillClosed } from '@/lib/cashback/bill';

/**
 * The bill of a comanda (spec 2026-10-07, 4.3): items, service charge, what the cash register already
 * holds for it, what is left. Payments are the cash entries linked to the comanda (lib/caixa).
 */

type Db = Prisma.TransactionClient | typeof prisma;

/** A payment of the bill: a cash-register entry, or an online payment of the table (PIX_ONLINE / CARD_ONLINE) */
export interface BillPayment { id: string; method: string; amountCents: number; changeCents: number; createdAt: string; refunded: boolean; online: boolean }
export interface Bill {
  sessionId: string;
  status: string;
  label: string;
  /** weightGrams: a line sold by weight (spec 2026-10-25 venda-por-peso) */
  items: Array<{ id: string; name: string; quantity: number; weightGrams: number | null; totalCents: number }>;
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
  /** Cashback used as a discount (spec 2026-10-23): already out of totalCents and remainingCents */
  cashbackUsedCents: number;
  /** The customer identified by phone; balanceCents is the cashback left to use */
  customer: { id: string; name: string; phone: string | null; balanceCents: number } | null;
}

/** The description of a partial refund, also how a payment is known to be refunded already */
export const REFUND_TAG = (entryId: string) => `Estorno de pagamento parcial (${entryId})`;

export async function loadBill(db: Db, restaurantId: string, sessionId: string): Promise<Bill | null> {
  const s = await db.orderSession.findFirst({
    where: { id: sessionId, restaurantId },
    select: {
      id: true, status: true, tableId: true, tableNumber: true, customerName: true, cashbackUsedCents: true,
      customer: { select: { id: true, name: true, phone: true } },
      serviceChargeCents: true, serviceChargeWaived: true, serviceChargeEligible: true, preBillPrintedAt: true,
      table: { select: { number: true } },
      restaurant: { select: { serviceChargePercent: true } },
      items: {
        select: { id: true, quantity: true, weightGrams: true, price: true, recipe: { select: { name: true } }, modifiers: { select: { priceAdjustment: true } } },
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
  // Pay at the table (spec 2026-10-10): online payments count once they were applied under the comanda lock
  const onlineRows = await db.payment.findMany({
    where: {
      restaurantId, orderSessionId: sessionId, gateway: 'MERCADO_PAGO_CONNECT',
      status: { in: ['APPROVED', 'PARTIALLY_REFUNDED', 'REFUNDED'] }, appliedToBillAt: { not: null },
    },
    select: { id: true, method: true, amount: true, amountRefunded: true, status: true, appliedToBillAt: true },
    orderBy: { appliedToBillAt: 'asc' },
  });

  const items = s.items.map((i) => ({
    id: i.id,
    name: i.recipe?.name ?? 'Item',
    quantity: i.quantity,
    weightGrams: i.weightGrams,
    totalCents: lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)),
  }));
  const subtotalCents = items.reduce((sum, i) => sum + i.totalCents, 0);
  const applies = serviceApplies(s);
  const percent = s.restaurant.serviceChargePercent;
  // A closed bill keeps the charge it was closed with; an open one follows the current choice
  const gross = s.status === 'CLOSED'
    ? { subtotalCents, serviceCents: s.serviceChargeCents, totalCents: subtotalCents + s.serviceChargeCents }
    : billTotals(subtotalCents, percent, { applies, waived: s.serviceChargeWaived });
  const totals = { ...gross, totalCents: Math.max(0, gross.totalCents - s.cashbackUsedCents) };
  const paidCents = paidNetCents(entries) + onlineRows.reduce((sum, p) => sum + onlinePaidCents(p), 0);

  const refunds = entries.filter((e) => e.type === 'REFUND').map((e) => e.description ?? '');
  // A manager's reopening or cancellation gives every payment made until then back (lib/caixa/sale.ts reverseSaleEntries)
  const lastReopen = entries
    .filter((e) => e.type === 'REFUND' && isReversal(e.description))
    .reduce((t, e) => Math.max(t, e.createdAt.getTime()), 0);
  const payments: BillPayment[] = entries
    .filter((e) => e.type === 'RECEIPT')
    .map((e) => ({
      id: e.id,
      method: e.method,
      amountCents: e.amountCents,
      // Change given back in the same payment (same transaction time) comes out of its cash: card,
      // PIX and others never have change
      changeCents: e.method !== 'CASH' ? 0 : entries
        .filter((c) => c.type === 'CHANGE' && c.createdAt.getTime() === e.createdAt.getTime())
        .reduce((n, c) => n + c.amountCents, 0),
      createdAt: e.createdAt.toISOString(),
      refunded: refunds.some((d) => d.startsWith(REFUND_TAG(e.id))) || e.createdAt.getTime() <= lastReopen,
      online: false,
    }));
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
    cashbackUsedCents: s.cashbackUsedCents,
    customer: s.customer
      ? { ...s.customer, balanceCents: await balanceCents(db, restaurantId, s.customer.id) }
      : null,
  };
}

/**
 * What the bill holds, split by where the money is: net cash-register money (receipts minus change and
 * refunds) and applied online payments of the table (minus their refunds). Pass the transaction to read
 * under the comanda lock.
 */
export async function billPaidCents(db: Db, restaurantId: string, sessionId: string): Promise<{ cashCents: number; onlineCents: number }> {
  const entries = await db.cashSessionEntry.findMany({
    where: { orderSessionId: sessionId, restaurantId },
    select: { type: true, method: true, amountCents: true, direction: true },
  });
  const online = await db.payment.findMany({
    where: { restaurantId, orderSessionId: sessionId, gateway: 'MERCADO_PAGO_CONNECT', appliedToBillAt: { not: null } },
    select: { amount: true, amountRefunded: true, status: true },
  });
  return { cashCents: paidNetCents(entries), onlineCents: online.reduce((sum, p) => sum + onlinePaidCents(p), 0) };
}

/** "This bill has payments" (cash or online): its items must not shrink or move under them */
export async function billHasPayments(db: Db, restaurantId: string, sessionId: string): Promise<boolean> {
  const { cashCents, onlineCents } = await billPaidCents(db, restaurantId, sessionId);
  return cashCents > 0 || onlineCents > 0;
}

/** The customer declines (or accepts again) the service charge, for every device (spec 4.3) */
export async function setServiceWaived(member: RestaurantMember, sessionId: string, waived: boolean): Promise<Bill> {
  const bill = await prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const bill = await loadBill(tx, member.restaurantId, sessionId);
    if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
    if (bill.status === 'CLOSED' || bill.status === 'CANCELLED') throw new CashRuleError('Comanda fechada ou cancelada', 409);
    if (waived && bill.paidCents > bill.subtotalCents) {
      throw new CashRuleError('Já foi pago mais do que o total sem a taxa: estorne um pagamento antes de tirar a taxa', 409);
    }
    await tx.orderSession.update({ where: { id: sessionId }, data: { serviceChargeWaived: waived } });
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sessionId, changes: { serviceChargeWaived: waived } });
    const after = (await loadBill(tx, member.restaurantId, sessionId))!;
    // What was already paid covers the new total: the bill closes now (it would be stuck open with
    // nothing left to receive — review of stage 2)
    if (after.paidCents > 0 && after.remainingCents === 0) {
      await tx.orderSession.updateMany({
        where: { id: sessionId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: after.serviceCents },
      });
      await settleSessionStock(tx, member.restaurantId, sessionId);
      return (await loadBill(tx, member.restaurantId, sessionId))!;
    }
    return after;
  });
  if (bill.status === 'CLOSED') await emitClosedBill(member, sessionId, null, bill.customerName);
  return bill;
}

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

/**
 * One payment towards the bill (spec 4.3): recorded at once in the open shift, linked to the comanda.
 * When what was paid reaches the total, the bill closes in the same transaction (status, service charge
 * written, table free) and the NFC-e is issued afterwards if the restaurant turned it on. Under the
 * comanda lock: two devices paying the same remainder at once never both get in.
 */
export async function recordBillPayment(
  member: RestaurantMember,
  sessionId: string,
  input: { payments: PaymentInput[]; cashSessionId?: string | null; customerCPF?: string | null; dueCents?: number | null },
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const bill = await loadBill(tx, member.restaurantId, sessionId);
    if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
    if (bill.status === 'CANCELLED') throw new CashRuleError('Comanda cancelada', 409);
    if (bill.status === 'CLOSED') throw new CashRuleError('Esta conta já foi fechada', 422, 'ALREADY_CLOSED');
    // The amount being paid now (one person's share) is what the change is counted against: the screen
    // showed change for that share, so the server must agree (review of stage 2)
    const due = Number.isInteger(input.dueCents) && (input.dueCents as number) > 0 ? Math.min(input.dueCents as number, bill.remainingCents) : bill.remainingCents;
    const settled = settlePartial(due, input.payments);
    const target = await resolveSaleShift(tx, { restaurantId: member.restaurantId, cashSessionId: input.cashSessionId, replay: false, legacy: false });
    await recordSaleEntries(tx, { restaurantId: member.restaurantId, target: target!, orderSessionId: sessionId, settled, createdById: member.userId });
    // The staff took a payment: the table's "pagar com o garçom" was answered (spec 2026-10-10 §5.3)
    await tx.orderSession.update({ where: { id: sessionId }, data: { payAtWaiterRequestedAt: null } });
    const paidNow = settled.paidCents - settled.changeCents;
    const closed = bill.paidCents + paidNow >= bill.totalCents;
    if (closed) {
      const guard = await tx.orderSession.updateMany({
        where: { id: sessionId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
        data: { status: 'CLOSED', closedAt: new Date(), serviceChargeCents: bill.serviceCents },
      });
      if (guard.count === 0) throw new CashRuleError('Esta conta já foi fechada', 422, 'ALREADY_CLOSED');
      // The sale takes its ingredients out of stock, kitchen screen or not (lib/stock/session-stock.ts)
      await settleSessionStock(tx, member.restaurantId, sessionId);
    }
    // Cashback and CRM purchase of the identified customer (spec 2026-10-23 §7.1)
    const cashbackEarnedCents = closed ? await onBillClosed(tx, member.restaurantId, sessionId) : 0;
    return { closed, changeCents: settled.changeCents, customerName: bill.customerName, cashbackEarnedCents };
  });

  let nfce: unknown = null;
  if (result.closed) {
    nfce = await emitClosedBill(member, sessionId, input.customerCPF, result.customerName);
  }
  const bill = (await loadBill(prisma, member.restaurantId, sessionId))!;
  return { bill, changeCents: result.changeCents, closed: result.closed, nfce, cashbackEarnedCents: result.cashbackEarnedCents };
}

/**
 * Gives back one partial payment (a PIX typed by mistake) while the bill is open (spec 4.3): a manager,
 * with a reason; a REFUND line in the open shift for what that payment left in the drawer (what was
 * handed over minus its change); once. A closed bill is reopened instead (the existing manager flow).
 */
export async function refundBillPayment(
  member: RestaurantMember,
  sessionId: string,
  entryId: string,
  input: { reason: string; cashSessionId?: string | null },
): Promise<Bill> {
  const reason = String(input.reason ?? '').trim();
  if (reason.length < 3) throw new CashRuleError('Informe o motivo do estorno');
  return prisma.$transaction(async (tx) => {
    await lockComanda(tx, sessionId);
    const bill = await loadBill(tx, member.restaurantId, sessionId);
    if (!bill) throw new CashRuleError('Comanda não encontrada', 404);
    if (bill.status === 'CLOSED') throw new CashRuleError('Conta fechada: para devolver, reabra a conta (gerente)', 409);
    const payment = bill.payments.find((p) => p.id === entryId);
    if (!payment) throw new CashRuleError('Pagamento não encontrado', 404);
    // An online payment goes back through Mercado Pago, never through the cash drawer
    if (payment.online) throw new CashRuleError('Pagamento online: devolva pelo Mercado Pago em Pagamentos, com o botão Estornar', 409);
    if (payment.refunded) throw new CashRuleError('Este pagamento já foi estornado', 422, 'ALREADY_REFUNDED');
    const target = await resolveSaleShift(tx, { restaurantId: member.restaurantId, cashSessionId: input.cashSessionId, replay: false, legacy: false });
    const amountCents = payment.amountCents - payment.changeCents;
    await tx.cashSessionEntry.create({
      data: {
        restaurantId: member.restaurantId,
        cashSessionId: target!.cashSessionId,
        orderSessionId: sessionId,
        type: 'REFUND',
        method: payment.method as CashMethod,
        amountCents,
        description: `${REFUND_TAG(entryId)}: ${reason}`.slice(0, 200),
        createdById: member.userId,
      },
    });
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sessionId, changes: { refundedPayment: entryId, amountCents, reason } });
    return (await loadBill(tx, member.restaurantId, sessionId))!;
  });
}

/** The pre-bill was printed: the table "asked for the bill" (yellow on the map) until a new item comes */
export async function markPreBill(member: RestaurantMember, sessionId: string): Promise<Bill> {
  const updated = await prisma.orderSession.updateMany({
    where: { id: sessionId, restaurantId: member.restaurantId, status: { notIn: ['CLOSED', 'CANCELLED'] } },
    data: { preBillPrintedAt: new Date() },
  });
  if (updated.count === 0) throw new CashRuleError('Comanda não encontrada ou já fechada', 404);
  return (await loadBill(prisma, member.restaurantId, sessionId))!;
}
