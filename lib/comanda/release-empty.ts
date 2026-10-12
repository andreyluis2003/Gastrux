import { prisma } from '@/lib/prisma';
import { recordAudit, type RestaurantMember } from '@/lib/auth/restaurant-role';
import { CashRuleError } from '@/lib/caixa/rules';
import { lockComanda } from './add-item';

/**
 * A tap on a free table opens its comanda at once; when the waiter leaves it with nothing on it, the table
 * must not stay "Ocupada" (owner, 2026-10-12). An empty comanda (no item, no money in a shift, no online
 * payment, even a pending one) is cancelled by anyone of the staff, with no reason: nothing is lost.
 * Locks in the order the QR order takes them (table, then comanda), so a QR order arriving at the same time
 * either lands first (the comanda is no longer empty) or finds it cancelled and opens a new one.
 */
export async function releaseEmptyComanda(member: RestaurantMember, sessionId: string): Promise<{ released: boolean }> {
  const owned = await prisma.orderSession.findFirst({ where: { id: sessionId, restaurantId: member.restaurantId }, select: { tableId: true } });
  if (!owned) throw new CashRuleError('Comanda não encontrada', 404);

  const released = await prisma.$transaction(async (tx) => {
    if (owned.tableId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'comanda-table:' + owned.tableId}))`;
    await lockComanda(tx, sessionId);
    const [items, entries, payments] = await Promise.all([
      tx.orderSessionItem.count({ where: { sessionId } }),
      tx.cashSessionEntry.count({ where: { orderSessionId: sessionId } }),
      tx.payment.count({ where: { orderSessionId: sessionId } }),
    ]);
    if (items || entries || payments) return false;
    const guard = await tx.orderSession.updateMany({ where: { id: sessionId, status: 'OPEN' }, data: { status: 'CANCELLED' } });
    return guard.count === 1;
  });

  if (released) {
    await recordAudit(member, { action: 'STATUS_CHANGE', entityType: 'OrderSession', entityId: sessionId, changes: { from: 'OPEN', to: 'CANCELLED', reason: 'Comanda vazia liberada' } });
  }
  return { released };
}
