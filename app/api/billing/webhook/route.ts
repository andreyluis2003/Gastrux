// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { STRIPE_PRICING_TIERS } from '@/lib/stripe-config';
import { logPaymentEvent, logSubscriptionEvent, logInvoiceEvent, logWebhookEvent } from '@/lib/payment-logger';
import { queuePaymentForRetry } from '@/lib/dunning-flow';
import { createInvoice } from '@/lib/billing/invoice-service';
import { upsertSubscriptionFromGatewayEvent, NormalizedSubscriptionStatus } from '@/lib/billing/subscription-sync';
import {
  alertPaymentSucceeded,
  alertPaymentFailed,
  alertSubscriptionCreated,
  alertSubscriptionUpdated,
  alertSubscriptionCancelled,
  alertWebhookProcessingError,
} from '@/lib/payment-webhook-alerts';
import { handleWebhookError } from '@/lib/payment-error-handler';

export const dynamic = 'force-dynamic';

// Lazily instantiate Stripe so the module can be imported (e.g. during `next build`'s
// page-data collection) even when Stripe env vars aren't available at build time.
let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY environment variable is not set');
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-04-22.dahlia',
    });
  }
  return stripe;
}

async function verifyWebhookSignature(
  body: string,
  signature: string
): Promise<Stripe.Event> {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET environment variable is not set');
  }
  try {
    return getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    throw new Error('Invalid webhook signature');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      await logWebhookEvent('unknown', 'unknown', 'failed', 'Missing signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    const event = await verifyWebhookSignature(body, signature);

    // Log webhook received
    await logWebhookEvent(event.id, event.type, 'received');

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.created':
        await handleInvoiceCreated(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice, event.id);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.id);
        break;

      default:
        console.log(`[WEBHOOK] Unhandled event type: ${event.type}`);
    }

    // Log webhook processed
    await logWebhookEvent(event.id, event.type, 'processed');
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[WEBHOOK] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await logWebhookEvent('unknown', 'unknown', 'failed', errorMessage);

    // Alert Sentry about webhook error
    if (error instanceof Error) {
      await handleWebhookError(error, 'unknown', 'unknown');
      await alertWebhookProcessingError('unknown', 'unknown', error.message);
    }

    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 400 }
    );
  }
}

/**
 * Fires the instant a Stripe Checkout session completes. For subscription-mode
 * sessions this lets us sync state a beat earlier than waiting on the separate
 * customer.subscription.created event (useful for /billing/success polling).
 * For setup-mode sessions (the free "starter" tier) there's no subscription to
 * sync - nothing to do beyond logging.
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  if (session.mode !== 'subscription' || !session.subscription) {
    return;
  }
  const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
  await syncFromStripeSubscription(subscription);
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });
  if (!user) return;

  const items = subscription.items.data;
  const priceId = items[0]?.price.id;
  const tierId = getTierIdFromPriceId(priceId);

  await logSubscriptionEvent(user.id, subscription.id, 'created', 'starter', tierId);
  await alertSubscriptionCreated(subscription.customer as string, subscription.id, getPlanNameFromTierId(tierId));

  await syncFromStripeSubscription(subscription);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });
  if (!user) return;

  const priceId = subscription.items.data[0]?.price.id;
  const tierId = getTierIdFromPriceId(priceId);
  await logSubscriptionEvent(user.id, subscription.id, 'updated', user.subscriptionTier, tierId);

  await syncFromStripeSubscription(subscription);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });
  if (!user) return;

  await logSubscriptionEvent(user.id, subscription.id, 'deleted', user.subscriptionTier, 'starter');

  await upsertSubscriptionFromGatewayEvent({
    gateway: 'STRIPE',
    gatewaySubscriptionId: subscription.id,
    userId: user.id,
    restaurantId: user.currentRestaurantId,
    tier: 'starter',
    billingCycle: 'monthly',
    amount: 0,
    status: 'canceled',
    cancelAtPeriodEnd: false,
    cancelledAt: new Date(),
  });
}

/**
 * Shared by handleSubscriptionCreated/Updated/handleCheckoutSessionCompleted -
 * resolves tier/billing cycle/status from a live Stripe Subscription object
 * and writes it through the gateway-agnostic sync helper.
 */
async function syncFromStripeSubscription(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });
  if (!user) return;

  const price = subscription.items.data[0]?.price;
  const tierId = getTierIdFromPriceId(price?.id);
  const billingCycle = price?.recurring?.interval === 'year' ? 'annual' : 'monthly';

  await upsertSubscriptionFromGatewayEvent({
    gateway: 'STRIPE',
    gatewaySubscriptionId: subscription.id,
    userId: user.id,
    restaurantId: user.currentRestaurantId,
    tier: tierId,
    planName: getPlanNameFromTierId(tierId),
    billingCycle,
    amount: (price?.unit_amount || 0) / 100,
    currency: (price?.currency || 'brl').toUpperCase(),
    status: mapStripeSubscriptionStatus(subscription.status),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: new Date((subscription.current_period_start as number) * 1000),
    currentPeriodEnd: new Date((subscription.current_period_end as number) * 1000),
    trialStart: subscription.trial_start ? new Date(subscription.trial_start * 1000) : null,
    trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
    metadata: { stripePriceId: price?.id },
  });
}

function mapStripeSubscriptionStatus(status: Stripe.Subscription.Status): NormalizedSubscriptionStatus {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
      return 'canceled';
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'incomplete':
    case 'incomplete_expired':
    default:
      return 'incomplete';
  }
}

async function handleInvoiceCreated(invoice: Stripe.Invoice) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: invoice.customer as string },
  });

  if (!user) return;

  await logInvoiceEvent(user.id, invoice.id, 'created', invoice.amount_due);
}

async function handleInvoicePaid(invoice: Stripe.Invoice, eventId: string) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: invoice.customer as string },
  });

  if (!user) return;

  const ownedRestaurant = await prisma.restaurant.findFirst({
    where: { ownerId: user.id },
    select: { id: true, name: true },
  });

  await logInvoiceEvent(user.id, invoice.id, 'paid', invoice.amount_paid);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastInvoiceDate: new Date(invoice.created * 1000),
      subscriptionStatus: 'active',
    },
  });

  // Create BillingInvoice record (idempotent by stripe invoice id)
  try {
    const stripeInvoiceId = invoice.id;
    const existing = await prisma.billingInvoice.findFirst({
      where: {
        OR: [
          { paymentId: stripeInvoiceId },
          { metadata: { contains: `"stripeInvoiceId":"${stripeInvoiceId}"` } },
        ],
      },
      select: { id: true },
    });
    if (existing) {
      console.log(`[WEBHOOK] BillingInvoice already exists for Stripe invoice ${stripeInvoiceId}`);
      return;
    }

    const amountPaid = (invoice.amount_paid || 0) / 100;
    const amountTax = (invoice.tax || 0) / 100;
    const amountSubtotal = Math.max(amountPaid - amountTax, 0);
    const currency = (invoice.currency || 'usd').toUpperCase();
    const periodStart = invoice.period_start ? new Date(invoice.period_start * 1000) : null;
    const periodEnd = invoice.period_end ? new Date(invoice.period_end * 1000) : null;
    const subscriptionId = (invoice.subscription as string) || user.subscriptionId || null;
    const planName = getPlanNameFromTierId(user.subscriptionTier || 'starter');
    const description = `Assinatura ${planName}` +
      (periodStart && periodEnd
        ? ` — ${periodStart.toLocaleDateString('pt-BR')} a ${periodEnd.toLocaleDateString('pt-BR')}`
        : '');
    const customerEmail =
      invoice.customer_email ||
      user.email ||
      '';
    const customerName =
      invoice.customer_name ||
      user.name ||
      customerEmail ||
      'Cliente';
    const restaurantId = ownedRestaurant?.id || null;

    await createInvoice({
      userId: user.id,
      restaurantId,
      customerName,
      customerEmail,
      subscriptionId,
      description,
      periodStart,
      periodEnd,
      subtotal: amountSubtotal,
      tax: amountTax,
      discount: 0,
      total: amountPaid,
      currency,
      status: 'PAID',
      paidAt: new Date(),
      paymentMethod: 'stripe',
      paymentId: stripeInvoiceId,
      dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    });

    // Update metadata on the just-created record to include stripe invoice id
    await prisma.billingInvoice.updateMany({
      where: { paymentId: stripeInvoiceId },
      data: {
        metadata: JSON.stringify({
          stripeInvoiceId,
          stripeEventId: eventId,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          invoicePdf: invoice.invoice_pdf,
        }),
      },
    });
  } catch (err) {
    console.error('[WEBHOOK] BillingInvoice creation failed (non-fatal):', err);
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventId: string) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: invoice.customer as string },
  });

  if (!user) return;

  const failureReason = invoice.last_finalization_error?.message || 'Unknown error';

  await logInvoiceEvent(
    user.id,
    invoice.id,
    'failed',
    invoice.amount_due,
    failureReason
  );

  // Queue for retry using dunning flow
  const subscriptionId = invoice.subscription as string;
  await queuePaymentForRetry(
    user.id,
    invoice.id,
    subscriptionId,
    invoice.amount_due,
    (invoice.currency || 'usd').toUpperCase(),
    failureReason
  );

  // Mark subscription as past due
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'past_due',
    },
  });

  if (subscriptionId) {
    await prisma.subscription.updateMany({
      where: { gateway: 'STRIPE', gatewaySubscriptionId: subscriptionId },
      data: { status: 'past_due' },
    });
  }
}

function getTierIdFromPriceId(priceId?: string): string {
  if (!priceId) return 'starter';

  // Search in STRIPE_PRICING_TIERS for matching price ID
  for (const tier of Object.values(STRIPE_PRICING_TIERS)) {
    if (
      tier.stripePriceId === priceId ||
      tier.stripePriceIdAnnual === priceId
    ) {
      return tier.id;
    }
  }

  // Fallback to default if not found
  console.warn(`Price ID not found in tiers: ${priceId}, defaulting to starter`);
  return 'starter';
}

function getPlanNameFromTierId(tierId: string): string {
  const tierMap: Record<string, string> = {
    starter: 'Starter',
    pro: 'Pro',
    business: 'Business',
    enterprise: 'Enterprise',
  };
  return tierMap[tierId] || tierId;
}
