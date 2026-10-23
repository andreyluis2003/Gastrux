import type { Prisma } from '@prisma/client';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { creditSale, recordPurchase, reverseForSession, undoPurchase } from './service';

/**
 * What a bill's close and reopening do to the cashback and to the CRM (spec 2026-10-23 §7.1, §7.4, §10). Both
 * close paths (the bill screen's payments and the old one-request close) call onBillClosed in their transaction.
 */
type Tx = Prisma.TransactionClient;

async function billNumbers(tx: Tx, sessionId: string) {
  const s = await tx.orderSession.findUnique({
    where: { id: sessionId },
    select: {
      customerId: true, cashbackUsedCents: true, serviceChargeCents: true, closedAt: true,
      items: { select: { quantity: true, price: true, modifiers: { select: { priceAdjustment: true } } } },
    },
  });
  if (!s) return null;
  const subtotalCents = s.items.reduce((sum, i) => sum + lineTotalCents(i.price, i.quantity, i.modifiers.map((m) => m.priceAdjustment)), 0);
  return {
    customerId: s.customerId,
    closedAt: s.closedAt ?? new Date(),
    // Spec §4.b: what was paid for the items, without the service charge and without the cashback used
    baseCents: Math.max(0, subtotalCents - s.cashbackUsedCents),
    paidCents: Math.max(0, subtotalCents + s.serviceChargeCents - s.cashbackUsedCents),
  };
}

/** The credit of the closed bill (0 without a customer, on Pro or with the cashback off); the CRM purchase */
export async function onBillClosed(tx: Tx, restaurantId: string, sessionId: string): Promise<number> {
  const n = await billNumbers(tx, sessionId);
  if (!n?.customerId) return 0;
  await recordPurchase(tx, n.customerId, n.paidCents, n.closedAt);
  return creditSale(tx, { restaurantId, customerId: n.customerId, baseCents: n.baseCents, orderSessionId: sessionId });
}

/** A reopened or cancelled bill: credit taken back, cashback used returned, and the purchase undone if it had closed */
export async function onBillReversed(tx: Tx, restaurantId: string, sessionId: string, wasClosed: boolean): Promise<{ notReversedCents: number }> {
  const n = await billNumbers(tx, sessionId);
  if (wasClosed && n?.customerId) await undoPurchase(tx, n.customerId, n.paidCents);
  return reverseForSession(tx, restaurantId, sessionId);
}
