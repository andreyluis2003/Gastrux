'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// Lazy load dos charts (carregamento sob demanda)
const AdvancedCharts = dynamic(
  () => import('./advanced-charts-wrapper').then(mod => ({ default: mod.AdvancedCharts })),
  {
    loading: () => <ChartLoadingSkeleton />,
    ssr: false, // Renderizar apenas no cliente para reduzir bundle do servidor
  }
);

function ChartLoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-64 w-full rounded" />
        </Card>
      ))}
    </div>
  );
}

export { AdvancedCharts };
