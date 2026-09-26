// @ts-nocheck
/**
 * Single write path for SaaS subscription state, shared by every payment
 * gateway's webhook handler (Stripe today, Mercado Pago next).
 *
 * Why this exists: `Subscription` is the source of truth for billing
 * history/detail (read by /conta/cobranca), but the hot-path tier gating
 * (lib/tier-guard.ts) reads the denormalized User/Restaurant fields for
 * performance and because free-tier restaurants never get a Subscription
 * row at all. This function keeps both in lockstep from one place instead
 * of duplicating the mirroring logic per gateway.
 */
import { prisma } from '@/lib/prisma';

export type NormalizedSubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete';

export interface GatewaySubscriptionEvent {
  gateway: 'STRIPE' | 'MERCADO_PAGO';
  gatewaySubscriptionId: string;
  userId: string;
  restaurantId?: string | null;
  tier: string;
  planName?: string | null;
  billingCycle: 'monthly' | 'annual';
  amount: number;
  currency?: string;
  status: NormalizedSubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
  cancelledAt?: Date | null;
  cancelledBy?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Statuses that give the restaurant its plan. past_due keeps it while the gateway retries the charge. */
export const GRANTING_STATUSES: NormalizedSubscriptionStatus[] = ['active', 'trialing', 'past_due'];

/**
 * Whether a subscription gives its plan right now. A canceled one keeps it until the end of a period
 * that was paid for (Mercado Pago has no "cancel at period end"; see lib/billing/cancel.ts); a
 * subscription canceled during its free trial ends at once.
 */
export function subscriptionGrantsAccess(
  sub: { status: string; currentPeriodEnd?: Date | null; trialEnd?: Date | null },
  now = new Date()
): boolean {
  if (GRANTING_STATUSES.includes(sub.status as NormalizedSubscriptionStatus)) return true;
  if (sub.status !== 'canceled' || !sub.currentPeriodEnd || sub.currentPeriodEnd <= now) return false;
  const inTrial = !!sub.trialEnd && sub.trialEnd > now;
  return !inTrial;
}

export async function upsertSubscriptionFromGatewayEvent(input: GatewaySubscriptionEvent) {
  const now = new Date();
  // A gateway may not natively distinguish "trialing" from "active" (Mercado
  // Pago doesn't) - derive it consistently here regardless of gateway. Only an
  // authorized subscription can be in trial: a checkout that was opened and
  // abandoned (MP "pending" -> incomplete) used to become "trialing" here and
  // gave the paid plan to a restaurant that never entered a card.
  const status: NormalizedSubscriptionStatus =
    input.trialEnd && input.trialEnd > now && (input.status === 'active' || input.status === 'trialing')
      ? 'trialing'
      : input.status;

  const subscription = await prisma.subscription.upsert({
    where: {
      gateway_gatewaySubscriptionId: {
        gateway: input.gateway,
        gatewaySubscriptionId: input.gatewaySubscriptionId,
      },
    },
    update: {
      userId: input.userId,
      restaurantId: input.restaurantId ?? undefined,
      tier: input.tier,
      planName: input.planName ?? undefined,
      billingCycle: input.billingCycle,
      amount: input.amount,
      currency: input.currency || 'BRL',
      status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      currentPeriodStart: input.currentPeriodStart ?? undefined,
      currentPeriodEnd: input.currentPeriodEnd ?? undefined,
      trialStart: input.trialStart ?? undefined,
      trialEnd: input.trialEnd ?? undefined,
      cancelledAt: input.cancelledAt ?? undefined,
      cancelledBy: input.cancelledBy ?? undefined,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    },
    create: {
      gateway: input.gateway,
      gatewaySubscriptionId: input.gatewaySubscriptionId,
      userId: input.userId,
      restaurantId: input.restaurantId ?? null,
      tier: input.tier,
      planName: input.planName ?? null,
      billingCycle: input.billingCycle,
      amount: input.amount,
      currency: input.currency || 'BRL',
      status,
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      currentPeriodStart: input.currentPeriodStart ?? null,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      trialStart: input.trialStart ?? null,
      trialEnd: input.trialEnd ?? null,
      cancelledAt: input.cancelledAt ?? null,
      cancelledBy: input.cancelledBy ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  });

  const mirror = await resolveMirror(subscription, input.userId, now);
  if (!mirror) return subscription;

  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: { subscriptionId: mirror.sourceId, ...mirror.data },
    });
  } catch (e) {
    console.error('[subscription-sync] Failed to mirror into User', e);
  }

  try {
    // Preserves the pre-existing behavior (syncRestaurantTier): one paid
    // subscription covers every restaurant this user owns.
    await prisma.restaurant.updateMany({
      where: { ownerId: input.userId },
      data: mirror.data,
    });
  } catch (e) {
    console.error('[subscription-sync] Failed to mirror into Restaurant', e);
  }

  return subscription;
}

/**
 * What the owner's User/Restaurant rows should say after this event. The plan used to be copied
 * from every event whatever its status, so a canceled or failed subscription kept the paid features,
 * and an abandoned checkout for a new plan could replace the plan being paid for.
 */
async function resolveMirror(subscription: any, userId: string, now: Date) {
  const fields = (sub: any, tier: string) => ({
    subscriptionTier: tier,
    subscriptionStatus: sub.status,
    billingCycleStart: sub.currentPeriodStart ?? undefined,
    billingCycleEnd: sub.currentPeriodEnd ?? undefined,
    trialEndsAt: sub.trialEnd ?? undefined,
  });
  if (subscriptionGrantsAccess(subscription, now)) return { sourceId: subscription.id, data: fields(subscription, subscription.tier) };

  // Another subscription of the same owner may still be the one paying (e.g. a plan change)
  const others = await prisma.subscription.findMany({
    where: { userId, id: { not: subscription.id }, status: { in: [...GRANTING_STATUSES, 'canceled'] } },
    orderBy: { createdAt: 'desc' },
  });
  const paying = others.find((o: any) => subscriptionGrantsAccess(o, now));
  if (paying) return { sourceId: paying.id, data: fields(paying, paying.tier) };

  // An abandoned checkout changes nothing; an ended subscription goes back to the free plan
  if (subscription.status === 'incomplete') return null;
  return {
    sourceId: subscription.id,
    data: { ...fields(subscription, 'starter'), billingCycleStart: undefined, billingCycleEnd: undefined },
  };
}

/**
 * Canceled subscriptions whose paid period is over go back to the free plan. Stripe tells us itself
 * (customer.subscription.deleted); Mercado Pago does not, so the payment sweep cron runs this.
 */
export async function expireEndedSubscriptions(now = new Date()): Promise<number> {
  const ended = await prisma.subscription.findMany({
    where: { status: 'canceled', currentPeriodEnd: { lte: now }, userId: { not: null } },
    select: { id: true, userId: true },
    take: 200,
  });
  let expired = 0;
  for (const sub of ended) {
    const owner = await prisma.user.findUnique({
      where: { id: sub.userId as string },
      select: { subscriptionId: true, subscriptionTier: true },
    });
    // Only the subscription the owner's plan still comes from, and only once
    if (!owner || owner.subscriptionId !== sub.id || owner.subscriptionTier === 'starter') continue;
    const full = await prisma.subscription.findUnique({ where: { id: sub.id } });
    const mirror = full ? await resolveMirror(full, sub.userId as string, now) : null;
    if (!mirror) continue;
    await prisma.user.update({ where: { id: sub.userId as string }, data: { subscriptionId: mirror.sourceId, ...mirror.data } });
    await prisma.restaurant.updateMany({ where: { ownerId: sub.userId as string }, data: mirror.data });
    expired++;
  }
  return expired;
}
