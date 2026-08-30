import type { Metadata } from 'next';
import { Poppins, DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import { SessionProvider } from '@/components/providers';
import { I18nProvider } from '@/lib/i18n';
import { QueryProvider } from '@/components/providers/query-provider';
import { MobileMenu } from '@/components/mobile-menu';
import { MobileHeader } from '@/components/mobile-header';
import { NotificationCenter } from '@/components/notification-center';
import { WebVitalsTracker } from '@/components/web-vitals-tracker';
import { OfflineIndicator } from '@/components/offline-indicator';
import { SyncStatus } from '@/components/sync-status';
import { ServiceWorkerRegister } from '@/components/service-worker-register';
import { FontPreload } from '@/components/font-preload';
import { PerformanceOptimizations } from '@/components/performance-optimizations';
import { GAScript } from '@/components/analytics/ga-script';
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
  title: 'Gastrux - Gestão de Produção',
  description: 'Plataforma de gestão de produção e inventário para restaurantes',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Gastrux - Gestão de Produção',
    description: 'Plataforma de gestão de produção e inventário para restaurantes',
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <script src="https://apps.abacus.ai/chatllm/appllm-lib.js"></script>
        <FontPreload />
        <GAScript />
      </head>
      <body
        suppressHydrationWarning
        className={`${dmSans.variable} ${poppins.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} font-sans antialiased`}
      >
        <I18nProvider>
          <QueryProvider>
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
              <SessionProvider>
                <RadixPointerEventsFix />
                <PerformanceOptimizations />
                <ServiceWorkerRegister />
                <WebVitalsTracker />
                <MobileMenu />
                <MobileHeader />
                <NotificationCenter />
                <OfflineIndicator />
                <SyncStatus />
                <div className="md:pt-0 pt-14">
                  {children}
                </div>
                <FeedbackWidget />
                <GastruxChat />
              </SessionProvider>
              <Toaster />
            </ThemeProvider>
          </QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}