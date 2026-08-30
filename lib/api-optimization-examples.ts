// @ts-nocheck
/**
 * API Optimization - Real-World Examples
 * Phase 10.1: How to apply optimizations to existing routes
 */

import {
  getCacheStrategy,
  applyCacheHeaders,
  buildLazySelect,
  preventN1Queries,
  parsePaginationParams,
  buildOptimizedResponse,
  buildOptimizedQuery,
  CacheStrategy
} from './api-optimization';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';

/**
 * EXAMPLE 1: Simple GET with Caching & Pagination
 */
export async function exampleSimpleGet(request: NextRequest) {
  const session = null; // getServerSession(authOptions)
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const pagination = parsePaginationParams({
    page: searchParams.get('page') || undefined,
    limit: searchParams.get('limit') || undefined
  });

  const [data, total] = await Promise.all([
    prisma.ingredient.findMany({
      skip: pagination.skip,
      take: pagination.take,
      select: {
        id: true,
        name: true,
        description: true,
        category: { select: { id: true, name: true } },
        active: true
      }
    }),
    prisma.ingredient.count({ where: { active: true } })
  ]);

  const strategy = getCacheStrategy('/api/ingredients');

  return buildOptimizedResponse(
    {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages: Math.ceil(total / pagination.limit)
      }
    },
    strategy,
    {
      meta: {
        'Total-Count': total,
        'Page-Size': pagination.limit
      }
    }
  );
}

/**
 * EXAMPLE 2: Prevent N+1 Queries with Proper Includes
 */
export async function examplePreventN1(request: NextRequest) {
  const recipes = await prisma.recipe.findMany({
    include: preventN1Queries({
      ingredients: true,
      category: true
    }),
    take: 50
  });

  const strategy = getCacheStrategy('/api/recipes');
  return buildOptimizedResponse(recipes, strategy);
}

/**
 * EXAMPLE 3: Lazy Loading - Load Only What's Requested
 */
export async function exampleLazyLoad(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeParam = searchParams.get('include') || '';
  
  const requestedIncludes: Record<string, boolean> = {};
  if (includeParam) {
    includeParam.split(',').forEach(relation => {
      requestedIncludes[relation.trim()] = true;
    });
  }

  const baseFields = {
    id: true,
    name: true,
    description: true,
    active: true,
    createdAt: true
  };

  const select = buildLazySelect(baseFields, requestedIncludes);

  const data = await prisma.ingredient.findMany({
    select,
    take: 50
  });

  const strategy = getCacheStrategy('/api/ingredients');
  return buildOptimizedResponse(data, strategy);
}

/**
 * EXAMPLE 4: Advanced Filtering & Sorting
 */
export async function exampleAdvancedFiltering(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const query = buildOptimizedQuery({
    search: searchParams.get('search') || undefined,
    category: searchParams.get('category') || undefined,
    status: searchParams.get('status') || undefined,
    sort: searchParams.get('sort') || 'name:asc',
    limit: searchParams.get('limit') || '20',
    page: searchParams.get('page') || '1'
  });

  const [data, total] = await Promise.all([
    prisma.ingredient.findMany({
      where: query.where,
      orderBy: query.orderBy,
      skip: query.skip,
      take: query.take
    }),
    prisma.ingredient.count({ where: query.where })
  ]);

  const strategy = getCacheStrategy('/api/ingredients');
  return buildOptimizedResponse(
    {
      data,
      pagination: {
        ...query.pagination,
        total,
        pages: Math.ceil(total / query.pagination.take)
      }
    },
    strategy
  );
}

/**
 * EXAMPLE 5: Batch Loading
 */
export async function exampleBatchLoad(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids') || '';
  
  const ids = idsParam.split(',').filter(id => id.trim());

  const stocks = await prisma.stock.findMany({
    where: {
      ingredientId: { in: ids }
    },
    include: preventN1Queries({
      ingredient: true
    }),
    take: Math.min(ids.length, 100)
  });

  const strategy = getCacheStrategy('/api/stock');
  return buildOptimizedResponse(stocks, strategy);
}

/**
 * EXAMPLE 6: Compression - Large Payloads
 */
export async function exampleCompressLargeResponse(request: NextRequest) {
  const data = await prisma.stockMovement.findMany({
    include: {
      ingredient: { select: { id: true, name: true } }
    },
    take: 1000
  });

  const strategy = getCacheStrategy('/api/consumption');
  return buildOptimizedResponse(data, strategy, { compressible: true });
}
