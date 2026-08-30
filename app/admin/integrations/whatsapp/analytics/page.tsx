'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { toast } from 'sonner';
import {
  BarChart3,
  MessageSquare,
  ShoppingBag,
  Clock,
  TrendingUp,
  Users,
  AlertTriangle,
  CheckCircle2,
  ArrowDownRight,
  Bot,
  PhoneForwarded,
  Target,
} from 'lucide-react';

interface AnalyticsData {
  period: { days: number; since: string };
  overview: {
    totalConversations: number;
    recentConversations: number;
    completedConversations: number;
    conversationsWithOrder: number;
    humanHandoffs: number;
    conversionRate: number;
    handoffRate: number;
    completionRate: number;
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
    avgResponseTimeSec: number;
    byDay: { day: string; count: number }[];
    byHour: { hour: number; count: number }[];
  };
  orders: {
    total: number;
    revenue: number;
    avgTicket: number;
  };
  funnel: { state: string; count: number }[];
  conversationsByState: Record<string, number>;
  conversationsByDay: { day: string; count: number }[];
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const stateLabels: Record<string, string> = {
  GREETING: 'Início',
  MENU_BROWSING: 'Navegando Cardápio',
  CATEGORY_SELECTED: 'Categoria',
  ITEM_SELECTED: 'Item Selecionado',
  CART_REVIEW: 'Revisão Carrinho',
  ORDER_TYPE: 'Tipo de Pedido',
  COLLECTING_INFO: 'Coletando Dados',
  CONFIRMING: 'Confirmando',
  COMPLETED: 'Finalizada',
  HUMAN_HANDOFF: 'Handoff Humano',
  IDLE: 'Inativa',
};

const funnelColors = [
  'bg-blue-500', 'bg-blue-400', 'bg-amber-400', 'bg-amber-500',
  'bg-orange-400', 'bg-violet-400', 'bg-emerald-500',
];

export default function WhatsAppAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/analytics?days=${period}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      toast.error('Erro ao carregar analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [period]);

  if (loading) return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <BackButton />
      <LoadingSkeleton count={8} />
    </div>
  );

  if (!data) return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <BackButton />
      <p className="text-gray-500 mt-4">Nenhum dado disponível.</p>
    </div>
  );

  const { overview, messages, orders, funnel, conversationsByDay } = data;
  const maxFunnelCount = Math.max(...funnel.map(f => f.count), 1);
  const maxHourCount = Math.max(...(messages.byHour || []).map((h: any) => h.count), 1);
  const maxDayCount = Math.max(...(conversationsByDay || []).map((d: any) => d.count), 1);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <BackButton />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-green-600" />
            Monitoramento WhatsApp AI
          </h1>
          <p className="text-sm text-gray-600 mt-1">Métricas de desempenho e qualidade do bot</p>
        </div>
        <div className="flex gap-2">
          {[7, 15, 30, 60].map(d => (
            <Button
              key={d}
              size="sm"
              variant={period === d ? 'default' : 'outline'}
              onClick={() => setPeriod(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <MessageSquare className="w-4 h-4" />
            Conversas ({period}d)
          </div>
          <p className="text-2xl font-bold">{overview.recentConversations}</p>
          <p className="text-xs text-gray-400">Total: {overview.totalConversations}</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <Target className="w-4 h-4 text-emerald-500" />
            Taxa de Conversão
          </div>
          <p className="text-2xl font-bold text-emerald-600">{overview.conversionRate}%</p>
          <p className="text-xs text-gray-400">{overview.conversationsWithOrder} pedidos via WhatsApp</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <Clock className="w-4 h-4 text-blue-500" />
            Tempo Médio Resposta
          </div>
          <p className="text-2xl font-bold">
            {messages.avgResponseTimeSec < 60
              ? `${messages.avgResponseTimeSec}s`
              : `${Math.round(messages.avgResponseTimeSec / 60)}min`}
          </p>
          <p className="text-xs text-gray-400">{messages.total} mensagens no período</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <ShoppingBag className="w-4 h-4 text-violet-500" />
            Receita WhatsApp
          </div>
          <p className="text-2xl font-bold text-violet-600">{fmtBRL(orders.revenue)}</p>
          <p className="text-xs text-gray-400">Ticket médio: {fmtBRL(orders.avgTicket)}</p>
        </Card>
      </div>

      {/* Second row of KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <Bot className="w-4 h-4 text-blue-500" />
            Resolvidas pelo Bot
          </div>
          <p className="text-2xl font-bold">{overview.completionRate}%</p>
          <p className="text-xs text-gray-400">{overview.completedConversations} finalizadas</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <PhoneForwarded className="w-4 h-4 text-rose-500" />
            Handoff Humano
          </div>
          <p className="text-2xl font-bold text-rose-600">{overview.handoffRate}%</p>
          <p className="text-xs text-gray-400">{overview.humanHandoffs} encaminhadas</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Msgs Inbound
          </div>
          <p className="text-2xl font-bold">{messages.inbound}</p>
          <p className="text-xs text-gray-400">Recebidas no período</p>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-1">
            <ArrowDownRight className="w-4 h-4 text-amber-500" />
            Msgs Outbound
          </div>
          <p className="text-2xl font-bold">{messages.outbound}</p>
          <p className="text-xs text-gray-400">Enviadas pelo bot</p>
        </Card>
      </div>

      {/* Funnel + State Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funil de Conversão */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-500" />
            Funil de Conversão
          </h3>
          <div className="space-y-2">
            {funnel.map((step, i) => (
              <div key={step.state} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 truncate">
                  {stateLabels[step.state] || step.state}
                </span>
                <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-md overflow-hidden">
                  <div
                    className={`h-full ${funnelColors[i] || 'bg-gray-400'} rounded-md transition-all duration-500`}
                    style={{ width: `${Math.max((step.count / maxFunnelCount) * 100, 2)}%` }}
                  />
                </div>
                <span className="text-xs font-medium w-8 text-right">{step.count}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Distribuição por Estado */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            Distribuição por Estado Atual
          </h3>
          <div className="space-y-2">
            {Object.entries(data.conversationsByState)
              .sort((a, b) => b[1] - a[1])
              .map(([state, count]) => {
                const pct = overview.totalConversations > 0 ? ((count / overview.totalConversations) * 100).toFixed(1) : '0';
                const isAlert = state === 'HUMAN_HANDOFF';
                return (
                  <div key={state} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      {isAlert && <AlertTriangle className="w-3 h-3 text-rose-500" />}
                      <span className="text-sm">{stateLabels[state] || state}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{pct}%</Badge>
                      <span className="text-sm font-medium w-8 text-right">{count}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      </div>

      {/* Conversas por Dia + Horários de Pico */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Volume por dia */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            Conversas por Dia
          </h3>
          <div className="flex items-end gap-[2px] h-32">
            {(conversationsByDay || []).map((d: any, i: number) => {
              const h = Math.max((d.count / maxDayCount) * 100, 4);
              const dateStr = new Date(d.day).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-blue-400 hover:bg-blue-500 rounded-t transition-colors cursor-default"
                    style={{ height: `${h}%` }}
                  />
                  <div className="hidden group-hover:block absolute -top-8 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {dateStr}: {d.count}
                  </div>
                </div>
              );
            })}
          </div>
          {conversationsByDay.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">Sem dados no período</p>
          )}
        </Card>

        {/* Horários de pico */}
        <Card className="p-5">
          <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-500" />
            Horários de Pico (Mensagens Recebidas)
          </h3>
          <div className="flex items-end gap-[2px] h-32">
            {Array.from({ length: 24 }, (_, h) => {
              const found = (messages.byHour || []).find((x: any) => x.hour === h);
              const count = found?.count || 0;
              const barH = Math.max((count / maxHourCount) * 100, 2);
              const isPeak = count >= maxHourCount * 0.7;
              return (
                <div key={h} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className={`w-full rounded-t transition-colors cursor-default ${
                      isPeak ? 'bg-amber-500 hover:bg-amber-600' : 'bg-gray-300 hover:bg-gray-400'
                    }`}
                    style={{ height: `${barH}%` }}
                  />
                  <span className="text-[9px] text-gray-400 mt-1">{h}</span>
                  <div className="hidden group-hover:block absolute -top-8 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                    {h}h: {count} msgs
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Alertas de Qualidade */}
      <Card className="p-5">
        <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          Alertas de Qualidade
        </h3>
        <div className="space-y-3">
          {overview.handoffRate > 20 && (
            <div className="flex items-start gap-3 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-lg border border-rose-200 dark:border-rose-800">
              <AlertTriangle className="w-5 h-5 text-rose-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-rose-700 dark:text-rose-400">Alta taxa de handoff humano</p>
                <p className="text-xs text-rose-600 dark:text-rose-500">
                  {overview.handoffRate}% das conversas estão sendo encaminhadas para atendimento humano.
                  Considere melhorar o fluxo do bot ou adicionar mais opções ao cardápio.
                </p>
              </div>
            </div>
          )}
          {overview.conversionRate < 5 && overview.totalConversations > 10 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Baixa conversão em pedidos</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  Apenas {overview.conversionRate}% das conversas resultam em pedidos.
                  Revise o fluxo de checkout ou simplifique o cardápio no bot.
                </p>
              </div>
            </div>
          )}
          {messages.avgResponseTimeSec > 30 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Tempo de resposta alto</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  O bot está demorando em média {messages.avgResponseTimeSec}s para responder.
                  Verifique se há lentidão na API da Meta ou timeouts internos.
                </p>
              </div>
            </div>
          )}
          {overview.handoffRate <= 20 && overview.conversionRate >= 5 && messages.avgResponseTimeSec <= 30 && (
            <div className="flex items-start gap-3 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Tudo funcionando bem!</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-500">
                  O bot está operando dentro dos parâmetros ideais.
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
