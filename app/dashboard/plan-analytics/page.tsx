'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, Users, CreditCard, Clock } from 'lucide-react';
import { toast } from 'sonner';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface ConversionMetrics {
  totalSignups: number;
  conversions: number;
  conversionRate: number;
  avgConversionTimeDays: number;
}

interface PlanData {
  starter: number;
  pro: number;
  business: number;
  enterprise: number;
}

interface MRRData {
  pro: number;
  business: number;
  enterprise: number;
  total: number;
}

interface ConversionSource {
  source: string;
  count: number;
  percentage: number;
}

interface DailyConversion {
  date: string;
  signups: number;
  conversions: number;
  conversionRate: number;
}

interface AnalyticsData {
  metrics: ConversionMetrics;
  byPlan: PlanData;
  mrrByPlan: MRRData;
  conversionsBySource: ConversionSource[];
  dailyConversions: DailyConversion[];
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

export default function PlanAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/analytics/conversion-by-plan?days=${period}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-40 rounded-lg bg-slate-200" />
            <div className="grid gap-6 md:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-slate-200" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl text-center">
          <p className="text-muted-foreground">Nenhum dado disponível</p>
        </div>
      </div>
    );
  }

  const planDistribution = [
    { name: 'Starter', value: data.byPlan.starter },
    { name: 'Pro', value: data.byPlan.pro },
    { name: 'Business', value: data.byPlan.business },
    { name: 'Enterprise', value: data.byPlan.enterprise },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50">
      {/* Header */}
      <div className="border-b border-slate-200/50 bg-white/50 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                Analytics de Planos
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Conversão de usuários e receita recorrente
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Period selector */}
        <div className="mb-6 flex gap-2">
          {[7, 30, 90].map(days => (
            <Button
              key={days}
              variant={period === days ? 'default' : 'outline'}
              onClick={() => setPeriod(days)}
            >
              {days} dias
            </Button>
          ))}
        </div>

        {/* KPI Cards */}
        <div className="mb-8 grid gap-6 md:grid-cols-4">
          <Card variant="glass-dark" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total de Signups</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {data.metrics.totalSignups}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </Card>

          <Card variant="glass-dark" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Taxa de Conversão</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {data.metrics.conversionRate.toFixed(1)}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-400" />
            </div>
          </Card>

          <Card variant="glass-dark" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">MRR Total</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  R$ {(data.mrrByPlan.total / 100).toLocaleString('pt-BR', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-amber-400" />
            </div>
          </Card>

          <Card variant="glass-dark" className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Tempo Médio até Conversão</p>
                <p className="mt-2 text-3xl font-bold text-white">
                  {data.metrics.avgConversionTimeDays.toFixed(0)} dias
                </p>
              </div>
              <Clock className="h-8 w-8 text-purple-400" />
            </div>
          </Card>
        </div>

        {/* Charts Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Daily Conversions */}
          <Card variant="glass-dark" className="p-6">
            <h3 className="mb-6 text-xl font-semibold text-white">Conversões Diárias</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.dailyConversions}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="date" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="conversions"
                  stroke="#10B981"
                  name="Conversões"
                />
                <Line
                  type="monotone"
                  dataKey="signups"
                  stroke="#3B82F6"
                  name="Signups"
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>

          {/* Plan Distribution */}
          <Card variant="glass-dark" className="p-6">
            <h3 className="mb-6 text-xl font-semibold text-white">
              Distribuição por Plano
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={planDistribution}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {planDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          {/* MRR by Plan */}
          <Card variant="glass-dark" className="p-6">
            <h3 className="mb-6 text-xl font-semibold text-white">MRR por Plano</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  { name: 'Pro', value: data.mrrByPlan.pro },
                  { name: 'Business', value: data.mrrByPlan.business },
                  { name: 'Enterprise', value: data.mrrByPlan.enterprise },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15,23,42,0.9)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                  formatter={(value) => `R$ ${value}`}
                />
                <Bar dataKey="value" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Conversions by Source */}
          <Card variant="glass-dark" className="p-6">
            <h3 className="mb-6 text-xl font-semibold text-white">
              Conversões por Fonte
            </h3>
            <div className="space-y-4">
              {data.conversionsBySource.map(source => (
                <div key={source.source}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-slate-300 capitalize">
                      {source.source}
                    </span>
                    <span className="text-white font-semibold">
                      {source.count} ({source.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                      style={{ width: `${source.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
