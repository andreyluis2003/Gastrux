import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn: SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  debug: process.env.NODE_ENV !== 'production',
  environment: process.env.NODE_ENV,
  attachStacktrace: true,
  maxBreadcrumbs: 100,
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: false,
    }),
    Sentry.browserTracingIntegration(),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  tracePropagationTargets: ['localhost', /^\//, /^https:\/\/restaurantes-cl3480\.abacusai\.app/],
  beforeSend: (event, hint) => {
    if (event.exception) {
      const error = hint.originalException;
      if (error instanceof Error && error.message.includes('404')) {
        return null;
      }
      if (error instanceof Error && error.message.includes('ResizeObserver loop')) {
        return null;
      }
      if (error instanceof Error && error.message.includes('Hydration')) {
        return null;
      }
    }
    if (event.tags?.['http.status_code'] === '0') {
      return null;
    }
    return event;
  },
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    'Network request failed',
    /^Script error/,
  ],
  denyUrls: [
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
  ],
});
