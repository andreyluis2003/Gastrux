'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { BarChart, PieChart, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface Metric {
  id: string;
  metricType: string;
  period: string;
  value: number;
  target?: number;
  percentageChange?: number;
  date: string;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-BR');
};

const MetricTypeLabel: Record<string, string> = {
  'total_revenue': 'Receita Total',
  'avg_ticket': 'Ticket Médio',
  'profit_margin': 'Margem de Lucro',
  'order_count': 'Total de Pedidos',
  'customer_acquisition': 'Aquisição de Clientes',
  'repeat_rate': 'Taxa de Repeção',
};

const PeriodLabel: Record<string, string> = {
  'daily': 'Diário',
  'weekly': 'Semanal',
  'monthly': 'Mensal',
  'yearly': 'Anual',
};

export default function AnalysisPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [selectedType, setSelectedType] = useState('total_revenue');
  const [selectedPeriod, setSelectedPeriod] = useState('monthly');

  useEffect(() => {
    fetchMetrics();
  }, [selectedType, selectedPeriod]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        metricType: selectedType,
        period: selectedPeriod,
      });
      const res = await fetch(`/api/financial/metrics?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setMetrics(data);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  const sortedMetrics = [...metrics].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const hasTargets = sortedMetrics.some((m) => m.target !== undefined);

  const getTrendIcon = (change?: number) => {
    if (change === undefined) return null;
    return change >= 0 ? (
      <span className="text-green-600 font-semibold">↑ {change.toFixed(1)}%</span>
    ) : (
      <span className="text-red-600 font-semibold">↓ {change.toFixed(1)}%</span>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Análises Financeiras</h1>
            <p className="text-sm text-gray-600 mt-1">Métricas e relatórios detalhados</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Métrica</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {Object.entries(MetricTypeLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Período</label>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              {Object.entries(PeriodLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sortedMetrics.length > 0 && (
          <>
            <Card className="p-6 bg-blue-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Média</p>
                  <p className="text-2xl font-bold text-blue-600 mt-2">
                    {selectedType === 'profit_margin' ||
                    selectedType === 'repeat_rate'
                      ? `${(sortedMetrics.reduce((s, m) => s + m.value, 0) / sortedMetrics.length).toFixed(1)}%`
                      : formatBRL(
                          sortedMetrics.reduce((s, m) => s + m.value, 0) /
                            sortedMetrics.length
                        )}
                  </p>
                </div>
                <BarChart className="w-8 h-8 text-blue-300" />
              </div>
            </Card>

            <Card className="p-6 bg-green-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Máximo</p>
                  <p className="text-2xl font-bold text-green-600 mt-2">
                    {selectedType === 'profit_margin' ||
                    selectedType === 'repeat_rate'
                      ? `${Math.max(...sortedMetrics.map((m) => m.value)).toFixed(1)}%`
                      : formatBRL(
                          Math.max(...sortedMetrics.map((m) => m.value))
                        )}
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-300" />
              </div>
            </Card>

            <Card className="p-6 bg-purple-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Último Período</p>
                  <p className="text-2xl font-bold text-purple-600 mt-2">
                    {selectedType === 'profit_margin' ||
                    selectedType === 'repeat_rate'
                      ? `${sortedMetrics[0]?.value.toFixed(1)}%`
                      : formatBRL(sortedMetrics[0]?.value || 0)}
                  </p>
                </div>
                <PieChart className="w-8 h-8 text-purple-300" />
              </div>
            </Card>
          </>
        )}
      </div>

      {/* Metrics Table */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Histórico</h2>
        {loading ? (
          <div className="text-center text-gray-500 py-8">Carregando...</div>
        ) : sortedMetrics.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>Nenhuma métrica disponível</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-semibold">Data</th>
                  <th className="text-right py-2 px-2 font-semibold">Valor</th>
                  {hasTargets && (
                    <th className="text-right py-2 px-2 font-semibold">Meta</th>
                  )}
                  <th className="text-right py-2 px-2 font-semibold">Variação</th>
                </tr>
              </thead>
              <tbody>
                {sortedMetrics.map((metric) => (
                  <tr key={metric.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-2 text-gray-600">
                      {formatDate(metric.date)}
                    </td>
                    <td className="text-right py-3 px-2 font-semibold">
                      {selectedType === 'profit_margin' ||
                      selectedType === 'repeat_rate'
                        ? `${metric.value.toFixed(1)}%`
                        : formatBRL(metric.value)}
                    </td>
                    {hasTargets && (
                      <td className="text-right py-3 px-2 text-gray-600">
                        {metric.target
                          ? selectedType === 'profit_margin' ||
                            selectedType === 'repeat_rate'
                            ? `${metric.target.toFixed(1)}%`
                            : formatBRL(metric.target)
                          : '-'}
                      </td>
                    )}
                    <td className="text-right py-3 px-2">
                      {metric.percentageChange !== undefined
                        ? getTrendIcon(metric.percentageChange)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
