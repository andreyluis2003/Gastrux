// @ts-nocheck
/**
 * API Response Helper
 * 
 * Provides consistent error handling and response formatting for all API routes.
 */

import { NextResponse } from 'next/server';

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: any;
}

export function errorResponse(
  message: string,
  code: string = 'INTERNAL_ERROR',
  status: number = 500,
  details?: any
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(details && { details }),
    },
    { status }
  );
}

export const ApiErrors = {
  UNAUTHORIZED: () =>
    errorResponse('Authentication required', 'UNAUTHORIZED', 401),
  FORBIDDEN: () =>
    errorResponse('Access denied', 'FORBIDDEN', 403),
  NOT_FOUND: (resource: string) =>
    errorResponse(`${resource} not found`, 'NOT_FOUND', 404),
  INVALID_REQUEST: (details?: any) =>
    errorResponse('Invalid request', 'INVALID_REQUEST', 400, details),
  VALIDATION_ERROR: (details: any) =>
    errorResponse('Validation failed', 'VALIDATION_ERROR', 422, details),
  CONFLICT: (message: string) =>
    errorResponse(message, 'CONFLICT', 409),
  RESTAURANT_CONTEXT_ERROR: (message: string) =>
    errorResponse(message, 'RESTAURANT_CONTEXT_ERROR', 400),
};
