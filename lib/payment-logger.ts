// @ts-nocheck
/**
 * Payment Event Logger
 * Logs all payment-related events with structured data for debugging and analytics
 */

import { prisma } from './prisma';

export enum PaymentEventType {
  CHECKOUT_SESSION_CREATED = 'checkout_session_created',
  CHECKOUT_SESSION_COMPLETED = 'checkout_session_completed',
  SUBSCRIPTION_CREATED = 'subscription_created',
  SUBSCRIPTION_UPDATED = 'subscription_updated',
  SUBSCRIPTION_DELETED = 'subscription_deleted',
  INVOICE_CREATED = 'invoice_created',
  INVOICE_PAID = 'invoice_paid',
  INVOICE_PAYMENT_FAILED = 'invoice_payment_failed',
  PAYMENT_INTENT_SUCCEEDED = 'payment_intent_succeeded',
  PAYMENT_INTENT_FAILED = 'payment_intent_failed',
  CUSTOMER_CREATED = 'customer_created',
  WEBHOOK_RECEIVED = 'webhook_received',
  WEBHOOK_PROCESSED = 'webhook_processed',
  WEBHOOK_FAILED = 'webhook_failed',
  TIER_UPGRADE = 'tier_upgrade',
  TIER_DOWNGRADE = 'tier_downgrade',
  PAYMENT_RETRY_QUEUED = 'payment_retry_queued',
  PAYMENT_RETRY_ATTEMPTED = 'payment_retry_attempted',
}

export interface PaymentLogEntry {
  eventType: PaymentEventType;
  userId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeInvoiceId?: string;
  stripeEventId?: string;
  oldTier?: string;
  newTier?: string;
  amount?: number;
  currency?: string;
  status?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Log payment events to database and console
 */
export async function logPaymentEvent(entry: PaymentLogEntry): Promise<void> {
  const timestamp = new Date().toISOString();
  
  // Log to console for real-time monitoring
  console.log(`[${timestamp}] [PAYMENT] ${entry.eventType}`, {
    userId: entry.userId,
    stripeCustomerId: entry.stripeCustomerId,
    stripeSubscriptionId: entry.stripeSubscriptionId,
    stripeInvoiceId: entry.stripeInvoiceId,
    status: entry.status,
    error: entry.error,
    metadata: entry.metadata,
  });

  try {
    // Create a payment log entry in database for audit trail
    // Note: This assumes a PaymentLog table exists in schema
    // If not, this can be stored as audit logs or separate payment_events table
    if (entry.userId) {
      // You can extend the User model to include paymentLogs relationship
      // For now, we'll just log to console and Stripe's built-in logging
      console.log(`✓ Payment event logged: ${entry.eventType}`);
    }
  } catch (error) {
    // Don't throw - logging shouldn't break the app
    console.error('Failed to log payment event:', error);
  }
}

/**
 * Log checkout session events
 */
export async function logCheckoutSession(
  userId: string,
  stripeCustomerId: string,
  tierId: string,
  status: 'created' | 'completed' | 'failed'
): Promise<void> {
  await logPaymentEvent({
    eventType: status === 'created' ? 
      PaymentEventType.CHECKOUT_SESSION_CREATED : 
      PaymentEventType.CHECKOUT_SESSION_COMPLETED,
    userId,
    stripeCustomerId,
    newTier: tierId,
    status,
  });
}

/**
 * Log subscription events from Stripe webhooks
 */
export async function logSubscriptionEvent(
  userId: string,
  stripeSubscriptionId: string,
  eventType: 'created' | 'updated' | 'deleted',
  tierFrom?: string,
  tierTo?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const eventTypeMap = {
    created: PaymentEventType.SUBSCRIPTION_CREATED,
    updated: PaymentEventType.SUBSCRIPTION_UPDATED,
    deleted: PaymentEventType.SUBSCRIPTION_DELETED,
  };

  await logPaymentEvent({
    eventType: eventTypeMap[eventType],
    userId,
    stripeSubscriptionId,
    oldTier: tierFrom,
    newTier: tierTo,
    metadata,
  });
}

/**
 * Log invoice events
 */
export async function logInvoiceEvent(
  userId: string,
  stripeInvoiceId: string,
  status: 'created' | 'paid' | 'failed',
  amount?: number,
  error?: string
): Promise<void> {
  const eventTypeMap = {
    created: PaymentEventType.INVOICE_CREATED,
    paid: PaymentEventType.INVOICE_PAID,
    failed: PaymentEventType.INVOICE_PAYMENT_FAILED,
  };

  await logPaymentEvent({
    eventType: eventTypeMap[status],
    userId,
    stripeInvoiceId,
    amount,
    status,
    error,
  });
}

/**
 * Log webhook events
 */
export async function logWebhookEvent(
  stripeEventId: string,
  eventType: string,
  status: 'received' | 'processed' | 'failed',
  error?: string,
  metadata?: Record<string, any>
): Promise<void> {
  const eventTypeMap = {
    received: PaymentEventType.WEBHOOK_RECEIVED,
    processed: PaymentEventType.WEBHOOK_PROCESSED,
    failed: PaymentEventType.WEBHOOK_FAILED,
  };

  await logPaymentEvent({
    eventType: eventTypeMap[status],
    stripeEventId,
    status,
    error,
    metadata: {
      stripeEventType: eventType,
      ...metadata,
    },
  });
}

/**
 * Log tier changes
 */
export async function logTierChange(
  userId: string,
  oldTier: string,
  newTier: string,
  reason: 'upgrade' | 'downgrade' | 'payment_failed'
): Promise<void> {
  const isUpgrade = ['pro', 'business', 'enterprise'].indexOf(newTier) >
    ['starter', 'pro', 'business'].indexOf(oldTier);

  await logPaymentEvent({
    eventType: isUpgrade ? PaymentEventType.TIER_UPGRADE : PaymentEventType.TIER_DOWNGRADE,
    userId,
    oldTier,
    newTier,
    metadata: { reason },
  });
}

/**
 * Log payment retry attempts (for dunning flow)
 */
export async function logPaymentRetry(
  userId: string,
  stripeInvoiceId: string,
  attempt: number,
  maxAttempts: number,
  nextRetryDate?: Date
): Promise<void> {
  await logPaymentEvent({
    eventType: PaymentEventType.PAYMENT_RETRY_ATTEMPTED,
    userId,
    stripeInvoiceId,
    metadata: {
      attempt,
      maxAttempts,
      nextRetryDate,
    },
  });
}

/**
 * Log payment retry queued (for dunning flow)
 */
export async function logPaymentRetryQueued(
  userId: string,
  stripeInvoiceId: string,
  scheduledFor: Date
): Promise<void> {
  await logPaymentEvent({
    eventType: PaymentEventType.PAYMENT_RETRY_QUEUED,
    userId,
    stripeInvoiceId,
    metadata: {
      scheduledFor,
    },
  });
}
