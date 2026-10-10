/**
 * The current billing period of a Stripe subscription. Since API 2025-03-31.basil it lives on the
 * subscription items, not on the subscription: reading only the old fields gave Invalid Date and every
 * subscription webhook failed (production 2026-10-10). Older payloads are still read. Never Invalid Date.
 */
type SecondsOrMissing = number | null | undefined;

interface StripeSubscriptionLike {
  current_period_start?: SecondsOrMissing;
  current_period_end?: SecondsOrMissing;
  items?: { data?: Array<{ current_period_start?: SecondsOrMissing; current_period_end?: SecondsOrMissing }> };
}

const toDate = (seconds: SecondsOrMissing) => (typeof seconds === 'number' && Number.isFinite(seconds) ? new Date(seconds * 1000) : null);

/**
 * The subscription id of a Stripe invoice: since API 2025-03-31.basil it is under
 * invoice.parent.subscription_details.subscription (invoice.subscription is gone).
 */
export function stripeInvoiceSubscriptionId(invoice: {
  subscription?: string | { id?: string } | null;
  parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
}): string | null {
  const ref = invoice.parent?.subscription_details?.subscription ?? invoice.subscription;
  if (!ref) return null;
  return typeof ref === 'string' ? ref : ref.id ?? null;
}

export function stripeSubscriptionPeriod(subscription: StripeSubscriptionLike): { currentPeriodStart: Date | null; currentPeriodEnd: Date | null } {
  const item = subscription.items?.data?.[0];
  return {
    currentPeriodStart: toDate(item?.current_period_start ?? subscription.current_period_start),
    currentPeriodEnd: toDate(item?.current_period_end ?? subscription.current_period_end),
  };
}
