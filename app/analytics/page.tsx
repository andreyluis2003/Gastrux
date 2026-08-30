'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, Suspense } from 'react';
import { BackButton } from '@/components/ui/back-button';
import { SmartChartLoader } from '@/components/analytics/smart-chart-loader';
import { Skeleton } from '@/components/ui/skeleton';

// Skeleton de carregamento
function AnalyticsLoadingSkeleton() {
  return (
    <div className="space-y-6">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-64 w-full" />
        </div>
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-900 p-4 sm:p-6 lg:p-8">
        <AnalyticsLoadingSkeleton />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-900">
      <div className="border-b border-slate-200 dark:border-slate-700">
        <div className="p-4 sm:p-6 lg:p-8 space-y-2">
          <div className="flex items-center gap-4">
            <BackButton />
            <div>
              <h1 className="text-2xl font-bold">Dashboard Analítico</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Tendências, desempenho e insights em tempo real
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        {/* Carrega gráficos apenas quando visíveis no viewport */}
        <Suspense fallback={<AnalyticsLoadingSkeleton />}>
          <SmartChartLoader />
        </Suspense>
      </div>
    </div>
  );
}