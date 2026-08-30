'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowRight,
  Loader2, PieChart, LineChart, QrCode, Users, Percent,
  ArrowUpRight, ShieldCheck, AlertTriangle
} from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: '7', label: '7 dias' },
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: '180', label: '6 meses' },
];

export default function MigracaoROI() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [period, setPeriod] = useState('30');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/migracao-roi?period=${period}`);
      if (res.ok) setData(await res.json());
    } catch { toast.error('Erro ao carregar dados'); }
    setLoading(false);
  }, [period]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const mp = data?.marketplace || {};
  const dr = data?.direct || {};
  const qr = data?.qr || {};
  const monthly = data?.monthlyTrend || [];
  const platforms = data?.platformBreakdown || [];

  const maxMonthly = Math.max(
    ...monthly.map((m: any) => Math.max(m.marketplace, m.direct, 1)),
    1
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-7 h-7 text-orange-500" />
              Dashboard ROI Migração
            </h1>
            <p className="text-sm text-muted-foreground">Compare marketplace vs pedido direto e veja quanto você economiza</p>
          </div>
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                period === opt.value
                  ? 'bg-white dark:bg-gray-800 shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Marketplace Card */}
        <Card className="p-5 border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">Marketplace</p>
              <p className="text-xs text-muted-foreground">{mp.orders || 0} pedidos</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Receita bruta</span>
              <span className="font-medium">R$ {Number(mp.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-red-600 font-medium">Taxas pagas ({mp.avgFeeRate || 0}%)</span>
              <span className="font-bold text-red-600">-R$ {Number(mp.feesPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <hr className="border-dashed" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Receita líquida</span>
              <span className="font-bold">R$ {Number(mp.netRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </Card>

        {/* Direct Card */}
        <Card className="p-5 border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-green-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">Pedido Direto</p>
              <p className="text-xs text-muted-foreground">{dr.orders || 0} pedidos</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Receita bruta</span>
              <span className="font-medium">R$ {Number(dr.revenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-600 font-medium">Taxas economizadas</span>
              <span className="font-bold text-green-600">+R$ {Number(dr.feeSavings || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <hr className="border-dashed" />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Receita líquida</span>
              <span className="font-bold">R$ {Number(dr.netRevenue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </Card>

        {/* ROI Summary */}
        <Card className="p-5 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <Percent className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <p className="font-semibold text-sm">ROI da Migração</p>
              <p className="text-xs text-muted-foreground">Retorno sobre investimento</p>
            </div>
          </div>
          <div className="text-center py-2">
            <p className="text-4xl font-bold text-orange-600">{data?.migrationROI || '0.0'}%</p>
            <p className="text-xs text-muted-foreground mt-1">das taxas marketplace recuperadas</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {qr.totalScans || 0} scans QR • {qr.conversionRate || '0.0'}% conversão
            </span>
          </div>
        </Card>
      </div>

      {/* Monthly Trend Chart */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <LineChart className="w-5 h-5 text-orange-500" />
          Tendência Mensal: Marketplace vs Direto
        </h2>
        <p className="text-sm text-muted-foreground mb-4">Últimos 6 meses de receita por canal</p>

        {monthly.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-xs mb-2">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> Marketplace</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 inline-block" /> Direto</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-400 inline-block" /> Taxas Economizadas</span>
            </div>
            {monthly.map((m: any, i: number) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium w-16">{m.label}</span>
                  <div className="flex gap-4 text-muted-foreground">
                    <span>MP: R$ {Number(m.marketplace).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                    <span>Dir: R$ {Number(m.direct).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
                <div className="flex gap-1 h-5">
                  <div
                    className="bg-red-400 rounded-sm transition-all h-full"
                    style={{ width: `${(m.marketplace / maxMonthly) * 100}%`, minWidth: m.marketplace > 0 ? '4px' : '0' }}
                  />
                  <div
                    className="bg-green-400 rounded-sm transition-all h-full"
                    style={{ width: `${(m.direct / maxMonthly) * 100}%`, minWidth: m.direct > 0 ? '4px' : '0' }}
                  />
                  <div
                    className="bg-orange-300 rounded-sm transition-all h-full"
                    style={{ width: `${(m.feesSaved / maxMonthly) * 100}%`, minWidth: m.feesSaved > 0 ? '4px' : '0' }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Sem dados suficientes para o gráfico</p>
        )}
      </Card>

      {/* Platform Breakdown */}
      {platforms.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-orange-500" />
            Breakdown por Plataforma
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {platforms.map((p: any) => (
              <div key={p.platform} className="p-4 rounded-xl bg-muted/30">
                <div className="flex items-center justify-between mb-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    p.platform === 'ifood' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    p.platform === 'uber_eats' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    {p.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{p.orders} pedidos</span>
                </div>
                <p className="text-lg font-bold">R$ {Number(p.revenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                <p className="text-xs text-red-600">Taxas: R$ {Number(p.fees).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({p.feeRate}%)</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Insight Box */}
      <Card className="p-6 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/10 dark:to-amber-900/10">
        <h2 className="text-lg font-semibold mb-2">💡 Insight de Migração</h2>
        <div className="space-y-2 text-sm">
          {Number(mp.feesPaid) > 0 && (
            <p>
              Nos últimos <strong>{data?.period} dias</strong>, você pagou <strong className="text-red-600">R$ {Number(mp.feesPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> em
              taxas de marketplace. Cada pedido migrado para o canal direto economiza em média <strong className="text-green-600">{mp.avgFeeRate}%</strong> em comissões.
            </p>
          )}
          {Number(dr.feeSavings) > 0 && (
            <p>
              ✅ Seus pedidos diretos já economizaram <strong className="text-green-600">R$ {Number(dr.feeSavings).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> em taxas que seriam pagas ao marketplace.
            </p>
          )}
          {Number(mp.feesPaid) > 0 && Number(dr.feeSavings) === 0 && (
            <p>
              ⚠️ Você ainda não tem pedidos diretos. Use o <strong>QR na Embalagem</strong> e a <strong>Campanha Reconquista</strong> para começar a migrar clientes!
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
