'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Trash2, TrendingDown, TrendingUp, DollarSign, Loader2, BarChart3, Calendar, AlertCircle } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface WasteReport {
  totalCost: number;
  totalQuantity: number;
  byReason: { reason: string; count: number; cost: number }[];
  byIngredient: { name: string; quantity: number; cost: number; unit: string }[];
  trend: { month: string; cost: number }[];
  avgDailyCost: number;
}

const reasonLabels: Record<string, string> = {
  EXPIRED: 'Vencido',
  PREPARATION: 'Preparo',
  DAMAGED: 'Danificado',
  OVERPRODUCTION: 'Superprodução',
  STORAGE: 'Armazenamento',
  OTHER: 'Outro',
};

const reasonColors: Record<string, string> = {
  EXPIRED: 'bg-red-500',
  PREPARATION: 'bg-orange-500',
  DAMAGED: 'bg-yellow-500',
  OVERPRODUCTION: 'bg-blue-500',
  STORAGE: 'bg-purple-500',
  OTHER: 'bg-gray-500',
};

export default function DesperdicioRelatorioPage() {
  const [data, setData] = useState<WasteReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('30');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/desperdicio/report?days=${period}`);
        if (res.ok) {
          const raw = await res.json();
          // Normalize API response to match interface
          const byReasonArr = Array.isArray(raw.byReason)
            ? raw.byReason
            : Object.entries(raw.byReason || {}).map(([reason, v]: [string, any]) => ({ reason, count: v.count || 0, cost: v.cost || 0 }));
          const byIngredient = (raw.topIngredients || raw.byIngredient || []).map((i: any) => ({
            name: i.name, quantity: i.qty ?? i.quantity ?? 0, cost: i.cost || 0, unit: i.unit || 'kg',
          }));
          const trend = (raw.dailyTrend || raw.trend || []).map((t: any) => ({
            month: t.date || t.month, cost: t.cost || 0,
          }));
          const totalCost = raw.summary?.totalCost ?? raw.totalCost ?? 0;
          const totalQuantity = raw.summary?.totalRecords ?? raw.totalQuantity ?? 0;
          const avgDailyCost = raw.summary?.period ? totalCost / raw.summary.period : raw.avgDailyCost ?? 0;
          setData({ totalCost, totalQuantity, byReason: byReasonArr, byIngredient, trend, avgDailyCost });
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, [period]);

  const maxReasonCost = data ? Math.max(...data.byReason.map(r => r.cost), 1) : 1;
  const maxIngCost = data ? Math.max(...data.byIngredient.map(i => i.cost), 1) : 1;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trash2 className="h-6 w-6 text-red-600" /> Relatório de Desperdício</h1>
          <p className="text-sm text-gray-500">Análise visual de perdas e tendências</p>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex gap-2">
        {[{ v: '7', l: '7 dias' }, { v: '30', l: '30 dias' }, { v: '90', l: '90 dias' }].map(p => (
          <button key={p.v} onClick={() => setPeriod(p.v)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.v ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {p.l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-red-600" /></div>
      ) : !data ? (
        <Card className="p-8 text-center text-gray-500">Nenhum dado de desperdício encontrado.</Card>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-red-600" /><span className="text-xs text-gray-500">Custo Total</span></div>
              <p className="text-xl font-bold text-red-700">{formatBRL(data.totalCost)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><BarChart3 className="h-4 w-4 text-orange-600" /><span className="text-xs text-gray-500">Qtd. Registros</span></div>
              <p className="text-xl font-bold">{data.totalQuantity}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Calendar className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Média Diária</span></div>
              <p className="text-xl font-bold">{formatBRL(data.avgDailyCost)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><AlertCircle className="h-4 w-4 text-yellow-600" /><span className="text-xs text-gray-500">Principal Causa</span></div>
              <p className="text-xl font-bold">{data.byReason.length > 0 ? reasonLabels[data.byReason[0].reason] || data.byReason[0].reason : '-'}</p>
            </Card>
          </div>

          {/* By Reason */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Desperdício por Motivo</h2>
            <div className="space-y-3">
              {data.byReason.map((r, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{reasonLabels[r.reason] || r.reason}</span>
                    <span className="text-gray-600">{r.count}x — {formatBRL(r.cost)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className={`${reasonColors[r.reason] || 'bg-gray-500'} h-3 rounded-full transition-all`} style={{ width: `${(r.cost / maxReasonCost) * 100}%` }}></div>
                  </div>
                </div>
              ))}
              {data.byReason.length === 0 && <p className="text-gray-400 text-sm">Nenhum registro no período.</p>}
            </div>
          </Card>

          {/* By Ingredient - Top 10 */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Top 10 Insumos com Mais Desperdício</h2>
            <div className="space-y-3">
              {data.byIngredient.slice(0, 10).map((ing, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{ing.name}</span>
                    <span className="text-gray-600">{ing.quantity} {ing.unit} — {formatBRL(ing.cost)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className="bg-red-400 h-3 rounded-full transition-all" style={{ width: `${(ing.cost / maxIngCost) * 100}%` }}></div>
                  </div>
                </div>
              ))}
              {data.byIngredient.length === 0 && <p className="text-gray-400 text-sm">Nenhum insumo com desperdício no período.</p>}
            </div>
          </Card>

          {/* Trend */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Tendência Mensal de Custo</h2>
            {data.trend.length > 0 ? (
              <div className="space-y-2">
                {data.trend.map((t, i) => {
                  const maxTrend = Math.max(...data.trend.map(x => x.cost), 1);
                  const prev = i > 0 ? data.trend[i - 1].cost : t.cost;
                  const isUp = t.cost > prev;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-sm w-20 text-gray-600">{t.month}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-4">
                        <div className={`${isUp ? 'bg-red-400' : 'bg-green-400'} h-4 rounded-full transition-all`} style={{ width: `${(t.cost / maxTrend) * 100}%` }}></div>
                      </div>
                      <span className="text-sm font-medium w-24 text-right">{formatBRL(t.cost)}</span>
                      {i > 0 && (isUp ? <TrendingUp className="h-4 w-4 text-red-500" /> : <TrendingDown className="h-4 w-4 text-green-500" />)}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">Dados insuficientes para tendência.</p>
            )}
          </Card>

          <Card className="p-4 bg-red-50 border-red-200">
            <h3 className="font-bold text-sm text-red-800 mb-2">💡 Dicas para Reduzir Desperdício</h3>
            <ul className="text-sm text-red-700 space-y-1">
              <li>• Monitore itens com vencimento próximo diariamente</li>
              <li>• Ajuste quantidades de produção baseado na previsão de demanda</li>
              <li>• Treine a equipe em boas práticas de armazenamento</li>
              <li>• Use o sistema de alertas para notificações automáticas</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
