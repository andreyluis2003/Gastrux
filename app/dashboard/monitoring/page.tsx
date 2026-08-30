'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  DollarSign,
  TrendingUp,
  Users,
  ShoppingCart,
  AlertCircle,
  BarChart3,
  Bell,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { KPICard } from '@/components/monitoring/kpi-card';
import { RevenueChart } from '@/components/monitoring/revenue-chart';
import { SubscriptionChart } from '@/components/monitoring/subscription-chart';
import { toast } from 'sonner';

interface KPIData {
  mrr: number;
  mrrTrend: number;
  mrrPreviousMonth: number;
  activeSubscriptions: number;
  newSubscriptionsThisMonth: number;
  subscriptionsLastMonth: number;
  subscriptionGrowthMoM: number;
  totalRevenueThisMonth: number;
  totalRevenueLast30Days: number;
  revenueTrend: number;
  conversionRate: number;
  totalSignups: number;
  totalConverted: number;
  avgDaysToConversion: number;
  churnRateThisMonth: number;
  cancelledSubscriptionsThisMonth: number;
  arpu: number;
  arpuTrend: number;
  paymentSuccessRate: number;
  totalPaymentAttempts: number;
  successfulPayments: number;
  failedPayments: number;
  planDistribution: { [key: string]: number };
  revenueTrendData: Array<{ date: string; revenue: number }>;
  subscriptionTrendData: Array<{ date: string; activeCount: number }>;
}

export default function MonitoringDashboard() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const [kpiData, setKpiData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingAlerts, setCheckingAlerts] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || (session.user as any)?.role !== 'ADMIN') {
      router.replace('/dashboard');
      return;
    }
    fetchKPIs();
  }, [status]);

  const fetchKPIs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/admin/monitoring/kpis');
      if (!response.ok) {
        throw new Error('Failed to fetch KPIs');
      }
      const data = await response.json();
      setKpiData(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setError(message);
      toast.error('Erro ao carregar KPIs: ' + message);
    } finally {
      setLoading(false);
    }
  };

  const checkAlerts = async () => {
    try {
      setCheckingAlerts(true);
      const response = await fetch('/api/admin/monitoring/check-alerts', {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error('Failed to check alerts');
      }
      const data = await response.json();
      if (data.mrrDropDetected) {
        toast.warning('Alerta: Queda de MRR detectada');
      }
      if (data.highChurnDetected) {
        toast.warning('Alerta: Taxa de churn elevada detectada');
      }
      if (!data.mrrDropDetected && !data.highChurnDetected) {
        toast.success('Nenhum alerta critico detectado');
      }
    } catch (error) {
      toast.error('Erro ao verificar alertas');
    } finally {
      setCheckingAlerts(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-6 p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />
            <div>
              <h3 className="font-semibold text-red-900">Erro ao carregar dados</h3>
              <p className="text-sm text-red-700">{error}</p>
              <Button
                onClick={fetchKPIs}
                variant="outline"
                className="mt-3"
              >
                Tentar novamente
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading || !kpiData) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 rounded-lg border border-gray-200 bg-gray-50 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton href="/dashboard" />
          <div>
          <h1 className="text-xl sm:text-3xl font-bold">Dashboard de Monitoramento</h1>
          <p className="mt-1 text-sm text-gray-600">
            Métricas de negócio em tempo real
          </p>
        </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={checkAlerts}
            disabled={checkingAlerts}
            variant="outline"
            className="gap-2"
          >
            <Bell className="h-4 w-4" />
            {checkingAlerts ? 'Verificando...' : 'Verificar Alertas'}
          </Button>
          <Button
            onClick={fetchKPIs}
            variant="outline"
            className="gap-2"
          >
            <BarChart3 className="h-4 w-4" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="MRR (Monthly Recurring Revenue)"
          value={`R$ ${(kpiData.mrr / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          trend={kpiData.mrrTrend}
          icon={<DollarSign className="h-5 w-5" />}
          color="blue"
          description="Receita recorrente mensal"
        />
        <KPICard
          title="Subscrições Ativas"
          value={kpiData.activeSubscriptions}
          trend={kpiData.subscriptionGrowthMoM}
          icon={<ShoppingCart className="h-5 w-5" />}
          color="green"
          description={`+${kpiData.newSubscriptionsThisMonth} este mês`}
        />
        <KPICard
          title="Taxa de Conversão"
          value={kpiData.conversionRate.toFixed(2)}
          unit="%"
          icon={<TrendingUp className="h-5 w-5" />}
          color="purple"
          description={`${kpiData.totalConverted} de ${kpiData.totalSignups} usuários`}
        />
        <KPICard
          title="Taxa de Churn"
          value={kpiData.churnRateThisMonth.toFixed(2)}
          unit="%"
          icon={<Users className="h-5 w-5" />}
          color="red"
          description={`${kpiData.cancelledSubscriptionsThisMonth} cancelamentos`}
        />
      </div>

      {/* Second row KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="ARPU (Avg Revenue Per User)"
          value={`R$ ${(kpiData.arpu / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          trend={kpiData.arpuTrend}
          icon={<DollarSign className="h-5 w-5" />}
          color="amber"
          description="Receita média por usuário"
        />
        <KPICard
          title="Payment Success Rate"
          value={kpiData.paymentSuccessRate.toFixed(2)}
          unit="%"
          icon={<TrendingUp className="h-5 w-5" />}
          color="green"
          description={`${kpiData.successfulPayments}/${kpiData.totalPaymentAttempts} tentativas`}
        />
        <KPICard
          title="Days to Conversion"
          value={kpiData.avgDaysToConversion}
          unit="dias"
          icon={<TrendingUp className="h-5 w-5" />}
          color="blue"
          description="Tempo médio do signup até conversão"
        />
        <KPICard
          title="Revenue This Month"
          value={`R$ ${(kpiData.totalRevenueThisMonth / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          trend={kpiData.revenueTrend}
          icon={<DollarSign className="h-5 w-5" />}
          color="green"
          description="Total de receita gerada"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart data={kpiData.revenueTrendData} />
        <SubscriptionChart data={kpiData.subscriptionTrendData} />
      </div>

      {/* Plan Distribution */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold">Distribuição de Planos</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(kpiData.planDistribution).map(([plan, count]) => (
            <div key={plan} className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-600 capitalize">{plan}</p>
              <p className="mt-2 text-2xl font-bold">{count}</p>
              <p className="mt-1 text-xs text-gray-500">
                {kpiData.activeSubscriptions > 0
                  ? ((count / kpiData.activeSubscriptions) * 100).toFixed(1)
                  : '0.0'}% do total
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
