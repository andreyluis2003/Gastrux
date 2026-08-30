// @ts-nocheck
import * as Sentry from '@sentry/nextjs';

/**
 * ============================================================
 * PHASE 42 - ADVANCED MONITORING (Sentry)
 * ============================================================
 * Enhanced error tracking with:
 * - Performance monitoring
 * - Multi-tenant context (restaurant)
 * - Transaction helpers
 * - Breadcrumb trails
 * - Alert thresholds
 */

// ============================================================
// CORE EXCEPTION HANDLING
// ============================================================

/**
 * Captures an exception with context
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, {
    contexts: {
      app: context,
    },
  });
}

/**
 * Captures a message with level
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: Record<string, any>
) {
  Sentry.captureMessage(message, {
    level,
    contexts: {
      app: context,
    },
  });
}

// ============================================================
// BREADCRUMB / CONTEXT TRACKING
// ============================================================

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  level: Sentry.SeverityLevel = 'info'
) {
  Sentry.addBreadcrumb({
    message,
    data,
    level,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Add API call breadcrumb
 */
export function trackApiCall(
  method: string,
  url: string,
  statusCode?: number,
  duration?: number
) {
  Sentry.addBreadcrumb({
    category: 'api',
    message: `${method} ${url}`,
    data: { method, url, statusCode, duration },
    level: statusCode && statusCode >= 400 ? 'error' : 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Add DB query breadcrumb
 */
export function trackDbQuery(
  operation: string,
  model: string,
  duration?: number
) {
  Sentry.addBreadcrumb({
    category: 'db',
    message: `${operation} ${model}`,
    data: { operation, model, duration },
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}

// ============================================================
// USER / TENANT CONTEXT
// ============================================================

/**
 * Set user context
 */
export function setSentryUser(
  userId: string | null,
  email?: string,
  username?: string,
  role?: string
) {
  if (userId) {
    Sentry.setUser({
      id: userId,
      email,
      username,
      role,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Set multi-tenant restaurant context (important for data isolation tracking)
 */
export function setRestaurantContext(
  restaurantId: string | null,
  restaurantName?: string,
  plan?: string
) {
  if (restaurantId) {
    Sentry.setTag('restaurant.id', restaurantId);
    if (restaurantName) Sentry.setTag('restaurant.name', restaurantName);
    if (plan) Sentry.setTag('restaurant.plan', plan);

    Sentry.setContext('restaurant', {
      id: restaurantId,
      name: restaurantName,
      plan,
    });
  } else {
    Sentry.setTag('restaurant.id', null);
    Sentry.setContext('restaurant', null);
  }
}

/**
 * Set custom tags for better filtering
 */
export function setTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

/**
 * Set multiple tags at once
 */
export function setTags(tags: Record<string, string>) {
  Object.entries(tags).forEach(([k, v]) => Sentry.setTag(k, v));
}

// ============================================================
// ERROR HANDLING WRAPPERS
// ============================================================

/**
 * Safely catch and report errors without throwing
 */
export async function withSentryErrorHandler<T>(
  fn: () => Promise<T>,
  operationName: string,
  fallback: T
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        operation: operationName,
        handled: 'true',
      },
    });
    return fallback;
  }
}

/**
 * Wrap a handler with automatic error reporting
 */
export function withErrorReporting<T extends (...args: any[]) => any>(
  fn: T,
  operationName: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { operation: operationName, handled: 'true' },
      });
      throw error;
    }
  }) as T;
}

// ============================================================
// PERFORMANCE MONITORING
// ============================================================

/**
 * Start a custom transaction for performance monitoring
 */
export function startTransaction(name: string, op: string) {
  if (typeof (Sentry as any).startTransaction === 'function') {
    return (Sentry as any).startTransaction({ name, op });
  }
  return null;
}

/**
 * Wrap an async operation with performance tracking
 */
export async function trackPerformance<T>(
  operationName: string,
  op: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const duration = Date.now() - start;

    // Alert on slow operations (>3s)
    if (duration > 3000) {
      Sentry.captureMessage(`Slow operation: ${operationName}`, {
        level: 'warning',
        tags: { op, operation: operationName },
        contexts: { perf: { duration, threshold: 3000 } },
      });
    }

    addBreadcrumb(`${op}: ${operationName}`, { duration }, 'info');
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    Sentry.captureException(error, {
      tags: { op, operation: operationName },
      contexts: { perf: { duration, failed: true } },
    });
    throw error;
  }
}

// ============================================================
// MONITORING ALERTS
// ============================================================

/**
 * Track critical business metric - failed payment
 */
export function trackFailedPayment(
  userId: string,
  amount: number,
  reason: string
) {
  Sentry.captureMessage('Payment Failed', {
    level: 'error',
    tags: {
      event: 'payment.failed',
      amount_range: getAmountRange(amount),
    },
    contexts: { payment: { userId, amount, reason } },
  });
}

/**
 * Track critical business metric - high stock alert
 */
export function trackStockAlert(
  ingredientId: string,
  stockLevel: number,
  threshold: number
) {
  Sentry.captureMessage('Critical Stock Alert', {
    level: 'warning',
    tags: { event: 'stock.critical' },
    contexts: {
      stock: { ingredientId, stockLevel, threshold },
    },
  });
}

/**
 * Track auth failures (could indicate brute force)
 */
export function trackAuthFailure(
  email: string,
  reason: string,
  ipAddress?: string
) {
  Sentry.captureMessage('Auth Failure', {
    level: 'warning',
    tags: { event: 'auth.failure' },
    contexts: { auth: { email, reason, ipAddress } },
  });
}

/**
 * Track API rate limiting hits
 */
export function trackRateLimitHit(
  endpoint: string,
  userId?: string,
  ipAddress?: string
) {
  Sentry.captureMessage('Rate Limit Hit', {
    level: 'warning',
    tags: { event: 'ratelimit.hit', endpoint },
    contexts: { ratelimit: { endpoint, userId, ipAddress } },
  });
}

// ============================================================
// UTILITIES
// ============================================================

function getAmountRange(amount: number): string {
  if (amount < 10) return '<10';
  if (amount < 100) return '10-100';
  if (amount < 1000) return '100-1000';
  if (amount < 10000) return '1000-10000';
  return '>10000';
}

/**
 * Flush Sentry events (useful before server shutdown)
 */
export async function flushSentry(timeout: number = 2000): Promise<boolean> {
  return Sentry.flush(timeout);
}

export { Sentry };
