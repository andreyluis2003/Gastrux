/**
 * FASE 34+: Enhanced Middleware with Auth Protection + Multi-Tenancy
 * - Route protection: redirect unauthenticated users to /auth/signin
 * - Cache Control and Regional Routing
 * - Multi-Tenancy Data Isolation and Access Control
 * - Security headers and audit logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCacheHeaders, getCacheTypeForRoute } from '@/lib/cache-strategy';
import { detectRegionFromCountry } from '@/lib/regional-config';
import { getToken } from 'next-auth/jwt';

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sw.js|workbox-.*|manifest.json|icons/.*).*)',
  ],
};

// ============================================
// ROTAS PÚBLICAS — acessíveis sem login
// ============================================
const PUBLIC_PATHS = [
  '/',
  '/auth/signin',
  '/auth/signup',
  '/pricing',
  '/ajuda',
  '/casos-de-sucesso',
  '/roadmap',
  '/feedback/share',
  '/showcase',
  '/docs',
  '/survey',
  '/termos',
  '/privacidade',
  '/billing/success',
  '/lp',
  '/para',
  '/menu',
];

function isPublicPage(pathname: string): boolean {
  // Exact matches or prefix matches for dynamic segments
  for (const pub of PUBLIC_PATHS) {
    if (pathname === pub || pathname.startsWith(pub + '/')) {
      return true;
    }
  }
  return false;
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/');
}

// ============================================
// ROTAS EXCLUSIVAS DA PLATAFORMA (equipe Gastrux) — NUNCA para tenants
// Restaurant OWNERs must never reach these internal SaaS control screens/APIs.
// Access === role ADMIN or email in PLATFORM_ADMIN_EMAILS.
// ============================================
const PLATFORM_ADMIN_PAGE_PREFIXES = [
  '/admin/platform',
  '/admin/customers',
  '/admin/users',
  '/admin/audit-logs',
  '/admin/support',
  '/admin/onboarding',
  '/admin/knowledge-base',
  '/admin/marketing',
  '/admin/nurturing',
];

const PLATFORM_ADMIN_API_PREFIXES = [
  '/api/admin/platform',
  '/api/admin/customers',
  '/api/admin/users',
  '/api/admin/audit-logs',
  '/api/admin/support',
  '/api/admin/help',
  '/api/admin/beta-testers',
  '/api/admin/marketing',
  '/api/admin/nurturing',
  '/api/admin/onboarding',
];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (pathname === p || pathname.startsWith(p + '/')) return true;
  }
  return false;
}

function isPlatformAdminToken(token: any): boolean {
  if (!token) return false;
  if (token.role === 'ADMIN') return true;
  const allow = (process.env.PLATFORM_ADMIN_EMAILS || '')
    .split(',')
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
  const email = String(token.email || '').toLowerCase();
  if (email && allow.includes(email)) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ============================================
  // PARTE 0: AUTH PROTECTION FOR PAGES
  // ============================================
  if (!isApiRoute(pathname) && !isPublicPage(pathname)) {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (!token) {
        const signInUrl = new URL('/auth/signin', request.url);
        signInUrl.searchParams.set('callbackUrl', pathname);
        return NextResponse.redirect(signInUrl);
      }

      // Block tenants from platform-internal pages (achado nº1)
      if (matchesPrefix(pathname, PLATFORM_ADMIN_PAGE_PREFIXES) && !isPlatformAdminToken(token)) {
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
    } catch {
      const signInUrl = new URL('/auth/signin', request.url);
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }
  }

  const response = NextResponse.next();

  // ============================================
  // PARTE 1: REGIONAL ROUTING
  // ============================================
  const countryCode =
    request.headers.get('cloudflare-country') || 
    request.headers.get('cf-ipcountry') || 
    'BR';
  
  const region = detectRegionFromCountry(countryCode);

  response.headers.set('X-Region', region);
  response.headers.set('X-Country-Code', countryCode);
  response.headers.set('X-Edge-Location', request.headers.get('x-vercel-edge-location') || 'unknown');

  // ============================================
  // SKIP middleware processing for NextAuth API routes to avoid interference with OAuth flows
  // ============================================
  if (pathname.startsWith('/api/auth/')) {
    return response;
  }

  // ============================================
  // PARTE 2: MULTI-TENANCY DATA ISOLATION (API only)
  // ============================================
  if (isApiRoute(pathname)) {
    try {
      const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (token) {
        response.headers.set('X-User-Id', String(token.sub || token.id || ''));
        response.headers.set('X-User-Role', String(token.role || ''));
        response.headers.set('X-Authenticated', 'true');
      } else {
        response.headers.set('X-Authenticated', 'false');
      }

      // Block tenants from platform-internal APIs (achado nº1) — defense in depth
      if (matchesPrefix(pathname, PLATFORM_ADMIN_API_PREFIXES) && !isPlatformAdminToken(token)) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Acesso restrito à equipe da plataforma.' },
          { status: 403 },
        );
      }
    } catch {
      response.headers.set('X-Authenticated', 'false');
    }

    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');

    const cacheType = getCacheTypeForRoute(pathname);
    const cacheHeaders = getCacheHeaders(cacheType);
    Object.entries(cacheHeaders).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    response.headers.set('X-Cache-Type', cacheType);
  }

  // ============================================
  // UNIVERSAL HEADERS
  // ============================================
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Accept-Encoding', 'gzip, deflate, br');
  response.headers.set('X-Edge-Request', 'true');
  response.headers.set('X-Request-Time', new Date().toISOString());

  // ============================================
  // REQUEST LOGGING
  // ============================================
  const method = request.method;
  const authenticated = response.headers.get('X-Authenticated') || 'unknown';
  const auditLog = `[${method}] [${pathname}] [Auth:${authenticated}] [Region:${region}]`;
  response.headers.set('X-Audit-Log', auditLog);

  return response;
}
