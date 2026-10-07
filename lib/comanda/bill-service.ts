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
