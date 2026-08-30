// @ts-nocheck
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  AlertTriangle,
  AlertCircle,
  ShieldAlert,
  XCircle,
  CheckCircle,
  Bell,
  Filter,
  RefreshCw,
  Loader2,
  Eye,
  Trash2,
  Clock,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface PaymentAlert {
  id: string;
  alertType:
    | 'chargeback'
    | 'failure'
    | 'refund'
    | 'dispute'
    | 'settlement_delay'
    | 'approved'
    | 'pending';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  paymentId: string | null;
  gateway: string | null;
  amount: number;
  createdAt: string;
  read: boolean;
}

export default function AlertasPage() {
  const [alerts, setAlerts] = useState<PaymentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'critical'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [streamStatus, setStreamStatus] = useState<
    'connecting' | 'connected' | 'disconnected'
  >('connecting');
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- Load initial data from REST endpoint ---
  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/pagamentos/alertas?limit=100');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      console.error('[Alertas] Failed to load:', err);
      toast.error('Não foi possível carregar os alertas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // --- Subscribe to real-time SSE stream ---
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let closed = false;
    const connect = () => {
      setStreamStatus('connecting');
      const es = new EventSource('/api/pagamentos/alertas/stream');
      eventSourceRef.current = es;

      es.addEventListener('hello', () => {
        setStreamStatus('connected');
      });

      es.addEventListener('ping', () => {
        setStreamStatus('connected');
      });

      es.addEventListener('alert', (evt: MessageEvent) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.type === 'alert.created') {
            setAlerts((prev) => {
              // Prevent duplicates
              if (prev.some((a) => a.id === data.payload.id)) return prev;
              return [data.payload, ...prev];
            });
            // Subtle notification toast for new alerts
            const sev = data.payload.severity;
            if (sev === 'critical' || sev === 'high') {
              toast.error(`${data.payload.title}`, {
                description: data.payload.message,
              });
            } else {
              toast(`${data.payload.title}`, {
                description: data.payload.message,
              });
            }
          } else if (data.type === 'alert.read') {
            setAlerts((prev) =>
              prev.map((a) =>
                a.id === data.payload.id ? { ...a, read: true } : a
              )
            );
          } else if (data.type === 'alert.deleted') {
            setAlerts((prev) => prev.filter((a) => a.id !== data.payload.id));
          }
        } catch (err) {
          console.warn('[Alertas SSE] Malformed event:', err);
        }
      });

      es.onerror = () => {
        if (closed) return;
        setStreamStatus('disconnected');
        es.close();
        // Reconnect with backoff
        setTimeout(() => {
          if (!closed) connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  const filteredAlerts = alerts.filter((alert) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'unread' && !alert.read) ||
      (filter === 'critical' && alert.severity === 'critical');
    const matchesType = typeFilter === 'all' || alert.alertType === typeFilter;
    return matchesFilter && matchesType;
  });

  const markAsRead = async (id: string) => {
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, read: true } : a))
    );
    try {
      const res = await fetch(`/api/pagamentos/alertas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      if (!res.ok) throw new Error();
      toast.success('Alerta marcado como lido');
    } catch {
      // Rollback
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, read: false } : a))
      );
      toast.error('Falha ao marcar como lido');
    }
  };

  const dismissAlert = async (id: string) => {
    const prev = alerts;
    setAlerts((s) => s.filter((a) => a.id !== id));
    try {
      const res = await fetch(`/api/pagamentos/alertas/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      toast.success('Alerta dispensado');
    } catch {
      setAlerts(prev);
      toast.error('Falha ao dispensar alerta');
    }
  };

  const markAllAsRead = async () => {
    const unread = alerts.filter((a) => !a.read);
    if (unread.length === 0) return;
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
    try {
      await Promise.all(
        unread.map((a) =>
          fetch(`/api/pagamentos/alertas/${a.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ read: true }),
          })
        )
      );
      toast.success(`${unread.length} alerta(s) marcado(s) como lido(s)`);
    } catch {
      toast.error('Falha ao marcar todos como lidos');
      fetchAlerts();
    }
  };

  const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value || 0);

  const severityConfig = {
    critical: {
      icon: ShieldAlert,
      color: 'text-red-600',
      bg: 'bg-red-50',
      border: 'border-red-200',
      label: 'Crítico',
    },
    high: {
      icon: AlertTriangle,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      label: 'Alto',
    },
    medium: {
      icon: AlertCircle,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      label: 'Médio',
    },
    low: {
      icon: Bell,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      label: 'Baixo',
    },
  };

  const typeConfig: Record<string, { label: string; icon: any }> = {
    chargeback: { label: 'Chargeback', icon: XCircle },
    failure: { label: 'Falha', icon: XCircle },
    refund: { label: 'Reembolso', icon: RefreshCw },
    dispute: { label: 'Disputa', icon: ShieldAlert },
    settlement_delay: { label: 'Atraso', icon: Clock },
    approved: { label: 'Aprovado', icon: CheckCircle },
    pending: { label: 'Pendente', icon: Clock },
  };

  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard/pagamentos" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                Alertas de Pagamento
              </h1>
              <p className="text-sm text-gray-500">
                Monitore chargebacks, falhas e disputas em tempo real
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Live connection indicator */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                streamStatus === 'connected'
                  ? 'bg-green-100 text-green-700'
                  : streamStatus === 'connecting'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-600'
              }`}
              title="Status da conexão em tempo real"
            >
              {streamStatus === 'connected' ? (
                <>
                  <Wifi className="h-3 w-3" /> Ao vivo
                </>
              ) : streamStatus === 'connecting' ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" /> Conectando
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> Offline
                </>
              )}
            </span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                {unreadCount} não lidos
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Marcar todos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAlerts}
              disabled={loading}
              aria-label="Recarregar alertas"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <Filter className="h-4 w-4" />
              Filtros:
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={filter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('all')}
              >
                Todos
              </Button>
              <Button
                variant={filter === 'unread' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('unread')}
              >
                Não Lidos
              </Button>
              <Button
                variant={filter === 'critical' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter('critical')}
                className={
                  filter === 'critical' ? 'bg-red-600 hover:bg-red-700' : ''
                }
              >
                Críticos
              </Button>
            </div>
            <div className="sm:ml-auto">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                aria-label="Filtrar por tipo"
              >
                <option value="all">Todos os tipos</option>
                <option value="chargeback">Chargeback</option>
                <option value="failure">Falha</option>
                <option value="refund">Reembolso</option>
                <option value="dispute">Disputa</option>
                <option value="settlement_delay">Atraso</option>
                <option value="approved">Aprovado</option>
                <option value="pending">Pendente</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Alerts List */}
        <div className="space-y-3">
          {loading ? (
            <Card className="p-8 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-gray-400" />
              <p className="mt-2 text-sm text-gray-500">Carregando alertas...</p>
            </Card>
          ) : filteredAlerts.length === 0 ? (
            <Card className="p-8 text-center">
              <Bell className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-2 text-gray-500">Nenhum alerta encontrado</p>
              <p className="mt-1 text-xs text-gray-400">
                Novos alertas aparecerão aqui automaticamente quando gerados.
              </p>
            </Card>
          ) : (
            filteredAlerts.map((alert) => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;
              const typeInfo = typeConfig[alert.alertType];
              const TypeIcon = typeInfo?.icon || AlertCircle;

              return (
                <Card
                  key={alert.id}
                  className={`p-4 transition-opacity ${
                    alert.read ? 'opacity-60' : ''
                  } ${config.border}`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.bg}`}
                    >
                      <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {alert.title}
                        </h3>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.color}`}
                        >
                          {config.label}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          <TypeIcon className="h-3 w-3" />
                          {typeInfo?.label || alert.alertType}
                        </span>
                        {!alert.read && (
                          <span
                            className="h-2 w-2 rounded-full bg-red-500"
                            aria-label="Não lido"
                          />
                        )}
                      </div>

                      <p className="mt-1 text-sm text-gray-600">
                        {alert.message}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                        {alert.paymentId && (
                          <span className="font-mono">
                            ID: {alert.paymentId}
                          </span>
                        )}
                        {alert.gateway && <span>{alert.gateway}</span>}
                        {alert.amount > 0 && (
                          <span className="font-semibold text-gray-700">
                            {formatBRL(alert.amount)}
                          </span>
                        )}
                        <span>
                          {new Date(alert.createdAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-1">
                      {!alert.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markAsRead(alert.id)}
                          className="h-8 w-8 p-0"
                          aria-label="Marcar como lido"
                        >
                          <Eye className="h-4 w-4 text-gray-400" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dismissAlert(alert.id)}
                        className="h-8 w-8 p-0"
                        aria-label="Dispensar alerta"
                      >
                        <Trash2 className="h-4 w-4 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
