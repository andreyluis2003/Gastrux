// @ts-nocheck
/**
 * FASE 10: Cache Strategy Configuration
 * Defines cache behavior for different types of endpoints
 * Used with Vercel Edge Network for global CDN caching
 */

export type CacheType = 'static' | 'master-data' | 'dynamic-data' | 'user-data' | 'real-time';

export interface CacheConfig {
  maxAge: number; // seconds
  sMaxAge: number; // seconds (CDN cache)
  staleWhileRevalidate?: number;
  staleIfError?: number;
  isPrivate: boolean;
  revalidatePath?: string[];
}

/**
 * Cache configurations by data type
 */
export const CACHE_STRATEGIES: Record<CacheType, CacheConfig> = {
  // Static assets (CSS, JS, Images) - Never changes
  static: {
    maxAge: 31536000, // 365 days
    sMaxAge: 31536000,
    isPrivate: false,
    staleWhileRevalidate: 60,
  },

  // Master data (Ingredients, Recipes, Categories) - Changes 1-2x per day
  'master-data': {
    maxAge: 3600, // 1 hour
    sMaxAge: 3600,
    isPrivate: false,
    staleWhileRevalidate: 300, // 5 min revalidate
    revalidatePath: ['/api/ingredients', '/api/recipes', '/api/categories'],
  },

  // Dynamic data (Stock, Forecasts, Analytics) - Changes multiple times per day
  'dynamic-data': {
    maxAge: 300, // 5 minutes
    sMaxAge: 300,
    isPrivate: false,
    staleWhileRevalidate: 240, // 4 min revalidate
    revalidatePath: ['/api/stock', '/api/forecasts', '/api/analytics'],
  },

  // User-specific data (Sessions, Preferences) - Never cache
  'user-data': {
    maxAge: 0,
    sMaxAge: 0,
    isPrivate: true,
  },

  // Real-time data (Alerts, Critical Stock) - Always fresh
  'real-time': {
    maxAge: 0,
    sMaxAge: 0,
    isPrivate: true,
  },
};

/**
 * Generate Cache-Control header value
 */
export function generateCacheHeader(strategy: CacheConfig): string {
  const parts: string[] = [];

  parts.push(strategy.isPrivate ? 'private' : 'public');

  if (strategy.maxAge > 0) {
    parts.push(`max-age=${strategy.maxAge}`);
  } else {
    parts.push('no-cache');
  }

  if (strategy.sMaxAge > 0) {
    parts.push(`s-maxage=${strategy.sMaxAge}`);
  }

  if (strategy.staleWhileRevalidate) {
    parts.push(`stale-while-revalidate=${strategy.staleWhileRevalidate}`);
  }

  if (strategy.staleIfError) {
    parts.push(`stale-if-error=${strategy.staleIfError}`);
  }

  if (!strategy.isPrivate && strategy.maxAge > 0) {
    parts.push('immutable');
  }

  return parts.join(', ');
}

/**
 * Get cache headers for a specific cache type
 */
export function getCacheHeaders(cacheType: CacheType): Record<string, string> {
  const strategy = CACHE_STRATEGIES[cacheType];
  const cacheControl = generateCacheHeader(strategy);

  return {
    'Cache-Control': cacheControl,
    // Inform CDN about stale content handling
    ...(strategy.staleWhileRevalidate && {
      'CDN-Cache-Control': cacheControl,
    }),
    // Add Vary header to account for different scenarios
    'Vary': 'Accept-Encoding, Authorization',
  };
}

/**
 * Helper to apply cache headers to NextResponse
 */
export function applyCache(
  headers: HeadersInit | undefined,
  cacheType: CacheType,
): HeadersInit {
  const cacheHeaders = getCacheHeaders(cacheType);
  return {
    ...headers,
    ...cacheHeaders,
  } as HeadersInit;
}

/**
 * Map API routes to cache types
 */
export const ROUTE_CACHE_MAP: Record<string, CacheType> = {
  // Ingredients - Master data
  '/api/ingredients': 'master-data',
  '/api/ingredients/*': 'master-data',

  // Recipes - Master data
  '/api/recipes': 'master-data',
  '/api/recipes/*': 'master-data',

  // Stock - Dynamic data
  '/api/stock': 'dynamic-data',
  '/api/stock/*': 'dynamic-data',

  // Analytics - Dynamic data
  '/api/analytics/*': 'dynamic-data',

  // Forecasts - Dynamic data
  '/api/forecasts': 'dynamic-data',
  '/api/forecasts/*': 'dynamic-data',

  // Alerts - Real-time
  '/api/alerts': 'real-time',
  '/api/alerts/*': 'real-time',

  // Auth - User data (never cache)
  '/api/auth/*': 'user-data',

  // Reports - User data (never cache)
  '/api/reports/*': 'user-data',

  // Categories - Master data
  '/api/ingredients/categories': 'master-data',
};

/**
 * Get cache type for a route
 */
export function getCacheTypeForRoute(pathname: string): CacheType {
  // Check exact match first
  if (ROUTE_CACHE_MAP[pathname]) {
    return ROUTE_CACHE_MAP[pathname];
  }

  // Check pattern match
  for (const [pattern, cacheType] of Object.entries(ROUTE_CACHE_MAP)) {
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.replace('*', '.*')}$`);
      if (regex.test(pathname)) {
        return cacheType;
      }
    }
  }

  // Default to dynamic-data for safety
  return 'dynamic-data';
}
