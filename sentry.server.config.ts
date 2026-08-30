import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  debug: process.env.NODE_ENV !== 'production',
  attachStacktrace: true,
  maxBreadcrumbs: 100,
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  serverName: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend: (event, hint) => {
    if (event.request?.url?.includes('_next/image')) {
      return null;
    }
    if (event.request?.url?.includes('/api/health')) {
      return null;
    }
    if (event.exception) {
      const error = hint.originalException;
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      if (error instanceof Error && error.message.match(/P2025|NotFoundError/)) {
        return null;
      }
    }
    return event;
  },
  ignoreErrors: [
    /Prisma Client.*not initialized/,
    /ECONNREFUSED/,
  ],
});
