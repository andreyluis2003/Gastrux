// @ts-nocheck
/**
 * API Route Optimization Utilities
 * Phase 10.1: Comprehensive API performance optimization
 * 
 * Features:
 * - Unified cache header application
 * - Lazy loading strategies
 * - N+1 query prevention
 * - Response compression
 * - Query optimization
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Cache Strategy Types
 */
export type CacheStrategy = 'static' | 'master' | 'dynamic' | 'real-time' | 'user-specific' | 'none';

/**
 * Cache Strategy Configuration
 */
const CACHE_STRATEGIES: Record<CacheStrategy, string> = {
  static: 'public, max-age=31536000, immutable', // 1 year
  master: 'public, max-age=3600, s-maxage=3600', // 1 hour
  dynamic: 'public, max-age=300, s-maxage=60', // 5 min cache, 60s CDN
  'real-time': 'public, max-age=30, s-maxage=10', // 30s cache, 10s CDN
  'user-specific': 'private, max-age=0, must-revalidate', // No cache
  'none': 'no-store, must-revalidate' // Never cache
};

/**
 * Route-to-Cache-Strategy Mapping
 * Maps API routes to optimal cache strategies
 */
const ROUTE_CACHE_MAPPING: Record<string, CacheStrategy> = {
  // Static resources
  '/api/auth': 'user-specific',
  '/api/auth/providers': 'static',
  
  // Master data (ingredients, recipes, suppliers)
  '/api/ingredients': 'master',
  '/api/ingredients/categories': 'master',
  '/api/recipes': 'master',
  '/api/suppliers': 'master',
  '/api/suppliers/': 'master',
  
  // Real-time data (stock, alerts, analytics)
  '/api/stock': 'real-time',
  '/api/alerts': 'real-time',
  '/api/analytics/metrics': 'real-time',
  '/api/analytics/stats': 'real-time',
  '/api/analytics/trends': 'real-time',
  
  // Dynamic data (forecasts, consumption)
  '/api/forecasts': 'dynamic',
  '/api/consumption': 'dynamic',
  '/api/cost-analysis': 'dynamic',
  
  // User-specific (no caching)
  '/api/user': 'user-specific',
  '/api/auth/signin': 'user-specific',
  '/api/auth/signout': 'user-specific',
  '/api/auth/callback': 'user-specific',
  
  // Export/Download (no caching)
  '/api/export': 'none',
  '/api/reports': 'none',
  '/api/download': 'none',
  '/api/consumption/export-csv': 'none',
};

/**
 * Get cache strategy for a given route
 */
export function getCacheStrategy(pathname: string): CacheStrategy {
  // Check exact match first
  if (ROUTE_CACHE_MAPPING[pathname]) {
    return ROUTE_CACHE_MAPPING[pathname];
  }

  // Check prefix matches
  for (const [route, strategy] of Object.entries(ROUTE_CACHE_MAPPING)) {
    if (pathname.startsWith(route)) {
      return strategy;
    }
  }

  // Default: dynamic cache
  return 'dynamic';
}

/**
 * Apply cache headers to response
 */
export function applyCacheHeaders(
  response: NextResponse,
  strategy: CacheStrategy
): NextResponse {
  const cacheControl = CACHE_STRATEGIES[strategy];
  response.headers.set('Cache-Control', cacheControl);
  
  // Add X-Cache-Strategy header for debugging
  response.headers.set('X-Cache-Strategy', strategy);
  
  return response;
}

/**
 * Lazy Load Utility
 * Prevents loading all relationships by default
 */
export interface LazyLoadOptions {
  include?: Record<string, boolean | { select?: Record<string, boolean> }>;
  select?: Record<string, boolean>;
  take?: number;
  skip?: number;
}

/**
 * Generate Prisma select clause for lazy loading
 * Only fetches essential fields, relationships must be explicitly requested
 */
export function buildLazySelect(
  baseFields: Record<string, boolean>,
  requestedIncludes?: Record<string, boolean>
): Record<string, any> {
  const select = { ...baseFields };

  if (requestedIncludes) {
    for (const [relation, include] of Object.entries(requestedIncludes)) {
      if (include) {
        select[relation] = true;
      }
    }
  }

  return select;
}

/**
 * N+1 Query Prevention
 * Build optimized Prisma query with proper includes to prevent N+1
 */
export function preventN1Queries(
  includes: Record<string, { select?: Record<string, boolean> } | true>
): Record<string, any> {
  const optimizedIncludes: Record<string, any> = {};

  for (const [relation, config] of Object.entries(includes)) {
    if (config === true) {
      optimizedIncludes[relation] = true;
    } else if (config && typeof config === 'object' && 'select' in config) {
      optimizedIncludes[relation] = {
        select: config.select
      };
    }
  }

  return optimizedIncludes;
}

/**
 * Pagination Helper
 * Safe pagination with reasonable limits
 */
export interface PaginationParams {
  page?: string | number;
  limit?: string | number;
  skip?: string | number;
  take?: string | number;
}

export function parsePaginationParams(params: PaginationParams) {
  let page = parseInt(params.page?.toString() || '1');
  let limit = parseInt(params.limit?.toString() || '20');
  let skip = parseInt(params.skip?.toString() || '0');
  let take = parseInt(params.take?.toString() || params.limit?.toString() || '20');

  // Validate and constrain
  page = Math.max(1, isNaN(page) ? 1 : page);
  limit = Math.max(1, Math.min(100, isNaN(limit) ? 20 : limit)); // Max 100 items
  skip = Math.max(0, isNaN(skip) ? 0 : skip);
  take = Math.max(1, Math.min(100, isNaN(take) ? 20 : take)); // Max 100 items

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
    offset: skip,
    pageSize: limit
  };
}

/**
 * Response Compression Header
 * Declare what compression is acceptable
 */
export function addCompressionHeaders(response: NextResponse): NextResponse {
  response.headers.set('Accept-Encoding', 'gzip, deflate, br');
  response.headers.set('Content-Encoding', 'gzip'); // Let CDN handle actual compression
  
  return response;
}

/**
 * Batch Query Helper
 * Load multiple related entities efficiently
 */
export function buildBatchQuery(
  ids: string[],
  batchSize: number = 100
): string[][] {
  const batches: string[][] = [];
  
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Query Timeout Configuration
 * Prevent long-running queries from hanging
 */
export const QUERY_TIMEOUT = 30000; // 30 seconds
export const API_TIMEOUT = 10000; // 10 seconds for API responses

/**
 * Optimized Response Builder
 * Applies all optimizations in one call
 */
export function buildOptimizedResponse(
  data: any,
  strategy: CacheStrategy = 'dynamic',
  options: {
    meta?: Record<string, any>;
    compressible?: boolean;
  } = {}
): NextResponse {
  const response = NextResponse.json(data);

  // Apply cache headers
  applyCacheHeaders(response, strategy);

  // Add compression headers if data is large
  const dataSize = JSON.stringify(data).length;
  if (options.compressible !== false && dataSize > 1024) {
    addCompressionHeaders(response);
  }

  // Add metadata
  if (options.meta) {
    for (const [key, value] of Object.entries(options.meta)) {
      response.headers.set(`X-${key}`, String(value));
    }
  }

  return response;
}

/**
 * Query Optimizer for Prisma
 * Converts request params to optimized Prisma query
 */
export function buildOptimizedQuery(params: {
  search?: string;
  category?: string;
  status?: string;
  sort?: string;
  limit?: string | number;
  page?: string | number;
}) {
  const pagination = parsePaginationParams({
    page: params.page,
    limit: params.limit
  });

  const where: any = {};
  
  // Add filters dynamically
  if (params.search) {
    where.OR = [
      { name: { contains: params.search, mode: 'insensitive' } },
      { description: { contains: params.search, mode: 'insensitive' } }
    ];
  }

  if (params.category) {
    where.categoryId = params.category;
  }

  if (params.status) {
    where.status = params.status;
  }

  // Parse sort (format: "field:asc" or "field:desc")
  let orderBy: any = { createdAt: 'desc' }; // Default sort
  if (params.sort) {
    const [field, direction] = params.sort.split(':');
    if (field) {
      orderBy = { [field]: direction === 'asc' ? 'asc' : 'desc' };
    }
  }

  return {
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy,
    skip: pagination.skip,
    take: pagination.take,
    pagination
  };
}

/**
 * Middleware Helper: Check cache before processing
 */
export function shouldUseCache(
  request: NextRequest,
  strategy: CacheStrategy
): boolean {
  // Never cache non-GET requests
  if (request.method !== 'GET') {
    return false;
  }

  // User-specific and no-cache strategies shouldn't use cache
  if (strategy === 'user-specific' || strategy === 'none') {
    return false;
  }

  return true;
}
