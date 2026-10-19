import { planAccess, trialEnd, TRIAL_DAYS } from '@/lib/billing/plan-access';

const NOW = new Date('2026-10-18T12:00:00Z');
const day = 86_400_000;
const base = { isInternal: false, subscriptionTier: 'business', subscriptionStatus: 'trialing', trialEndsAt: new Date(NOW.getTime() + 10 * day) };

describe('planAccess (spec 2026-10-18 §5)', () => {
  it('internal is never locked, whatever the plan says', () => {
    expect(planAccess({ ...base, isInternal: true, subscriptionTier: 'starter', subscriptionStatus: 'canceled', trialEndsAt: null }, NOW)).toEqual({ state: 'internal', locked: false, daysLeft: null });
  });
  it('trial in time: free, with the days left rounded up', () => {
    expect(planAccess(base, NOW)).toEqual({ state: 'trial', locked: false, daysLeft: 10 });
    expect(planAccess({ ...base, trialEndsAt: new Date(NOW.getTime() + 1) }, NOW).daysLeft).toBe(1);
  });
  it('trial over or without a date: locked', () => {
    expect(planAccess({ ...base, trialEndsAt: new Date(NOW.getTime() - 1) }, NOW).state).toBe('locked');
    expect(planAccess({ ...base, trialEndsAt: null }, NOW).state).toBe('locked');
  });
  it.each(['pro', 'business', 'enterprise'])('paid %s (active or past_due) is free', (tier) => {
    expect(planAccess({ ...base, subscriptionTier: tier, subscriptionStatus: 'active', trialEndsAt: null }, NOW).state).toBe('paid');
    expect(planAccess({ ...base, subscriptionTier: tier, subscriptionStatus: 'past_due', trialEndsAt: null }, NOW).state).toBe('paid');
  });
  it('ended plan ("starter" or canceled) is locked', () => {
    expect(planAccess({ ...base, subscriptionTier: 'starter', subscriptionStatus: 'active', trialEndsAt: null }, NOW).state).toBe('locked');
    expect(planAccess({ ...base, subscriptionTier: 'pro', subscriptionStatus: 'canceled', trialEndsAt: null }, NOW).state).toBe('locked');
  });
  it('trialEnd is 30 days later', () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(trialEnd(NOW).getTime() - NOW.getTime()).toBe(30 * day);
  });
});

describe('a canceled paid plan runs to the end of the paid period (final review I-1, Mercado Pago cancels at once)', () => {
  it('canceled with the period still ahead is paid; after it, locked', () => {
    const canceled = { ...base, subscriptionTier: 'pro', subscriptionStatus: 'canceled', trialEndsAt: null };
    expect(planAccess({ ...canceled, billingCycleEnd: new Date(NOW.getTime() + 5 * day) }, NOW).state).toBe('paid');
    expect(planAccess({ ...canceled, billingCycleEnd: new Date(NOW.getTime() - 1) }, NOW).state).toBe('locked');
    expect(planAccess({ ...canceled, billingCycleEnd: null }, NOW).state).toBe('locked');
  });
  it('a canceled "starter" (no plan) is locked even with a date', () => {
    expect(planAccess({ ...base, subscriptionTier: 'starter', subscriptionStatus: 'canceled', trialEndsAt: null, billingCycleEnd: new Date(NOW.getTime() + day) }, NOW).state).toBe('locked');
  });
});

describe('a subscription made during the trial is a paid plan (deferred from the 2026-10-18 review)', () => {
  it('no trial bar and no lock, even after trialEndsAt while the gateway has not answered', () => {
    const subscribed = { ...base, subscriptionTier: 'pro', subscribedInTrial: true };
    expect(planAccess(subscribed, NOW)).toEqual({ state: 'paid', locked: false, daysLeft: null });
    expect(planAccess({ ...subscribed, trialEndsAt: new Date(NOW.getTime() - day) }, NOW).state).toBe('paid');
  });
  it('without a subscription the trial stays a trial', () => {
    expect(planAccess({ ...base, subscribedInTrial: false }, NOW).state).toBe('trial');
  });
});
