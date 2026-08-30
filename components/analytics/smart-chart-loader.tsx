'use client';

import { useIntersectionObserver } from '@/lib/hooks/use-intersection-observer';
import dynamic from 'next/dynamic';
import { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const AdvancedCharts = dynamic(
  () => import('./advanced-charts-wrapper').then(m => ({ default: m.AdvancedCharts })),
  { loading: () => <Skeleton className="h-96 w-full" />, ssr: false }
);

/**
 * Carrega gráficos avançados apenas quando ficam visíveis
 * Reduz JavaScript inicial do bundle
 */
export function SmartChartLoader() {
  const { ref, isVisible } = useIntersectionObserver({ rootMargin: '100px' });

  return (
    <div ref={ref}>
      {isVisible ? <AdvancedCharts /> : <Skeleton className="h-96 w-full" />}
    </div>
  );
}
