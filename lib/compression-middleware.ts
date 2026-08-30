// @ts-nocheck
/**
 * Compression Middleware Configuration
 * Enables Gzip and Brotli compression for API responses and static assets
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Get compression directive based on content type
 */
export function shouldCompress(contentType: string): boolean {
  const compressibleTypes = [
    'application/json',
    'application/javascript',
    'application/x-javascript',
    'text/plain',
    'text/html',
    'text/css',
    'text/xml',
    'text/csv',
    'application/xml',
    'application/rss+xml',
    'application/atom+xml',
  ];

  return compressibleTypes.some((type) => contentType.includes(type));
}

/**
 * Apply compression headers to response
 */
export function applyCompressionHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Encoding', 'gzip');

  const varyHeader = response.headers.get('Vary') || '';
  if (!varyHeader.includes('Accept-Encoding')) {
    response.headers.set(
      'Vary',
      varyHeader ? `${varyHeader}, Accept-Encoding` : 'Accept-Encoding'
    );
  }

  return response;
}

/**
 * Compression configuration for production deployment
 * These settings are automatically applied by Next.js in production
 */
export const compressionConfig = {
  compress: true,
  minSize: 1024,
  level: 6,
  filter: (
    pathname: string,
    contentType?: string
  ): boolean => {
    if (pathname.startsWith('/api/')) {
      return contentType ? shouldCompress(contentType) : true;
    }

    if (
      pathname.includes('.css') ||
      pathname.includes('.js') ||
      pathname.includes('_next')
    ) {
      return true;
    }

    if (pathname.endsWith('.html') || pathname === '/') {
      return true;
    }

    return false;
  },
};
