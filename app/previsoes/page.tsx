'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { AdvancedFilter } from '@/components/ui/advanced-filter';
import { FilterPresetManager } from '@/components/ui/filter-preset';
import { GlassCard } from '@/components/ui/glass-card';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { FadeIn, ScaleIn } from '@/components/ui/animate';
import { AlertCircle, TrendingDown, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

interface Forecast {
  id: string;
  ingredientId: string;
  ingredient: {
    id: string;
    name: string;
    code: string;
    category: { name: string; color: string };
    currentStock: { currentQuantity: number };
  };
  currentStock: number;
  dailyConsumptionAvg: number;
  daysUntilEmpty: number;
  riskLevel: string;
  suggestedReorderQty: number;
  confidenceLevel: number;
}

const RISK_COLORS = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  HIGH: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  MEDIUM: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  LOW: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const RISK_LABELS = {
  CRITICAL: '🔴 Crítico (<7 dias)',
  HIGH: '🟠 Alto (7-15 dias)',
  MEDIUM: '🟡 Médio (15-30 dias)',
  LOW: '🟢 Baixo (>30 dias)',
};

export default function PrevisõesPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  useEffect(() => {
    fetchForecasts();
  }, []);

  const fetchForecasts = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/forecasts/stock-levels');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setForecasts(data);
      
      // Extract categories
      const cats = Array.from(
        new Map(data.map((f: Forecast) => [f.ingredient.category?.name, f.ingredient.category])).values()
      ).filter(Boolean);
      setCategories(cats as any[]);
    } catch (error) {
      console.error('Error fetching forecasts:', error);
      toast.error('Erro ao carregar previsões');
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateForecasts = async () => {
    try {
      setCalculating(true);
      const res = await fetch('/api/forecasts/stock-levels', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to calculate');
      const data = await res.json();
      setForecasts(data.results);
      toast.success(`${data.results.length} previsões calculadas!`);
    } catch (error) {
      console.error('Error calculating forecasts:', error);
      toast.error('Erro ao calcular previsões');
    } finally {
      setCalculating(false);
    }
  };

  const filteredForecasts = forecasts.filter((forecast) => {
    // Risk level filter
    if (filters.riskLevel && forecast.riskLevel !== filters.riskLevel) {
      return false;
    }

    // Category filter
    if (filters.category && forecast.ingredient.category?.name !== filters.category) {
      return false;
    }

    // Days until empty filter
    if (filters.daysRange) {
      const [min, max] = filters.daysRange;
      if (forecast.daysUntilEmpty < min || forecast.daysUntilEmpty > max) {
        return false;
      }
    }

    // Confidence level filter
    if (filters.confidenceRange) {
      const [min, max] = filters.confidenceRange;
      if (forecast.confidenceLevel < min || forecast.confidenceLevel > max) {
        return false;
      }
    }

    // Text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!(
        forecast.ingredient.name.toLowerCase().includes(query) ||
        forecast.ingredient.code.toLowerCase().includes(query)
      )) {
        return false;
      }
    }

    return true;
  });

  const riskCounts = {
    CRITICAL: forecasts.filter((f) => f.riskLevel === 'CRITICAL').length,
    HIGH: forecasts.filter((f) => f.riskLevel === 'HIGH').length,
    MEDIUM: forecasts.filter((f) => f.riskLevel === 'MEDIUM').length,
    LOW: forecasts.filter((f) => f.riskLevel === 'LOW').length,
  };

  const filterFields = [
    {
      key: 'riskLevel',
      label: 'Nível de Risco',
      type: 'select' as const,
      options: [
        { label: '🔴 Crítico (<7 dias)', value: 'CRITICAL' },
        { label: '🟠 Alto (7-15 dias)', value: 'HIGH' },
        { label: '🟡 Médio (15-30 dias)', value: 'MEDIUM' },
        { label: '🟢 Baixo (>30 dias)', value: 'LOW' },
      ],
    },
    {
      key: 'category',
      label: 'Categoria',
      type: 'select' as const,
      options: categories.map((cat) => ({ label: cat.name, value: cat.name })),
    },
    {
      key: 'daysRange',
      label: 'Dias até acabar',
      type: 'range' as const,
      minValue: 0,
      maxValue: 100,
      step: 1,
    },
    {
      key: 'confidenceRange',
      label: 'Confiança da Previsão',
      type: 'range' as const,
      minValue: 0,
      maxValue: 100,
      step: 5,
    },
  ];

  if (status === 'loading') {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <LoadingSkeleton key={i} variant="card" height="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900/50">
      <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <FadeIn>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <BackButton href="/dashboard" label="Voltar" />
              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white mb-2">
                  🔮 Previsões de Ruptura
                </h1>
                <p className="text-slate-600 dark:text-slate-400">
                  Análise preditiva de quando os insumos irão acabar
                </p>
              </div>
            </div>
            <Button
              onClick={handleCalculateForecasts}
              disabled={calculating}
              className="mt-4 md:mt-0"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {calculating ? 'Calculando...' : 'Recalcular Previsões'}
            </Button>
          </div>
        </FadeIn>

        {/* Risk Summary */}
        <FadeIn delay={0.1}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { level: 'CRITICAL', count: riskCounts.CRITICAL },
              { level: 'HIGH', count: riskCounts.HIGH },
              { level: 'MEDIUM', count: riskCounts.MEDIUM },
              { level: 'LOW', count: riskCounts.LOW },
            ].map((item) => (
              <ScaleIn key={item.level} delay={0.15}>
                <GlassCard
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() =>
                    setFilters({
                      ...filters,
                      riskLevel: filters.riskLevel === item.level ? undefined : item.level,
                    })
                  }
                >
                  <div className="text-center">
                    <p
                      className={`text-sm font-medium px-2 py-1 rounded-full mb-2 w-fit mx-auto ${
                        RISK_COLORS[item.level as keyof typeof RISK_COLORS]
                      }`}
                    >
                      {RISK_LABELS[item.level as keyof typeof RISK_LABELS]}
                    </p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white">
                      {item.count}
                    </p>
                  </div>
                </GlassCard>
              </ScaleIn>
            ))}
          </div>
        </FadeIn>

        {/* Search Bar */}
        <FadeIn delay={0.2}>
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou código..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-800"
            />
          </div>
        </FadeIn>

        {/* Advanced Filters */}
        <FadeIn delay={0.25}>
          <AdvancedFilter
            filters={filterFields}
            onFilterChange={setFilters}
            onReset={() => setFilters({})}
          >
            <div className="mt-2 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                {filteredForecasts.length} {filteredForecasts.length === 1 ? 'insumo' : 'insumos'} encontrado(s)
              </p>
              <FilterPresetManager
                currentFilters={filters}
                onLoadPreset={setFilters}
              />
            </div>
          </AdvancedFilter>
        </FadeIn>

        {/* Loading State */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <LoadingSkeleton key={i} variant="card" height="h-40" />
            ))}
          </div>
        )}

        {/* Forecasts Grid */}
        {!loading && (
          <FadeIn delay={0.3}>
            {filteredForecasts.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-slate-600 dark:text-slate-400">
                  {searchQuery || Object.keys(filters).length > 0
                    ? 'Nenhum insumo encontrado com os filtros selecionados'
                    : 'Nenhuma previsão disponível. Clique em "Recalcular Previsões"'}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredForecasts.map((forecast, idx) => (
                  <ScaleIn key={forecast.id} delay={0.4 + idx * 0.05}>
                    <GlassCard className="hover:shadow-lg transition-shadow">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">
                              {forecast.ingredient.name}
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              {forecast.ingredient.code}
                            </p>
                          </div>
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium ${
                              RISK_COLORS[forecast.riskLevel as keyof typeof RISK_COLORS]
                            }`}
                          >
                            {RISK_LABELS[forecast.riskLevel as keyof typeof RISK_LABELS]}
                          </span>
                        </div>

                        {/* Main Metric */}
                        <div className="bg-gradient-to-r from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 p-3 rounded-lg">
                          <p className="text-xs text-slate-600 dark:text-slate-400">
                            Dias até acabar
                          </p>
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">
                            {forecast.daysUntilEmpty.toFixed(1)}
                          </p>
                        </div>

                        {/* Details */}
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">
                              Estoque atual:
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {Number(forecast.currentStock).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">
                              Consumo/dia:
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {Number(forecast.dailyConsumptionAvg).toFixed(2)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600 dark:text-slate-400">
                              Confiança:
                            </span>
                            <span className="font-medium text-slate-900 dark:text-white">
                              {(forecast.confidenceLevel * 100).toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {/* Alert */}
                        {forecast.riskLevel === 'CRITICAL' && (
                          <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
                            <p className="text-xs text-red-600 dark:text-red-400">
                              Alerta: Reabastecer imediatamente!
                            </p>
                          </div>
                        )}
                      </div>
                    </GlassCard>
                  </ScaleIn>
                ))}
              </div>
            )}
          </FadeIn>
        )}
      </div>
    </div>
  );
}