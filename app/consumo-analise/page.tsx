'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { SlideIn } from '@/components/ui/animate';
import { TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { ConsumptionFilters } from '@/components/consumption/consumption-filters';
import { ConsumptionChart } from '@/components/consumption/consumption-chart';
import { ConsumptionStats } from '@/components/consumption/consumption-stats';
import { ConsumptionExport } from '@/components/consumption/consumption-export';

interface ConsumptionSummary {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalQuantity: number;
    totalCost: number;
    averageDailyQuantity: number;
    uniqueIngredients: number;
    totalMovements: number;
  };
  byIngredient: any[];
}

interface ConsumptionTrend {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  trends: {
    date: string;
    totalQuantity: number;
    totalCost: number;
    movements: number;
  }[];
}

export default function ConsumoAnalisePage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();

  const [filters, setFilters] = useState({
    period: '30',
    ingredientIds: [] as string[],
    types: ['MANUAL_DEDUCTION'] as string[],
  });

  const [summary, setSummary] = useState<ConsumptionSummary | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [topIngredients, setTopIngredients] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  const handleFilterChange = async (newFilters: typeof filters) => {
    setFilters(newFilters);
    await loadData(newFilters);
  };

  const loadData = async (currentFilters: typeof filters) => {
    try {
      setIsLoading(true);

      const params = new URLSearchParams();
      params.append('period', currentFilters.period);
      if (currentFilters.ingredientIds.length > 0) {
        params.append('ingredients', currentFilters.ingredientIds.join(','));
      }
      if (currentFilters.types.length > 0) {
        params.append('types', currentFilters.types.join(','));
      }

      const [summaryRes, trendsRes, topRes] = await Promise.all([
        fetch(`/api/consumption/summary?${params.toString()}`),
        fetch(`/api/consumption/trends?${params.toString()}`),
        fetch(`/api/consumption/top-ingredients?${params.toString()}`),
      ]);

      if (!summaryRes.ok || !trendsRes.ok || !topRes.ok) {
        throw new Error('Failed to load consumption data');
      }

      const summaryData = await summaryRes.json();
      const trendsData = await trendsRes.json();
      const topData = await topRes.json();

      setSummary(summaryData);
      setTrends(trendsData.trends || []);
      setTopIngredients(topData.topIngredients || []);
    } catch (error) {
      console.error('[LOAD DATA ERROR]', error);
      toast.error('Erro ao carregar dados de consumo');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      loadData(filters);
    }
  }, [status]);

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-600">Carregando...</p>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard" label="Voltar" />
            <div className="p-3 bg-blue-600 rounded-lg">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                Análise de Consumo
              </h1>
              <p className="text-slate-600 dark:text-slate-400 mt-1">
                Visualize tendências e padrões de consumo
              </p>
            </div>
          </div>
          <ConsumptionExport
            period={filters.period}
            ingredientIds={filters.ingredientIds}
            types={filters.types}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <ConsumptionFilters onFilterChange={handleFilterChange} />
          </div>

          <div className="lg:col-span-3 space-y-8">
            {isLoading ? (
              <SlideIn direction="up" delay={0.2}>
                <Card className="p-8 text-center bg-white dark:bg-slate-950">
                  <p className="text-slate-600 dark:text-slate-400">
                    Carregando análise...
                  </p>
                </Card>
              </SlideIn>
            ) : (
              <>
                {summary && (
                  <SlideIn direction="up" delay={0.1}>
                    <ConsumptionStats
                      stats={summary.byIngredient}
                      summary={summary.summary}
                    />
                  </SlideIn>
                )}

                {trends.length > 0 && (
                  <SlideIn direction="up" delay={0.3}>
                    <ConsumptionChart trends={trends} topIngredients={topIngredients} />
                  </SlideIn>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
