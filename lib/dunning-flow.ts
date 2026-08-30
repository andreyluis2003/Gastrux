// @ts-nocheck
/**
 * Dunning Flow: Automatic retry logic for failed payments
 * Implements exponential backoff strategy for payment recovery
 */

import { prisma } from './prisma';
import { logPaymentRetry, logPaymentRetryQueued } from './payment-logger';

export interface DunningConfig {
  maxRetries: number; // Maximum number of retry attempts
  initialDelayHours: number; // Delay before first retry (hours)
  backoffMultiplier: number; // Exponential backoff multiplier
  maxDelayHours: number; // Maximum delay between retries (hours)
}

const DEFAULT_DUNNING_CONFIG: DunningConfig = {
  maxRetries: 4,
  initialDelayHours: 3,
  backoffMultiplier: 2,
  maxDelayHours: 72, // Max 3 days
};

export interface PaymentFailureRecord {
  userId: string;
  stripeInvoiceId: string;
  stripeSubscriptionId: string;
  amount: number;
  currency: string;
  failureReason: string;
  attemptCount: number;
  lastAttemptAt: Date;
  nextRetryAt: Date | null;
  status: 'pending' | 'retrying' | 'failed' | 'resolved';
}

/**
 * Calculate next retry date with exponential backoff
 */
export function calculateNextRetryDate(
  attemptNumber: number,
  config: DunningConfig = DEFAULT_DUNNING_CONFIG
): Date {
  const delayHours = Math.min(
    config.initialDelayHours * Math.pow(config.backoffMultiplier, attemptNumber - 1),
    config.maxDelayHours
  );

  const nextRetry = new Date();
  nextRetry.setHours(nextRetry.getHours() + delayHours);
  return nextRetry;
}

/**
 * Queue a payment for retry
 */
export async function queuePaymentForRetry(
  userId: string,
  stripeInvoiceId: string,
  stripeSubscriptionId: string,
  amount: number,
  currency: string,
  failureReason: string,
  config: DunningConfig = DEFAULT_DUNNING_CONFIG
): Promise<PaymentFailureRecord | null> {
  try {
    const nextRetryAt = calculateNextRetryDate(0, config);

    // Log that we're queuing this for retry
    await logPaymentRetryQueued(userId, stripeInvoiceId, nextRetryAt);

    console.log(`[DUNNING] Queued payment retry for invoice ${stripeInvoiceId}`);
    console.log(`  User: ${userId}`);
    console.log(`  Amount: ${currency} ${amount}`);
    console.log(`  Next retry: ${nextRetryAt.toISOString()}`);
    console.log(`  Reason: ${failureReason}`);

    return {
      userId,
      stripeInvoiceId,
      stripeSubscriptionId,
      amount,
      currency,
      failureReason,
      attemptCount: 0,
      lastAttemptAt: new Date(),
      nextRetryAt,
      status: 'pending',
    };
  } catch (error) {
    console.error('[DUNNING] Failed to queue payment retry:', error);
    return null;
  }
}

/**
 * Check if a payment should be retried
 */
export function shouldRetryPayment(
  attemptCount: number,
  config: DunningConfig = DEFAULT_DUNNING_CONFIG
): boolean {
  return attemptCount < config.maxRetries;
}

/**
 * Process dunning events - should be called by a scheduled job
 * This is a placeholder for integration with a task scheduler
 */
export async function processDunningQueue(
  config: DunningConfig = DEFAULT_DUNNING_CONFIG
): Promise<{ processed: number; successful: number; failed: number }> {
  console.log('[DUNNING] Processing payment retry queue...');

  const stats = {
    processed: 0,
    successful: 0,
    failed: 0,
  };

  try {
    // This would typically query a PaymentFailures or DunningQueue table
    // and retry payments that are ready for retry
    // For now, this is a placeholder

    console.log('[DUNNING] Queue processing complete:', stats);
    return stats;
  } catch (error) {
    console.error('[DUNNING] Error processing queue:', error);
    throw error;
  }
}

/**
 * Get dunning statistics for a user
 */
export async function getUserDunningStats(userId: string) {
  try {
    // This would query payment failure records for the user
    // For now, return placeholder
    return {
      userId,
      failedPayments: 0,
      retryingPayments: 0,
      resolvedPayments: 0,
      lastFailureDate: null,
    };
  } catch (error) {
    console.error('[DUNNING] Error getting user stats:', error);
    return null;
  }
}

/**
 * Resolve a dunning record (payment succeeded after retry)
 */
export async function resolveDunningRecord(
  userId: string,
  stripeInvoiceId: string
): Promise<void> {
  try {
    console.log(`[DUNNING] Resolved payment for invoice ${stripeInvoiceId}`);
    // Update payment failure record status to 'resolved'
  } catch (error) {
    console.error('[DUNNING] Error resolving dunning record:', error);
  }
}
