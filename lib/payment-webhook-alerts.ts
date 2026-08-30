// @ts-nocheck
import { captureMessage, setTag } from './sentry';

/**
 * Alert system for critical payment webhook events
 * Notifies Sentry and logs for analysis
 */

interface WebhookAlert {
  type: 'success' | 'failure' | 'warning' | 'critical';
  eventType: string;
  title: string;
  description: string;
  metadata?: Record<string, any>;
  shouldNotifyAdmin?: boolean;
}

/**
 * Send webhook alert to Sentry
 */
export async function sendWebhookAlert(alert: WebhookAlert) {
  const severityMap = {
    success: 'info' as const,
    failure: 'error' as const,
    warning: 'warning' as const,
    critical: 'fatal' as const,
  };

  // Send to Sentry
  setTag('webhook_alert_type', alert.eventType);
  captureMessage(alert.title, severityMap[alert.type], {
    description: alert.description,
    metadata: alert.metadata,
    type: alert.type,
  });

  console.log(`[WEBHOOK ALERT] ${alert.type.toUpperCase()}: ${alert.title}`);
  console.log(`  Description: ${alert.description}`);

  // Optional: Send email to admin if critical
  if (alert.shouldNotifyAdmin && alert.type === 'critical') {
    console.log(`  >>> ADMIN NOTIFICATION REQUIRED <<<`);
    // TODO: Implement email notification when email service is ready
  }
}

/**
 * Common webhook alerts
 */

export async function alertPaymentSucceeded(
  customerId: string,
  amount: number,
  currency: string
) {
  await sendWebhookAlert({
    type: 'success',
    eventType: 'payment_intent.succeeded',
    title: 'Payment Succeeded',
    description: `Customer ${customerId} paid ${amount} ${currency.toUpperCase()}`,
    metadata: { customerId, amount, currency },
  });
}

export async function alertPaymentFailed(
  customerId: string,
  errorCode: string,
  errorMessage: string,
  shouldAlert = true
) {
  await sendWebhookAlert({
    type: 'failure',
    eventType: 'payment_intent.payment_failed',
    title: 'Payment Failed',
    description: `Customer ${customerId} - ${errorCode}: ${errorMessage}`,
    metadata: { customerId, errorCode, errorMessage },
    shouldNotifyAdmin: shouldAlert,
  });
}

export async function alertSubscriptionCreated(
  customerId: string,
  subscriptionId: string,
  plan: string
) {
  await sendWebhookAlert({
    type: 'success',
    eventType: 'customer.subscription.created',
    title: 'New Subscription',
    description: `Customer ${customerId} subscribed to ${plan}`,
    metadata: { customerId, subscriptionId, plan },
  });
}

export async function alertSubscriptionUpdated(
  customerId: string,
  subscriptionId: string,
  status: string
) {
  await sendWebhookAlert({
    type: 'warning',
    eventType: 'customer.subscription.updated',
    title: 'Subscription Updated',
    description: `Subscription ${subscriptionId} status: ${status}`,
    metadata: { customerId, subscriptionId, status },
  });
}

export async function alertSubscriptionCancelled(
  customerId: string,
  subscriptionId: string
) {
  await sendWebhookAlert({
    type: 'warning',
    eventType: 'customer.subscription.deleted',
    title: 'Subscription Cancelled',
    description: `Customer ${customerId} cancelled subscription`,
    metadata: { customerId, subscriptionId },
  });
}

export async function alertChargeRefunded(
  customerId: string,
  chargeId: string,
  refundAmount: number,
  reason: string
) {
  await sendWebhookAlert({
    type: 'warning',
    eventType: 'charge.refunded',
    title: 'Charge Refunded',
    description: `${refundAmount} refunded - ${reason}`,
    metadata: { customerId, chargeId, refundAmount, reason },
    shouldNotifyAdmin: true,
  });
}

export async function alertWebhookProcessingError(
  eventId: string,
  eventType: string,
  error: string
) {
  await sendWebhookAlert({
    type: 'critical',
    eventType: 'webhook.processing_error',
    title: 'Webhook Processing Failed',
    description: `Event ${eventId} (${eventType}) failed to process: ${error}`,
    metadata: { eventId, eventType, error },
    shouldNotifyAdmin: true,
  });
}
