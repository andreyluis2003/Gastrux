// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
import { STRIPE_PRICING_TIERS } from '@/lib/stripe-config';
import { logPaymentEvent, logSubscriptionEvent, logInvoiceEvent, logWebhookEvent } from '@/lib/payment-logger';
import { queuePaymentForRetry } from '@/lib/dunning-flow';
import { createInvoice } from '@/lib/billing/invoice-service';
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

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });

  if (!user) return;

  const items = subscription.items.data;
  const priceId = items[0]?.price.id;
  const tierId = getTierIdFromPriceId(priceId);

  await logSubscriptionEvent(user.id, subscription.id, 'created', 'starter', tierId);
  
  // Send Sentry alert
  const planName = getPlanNameFromTierId(tierId);
  await alertSubscriptionCreated(subscription.customer as string, subscription.id, planName);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionId: subscription.id,
      subscriptionTier: tierId,
      subscriptionStatus: subscription.status,
      billingCycleStart: new Date((subscription.current_period_start as number) * 1000),
      billingCycleEnd: new Date((subscription.current_period_end as number) * 1000),
      trialEndsAt: subscription.trial_end
        ? new Date(subscription.trial_end * 1000)
        : null,
    },
  });

  // Also sync tier to Restaurant
  await syncRestaurantTier(user.id, tierId, subscription.status);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });

  if (!user) return;

  const items = subscription.items.data;
  const priceId = items[0]?.price.id;
  const tierId = getTierIdFromPriceId(priceId);

  const oldTier = user.subscriptionTier;
  await logSubscriptionEvent(user.id, subscription.id, 'updated', oldTier, tierId);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionTier: tierId,
      subscriptionStatus: subscription.status,
      billingCycleStart: new Date((subscription.current_period_start as number) * 1000),
      billingCycleEnd: new Date((subscription.current_period_end as number) * 1000),
    },
  });

  // Also sync tier to Restaurant
  await syncRestaurantTier(user.id, tierId, subscription.status);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });

  if (!user) return;

  await logSubscriptionEvent(user.id, subscription.id, 'deleted', user.subscriptionTier, 'starter');

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionId: null,
      subscriptionStatus: 'canceled',
      subscriptionTier: 'starter',
    },
  });

  // Also sync tier to Restaurant
  await syncRestaurantTier(user.id, 'starter', 'canceled');
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

/**
 * Sync subscription tier from User to their owned Restaurant(s)
 */
async function syncRestaurantTier(userId: string, tierId: string, status: string) {
  try {
    await prisma.restaurant.updateMany({
      where: { ownerId: userId },
      data: {
        subscriptionTier: tierId,
        subscriptionStatus: status === 'active' ? 'active' : status === 'canceled' ? 'canceled' : status,
      },
    });
  } catch (err) {
    console.error('[WEBHOOK] syncRestaurantTier failed (non-fatal):', err);
  }
}
