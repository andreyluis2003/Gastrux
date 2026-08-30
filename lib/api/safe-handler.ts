// @ts-nocheck
/**
 * Safe API Handler Wrapper
 * 
 * Wraps API route handlers to provide consistent error handling,
 * logging, and multi-tenancy enforcement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRestaurantContext, SessionWithRestaurant } from './restaurant-context';
import { ApiErrors } from './api-response';

export type SafeHandlerFn<T = any> = (
  req: NextRequest,
  context: SessionWithRestaurant,
  params?: any
) => Promise<NextResponse<T>>;

/**
 * Wraps an API handler with error handling and restaurant context.
 * 
 * Usage:
 * export const GET = safeHandler(async (req, context) => {
 *   // context.restaurantId is automatically available
 *   // All errors are caught and formatted consistently
 * });
 */
export function safeHandler(handler: SafeHandlerFn): any {
  return async (req: NextRequest, context?: any) => {
    try {
      const restaurantContext = await getRestaurantContext();
      return await handler(req, restaurantContext, context?.params);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Wraps an API handler that requires dynamic params.
 * 
 * Usage:
 * export const GET = safeHandlerWithParams(async (req, context, params) => {
 *   const { id } = params;
 *   // context.restaurantId is available
 * });
 */
export function safeHandlerWithParams(handler: SafeHandlerFn): any {
  return async (req: NextRequest, context: any) => {
    try {
      const restaurantContext = await getRestaurantContext();
      return await handler(req, restaurantContext, context.params);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

function handleApiError(error: any): NextResponse {
  const message = error?.message || 'Internal server error';

  console.error('[API Error]', message, error);

  if (message.includes('UNAUTHORIZED')) {
    return ApiErrors.UNAUTHORIZED();
  }
  if (message.includes('FORBIDDEN') || message.includes('Access denied')) {
    return ApiErrors.FORBIDDEN();
  }
  if (message.includes('NO_RESTAURANT')) {
    return ApiErrors.RESTAURANT_CONTEXT_ERROR(
      'User must select a restaurant first'
    );
  }

  if (message.includes('Record to update not found')) {
    return ApiErrors.NOT_FOUND('Record');
  }
  if (message.includes('Unique constraint failed')) {
    return ApiErrors.CONFLICT('Record already exists');
  }
  if (message.includes('Foreign key constraint failed') || message.includes('foreign key constraint')) {
    return ApiErrors.INVALID_REQUEST({ message: 'Registro relacionado não encontrado. Verifique os dados e tente novamente.' });
  }

  // Sanitize Prisma internal errors in production
  const isPrismaError = message.includes('prisma') || message.includes('PrismaClient') || error?.code?.startsWith?.('P');
  const safeMessage = isPrismaError && process.env.NODE_ENV !== 'development'
    ? 'Erro interno do servidor. Tente novamente.'
    : message;

  return ApiErrors.INVALID_REQUEST({
    message: safeMessage,
    stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined,
  });
}
