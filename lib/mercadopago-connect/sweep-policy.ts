/**
 * When the server-side sweep may ask Mercado Pago about a payment that is still
 * PENDING/PROCESSING. Pure (no I/O), so the rules are unit-testable.
 *
 * Numbers follow docs/superpowers/plans/2026-09-20-bad-day-scenarios-test-plan.md
 * (scenario 6). They are recommendations, not Mercado Pago rules: adjust after the
 * first month of real data.
 *
 * The last-checked time is the row's own `updatedAt`: the sweep touches it after every
 * attempt, and any real status write (webhook, page poll) also bumps it, which only
 * delays the next look at a payment that was just resolved anyway. No extra column.
 */

/** Statuses a notification could still move forward; anything else is settled. */
export const SWEEPABLE_STATUSES = ['PENDING', 'PROCESSING'] as const;

/** Give the webhook and the customer's open page time first. */
export const SWEEP_MIN_AGE_MS = 2 * 60 * 1000;

/** First hour: look at every run of a ~5 min cron (2 min < 5 min, so none is skipped by jitter). */
export const SWEEP_FAST_WINDOW_MS = 60 * 60 * 1000;
export const SWEEP_FAST_INTERVAL_MS = 2 * 60 * 1000;

/** After the first hour: hourly (55 min so a cron jitter never skips a whole hour). */
export const SWEEP_SLOW_INTERVAL_MS = 55 * 60 * 1000;

/** Covers Mercado Pago's last notification retry (96 h). Older ones need manual reconciliation. */
export const SWEEP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SweepCandidate {
  status: string;
  restaurantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function isSweepDue(payment: SweepCandidate, now: number = Date.now()): boolean {
  if (!payment.restaurantId) return false;
  if (!(SWEEPABLE_STATUSES as readonly string[]).includes(payment.status)) return false;

  const age = now - payment.createdAt.getTime();
  if (age < SWEEP_MIN_AGE_MS || age > SWEEP_MAX_AGE_MS) return false;

  const sinceLastCheck = now - payment.updatedAt.getTime();
  return sinceLastCheck >= (age <= SWEEP_FAST_WINDOW_MS ? SWEEP_FAST_INTERVAL_MS : SWEEP_SLOW_INTERVAL_MS);
}
