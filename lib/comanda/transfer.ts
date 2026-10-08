import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { lockComanda } from '@/lib/comanda/add-item';
import { CashRuleError } from '@/lib/caixa/rules';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { paidNetCents } from './bill';

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

/** The chosen table already has an open comanda: the screen offers to merge into it */
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

/** The whole comanda (lines, payments, time open, pre-bill) goes to a free table; the old one is free */
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
      const table = input.tableId
        ? await tx.table.findFirst({ where: { id: input.tableId, restaurantId: member.restaurantId }, select: { id: true, number: true } })
        : null;
      if (!table) throw new CashRuleError('Mesa não encontrada', 404);
      // The table lock is held from here: no other device opens this table meanwhile
      await lockTable(tx, table.id);
      const busy = await tx.orderSession.findFirst({
        where: { restaurantId: member.restaurantId, tableId: table.id, status: { in: [...OPEN_STATUSES] } },
        select: { id: true },
      });
      targetId = busy?.id ?? (await tx.orderSession.create({
        data: { restaurantId: member.restaurantId, userId: member.userId, tableId: table.id, tableNumber: table.number, status: 'OPEN', serviceChargeEligible: true },
        select: { id: true },
      })).id;
    }
    if (targetId === sourceSessionId) throw new CashRuleError('Escolha outra mesa ou comanda', 400);
    await lockBoth(tx, sourceSessionId, targetId);
    await openSession(tx, member.restaurantId, sourceSessionId);
    await openSession(tx, member.restaurantId, targetId);
    const lines = await tx.cashSessionEntry.findMany({
      where: { orderSessionId: sourceSessionId, restaurantId: member.restaurantId },
      select: { type: true, method: true, amountCents: true, direction: true },
    });
    if (paidNetCents(lines) > 0) throw new CashRuleError('Esta conta já tem pagamentos: estorne um pagamento antes de tirar itens', 409);
    const owned = await tx.orderSessionItem.count({ where: { id: { in: itemIds }, sessionId: sourceSessionId } });
    if (owned !== itemIds.length) throw new CashRuleError('Item não encontrado nesta comanda', 404);
    await tx.orderSessionItem.updateMany({ where: { id: { in: itemIds } }, data: { sessionId: targetId } });
    await tx.orderSession.update({ where: { id: targetId }, data: { preBillPrintedAt: null } });
    await recordAudit(member, { action: 'UPDATE', entityType: 'OrderSession', entityId: sourceSessionId, changes: { moveItems: { to: targetId, itemIds } } });
    return { sessionId: targetId, moved: itemIds.length };
  });
}
