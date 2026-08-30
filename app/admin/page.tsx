'use client';

import { useEffect, useState } from 'react';
import { DashboardKPIs } from '@/components/admin/dashboard-kpis';
import { DashboardAlerts } from '@/components/admin/dashboard-alerts';
import { RevenueChart } from '@/components/admin/revenue-chart';
import { RecentLogs } from '@/components/admin/recent-logs';
import { UpgradeBanner } from '@/components/tier/upgrade-banner';
import { toast } from 'sonner';

interface DashboardData {
  kpis: any;
  alerts: any[];
  dailyRevenue: any[];
  recentLogs: any[];
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      setLoading(true);
      const [dashboardRes, alertsRes] = await Promise.all([
        fetch('/api/admin/dashboard'),
        fetch('/api/admin/dashboard/alerts'),
      ]);

      if (!dashboardRes.ok || !alertsRes.ok) {
        throw new Error('Erro ao carregar dados');
      }

      const dashboardData = await dashboardRes.json();
      const alertsData = await alertsRes.json();

      setData({
        kpis: dashboardData.kpis,
        alerts: alertsData.alerts || [],
        dailyRevenue: dashboardData.dailyRevenue || [],
        recentLogs: dashboardData.recentLogs || [],
      });
    } catch (error) {
      console.error('Erro ao carregar dashboard:', error);
      toast.error('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-10 bg-slate-100 rounded animate-pulse w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center">
        <p className="text-slate-600">Erro ao carregar dashboard</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <UpgradeBanner />
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard Admin</h1>
        <p className="text-slate-600 mt-1">Visão geral do seu negócio</p>
      </div>

      {/* KPIs */}
      <DashboardKPIs kpis={data.kpis} />

      {/* Alerts and Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <DashboardAlerts alerts={data.alerts} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <RevenueChart
            data={data.dailyRevenue}
            title="Receita - Últimos 7 Dias"
            type="line"
            loading={loading}
          />
        </div>
      </div>

      {/* Recent Activity */}
      <RecentLogs logs={data.recentLogs} loading={loading} />

      {/* Bottom Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
          <p className="text-slate-600 text-sm font-medium mb-2">Staff Ativo</p>
          <p className="text-3xl font-bold text-slate-900">{data.kpis.staffCount}</p>
          <p className="text-xs text-slate-500 mt-2">Funcionários em atividade</p>
        </div>
        <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
          <p className="text-slate-600 text-sm font-medium mb-2">Estoque Baixo</p>
          <p className="text-3xl font-bold text-amber-600">{data.kpis.lowStockCount}</p>
          <p className="text-xs text-slate-500 mt-2">Ingredientes abaixo do mínimo</p>
        </div>
        <div className="bg-white rounded-lg border-2 border-slate-200 p-6">
          <p className="text-slate-600 text-sm font-medium mb-2">Taxa de Conversão</p>
          <p className="text-3xl font-bold text-green-600">92%</p>
          <p className="text-xs text-slate-500 mt-2">Visitantes convertidos em pedidos</p>
        </div>
      </div>
    </div>
  );
}
