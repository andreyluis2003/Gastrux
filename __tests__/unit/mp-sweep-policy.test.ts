// @ts-nocheck
import {
  isSweepDue,
  SWEEP_MIN_AGE_MS,
  SWEEP_FAST_WINDOW_MS,
  SWEEP_FAST_INTERVAL_MS,
  SWEEP_SLOW_INTERVAL_MS,
  SWEEP_MAX_AGE_MS,
} from '../../lib/mercadopago-connect/sweep-policy';

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);
const MIN = 60_000;
const p = (ageMs: number, sinceCheckMs: number, over: any = {}) => ({
  status: 'PENDING',
  restaurantId: 'rest-1',
  createdAt: new Date(NOW - ageMs),
  updatedAt: new Date(NOW - sinceCheckMs),
  ...over,
});

describe('mercadopago-connect/sweep-policy isSweepDue', () => {
  it('waits for the webhook and the open page during the first 2 minutes', () => {
    expect(isSweepDue(p(SWEEP_MIN_AGE_MS - 1, SWEEP_MIN_AGE_MS - 1), NOW)).toBe(false);
    expect(isSweepDue(p(SWEEP_MIN_AGE_MS, SWEEP_MIN_AGE_MS), NOW)).toBe(true);
  });

  it('first hour: due again once the fast interval has passed since the last check', () => {
    expect(isSweepDue(p(20 * MIN, SWEEP_FAST_INTERVAL_MS - 1), NOW)).toBe(false);
    expect(isSweepDue(p(20 * MIN, SWEEP_FAST_INTERVAL_MS), NOW)).toBe(true);
  });

  it('after the first hour: only hourly', () => {
    const age = SWEEP_FAST_WINDOW_MS + 30 * MIN;
    expect(isSweepDue(p(age, 10 * MIN), NOW)).toBe(false);
    expect(isSweepDue(p(age, SWEEP_SLOW_INTERVAL_MS - 1), NOW)).toBe(false);
    expect(isSweepDue(p(age, SWEEP_SLOW_INTERVAL_MS), NOW)).toBe(true);
  });

  it('gives up after 7 days (manual reconciliation from then on)', () => {
    expect(isSweepDue(p(SWEEP_MAX_AGE_MS, SWEEP_SLOW_INTERVAL_MS), NOW)).toBe(true);
    expect(isSweepDue(p(SWEEP_MAX_AGE_MS + 1, SWEEP_SLOW_INTERVAL_MS), NOW)).toBe(false);
  });

  it('covers PENDING and PROCESSING only', () => {
    expect(isSweepDue(p(10 * MIN, 10 * MIN, { status: 'PROCESSING' }), NOW)).toBe(true);
    for (const status of ['APPROVED', 'DECLINED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CHARGEBACK', 'SETTLED']) {
      expect(isSweepDue(p(10 * MIN, 10 * MIN, { status }), NOW)).toBe(false);
    }
  });

  it('ignores a payment with no restaurant', () => {
    expect(isSweepDue(p(10 * MIN, 10 * MIN, { restaurantId: null }), NOW)).toBe(false);
  });
});
