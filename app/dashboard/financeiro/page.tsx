'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import {
  TrendingUp,
  DollarSign,
  Wallet,
  PieChart,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface DashboardData {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    totalIncome: number;
    profit: number;
    profitMargin: number;
    averageTicket: number;
    paymentMethods: Record<string, number>;
    totalOrders: number;
    totalPayments: number;
  };
}

interface SummaryData {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  orders: number;
  items: number;
  transactions: number;
}

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);

const KPICard = ({
  title,
  value,
  change,
  icon: Icon,
  color,
}: any) => (
  <Card className={`p-6 ${color}`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-2xl font-bold mt-2">{value}</p>
        {change !== undefined && (
          <div className="flex items-center gap-1 mt-2">
            {change >= 0 ? (
              <>
                <ArrowUpRight className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-600">
                  +{change.toFixed(1)}%
                </span>
              </>
            ) : (
              <>
                <ArrowDownLeft className="w-4 h-4 text-red-600" />
                <span className="text-sm font-medium text-red-600">
                  {change.toFixed(1)}%
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <Icon className="w-8 h-8 text-gray-400" />
    </div>
  </Card>
);

export default function FinancialDashboard() {
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [dashRes, summaryRes] = await Promise.all([
        fetch('/api/financial/dashboard?days=30'),
        fetch('/api/financial/summary'),
      ]);

      if (!dashRes.ok || !summaryRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const dashData = await dashRes.json();
      const summData = await summaryRes.json();

      setDashboardData(dashData);
      setSummaryData(summData);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
      toast.error('Erro ao carregar dados financeiros');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <BackButton />
          <h1 className="text-xl sm:text-3xl font-bold">Financeiro</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!dashboardData || !summaryData) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex items-center gap-4">
          <BackButton />
          <h1 className="text-xl sm:text-3xl font-bold">Financeiro</h1>
        </div>
        <div className="text-center text-gray-500">
          <p>Nenhum dado disponível</p>
        </div>
      </div>
    );
  }

  const { summary } = dashboardData;
  const metrics = [
    {
      title: 'Receita (30d)',
      value: formatBRL(summary.totalRevenue),
      change: 5.2,
      icon: DollarSign,
      color: 'bg-blue-50',
    },
    {
      title: 'Lucro (30d)',
      value: formatBRL(summary.profit),
      change: summary.profitMargin,
      icon: TrendingUp,
      color: 'bg-green-50',
    },
    {
      title: 'Margem de Lucro',
      value: `${summary.profitMargin.toFixed(1)}%`,
      icon: PieChart,
      color: 'bg-purple-50',
    },
    {
      title: 'Ticket Médio',
      value: formatBRL(summary.averageTicket),
      change: 2.1,
      icon: Wallet,
      color: 'bg-amber-50',
    },
  ];

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <BackButton />
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Financeiro</h1>
            <p className="text-sm text-gray-600 mt-1">Análise e controle financeiro</p>
          </div>
        </div>
        <Link href="/dashboard/financeiro/analise">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Nova Análise
          </Button>
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, i) => (
          <KPICard key={i} {...metric} />
        ))}
      </div>

      {/* Today's Summary */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Resumo de Hoje</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Receita</p>
            <p className="text-xl font-bold text-green-600 mt-1">
              {formatBRL(summaryData.revenue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Despesas</p>
            <p className="text-xl font-bold text-red-600 mt-1">
              {formatBRL(summaryData.expenses)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Lucro</p>
            <p className="text-xl font-bold text-blue-600 mt-1">
              {formatBRL(summaryData.profit)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Margem</p>
            <p className="text-xl font-bold text-purple-600 mt-1">
              {summaryData.margin.toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/dashboard/financeiro/fluxo">
          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Wallet className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold">Fluxo de Caixa</p>
                <p className="text-sm text-gray-600">Entradas e saídas</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/financeiro/previsoes">
          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="font-semibold">Previsões</p>
                <p className="text-sm text-gray-600">Tendências futuras</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/financeiro/analise">
          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-100 rounded-lg">
                <PieChart className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold">Análises</p>
                <p className="text-sm text-gray-600">Relatórios detalhados</p>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/dashboard/financeiro/dre">
          <Card className="p-6 hover:shadow-lg transition cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-100 rounded-lg">
                <FileText className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold">DRE</p>
                <p className="text-sm text-gray-600">Demonstrativo de Resultado</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Payment Methods Summary */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Métodos de Pagamento (30d)</h2>
        <div className="space-y-2">
          {Object.entries(summary.paymentMethods).map(([method, amount]) => (
            <div key={method} className="flex items-center justify-between pb-2 border-b last:border-b-0">
              <span className="text-gray-600 capitalize">{method}</span>
              <span className="font-semibold">
                {formatBRL(amount as number)}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
