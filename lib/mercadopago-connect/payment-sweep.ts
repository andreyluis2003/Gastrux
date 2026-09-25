import { prisma } from '@/lib/prisma';
import { getMpClientForRestaurant, markNeedsReconnect } from './connection-service';
import { isUnauthorizedError, searchConnectPaymentsByReference } from './payments';
import { syncRestaurantPayment } from './payment-sync';
import {
  SWEEPABLE_STATUSES,
  SWEEP_FAST_INTERVAL_MS,
  SWEEP_FAST_WINDOW_MS,
  SWEEP_MAX_AGE_MS,
  SWEEP_MIN_AGE_MS,
  SWEEP_SLOW_INTERVAL_MS,
  isSweepDue,
} from './sweep-policy';

export interface SweepSummary {
  examined: number;
  /** Payments whose status changed because of this sweep. */
  resolved: number;
  unchanged: number;
  /** No active Mercado Pago connection for the restaurant: nothing could be asked. */
  skippedNoConnection: number;
  failed: number;
  /** The time budget ran out before every due payment was looked at (the next run continues). */
  stoppedEarly: boolean;
}

export interface SweepOptions {
  now?: number;
  /** Payments examined per run. */
  limit?: number;
  /** Stop starting new payments after this long (serverless time limits). */
  budgetMs?: number;
}

/** An approved attempt goes last so a rejected-then-approved checkout ends APPROVED. */
function orderAttempts(results: any[]): string[] {
  const approved = results.filter((r) => r?.status === 'approved');
  const others = results.filter((r) => r?.status !== 'approved');
  return [...others, ...approved].map((r) => String(r.id)).filter((id) => /^[0-9]{1,20}$/.test(id));
}

/**
 * Server-side reconciliation of Mercado Pago Connect payments that are still
 * PENDING/PROCESSING, so a lost webhook or a customer who closed the page can
 * no longer leave paid money unrecorded (bad-day scenario 6, gap G1). Meant to
 * be triggered every ~5 minutes by a scheduler (POST /api/pagamentos/mp/reconcile).
 *
 * It only ASKS Mercado Pago and applies the answer through syncRestaurantPayment,
 * which uses the restaurant's own token, enforces the tenant guard, the amount
 * guard and the state machine, and is safe to run concurrently with webhooks and
 * page polls. It never cancels, expires or refunds anything.
 */
export async function sweepPendingPayments(options: SweepOptions = {}): Promise<SweepSummary> {
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 200;
  const deadline = Date.now() + (options.budgetMs ?? 45_000);
  const ago = (ms: number) => new Date(now - ms);

  const rows = await prisma.payment.findMany({
    where: {
      gateway: 'MERCADO_PAGO_CONNECT',
      status: { in: [...SWEEPABLE_STATUSES] },
      restaurantId: { not: null },
      OR: [
        // First hour: every run. Later: hourly. Beyond 7 days: manual reconciliation.
        { createdAt: { gt: ago(SWEEP_FAST_WINDOW_MS), lte: ago(SWEEP_MIN_AGE_MS) }, updatedAt: { lte: ago(SWEEP_FAST_INTERVAL_MS) } },
        { createdAt: { gte: ago(SWEEP_MAX_AGE_MS), lte: ago(SWEEP_FAST_WINDOW_MS) }, updatedAt: { lte: ago(SWEEP_SLOW_INTERVAL_MS) } },
      ],
    },
    orderBy: { updatedAt: 'asc' },
    take: limit,
    select: { id: true, status: true, restaurantId: true, gatewayPaymentId: true, createdAt: true, updatedAt: true },
  });

  const summary: SweepSummary = { examined: 0, resolved: 0, unchanged: 0, skippedNoConnection: 0, failed: 0, stoppedEarly: false };

  for (const payment of rows) {
    if (!isSweepDue(payment, now)) continue;
    if (Date.now() > deadline) {
      summary.stoppedEarly = true;
      break;
    }
    summary.examined++;
    const restaurantId = payment.restaurantId!;

    try {
      let ids: string[];
      if (payment.gatewayPaymentId) {
        ids = [payment.gatewayPaymentId];
      } else {
        // We never recorded the Mercado Pago id (card checkout whose webhook was lost, or a PIX
        // whose local write failed after Mercado Pago created it): find it by our reference.
        const client = await getMpClientForRestaurant(restaurantId);
        if (!client) {
          summary.skippedNoConnection++;
          continue;
        }
        try {
          ids = orderAttempts(await searchConnectPaymentsByReference(client, payment.id));
        } catch (error) {
          if (isUnauthorizedError(error)) {
            await markNeedsReconnect(restaurantId, 'Mercado Pago rejeitou o token (401)');
            summary.skippedNoConnection++;
            continue;
          }
          throw error;
        }
      }

      let changed = false;
      for (const id of ids) {
        const result = await syncRestaurantPayment(restaurantId, id);
        if (result.updated) changed = true;
      }
      if (changed) summary.resolved++;
      else summary.unchanged++;
    } catch (error) {
      // One bad payment must never abort the run: count it and move on.
      summary.failed++;
      console.error(`[mp-connect] payment sweep failed for payment ${payment.id}:`, error);
    } finally {
      // Mark "checked now" so the next run does not repeat it before the interval passes.
      await prisma.payment
        .updateMany({ where: { id: payment.id, status: { in: [...SWEEPABLE_STATUSES] } }, data: { updatedAt: new Date() } })
        .catch(() => {});
    }
  }

  return summary;
}
