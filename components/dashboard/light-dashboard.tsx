'use client';

import { useState, Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import dynamic from 'next/dynamic';

/**
 * Versão leve do dashboard que carrega grades
 * e gráficos opcionalmente
 */

const AdvancedCharts = dynamic(
  () => import('@/components/analytics/advanced-charts-wrapper').then(m => ({ default: m.AdvancedCharts })),
  { loading: () => <ChartSkeleton />, ssr: false }
);

function ChartSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(2)].map((_, i) => (
        <Card key={i} className="p-4">
          <Skeleton className="h-64 w-full" />
        </Card>
      ))}
    </div>
  );
}

interface LightDashboardProps {
  showAdvancedCharts?: boolean;
}

export function LightDashboard({ showAdvancedCharts = false }: LightDashboardProps) {
  const [showCharts, setShowCharts] = useState(showAdvancedCharts);

  return (
    <div className="space-y-6">
      {/* KPI Cards (leve, sempre visível) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-20 w-full" />
          </Card>
        ))}
      </div>

      {/* Botão para expandir gráficos */}
      <div className="flex justify-center">
        <button
          onClick={() => setShowCharts(!showCharts)}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
          aria-label={showCharts ? 'Ocultar gráficos' : 'Mostrar gráficos'}
        >
          {showCharts ? 'Ocultar Análises' : 'Carregar Análises Avançadas'}
        </button>
      </div>

      {/* Gráficos (carregamento sob demanda) */}
      {showCharts && (
        <Suspense fallback={<ChartSkeleton />}>
          <AdvancedCharts />
        </Suspense>
      )}
    </div>
  );
}
