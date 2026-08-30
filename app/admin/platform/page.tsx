'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  TrendingUp,
  AlertTriangle,
  Users,
  RefreshCw,
  DollarSign,
  BarChart3,
  UserX,
  CircleAlert,
  Clock,
  ExternalLink,
  Repeat,
} from 'lucide-react';

interface PlatformMetrics {
  revenue: {
    mrrCents: number;
    last30DaysCents: number;
    last7DaysCents: number;
    todayCents: number;
    byGateway: Record<string, number>;
    currency: string;
  };
  subscriptions: {
    activeCount: number;
    trialingCount: number;
    pausedCount: number;
    cancelledLast30d: number;
    grossChurnPct: number;
  };
  customers: {
    totalRestaurants: number;
    activeRestaurants: number;
    trialRestaurants: number;
    suspendedRestaurants: number;
    cancelledRestaurants: number;
    archivedRestaurants: number;
    newLast30d: number;
    trialsExpiringNext7d: number;
  };
  issues: {
    failedPayments24h: number;
    refundedPayments7d: number;
    criticalNotificationsOpen: number;
    disputesOpen: number;
  };
  topCustomers: Array<{
    restaurantId: string | null;
    name: string;
    totalRevenueCents: number;
    paymentCount: number;
    subscriptionStatus: string | null;
  }>;
  signupsPerDay: Array<{ date: string; count: number }>;
  trialConversionRate: number;
  revenueByTier: Record<string, number>;
  generatedAt: string;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function PlatformDashboardPage() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = useCallback(async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      const res = await fetch(`/api/admin/platform/metrics${refresh ? '?refresh=1' : ''}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setMetrics(data);
      if (refresh) toast.success('Métricas atualizadas');
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro: ${err.message || 'Falha ao carregar métricas'}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics(false);
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="h-10 bg-slate-200 rounded animate-pulse w-1/3" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 rounded animate-pulse" />
          ))}
        </div>
        <div className="h-60 bg-slate-100 rounded animate-pulse" />
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Sem dados disponíveis.</p>
      </div>
    );
  }

  const totalActiveSubs =
    metrics.subscriptions.activeCount + metrics.subscriptions.trialingCount;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold tracking-tight">
            Platform Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral da plataforma — receita, churn e saúde do serviço
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Atualizado em {formatDateTime(metrics.generatedAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/customers">
            <Button variant="outline" className="gap-2">
              <Users className="h-4 w-4" />
              <span>Clientes</span>
            </Button>
          </Link>
          <Button onClick={() => fetchMetrics(true)} disabled={refreshing} className="gap-2">
            <RefreshCw className={refreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            <span>Atualizar</span>
          </Button>
        </div>
      </div>

      {/* Revenue row */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Receita
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="MRR estimado"
            value={formatCurrency(metrics.revenue.mrrCents)}
            hint={`${totalActiveSubs} assinaturas ativas / trial`}
            accent="emerald"
          />
          <MetricCard
            label="Receita (30 dias)"
            value={formatCurrency(metrics.revenue.last30DaysCents)}
            hint="Pagamentos aprovados"
            accent="blue"
          />
          <MetricCard
            label="Receita (7 dias)"
            value={formatCurrency(metrics.revenue.last7DaysCents)}
            accent="indigo"
          />
          <MetricCard
            label="Receita hoje"
            value={formatCurrency(metrics.revenue.todayCents)}
            accent="violet"
          />
        </div>
      </div>

      {/* Revenue by gateway */}
      {Object.keys(metrics.revenue.byGateway).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Receita por gateway (30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(metrics.revenue.byGateway)
                .sort(([, a], [, b]) => b - a)
                .map(([gateway, cents]) => {
                  const total =
                    Object.values(metrics.revenue.byGateway).reduce((s, v) => s + v, 0) || 1;
                  const pct = Math.round((cents / total) * 100);
                  return (
                    <div key={gateway}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{gateway}</span>
                        <span className="tabular-nums">
                          {formatCurrency(cents)}{' '}
                          <span className="text-muted-foreground">({pct}%)</span>
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded mt-1 overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Churn & subscriptions */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Repeat className="h-4 w-4" /> Churn & Assinaturas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Assinaturas ativas"
            value={metrics.subscriptions.activeCount.toString()}
            accent="emerald"
          />
          <MetricCard
            label="Em trial"
            value={metrics.subscriptions.trialingCount.toString()}
            accent="blue"
          />
          <MetricCard
            label="Cancelamentos (30d)"
            value={metrics.subscriptions.cancelledLast30d.toString()}
            accent="rose"
          />
          <MetricCard
            label="Churn bruto"
            value={`${metrics.subscriptions.grossChurnPct.toFixed(2)}%`}
            hint="Últimos 30 dias"
            accent={metrics.subscriptions.grossChurnPct > 5 ? 'rose' : 'amber'}
          />
        </div>
      </div>

      {/* Customers */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <Users className="h-4 w-4" /> Clientes (Restaurantes)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total"
            value={metrics.customers.totalRestaurants.toString()}
            hint={`${metrics.customers.newLast30d} novos (30d)`}
          />
          <MetricCard
            label="Ativos"
            value={metrics.customers.activeRestaurants.toString()}
            accent="emerald"
          />
          <MetricCard
            label="Em trial"
            value={metrics.customers.trialRestaurants.toString()}
            hint={`${metrics.customers.trialsExpiringNext7d} expirando em 7d`}
            accent="blue"
          />
          <MetricCard
            label="Suspensos / cancelados"
            value={(
              metrics.customers.suspendedRestaurants + metrics.customers.cancelledRestaurants
            ).toString()}
            accent="rose"
          />
        </div>
      </div>

      {/* Issues */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> Issues & saúde
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Pagamentos falhados (24h)"
            value={metrics.issues.failedPayments24h.toString()}
            accent={metrics.issues.failedPayments24h > 0 ? 'rose' : 'slate'}
          />
          <MetricCard
            label="Estornos (7d)"
            value={metrics.issues.refundedPayments7d.toString()}
            accent="amber"
          />
          <MetricCard
            label="Alertas críticos"
            value={metrics.issues.criticalNotificationsOpen.toString()}
            accent={metrics.issues.criticalNotificationsOpen > 0 ? 'rose' : 'slate'}
          />
          <MetricCard
            label="Chargebacks/Disputas"
            value={metrics.issues.disputesOpen.toString()}
            accent={metrics.issues.disputesOpen > 0 ? 'rose' : 'slate'}
          />
        </div>
      </div>

      {/* Conversion & Tier Analytics */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Conversão & Receita por Plano
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            label="Taxa de conversão Trial → Ativo"
            value={`${metrics.trialConversionRate}%`}
            hint="Restaurantes que converteram de trial para ativo"
            accent={metrics.trialConversionRate > 10 ? 'emerald' : 'amber'}
          />
          <Card>
            <CardContent className="pt-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Receita por plano (90d)</p>
              {Object.keys(metrics.revenueByTier).length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum dado disponível</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {Object.entries(metrics.revenueByTier)
                    .sort(([, a], [, b]) => b - a)
                    .map(([tier, cents]) => {
                      const total = Object.values(metrics.revenueByTier).reduce((s, v) => s + v, 0) || 1;
                      const pct = Math.round((cents / total) * 100);
                      const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
                      return (
                        <div key={tier}>
                          <div className="flex items-center justify-between text-sm">
                            <Badge variant="outline" className="text-xs">{tierLabel}</Badge>
                            <span className="tabular-nums text-sm font-medium">
                              {formatCurrency(cents)}{' '}
                              <span className="text-muted-foreground">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-2 w-full bg-slate-100 rounded mt-1 overflow-hidden">
                            <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Signups per day chart */}
      {metrics.signupsPerDay.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Novos cadastros por dia (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-[2px] h-32">
              {(() => {
                const maxCount = Math.max(...metrics.signupsPerDay.map(d => d.count), 1);
                return metrics.signupsPerDay.map((day, i) => {
                  const heightPct = (day.count / maxCount) * 100;
                  const dateStr = day.date.slice(5); // MM-DD
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center justify-end group relative"
                    >
                      <div
                        className="w-full bg-blue-500 rounded-t-sm min-h-[2px] transition-all hover:bg-blue-600"
                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                        title={`${day.date}: ${day.count} cadastro(s)`}
                      />
                      {i % 5 === 0 && (
                        <span className="text-[9px] text-muted-foreground mt-1 rotate-[-45deg] origin-top-left whitespace-nowrap">
                          {dateStr}
                        </span>
                      )}
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-foreground text-background text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-10">
                        {day.count} cadastro(s)
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Total: {metrics.signupsPerDay.reduce((s, d) => s + d.count, 0)} novos restaurantes nos últimos 30 dias
            </p>
          </CardContent>
        </Card>
      )}

      {/* Top customers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Top 10 clientes por receita (90d)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.topCustomers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum pagamento aprovado nos últimos 90 dias.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 text-left">#</th>
                    <th className="py-2 text-left">Restaurante</th>
                    <th className="py-2 text-left">Status</th>
                    <th className="py-2 text-right">Pagamentos</th>
                    <th className="py-2 text-right">Receita</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {metrics.topCustomers.map((c, i) => (
                    <tr key={c.restaurantId || i} className="border-b last:border-b-0">
                      <td className="py-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-2 font-medium">{c.name}</td>
                      <td className="py-2">
                        <Badge variant={subStatusVariant(c.subscriptionStatus)}>
                          {c.subscriptionStatus || '—'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums">{c.paymentCount}</td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        {formatCurrency(c.totalRevenueCents)}
                      </td>
                      <td className="py-2 text-right">
                        {c.restaurantId && (
                          <Link
                            href={`/admin/customers/${c.restaurantId}`}
                            className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1"
                          >
                            <span>Detalhes</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent = 'slate',
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: 'blue' | 'emerald' | 'indigo' | 'violet' | 'amber' | 'rose' | 'slate';
}) {
  const accentMap: Record<string, string> = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    indigo: 'text-indigo-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    slate: 'text-slate-700',
  };
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-2xl font-bold tabular-nums ${accentMap[accent]}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function subStatusVariant(s: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (s) {
    case 'ACTIVE':
    case 'active':
      return 'default';
    case 'TRIAL':
    case 'trialing':
      return 'secondary';
    case 'SUSPENDED':
    case 'past_due':
    case 'CANCELLED':
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}
