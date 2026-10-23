'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { TrendingUp, DollarSign, Wallet, PieChart, ArrowUpRight, ArrowDownLeft, FileText, Receipt, Zap, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

// lib/finance/overview.ts: the numbers of the DRE and the Caixa (2026-10-23)
interface Overview {
  last30: { first: string; last: string; revenue: number; result: number; netMargin: number; sales: number; avgTicket: number; byMethod: Record<string, number> };
  changes: { revenue: number | null; avgTicket: number | null; sales: number | null };
  today: { revenue: number; sales: number };
  month: { ym: string; revenueSoFar: number; daysElapsed: number; daysInMonth: number; projection: number | null; lastMonthRevenue: number };
}

// The names the DRE uses for the same keys (app/dashboard/financeiro/dre)
const METHOD_LABEL: Record<string, string> = {
  CASH: 'Dinheiro', PIX: 'PIX', CREDIT: 'Crédito', DEBIT: 'Débito', OTHER: 'Outros',
  PIX_ONLINE: 'PIX pelo celular (mesa)', CARD_ONLINE: 'Cartão pelo celular (mesa)', DELIVERY: 'Delivery (site e integrações)',
};

const formatBRL = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
const br = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function Change({ value }: { value: number | null }) {
  if (value === null) return <p className="text-xs text-gray-500 mt-2">sem vendas nos 30 dias anteriores</p>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownLeft;
  return (
    <div className={`flex items-center gap-1 mt-2 text-sm font-medium ${up ? 'text-green-600' : 'text-red-600'}`}>
      <Icon className="w-4 h-4" />
      {up ? '+' : ''}{value.toFixed(1).replace('.', ',')}% <span className="text-xs font-normal text-gray-500">vs. 30 dias anteriores</span>
    </div>
  );
}

function Kpi({ title, value, color, icon: Icon, children }: { title: string; value: string; color: string; icon: any; children?: React.ReactNode }) {
  return (
    <Card className={`p-6 ${color}`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold mt-2">{value}</p>
          {children}
        </div>
        <Icon className="w-8 h-8 text-gray-400" />
      </div>
    </Card>
  );
}

const LINKS = [
  { href: '/dashboard/financeiro/dre', label: 'DRE', hint: 'Resultado do mês com despesas', icon: FileText, color: 'bg-emerald-100 text-emerald-600' },
  { href: '/contas-a-pagar', label: 'Contas a pagar', hint: 'Boletos, aluguel e folha', icon: Receipt, color: 'bg-blue-100 text-blue-600' },
  { href: '/dashboard/financeiro/contas', label: 'Contas de consumo', hint: 'Luz, água e gás', icon: Zap, color: 'bg-amber-100 text-amber-600' },
  { href: '/dashboard/reports/sales', label: 'Vendas', hint: 'Itens e categorias', icon: BarChart3, color: 'bg-purple-100 text-purple-600' },
  { href: '/dashboard/reports/profitability', label: 'Lucratividade', hint: 'Margem de cada item', icon: TrendingUp, color: 'bg-green-100 text-green-600' },
  { href: '/caixa/historico', label: 'Histórico de caixas', hint: 'Entradas e saídas da gaveta', icon: Wallet, color: 'bg-gray-100 text-gray-600' },
];

export default function FinancialDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/financeiro/resumo', { cache: 'no-store' });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        setData(body);
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar dados financeiros');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const header = (
    <div className="flex items-center gap-4">
      <BackButton />
      <div>
        <h1 className="text-xl sm:text-3xl font-bold">Financeiro</h1>
        <p className="text-sm text-gray-600 mt-1">
          {data ? `Últimos 30 dias (${br(data.last30.first)} a ${br(data.last30.last)}), com os números do Caixa e da DRE` : 'Os números do Caixa e da DRE'}
        </p>
      </div>
    </div>
  );

  if (loading || !data) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        {header}
        {loading ? <p className="text-gray-500">Carregando...</p> : <p className="text-gray-500">Não foi possível carregar o financeiro.</p>}
      </div>
    );
  }

  const { last30, changes, today, month } = data;
  const monthName = MONTHS[Number(month.ym.slice(5, 7)) - 1];
  const methods = Object.entries(last30.byMethod).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {header}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Receita (30 dias)" value={formatBRL(last30.revenue)} color="bg-blue-50" icon={DollarSign}>
          <Change value={changes.revenue} />
        </Kpi>
        <Kpi title="Resultado (30 dias)" value={formatBRL(last30.result)} color="bg-green-50" icon={TrendingUp}>
          <p className="text-xs text-gray-500 mt-2">receita menos CMV e despesas, como na DRE</p>
        </Kpi>
        <Kpi title="Margem líquida" value={`${last30.netMargin.toFixed(1).replace('.', ',')}%`} color="bg-purple-50" icon={PieChart} />
        <Kpi title="Ticket médio" value={formatBRL(last30.avgTicket)} color="bg-amber-50" icon={Wallet}>
          <Change value={changes.avgTicket} />
        </Kpi>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Hoje</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Vendido</p>
              <p className="text-xl font-bold text-green-600 mt-1">{formatBRL(today.revenue)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Vendas</p>
              <p className="text-xl font-bold mt-1">{today.sales}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-1">Previsão de {monthName}</h2>
          {month.projection === null ? (
            <p className="text-sm text-gray-600">A previsão aparece a partir do dia 3. Até agora: {formatBRL(month.revenueSoFar)}.</p>
          ) : (
            <>
              <p className="text-2xl font-bold mt-2">{formatBRL(month.projection)}</p>
              <p className="text-sm text-gray-600 mt-1">
                {formatBRL(month.revenueSoFar)} em {month.daysElapsed} dias. No mesmo ritmo, o mês fecha nesse valor
                {month.lastMonthRevenue > 0 ? ` (o mês passado fechou em ${formatBRL(month.lastMonthRevenue)})` : ''}.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LINKS.map(({ href, label, hint, icon: Icon, color }) => (
          <Link key={href} href={href}>
            <Card className="p-6 hover:shadow-lg transition cursor-pointer">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${color}`}><Icon className="w-6 h-6" /></div>
                <div>
                  <p className="font-semibold">{label}</p>
                  <p className="text-sm text-gray-600">{hint}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Formas de pagamento (30 dias)</h2>
        {methods.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma venda nos últimos 30 dias.</p>
        ) : (
          <div className="space-y-2">
            {methods.map(([method, amount]) => (
              <div key={method} className="flex items-center justify-between pb-2 border-b last:border-b-0">
                <span className="text-gray-600">{METHOD_LABEL[method] ?? method}</span>
                <span className="font-semibold">{formatBRL(amount)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
