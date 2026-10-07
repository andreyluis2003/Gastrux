import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { lockComanda } from '@/lib/comanda/add-item';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { recordSaleEntries, resolveSaleShift } from '@/lib/caixa/sale';
import { CASH_METHODS, toNfcePaymentMethod, type CashMethod } from '@/lib/caixa/payment-methods';
import type { PaymentInput } from '@/lib/caixa/rules';
import { autoEmitNFCe } from '@/lib/nfe/emit-session';
import { billTotals, paidNetCents, serviceApplies, settlePartial } from './bill';

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
      id: true, status: true, tableId: true, tableNumber: true, customerName: true,
      serviceChargeCents: true, serviceChargeWaived: true, preBillPrintedAt: true,
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
      changeCents: entries
        .filter((c) => c.type === 'CHANGE' && c.createdAt.getTime() === e.createdAt.getTime())
        .reduce((n, c) => n + c.amountCents, 0),
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
    const entries = await prisma.cashSessionEntry.findMany({
      where: { orderSessionId: sessionId, restaurantId: member.restaurantId, type: 'RECEIPT' },
      select: { method: true, amountCents: true },
    });
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
