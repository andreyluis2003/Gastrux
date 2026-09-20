import { prisma } from '@/lib/prisma';
import { IN_PROGRESS_TIMEOUT_MS } from './pix-service';
import type { ResolvedPixTarget } from './pix-target';

/**
 * Find-or-create the PENDING Payment row behind a delivery card checkout,
 * serialized per order with a Postgres advisory lock. Same pattern, and same
 * reason (ruling R19), as `claimPixPayment`.
 *
 * Without the lock a double tap creates two Payments and two live Checkout Pro
 * preferences for the same order. Both links can be paid, the sync approves
 * BOTH rows (each carries the full amount) while the order update is a no-op
 * the second time: the restaurant is charged twice. The lock is
 * transaction-scoped and released on commit; the Mercado Pago call itself
 * happens OUTSIDE the transaction.
 */

/**
 * Every preference is created with this validity (`expirationDateTo`), so a
 * link cannot be paid after it. The reuse window below stays SAFELY shorter, so
 * a reused link is never one about to expire under the customer.
 */
export const CARD_LINK_VALIDITY_MS = 30 * 60 * 1000;

/** Reuse a pending checkout only within this window (5 min shorter than the link validity). */
export const CARD_REUSE_WINDOW_MS = 25 * 60 * 1000;

export const CHECKOUT_IN_PROGRESS = 'Estamos preparando o seu pagamento. Tente novamente em instantes.';

export type CardClaim =
  | { kind: 'reuse'; payment: { id: string }; initPoint: string }
  | { kind: 'in-progress' }
  | { kind: 'created'; payment: { id: string } };

export function cardLockKey(target: ResolvedPixTarget): string {
  return `card:${target.restaurantId}:order:${target.orderId}`;
}

export async function claimCardPayment(
  target: ResolvedPixTarget,
  payer: { email: string; name?: string }
): Promise<CardClaim> {
  const key = cardLockKey(target);

  return prisma.$transaction(async (tx) => {
    // $executeRaw, not $queryRaw: pg_advisory_xact_lock returns void, which
    // Prisma cannot deserialize as a query result.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    // Matches a row WITH OR WITHOUT a stored link: a row still being created
    // must block a second checkout, not be invisible to it.
    const existing = await tx.payment.findFirst({
      where: {
        restaurantId: target.restaurantId,
        orderId: target.orderId,
        gateway: 'MERCADO_PAGO_CONNECT',
        method: 'MERCADO_PAGO',
        status: 'PENDING',
        amount: target.amount,
        createdAt: { gte: new Date(Date.now() - CARD_REUSE_WINDOW_MS) },
      },
      orderBy: { createdAt: 'desc' },
      include: { mercadoPagoData: { select: { initPoint: true } } },
    });

    if (existing) {
      // The link lives on the MercadoPagoTransaction row, which is written
      // first and right after the preference exists.
      const initPoint = existing.mercadoPagoData?.initPoint;
      if (initPoint) return { kind: 'reuse' as const, payment: existing, initPoint };
      if (Date.now() - new Date(existing.createdAt).getTime() < IN_PROGRESS_TIMEOUT_MS) {
        return { kind: 'in-progress' as const };
      }
      // Older than the in-progress window: the other request never finished.
    }

    const payment = await tx.payment.create({
      data: {
        restaurantId: target.restaurantId,
        orderId: target.orderId,
        amount: target.amount,
        currency: 'BRL',
        method: 'MERCADO_PAGO' as const,
        gateway: 'MERCADO_PAGO_CONNECT' as const,
        status: 'PENDING' as const,
        description: target.description,
        customerEmail: payer.email,
        customerName: payer.name,
        metadata: JSON.stringify({ ...target.metadata, source: 'delivery-card' }),
      },
    });
    return { kind: 'created' as const, payment };
  }, {
    // Waiters queue on the advisory lock; Prisma's default 5 s interactive
    // timeout would turn a busy order into a 500 instead of a retryable 409.
    maxWait: 10_000,
    timeout: 10_000,
  });
}
