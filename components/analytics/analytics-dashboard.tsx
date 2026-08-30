'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GlassCard } from '@/components/ui/glass-card';
import { FadeIn, ScaleIn } from '@/components/ui/animate';
import { BarChart3, TrendingUp, PieChart as PieChartIcon } from 'lucide-react';
import {
  ConsumptionTrendChart,
  TopIngredientsChart,
  RiskDistributionChart,
} from './advanced-charts';
import { formatBRL, formatQuantity } from '@/lib/formatters';

interface KPIData {
  stockValue: number;
  totalMovements: number;
  averageCost: number;
  criticalItems: number;
  consumptionRate: number;
  forecastAccuracy: number;
}

interface AnalyticsData extends KPIData {
  consumptionTrend: Array<{ date: string; quantity: number; forecast: number }>;
  topIngredients: Array<{ name: string; quantity: number; percentage: number }>;
  riskDistribution: Array<{ name: string; value: number; percentage: number }>;
}

export function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();

    // Reload data every 60 seconds for real-time updates
    const interval = setInterval(loadAnalytics, 60000);

    return () => clearInterval(interval);
  }, []);

  const loadAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics/stats');
      if (!res.ok) throw new Error('Failed to load analytics');

      const analyticsData: KPIData = await res.json();

      // Generate mock trend data for demonstration
      const consumptionTrend = generateMockTrendData();
      const topIngredients = generateMockTopIngredients();
      const riskDistribution = generateMockRiskDistribution();

      setData({
        ...analyticsData,
        consumptionTrend,
        topIngredients,
        riskDistribution,
      });
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateMockTrendData = () => {
    const days = 14;
    const data = [];
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - days);

    for (let i = 0; i < days; i++) {
      const date = new Date(baseDate);
      date.setDate(date.getDate() + i);
      const quantity = Math.floor(Math.random() * 100) + 50;

      data.push({
        date: date.toLocaleDateString('pt-BR', {
          month: 'short',
          day: 'numeric',
        }),
        quantity,
        forecast: quantity + Math.floor(Math.random() * 20) - 10,
      });
    }

    return data;
  };

  const generateMockTopIngredients = () => [
    { name: 'Carne Vermelha', quantity: 250, percentage: 25 },
    { name: 'Frango', quantity: 180, percentage: 18 },
    { name: 'Óleo', quantity: 120, percentage: 12 },
    { name: 'Sal', quantity: 95, percentage: 10 },
    { name: 'Alho', quantity: 80, percentage: 8 },
  ];

  const generateMockRiskDistribution = () => [
    { name: 'Crítico', value: 3, percentage: 8 },
    { name: 'Alto', value: 8, percentage: 22 },
    { name: 'Médio', value: 15, percentage: 42 },
    { name: 'Baixo', value: 10, percentage: 28 },
  ];

  if (loading || !data) {
    return <div className="text-center py-12">Carregando analíticas...</div>;
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <ScaleIn delay={0}>
          <GlassCard className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Valor em Estoque</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {formatBRL(data.stockValue)}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">+5% vs semana anterior</p>
            </div>
          </GlassCard>
        </ScaleIn>

        <ScaleIn delay={0.1}>
          <GlassCard className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Movimentações</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {data.totalMovements}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Total de movimentos</p>
            </div>
          </GlassCard>
        </ScaleIn>

        <ScaleIn delay={0.2}>
          <GlassCard className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Custo Médio</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {formatBRL(data.averageCost)}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Por item</p>
            </div>
          </GlassCard>
        </ScaleIn>

        <ScaleIn delay={0.3}>
          <GlassCard className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Itens Críticos</p>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                {data.criticalItems}
              </p>
              <p className="text-xs text-red-600 dark:text-red-400">Requerem atenção</p>
            </div>
          </GlassCard>
        </ScaleIn>

        <ScaleIn delay={0.4}>
          <GlassCard className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Taxa de Consumo</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                {formatQuantity(data.consumptionRate)}
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">Média diária</p>
            </div>
          </GlassCard>
        </ScaleIn>

        <ScaleIn delay={0.5}>
          <GlassCard className="p-6">
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500">Acurácia de Previsão</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {data.forecastAccuracy}%
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Modelos ML</p>
            </div>
          </GlassCard>
        </ScaleIn>
      </div>

      {/* Detailed Analysis Tabs */}
      <FadeIn>
        <Card className="border border-slate-200 dark:border-slate-700">
          <CardHeader>
            <CardTitle>Análise Detalhada</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="trends" className="space-y-6">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="trends" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Tendências</span>
                </TabsTrigger>
                <TabsTrigger value="top-ingredients" className="gap-2">
                  <BarChart3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Top Insumos</span>
                </TabsTrigger>
                <TabsTrigger value="risk-distribution" className="gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Distribuição</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trends" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Tendências de Consumo (14 dias)</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Consumo real vs Previsão
                  </p>
                </div>
                <ConsumptionTrendChart data={data.consumptionTrend} />
              </TabsContent>

              <TabsContent value="top-ingredients" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Top 5 Insumos Mais Consumidos</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Últimos 30 dias
                  </p>
                </div>
                <TopIngredientsChart data={data.topIngredients} />
              </TabsContent>

              <TabsContent value="risk-distribution" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Distribuição de Risco</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    Classificação dos insumos
                  </p>
                </div>
                <RiskDistributionChart data={data.riskDistribution} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
