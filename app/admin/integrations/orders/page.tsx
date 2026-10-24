// @ts-nocheck
// Feature #1: Painel Unificado de Pedidos Delivery
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';
import {
  RefreshCw, Check, X, ChefHat, Bike, Package, Clock,
  Bell, BellOff, Filter, AlertCircle, Search, Volume2, VolumeX,
  ArrowRight, Phone, MapPin, FileText
} from 'lucide-react';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'REJECTED';

interface ExternalOrder {
  id: string;
  externalOrderId: string;
  status: OrderStatus;
  totalAmount: number;
  deliveryFee: number;
  platformFee: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deliveryAddress: string;
  items: string;
  specialInstructions?: string;
  orderReceivedAt: string;
  estimatedDeliveryTime?: string;
  integration: {
    platform: string;
    storeName?: string;
  };
  /** The Gastrux order API key that sent it (plan 2026-10-23 api-de-pedidos) */
  apiKeyName?: string | null;
  /** iFood (plan 2026-10-24 ifood): displayId is the number the customer sees; a dispute is a cancel request to answer */
  platformData?: { displayId?: string } | null;
  disputeId?: string | null;
  disputeExpiresAt?: string | null;
}

/** The iFood reason picker: refusing a new order or cancelling an accepted one */
interface ReasonPick {
  order: ExternalOrder;
  mode: 'reject' | 'cancel';
  reasons: Array<{ cancelCodeId: string; description: string }> | null;
  code: string;
  text: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string; icon: any }> = {
  PENDING: { label: 'Novo Pedido', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: Bell },
  CONFIRMED: { label: 'Confirmado', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Check },
  PREPARING: { label: 'Preparando', color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', icon: ChefHat },
  READY: { label: 'Pronto', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: Package },
  PICKED_UP: { label: 'Em Entrega', color: 'text-cyan-700', bg: 'bg-cyan-50 border-cyan-200', icon: Bike },
  DELIVERED: { label: 'Entregue', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: Check },
  CANCELLED: { label: 'Cancelado', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: X },
  REJECTED: { label: 'Rejeitado', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: X },
};

// Only what works today (plan 2026-10-23 api-de-pedidos; iFood plan 2026-10-24). Keeta and 99Food come with part 2
const PLATFORM_CONFIG: Record<string, { label: string; color: string; logo: string }> = {
  delivery_site: { label: 'Cardápio digital', color: 'bg-orange-600', logo: '🛒' },
  gastrux_api: { label: 'API do Gastrux', color: 'bg-slate-700', logo: '🔗' },
  ifood: { label: 'iFood', color: 'bg-red-600', logo: '🍔' },
};

const isIfood = (o: ExternalOrder) => o.integration.platform === 'ifood';
const orderCode = (o: ExternalOrder) => (isIfood(o) && o.platformData?.displayId ? o.platformData.displayId : o.externalOrderId);

const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP'];
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'PICKED_UP',
  PICKED_UP: 'DELIVERED',
};

export default function DeliveryOrdersPage() {
  const [orders, setOrders] = useState<ExternalOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'active' | 'all' | OrderStatus>('active');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [autoAccept, setAutoAccept] = useState<boolean | null>(null);
  const [canChangeSettings, setCanChangeSettings] = useState(false);
  const prevOrderCountRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sound notification
  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkpOOh3x1c3V8hoyQj4Z9dXJzdXyEi5GPi4J6c3F0eICIjpCMhHt0cnR4gIiOkIyEe3RydHiAiI6QjIR7dHJ0eICIjpCMhHt0cnR4gIiOkIyEe3RydHiAiI6QjIR7dHJ0eICIjpCMhHt0cnR4gIiOkIyEe3RydHh/');
  }, []);

  const playNotificationSound = useCallback(() => {
    if (soundEnabled && audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [soundEnabled]);

  const fetchOrders = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const res = await fetch('/api/admin/integrations/orders?limit=100');
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      const fetched = data.orders || [];
      setAutoAccept(data.autoAccept !== false);
      setCanChangeSettings(!!data.canChangeSettings);
      // New order notification
      const pendingCount = fetched.filter((o: ExternalOrder) => o.status === 'PENDING').length;
      if (pendingCount > prevOrderCountRef.current && prevOrderCountRef.current > 0) {
        playNotificationSound();
        toast.success('🔔 Novo pedido recebido!', { duration: 5000 });
      }
      prevOrderCountRef.current = pendingCount;
      setOrders(fetched);
    } catch {
      if (showLoader) toast.error('Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }, [playNotificationSound]);

  useEffect(() => { fetchOrders(true); }, [fetchOrders]);

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchOrders(false), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchOrders]);

  const [reasonPick, setReasonPick] = useState<ReasonPick | null>(null);

  const send = async (orderId: string, payload: Record<string, unknown>, done: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/integrations/orders/${orderId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível atualizar o pedido'); return false; }
      toast.success(done);
      fetchOrders(false);
      return true;
    } catch {
      toast.error('Sem conexão: tente de novo');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  // iFood takes a refusal or a cancel only with one of its reasons (plan 2026-10-24 ifood)
  const openReasons = async (order: ExternalOrder, mode: 'reject' | 'cancel') => {
    setReasonPick({ order, mode, reasons: null, code: '', text: '' });
    const res = await fetch(`/api/admin/integrations/orders/${order.id}/cancel-reasons`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || 'O iFood não mandou os motivos'); setReasonPick(null); return; }
    setReasonPick((p) => (p && p.order.id === order.id ? { ...p, reasons: body.reasons } : p));
  };

  const confirmReason = async () => {
    if (!reasonPick) return;
    const { order, mode, code, reasons } = reasonPick;
    const text = reasonPick.text.trim() || reasons?.find((r) => r.cancelCodeId === code)?.description || '';
    const ok = await send(order.id, { action: mode, cancelCode: code, reason: text }, mode === 'reject' ? 'Pedido recusado no iFood' : 'Cancelamento enviado ao iFood');
    if (ok) setReasonPick(null);
  };

  // Accept creates the kitchen order; reject needs a reason (plan 2026-10-23 api-de-pedidos)
  const act = async (orderId: string, action: 'accept' | 'reject') => {
    const order = orders.find((o) => o.id === orderId);
    if (action === 'reject' && order && isIfood(order)) { openReasons(order, 'reject'); return; }
    let reason: string | null = null;
    if (action === 'reject') {
      reason = window.prompt('Por que recusar este pedido? (o cliente ou o sistema de origem fica sabendo que foi cancelado)');
      if (reason === null) return;
    }
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/integrations/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível atualizar o pedido'); return; }
      toast.success(action === 'accept' ? 'Pedido aceito: foi para a cozinha' : 'Pedido recusado');
      fetchOrders(false);
    } catch {
      toast.error('Sem conexão: tente de novo');
    } finally {
      setUpdatingId(null);
    }
  };

  const saveAutoAccept = async (value: boolean) => {
    const res = await fetch('/api/admin/delivery-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ autoAccept: value }) });
    if (!res.ok) { toast.error('Não foi possível salvar o ajuste'); return; }
    setAutoAccept(value);
    toast.success(value ? 'Os pedidos vão direto para a cozinha' : 'Cada pedido espera o "Aceitar"');
  };

  const updateStatus = async (orderId: string, newStatus: OrderStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/integrations/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); toast.error(body.error || 'Erro ao atualizar pedido'); return; }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
      toast.success(`Pedido atualizado para: ${STATUS_CONFIG[newStatus].label}`);
    } catch {
      toast.error('Erro ao atualizar pedido');
    } finally {
      setUpdatingId(null);
    }
  };

  const parseItems = (itemsStr: string) => {
    try { return JSON.parse(itemsStr); } catch { return []; }
  };

  const timeSince = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
  };

  // Filter orders
  const filteredOrders = orders.filter(o => {
    if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(o.status)) return false;
    if (statusFilter !== 'active' && statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (platformFilter !== 'all' && o.integration.platform !== platformFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return o.customerName.toLowerCase().includes(q)
        || o.externalOrderId.toLowerCase().includes(q)
        || o.deliveryAddress.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    // Pending first, then by date
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (b.status === 'PENDING' && a.status !== 'PENDING') return 1;
    return new Date(b.orderReceivedAt).getTime() - new Date(a.orderReceivedAt).getTime();
  });

  const stats = {
    pending: orders.filter(o => o.status === 'PENDING').length,
    preparing: orders.filter(o => o.status === 'CONFIRMED' || o.status === 'PREPARING').length,
    ready: orders.filter(o => o.status === 'READY').length,
    delivering: orders.filter(o => o.status === 'PICKED_UP').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <BackButton href="/dashboard" />
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Pedidos de delivery</h1>
              <p className="text-sm text-muted-foreground">Pedidos do cardápio digital e dos sistemas ligados pela API de pedidos</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setSoundEnabled(!soundEnabled)}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'border-green-500 text-green-600' : ''}>
              <RefreshCw className={`h-4 w-4 mr-1 ${autoRefresh ? 'animate-spin' : ''}`} style={autoRefresh ? { animationDuration: '3s' } : {}} />
              {autoRefresh ? 'Auto' : 'Manual'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => fetchOrders(true)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {autoAccept !== null && (
          <Card className="p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm">
              <p className="font-medium">Aceitar pedidos sozinho</p>
              <p className="text-muted-foreground">{autoAccept ? 'O pedido vai direto para a cozinha.' : 'Cada pedido toca o alarme e espera o "Aceitar".'} Os pedidos do cardápio digital vão sempre direto.</p>
            </div>
            {canChangeSettings ? (
              <Button size="sm" variant={autoAccept ? 'default' : 'outline'} onClick={() => saveAutoAccept(!autoAccept)}>{autoAccept ? 'Ligado' : 'Desligado'}</Button>
            ) : (
              <span className="text-sm font-medium">{autoAccept ? 'Ligado' : 'Desligado'}</span>
            )}
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className={`p-3 border-l-4 border-l-amber-500 ${stats.pending > 0 ? 'animate-pulse' : ''}`}>
            <div className="text-xs text-muted-foreground">Novos</div>
            <div className="text-2xl font-bold text-amber-600">{stats.pending}</div>
          </Card>
          <Card className="p-3 border-l-4 border-l-purple-500">
            <div className="text-xs text-muted-foreground">Preparando</div>
            <div className="text-2xl font-bold text-purple-600">{stats.preparing}</div>
          </Card>
          <Card className="p-3 border-l-4 border-l-green-500">
            <div className="text-xs text-muted-foreground">Prontos</div>
            <div className="text-2xl font-bold text-green-600">{stats.ready}</div>
          </Card>
          <Card className="p-3 border-l-4 border-l-cyan-500">
            <div className="text-xs text-muted-foreground">Em Entrega</div>
            <div className="text-2xl font-bold text-cyan-600">{stats.delivering}</div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por cliente, pedido ou endereço..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
          >
            <option value="active">Ativos</option>
            <option value="all">Todos</option>
            <option value="PENDING">Novos</option>
            <option value="CONFIRMED">Confirmados</option>
            <option value="PREPARING">Preparando</option>
            <option value="READY">Prontos</option>
            <option value="DELIVERED">Entregues</option>
            <option value="CANCELLED">Cancelados</option>
          </select>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
          >
            <option value="all">Todas Plataformas</option>
            <option value="delivery_site">🛒 Cardápio digital</option>
            <option value="gastrux_api">🔗 API do Gastrux</option>
            <option value="ifood">🍔 iFood</option>
          </select>
        </div>

        {/* Orders List */}
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <Card key={i} className="h-32 animate-pulse bg-gray-100" />)}
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">Nenhum pedido encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter === 'active' ? 'Não há pedidos ativos no momento.' : 'Nenhum pedido corresponde aos filtros.'}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredOrders.map(order => {
              const statusCfg = STATUS_CONFIG[order.status];
              const platCfg = PLATFORM_CONFIG[order.integration.platform] || { label: order.integration.platform, color: 'bg-gray-500', logo: '⚪' };
              const items = parseItems(order.items);
              const isExpanded = expandedId === order.id;
              const nextStatus = NEXT_STATUS[order.status];
              const isUpdating = updatingId === order.id;
              const StatusIcon = statusCfg.icon;

              return (
                <Card
                  key={order.id}
                  className={`border transition-all ${statusCfg.bg} ${order.status === 'PENDING' ? 'ring-2 ring-amber-400 shadow-lg' : ''}`}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : order.id)}
                  >
                    {/* Order Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${platCfg.color} text-white`}>
                            {platCfg.logo} {platCfg.label}{order.apiKeyName ? `: ${order.apiKeyName}` : ''}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusCfg.bg} ${statusCfg.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusCfg.label}
                          </span>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeSince(order.orderReceivedAt)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="font-bold text-sm truncate max-w-[16rem]" title={order.externalOrderId}>#{orderCode(order)}</span>
                          <span className="text-sm">{order.customerName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 truncate">
                          {items.length > 0
                            ? items.map((i: any) => `${i.quantity || 1}x ${i.name || i.productName || 'Item'}`).join(', ')
                            : 'Itens não disponíveis'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold">{formatBRL(order.totalAmount)}</div>
                        {order.deliveryFee > 0 && (
                          <div className="text-xs text-muted-foreground">Entrega: {formatBRL(order.deliveryFee)}</div>
                        )}
                      </div>
                    </div>

                    {/* Quick Actions (always visible for PENDING) */}
                    {order.status === 'PENDING' && (
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          disabled={isUpdating}
                          onClick={(e) => { e.stopPropagation(); act(order.id, 'accept'); }}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Aceitar
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isUpdating}
                          onClick={(e) => { e.stopPropagation(); act(order.id, 'reject'); }}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Recusar
                        </Button>
                      </div>
                    )}

                    {/* iFood: the customer asked to cancel; the answer goes back to iFood */}
                    {order.disputeId && (
                      <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm space-y-2" onClick={(e) => e.stopPropagation()}>
                        <p className="font-medium text-red-800 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" /> O cliente pediu para cancelar este pedido
                          {order.disputeExpiresAt ? ` (responda até ${new Date(order.disputeExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={isUpdating} onClick={() => send(order.id, { action: 'dispute-accept' }, 'Cancelamento aceito: o iFood cancela o pedido')}>
                            Aceitar o cancelamento
                          </Button>
                          <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => send(order.id, { action: 'dispute-reject' }, 'Pedido mantido')}>
                            Manter o pedido
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t px-4 pb-4 pt-3 space-y-3">
                      {/* Items Detail */}
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                          <FileText className="h-4 w-4" /> Itens do Pedido
                        </h4>
                        <div className="space-y-1">
                          {items.length > 0 ? items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span>{item.quantity || 1}x {item.name || item.productName || 'Item'}</span>
                              <span className="text-muted-foreground">{item.price ? formatBRL(item.price * (item.quantity || 1)) : ''}</span>
                            </div>
                          )) : <p className="text-sm text-muted-foreground">Dados dos itens não disponíveis</p>}
                        </div>
                      </div>

                      {/* Customer & Address */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <h4 className="text-sm font-semibold mb-1">Cliente</h4>
                          <p className="text-sm">{order.customerName}</p>
                          {order.customerPhone && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {order.customerPhone}
                            </p>
                          )}
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold mb-1 flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Endereço
                          </h4>
                          <p className="text-sm">{order.deliveryAddress || 'Não informado'}</p>
                        </div>
                      </div>

                      {order.specialInstructions && (
                        <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm">
                          <strong>Observações:</strong> {order.specialInstructions}
                        </div>
                      )}

                      {/* Pricing */}
                      <div className="flex gap-4 text-sm">
                        <span>Subtotal: <strong>{formatBRL(order.totalAmount - order.deliveryFee)}</strong></span>
                        {order.deliveryFee > 0 && <span>Entrega: <strong>{formatBRL(order.deliveryFee)}</strong></span>}
                        {order.platformFee > 0 && <span>Taxa plataforma: <strong>{formatBRL(order.platformFee)}</strong></span>}
                      </div>

                      {/* Status Actions */}
                      {nextStatus && order.status !== 'PENDING' && (
                        <Button
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => updateStatus(order.id, nextStatus)}
                          className="w-full"
                        >
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Avançar para: {STATUS_CONFIG[nextStatus].label}
                        </Button>
                      )}

                      {['CONFIRMED', 'PREPARING', 'READY'].includes(order.status) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isUpdating}
                          onClick={() => (isIfood(order) ? openReasons(order, 'cancel') : updateStatus(order.id, 'CANCELLED'))}
                          className="w-full"
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancelar Pedido
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {reasonPick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setReasonPick(null)}>
          <Card className="w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium">
              {reasonPick.mode === 'reject' ? 'Recusar' : 'Cancelar'} o pedido iFood #{orderCode(reasonPick.order)}
            </p>
            {reasonPick.reasons === null ? (
              <p className="text-sm text-muted-foreground">Buscando os motivos do iFood…</p>
            ) : (
              <>
                <label className="text-sm font-medium block">Motivo (lista do iFood)</label>
                <select
                  value={reasonPick.code}
                  onChange={(e) => setReasonPick({ ...reasonPick, code: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
                >
                  <option value="">Escolha…</option>
                  {reasonPick.reasons.map((r) => <option key={r.cancelCodeId} value={r.cancelCodeId}>{r.description}</option>)}
                </select>
                <input
                  value={reasonPick.text}
                  maxLength={200}
                  placeholder="Detalhe (opcional)"
                  onChange={(e) => setReasonPick({ ...reasonPick, text: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
                />
                {reasonPick.mode === 'cancel' && (
                  <p className="text-xs text-muted-foreground">A cozinha cancela o pedido quando o iFood confirmar o cancelamento.</p>
                )}
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setReasonPick(null)}>Voltar</Button>
              <Button size="sm" variant="destructive" disabled={!reasonPick.code || updatingId === reasonPick.order.id} onClick={confirmReason}>
                {reasonPick.mode === 'reject' ? 'Recusar no iFood' : 'Cancelar no iFood'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
