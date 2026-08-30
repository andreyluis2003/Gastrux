// @ts-nocheck
/**
 * Cache Control Headers Strategy for API Endpoints
 * Optimizes performance by instructing browsers and CDN when to cache responses
 */

export type CacheStrategy = 
  | 'no-cache'
  | 'short'
  | 'medium'
  | 'long'
  | 'immutable';

/**
 * Get Cache-Control header value for a given strategy
 */
export function getCacheHeader(strategy: CacheStrategy): Record<string, string> {
  const headers: Record<CacheStrategy, Record<string, string>> = {
    'no-cache': {
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
    'short': {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
    },
    'medium': {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200',
    },
    'long': {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=172800',
    },
    'immutable': {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  };

  return headers[strategy];
}

/**
 * Determine cache strategy by endpoint pattern
 */
export function getCacheStrategyForEndpoint(pathname: string): CacheStrategy {
  // Authentication endpoints - never cache
  if (pathname.includes('/api/auth/') || pathname.includes('/api/signup')) {
    return 'no-cache';
  }

  // User-specific data - never cache
  if (pathname.includes('/api/users/') || pathname.includes('/api/sessions/')) {
    return 'no-cache';
  }

  // Static categories and reference data - long cache
  if (pathname.includes('/api/ingredients/categories')) {
    return 'long';
  }

  // Real-time analytics and stock data - short cache
  if (
    pathname.includes('/api/analytics/') ||
    pathname.includes('/api/stock/') ||
    pathname.includes('/api/forecasts/') ||
    pathname.includes('/api/alerts/')
  ) {
    return 'short';
  }

  // Master data (ingredients, recipes, suppliers) - medium cache
  if (
    pathname.includes('/api/ingredients') ||
    pathname.includes('/api/recipes') ||
    pathname.includes('/api/suppliers') ||
    pathname.includes('/api/production-plans') ||
    pathname.includes('/api/shopping-lists')
  ) {
    return 'medium';
  }

  // Onboarding endpoints - medium cache
  if (pathname.includes('/api/onboarding/')) {
    return 'medium';
  }

  // Reports, exports, OCR - no cache (dynamic generated content)
  if (
    pathname.includes('/api/reports/') ||
    pathname.includes('/api/invoices/') ||
    pathname.includes('/api/export')
  ) {
    return 'no-cache';
  }

  // Default: short cache for unknown endpoints
  return 'short';
}
