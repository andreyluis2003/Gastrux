'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import {
  FileText, TrendingUp, TrendingDown, DollarSign, Download, Calendar,
  ChevronDown, ChevronRight, Loader2, AlertCircle, Users, Truck, UtensilsCrossed,
  Percent, BarChart3, ArrowUpRight, ArrowDownRight, Minus as MinusIcon, CreditCard
} from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';

type PeriodType = 'month' | 'quarter' | 'year' | 'custom';

interface DREData {
  periodo: { inicio: string; fim: string };
  dre: {
    receitaBruta: number;
    receitaDineIn: number;
    receitaDelivery: number;
    receitaCaixa: number;
    deducoes: { impostos: number; descontos: number; total: number };
    receitaLiquida: number;
    cmv: number;
    lucroBruto: number;
    margemBruta: number;
    despesasOperacionais: { operacional: number; pessoal: number; taxasGateway: number; total: number };
    resultadoOperacional: number;
    margemOperacional: number;
    resultadoLiquido: number;
    margemLiquida: number;
  };
  detalhamento: {
    totalPedidos: number;
    receitaPorMetodo: Record<string, number>;
    totalFuncionarios: number;
  };
}

function getMonthDates(monthsAgo: number) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const end = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function getQuarterDates(quartersAgo: number) {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const targetQuarter = currentQuarter - quartersAgo;
  const year = now.getFullYear() + Math.floor(targetQuarter / 4);
  const q = ((targetQuarter % 4) + 4) % 4;
  const start = new Date(year, q * 3, 1);
  const end = new Date(year, q * 3 + 3, 0);
  return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
}

function getYearDates(yearsAgo: number) {
  const year = new Date().getFullYear() - yearsAgo;
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function formatPeriodLabel(type: PeriodType, startDate: string, endDate: string): string {
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  if (type === 'month') return `${months[s.getMonth()]} ${s.getFullYear()}`;
  if (type === 'quarter') {
    const q = Math.floor(s.getMonth() / 3) + 1;
    return `${q}º Trimestre ${s.getFullYear()}`;
  }
  if (type === 'year') return `Ano ${s.getFullYear()}`;
  return `${s.toLocaleDateString('pt-BR')} a ${e.toLocaleDateString('pt-BR')}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: 'Dinheiro', CARD: 'Cartão', PIX: 'PIX', MERCADO_PAGO: 'Mercado Pago',
  BANK_TRANSFER: 'Transferência', OTHER: 'Outros', STRIPE: 'Stripe',
};

export default function DREPage() {
  const [data, setData] = useState<DREData | null>(null);
  const [loading, setLoading] = useState(false);
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    receita: true, deducoes: true, cmv: true, despesas: true, resultado: true,
  });

  const getDates = useCallback(() => {
    if (periodType === 'month') return getMonthDates(periodOffset);
    if (periodType === 'quarter') return getQuarterDates(periodOffset);
    if (periodType === 'year') return getYearDates(periodOffset);
    return { startDate: customStart, endDate: customEnd };
  }, [periodType, periodOffset, customStart, customEnd]);

  const fetchDRE = useCallback(async () => {
    const { startDate, endDate } = getDates();
    if (!startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/financeiro/dre?startDate=${startDate}&endDate=${endDate}`);
      if (!res.ok) throw new Error('Erro ao carregar DRE');
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDates]);

  useEffect(() => {
    fetchDRE();
  }, [fetchDRE]);

  function toggleSection(key: string) {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function MarginBadge({ value }: { value: number }) {
    const color = value > 0 ? 'text-green-700 bg-green-50' : value < 0 ? 'text-red-700 bg-red-50' : 'text-gray-700 bg-gray-50';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>{value.toFixed(1)}%</span>;
  }

  function TrendIcon({ value }: { value: number }) {
    if (value > 0) return <ArrowUpRight className="h-4 w-4 text-green-600" />;
    if (value < 0) return <ArrowDownRight className="h-4 w-4 text-red-600" />;
    return <MinusIcon className="h-4 w-4 text-gray-400" />;
  }

  function DRELine({ label, value, bold, indent, sub, negative }: {
    label: string; value: number; bold?: boolean; indent?: boolean; sub?: boolean; negative?: boolean;
  }) {
    const textColor = negative ? 'text-red-600' : value < 0 ? 'text-red-600' : '';
    return (
      <div className={`flex items-center justify-between py-1.5 ${indent ? 'pl-6' : ''} ${bold ? 'border-t border-gray-200 pt-2' : ''}`}>
        <span className={`text-sm ${bold ? 'font-bold' : sub ? 'text-gray-500 text-xs' : 'text-gray-700'}`}>{label}</span>
        <span className={`text-sm font-mono ${bold ? 'font-bold text-base' : ''} ${textColor}`}>
          {negative ? `(${formatBRL(Math.abs(value))})` : formatBRL(value)}
        </span>
      </div>
    );
  }

  const d = data?.dre;
  const det = data?.detalhamento;
  const dates = getDates();
  const periodLabel = dates.startDate ? formatPeriodLabel(periodType, dates.startDate, dates.endDate) : '';

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-blue-600" /> DRE</h1>
          <p className="text-sm text-gray-500">Demonstrativo de Resultado do Exercício</p>
        </div>
      </div>

      {/* Period selector */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border overflow-hidden">
            {(['month', 'quarter', 'year', 'custom'] as PeriodType[]).map((t) => (
              <button
                key={t}
                onClick={() => { setPeriodType(t); setPeriodOffset(0); }}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  periodType === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t === 'month' ? 'Mensal' : t === 'quarter' ? 'Trimestral' : t === 'year' ? 'Anual' : 'Personalizado'}
              </button>
            ))}
          </div>

          {periodType !== 'custom' && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPeriodOffset((p) => p + 1)}>&larr;</Button>
              <span className="text-sm font-medium min-w-[140px] text-center">{periodLabel}</span>
              <Button variant="outline" size="sm" onClick={() => setPeriodOffset((p) => Math.max(0, p - 1))} disabled={periodOffset === 0}>&rarr;</Button>
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="border rounded px-2 py-1 text-sm" />
              <span className="text-sm">até</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="border rounded px-2 py-1 text-sm" />
              <Button size="sm" onClick={fetchDRE}>Buscar</Button>
            </div>
          )}
        </div>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      ) : !d ? (
        <Card className="p-8 text-center">
          <AlertCircle className="h-10 w-10 mx-auto text-gray-400 mb-3" />
          <p className="text-gray-500">Selecione um período para gerar o DRE</p>
        </Card>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-xs text-gray-500">Receita Líquida</span></div>
              <p className="text-lg font-bold">{formatBRL(d.receitaLiquida)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Lucro Bruto</span></div>
              <p className="text-lg font-bold">{formatBRL(d.lucroBruto)}</p>
              <MarginBadge value={d.margemBruta} />
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><BarChart3 className="h-4 w-4 text-purple-600" /><span className="text-xs text-gray-500">Resultado Oper.</span></div>
              <p className={`text-lg font-bold ${d.resultadoOperacional < 0 ? 'text-red-600' : ''}`}>{formatBRL(d.resultadoOperacional)}</p>
              <MarginBadge value={d.margemOperacional} />
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendIcon value={d.resultadoLiquido} /><span className="text-xs text-gray-500">Resultado Líq.</span></div>
              <p className={`text-lg font-bold ${d.resultadoLiquido < 0 ? 'text-red-600' : ''}`}>{formatBRL(d.resultadoLiquido)}</p>
              <MarginBadge value={d.margemLiquida} />
            </Card>
          </div>

          {/* DRE formal */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold">Demonstrativo de Resultado</h2>
                <p className="text-sm text-gray-500">{periodLabel}</p>
              </div>
            </div>

            {/* RECEITA */}
            <button onClick={() => toggleSection('receita')} className="flex items-center gap-2 w-full text-left mb-2">
              {expandedSections.receita ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-bold text-sm text-blue-700 uppercase tracking-wide">Receita</span>
            </button>
            {expandedSections.receita && (
              <div className="mb-4 border-l-2 border-blue-200 pl-4">
                <DRELine label="Receita Bruta" value={d.receitaBruta} />
                <DRELine label="Vendas Salão" value={d.receitaDineIn} indent sub />
                <DRELine label="Vendas Delivery" value={d.receitaDelivery} indent sub />
                {d.receitaCaixa > 0 && <DRELine label="Receita Caixa" value={d.receitaCaixa} indent sub />}
              </div>
            )}

            {/* DEDUÇÕES */}
            <button onClick={() => toggleSection('deducoes')} className="flex items-center gap-2 w-full text-left mb-2">
              {expandedSections.deducoes ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-bold text-sm text-red-700 uppercase tracking-wide">Deduções</span>
            </button>
            {expandedSections.deducoes && (
              <div className="mb-4 border-l-2 border-red-200 pl-4">
                <DRELine label="Impostos" value={d.deducoes.impostos} negative />
                <DRELine label="Descontos Concedidos" value={d.deducoes.descontos} negative />
                <DRELine label="Total Deduções" value={d.deducoes.total} bold negative />
              </div>
            )}

            <DRELine label="RECEITA LÍQUIDA" value={d.receitaLiquida} bold />

            {/* CMV */}
            <button onClick={() => toggleSection('cmv')} className="flex items-center gap-2 w-full text-left mb-2 mt-4">
              {expandedSections.cmv ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-bold text-sm text-orange-700 uppercase tracking-wide">CMV</span>
            </button>
            {expandedSections.cmv && (
              <div className="mb-4 border-l-2 border-orange-200 pl-4">
                <DRELine label="Custo das Mercadorias Vendidas" value={d.cmv} negative />
              </div>
            )}

            <DRELine label="LUCRO BRUTO" value={d.lucroBruto} bold />
            <div className="flex items-center gap-1 mb-4"><Percent className="h-3 w-3 text-gray-400" /><span className="text-xs text-gray-500">Margem Bruta:</span><MarginBadge value={d.margemBruta} /></div>

            {/* DESPESAS */}
            <button onClick={() => toggleSection('despesas')} className="flex items-center gap-2 w-full text-left mb-2">
              {expandedSections.despesas ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-bold text-sm text-purple-700 uppercase tracking-wide">Despesas Operacionais</span>
            </button>
            {expandedSections.despesas && (
              <div className="mb-4 border-l-2 border-purple-200 pl-4">
                <DRELine label="Despesas Gerais" value={d.despesasOperacionais.operacional} negative />
                <DRELine label="Folha de Pagamento" value={d.despesasOperacionais.pessoal} negative />
                <DRELine label="Taxas de Gateway" value={d.despesasOperacionais.taxasGateway} negative />
                <DRELine label="Total Despesas" value={d.despesasOperacionais.total} bold negative />
              </div>
            )}

            {/* RESULTADO */}
            <div className="bg-gray-50 rounded-lg p-4 mt-4 space-y-1">
              <DRELine label="RESULTADO OPERACIONAL" value={d.resultadoOperacional} bold />
              <div className="flex items-center gap-1"><Percent className="h-3 w-3 text-gray-400" /><span className="text-xs text-gray-500">Margem Operacional:</span><MarginBadge value={d.margemOperacional} /></div>
              <div className="border-t border-gray-300 my-2" />
              <DRELine label="RESULTADO LÍQUIDO" value={d.resultadoLiquido} bold />
              <div className="flex items-center gap-1"><Percent className="h-3 w-3 text-gray-400" /><span className="text-xs text-gray-500">Margem Líquida:</span><MarginBadge value={d.margemLiquida} /></div>
            </div>
          </Card>

          {/* Details */}
          {det && (
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><UtensilsCrossed className="h-4 w-4" /> Detalhamento</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-600">Total de Pedidos</span><span className="font-medium">{det.totalPedidos}</span></div>
                  <div className="flex justify-between"><span className="text-gray-600">Funcionários Ativos</span><span className="font-medium">{det.totalFuncionarios}</span></div>
                </div>
              </Card>
              <Card className="p-4">
                <h3 className="font-bold text-sm mb-3 flex items-center gap-2"><CreditCard className="h-4 w-4" /> Receita por Método</h3>
                <div className="space-y-2 text-sm">
                  {Object.entries(det.receitaPorMetodo).map(([method, amount]) => (
                    <div key={method} className="flex justify-between">
                      <span className="text-gray-600">{PAYMENT_LABELS[method] || method}</span>
                      <span className="font-medium">{formatBRL(amount)}</span>
                    </div>
                  ))}
                  {Object.keys(det.receitaPorMetodo).length === 0 && <p className="text-gray-400">Sem dados</p>}
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
