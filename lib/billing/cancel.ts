import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { updatePreApproval } from '@/lib/mercado-pago';
import { GRANTING_STATUSES, upsertSubscriptionFromGatewayEvent } from '@/lib/billing/subscription-sync';

/**
 * Self-service cancellation of the SaaS subscription ("Cancele quando quiser" on the pricing page had
 * no way to do it). Market practice: nothing more is charged, and the plan stays until the end of the
 * period already paid for; a cancellation during the free trial ends the plan at once.
 *
 * - Stripe: cancel_at_period_end; Stripe sends customer.subscription.deleted at the end.
 * - Mercado Pago: a PreApproval cannot be canceled at period end, so it is canceled now (no further
 *   charge) and expireEndedSubscriptions() takes the plan away when the paid period ends.
 */
export type CancelResult =
  | { ok: true; subscriptionId: string; accessUntil: Date | null }
  | { ok: false; status: number; error: string };

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' as any });
  return stripe;
}

export async function findPayingSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: { in: GRANTING_STATUSES }, cancelAtPeriodEnd: false },
    orderBy: { createdAt: 'desc' },
  });
}

export async function cancelSubscription(userId: string, cancelledBy: string): Promise<CancelResult> {
  const sub = await findPayingSubscription(userId);
  if (!sub || !sub.gatewaySubscriptionId) {
    return { ok: false, status: 404, error: 'Nenhuma assinatura ativa para cancelar' };
  }
  const now = new Date();
  const inTrial = sub.status === 'trialing' || (!!sub.trialEnd && sub.trialEnd > now);

  if (sub.gateway === 'STRIPE') {
    await getStripe().subscriptions.update(sub.gatewaySubscriptionId, { cancel_at_period_end: true });
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { cancelAtPeriodEnd: true, cancelledBy },
    });
    return { ok: true, subscriptionId: sub.id, accessUntil: sub.trialEnd && inTrial ? sub.trialEnd : sub.currentPeriodEnd };
  }

  if (sub.gateway === 'MERCADO_PAGO') {
    await updatePreApproval(sub.gatewaySubscriptionId, 'cancelled');
    await upsertSubscriptionFromGatewayEvent({
      gateway: 'MERCADO_PAGO',
      gatewaySubscriptionId: sub.gatewaySubscriptionId,
      userId,
      restaurantId: sub.restaurantId,
      tier: sub.tier,
      planName: sub.planName,
      billingCycle: sub.billingCycle as 'monthly' | 'annual',
      amount: Number(sub.amount),
      currency: sub.currency,
      status: 'canceled',
      cancelAtPeriodEnd: !inTrial,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      trialStart: sub.trialStart,
      trialEnd: sub.trialEnd,
      cancelledAt: now,
      cancelledBy,
    });
    const keeps = !inTrial && !!sub.currentPeriodEnd && sub.currentPeriodEnd > now;
    return { ok: true, subscriptionId: sub.id, accessUntil: keeps ? sub.currentPeriodEnd : null };
  }

  return { ok: false, status: 400, error: 'Forma de cobrança desconhecida' };
}
