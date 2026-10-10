import { stripeInvoiceSubscriptionId, stripeSubscriptionPeriod } from '../../lib/billing/stripe-period';

describe('stripeInvoiceSubscriptionId', () => {
  it('reads the current API shape, the old field, or gives null', () => {
    expect(stripeInvoiceSubscriptionId({ parent: { subscription_details: { subscription: 'sub_new' } } })).toBe('sub_new');
    expect(stripeInvoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: 'sub_obj' } } } })).toBe('sub_obj');
    expect(stripeInvoiceSubscriptionId({ subscription: 'sub_old' })).toBe('sub_old');
    expect(stripeInvoiceSubscriptionId({})).toBeNull();
  });
});

describe('stripeSubscriptionPeriod', () => {
  // Production 2026-10-10: since Stripe API 2025-03-31.basil the billing period lives on the
  // subscription items. Reading subscription.current_period_* gave Invalid Date, Prisma refused the
  // write and every checkout.session.completed / customer.subscription.* webhook answered 400.
  it('reads the period from the first subscription item (current Stripe API)', () => {
    const period = stripeSubscriptionPeriod({
      items: { data: [{ current_period_start: 1_760_108_745, current_period_end: 1_762_700_745 }] },
    } as any);
    expect(period.currentPeriodStart?.toISOString()).toBe('2025-10-10T15:05:45.000Z');
    expect(period.currentPeriodEnd?.toISOString()).toBe('2025-11-09T15:05:45.000Z');
  });

  it('falls back to the subscription fields of older API versions', () => {
    const period = stripeSubscriptionPeriod({ current_period_start: 1_760_108_745, current_period_end: 1_762_700_745, items: { data: [] } } as any);
    expect(period.currentPeriodStart?.toISOString()).toBe('2025-10-10T15:05:45.000Z');
  });

  it('gives null, never an Invalid Date, when Stripe sends no period', () => {
    expect(stripeSubscriptionPeriod({ items: { data: [{}] } } as any)).toEqual({ currentPeriodStart: null, currentPeriodEnd: null });
  });
});
