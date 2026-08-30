// @ts-nocheck
import { captureException, captureMessage, setTag, addBreadcrumb } from './sentry';

/**
 * Centralized error handler for Stripe/Payment operations
 * Logs errors to Sentry for analysis and monitoring
 */
export async function handlePaymentError(
  error: Error,
  context: {
    userId?: string;
    stripeCustomerId?: string;
    subscriptionId?: string;
    paymentIntentId?: string;
    operationType: 'charge' | 'webhook' | 'subscription' | 'refund' | 'dunning';
    amount?: number;
    currency?: string;
  }
) {
  // Log breadcrumb
  addBreadcrumb(`Payment ${context.operationType} error`, {
    userId: context.userId,
    stripeCustomerId: context.stripeCustomerId,
    operationType: context.operationType,
  }, 'error');

  // Set tags for filtering in Sentry
  setTag('payment_operation', context.operationType);
  if (context.userId) setTag('user_id', context.userId);
  if (context.stripeCustomerId) setTag('stripe_customer_id', context.stripeCustomerId);

  // Capture exception to Sentry
  captureException(error, {
    ...context,
  });
}

export async function handleWebhookError(
  error: Error,
  webhookType: string,
  eventId: string
) {
  captureMessage(
    `Stripe webhook failure: ${webhookType}`,
    'error',
    {
      webhookType,
      eventId,
      error: error.message,
    }
  );

  setTag('webhook_type', webhookType);
  setTag('stripe_event_id', eventId);
}

export async function handlePaymentMethodError(
  userId: string,
  stripeCustomerId: string,
  errorCode: string,
  errorMessage: string,
  shouldAlert: boolean = true
) {
  const severity = shouldAlert ? 'warning' : 'info';

  captureMessage(
    `Payment method error: ${errorCode}`,
    severity as any,
    {
      userId,
      stripeCustomerId,
      errorCode,
      errorMessage,
    }
  );

  setTag('payment_error_code', errorCode);
}
