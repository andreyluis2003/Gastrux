import type { Metadata } from 'next';
import { Poppins, DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AppToaster } from '@/components/app-shell/app-toaster';
import { SessionProvider } from '@/components/providers';
import { I18nProvider } from '@/lib/i18n';
import { QueryProvider } from '@/components/providers/query-provider';
import { AppShell } from '@/components/app-shell/app-shell';
import { WebVitalsTracker } from '@/components/web-vitals-tracker';
import { OfflineIndicator } from '@/components/offline-indicator';
import { OutboxProvider } from '@/components/offline/outbox-provider';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { FontPreload } from '@/components/font-preload';
import { PerformanceOptimizations } from '@/components/performance-optimizations';
import { AnalyticsProvider, GAScript } from '@/components/analytics/ga-script';
import { gaIdFrom, metaPixelIdFrom } from '@/lib/analytics/consent';
import { CookieBanner } from '@/components/analytics/cookie-banner';
import { MetaPixel } from '@/components/analytics/meta-pixel';
import { FeedbackWidget } from '@/components/feedback/feedback-widget';
import { GastruxChat } from '@/components/ai/gastrux-chat';
import { RadixPointerEventsFix } from '@/components/radix-pointer-events-fix';

const poppins = Poppins({
  variable: '--font-poppins',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://gastrux.com'),
  title: 'Gastrux - Gestão Integrada',
  description: 'Plataforma de gestão integrada para restaurantes',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Gastrux - Gestão Integrada',
    description: 'Plataforma de gestão integrada para restaurantes',
    images: [{
      url: '/og-image.png',
      width: 1200,
      height: 630,
    }],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Gastrux',
  },
  formatDetection: {
    telephone: false,
  },
};

export const dynamic = 'force-dynamic';

// Read at request time: a plain process.env.NEXT_PUBLIC_* would be inlined at build, where Easypanel has no env
const GA_ENV = 'NEXT_PUBLIC_GA_MEASUREMENT_ID';
// The pixel id is public (it ships in every page that loads it); META_PIXEL_ID in Easypanel overrides it
const META_PIXEL_ENV = 'META_PIXEL_ID';
const GASTRUX_META_PIXEL_ID = '2314889532683222';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = gaIdFrom(process.env[GA_ENV]);
  const metaPixelId = metaPixelIdFrom(process.env[META_PIXEL_ENV] || GASTRUX_META_PIXEL_ID);
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <FontPreload />
      </head>
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${poppins.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <AnalyticsProvider gaId={gaId} metaPixelId={metaPixelId}>
        <I18nProvider>
          <QueryProvider>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
              <SessionProvider>
                <OutboxProvider>
                <RadixPointerEventsFix />
                <PerformanceOptimizations />
                <ServiceWorkerRegister />
                <WebVitalsTracker />
                <OfflineIndicator />
                <AppShell>{children}</AppShell>
                <FeedbackWidget />
                <GastruxChat />
                </OutboxProvider>
              </SessionProvider>
              <AppToaster />
              {/* Google Analytics and the Meta Pixel only after consent (lib/analytics/consent.ts) */}
              <GAScript />
              <MetaPixel />
              <CookieBanner />
            </ThemeProvider>
          </QueryProvider>
        </I18nProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
}