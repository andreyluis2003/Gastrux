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

export async function upsertSubscriptionFromGatewayEvent(input: GatewaySubscriptionEvent) {
  const now = new Date();
  // A gateway may not natively distinguish "trialing" from "active" (Mercado
  // Pago doesn't) - derive it consistently here regardless of gateway.
  const status: NormalizedSubscriptionStatus =
    input.trialEnd && input.trialEnd > now && input.status !== 'canceled'
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

  const mirrorData = {
    subscriptionTier: input.tier,
    subscriptionStatus: status,
    billingCycleStart: input.currentPeriodStart ?? undefined,
    billingCycleEnd: input.currentPeriodEnd ?? undefined,
    trialEndsAt: input.trialEnd ?? undefined,
  };

  try {
    await prisma.user.update({
      where: { id: input.userId },
      data: { subscriptionId: subscription.id, ...mirrorData },
    });
  } catch (e) {
    console.error('[subscription-sync] Failed to mirror into User', e);
  }

  try {
    // Preserves the pre-existing behavior (syncRestaurantTier): one paid
    // subscription covers every restaurant this user owns.
    await prisma.restaurant.updateMany({
      where: { ownerId: input.userId },
      data: mirrorData,
    });
  } catch (e) {
    console.error('[subscription-sync] Failed to mirror into Restaurant', e);
  }

  return subscription;
}
