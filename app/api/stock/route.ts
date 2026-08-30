// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCacheHeader } from '@/lib/cache-headers';
import { safeHandler } from '@/lib/api/safe-handler';

export const dynamic = 'force-dynamic';

export const GET = safeHandler(async (req, context) => {
  // Optimized query: select only necessary fields to reduce response size
  const stocks = await prisma.stock.findMany({
    where: { restaurantId: context.restaurantId },
    select: {
      id: true,
      currentQuantity: true,
      ingredient: {
        select: {
          id: true,
          code: true,
          name: true,
          standardUnit: true,
          minimumStock: true,
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const response = NextResponse.json(stocks);
  const cacheHeaders = getCacheHeader('short');
  Object.entries(cacheHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
});
