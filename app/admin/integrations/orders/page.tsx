// @ts-nocheck
// Feature #1: Painel Unificado de Pedidos Delivery
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { StoreToggle } from '@/components/orders/store-toggle';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';
import { boardColumns, paymentHint } from '@/lib/delivery-orders/board';
import { acceptDeadline, countdown, newArrivals, pendingTitle } from '@/lib/delivery-orders/alert';
import { ringBell, soundReady, unlockSound } from '@/lib/delivery-orders/bell';
import {
  RefreshCw, Check, X, ChefHat, Bike, Package, Clock,
  Bell, BellOff, Filter, AlertCircle, Search, Volume2, VolumeX,
  ArrowRight, Phone, MapPin, FileText
} from 'lucide-react';

type OrderStatus = 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED' | 'REJECTED';

interface ExternalOrder {
  id: string;
  externalOrderId: string;
  /** Who took it out (spec 2026-10-26 acerto com o entregador) */
  driverName?: string | null;
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
  /**
   * iFood (plan 2026-10-24 ifood): displayId is the number the customer sees; a dispute is a cancel request to answer.
   * 99Food (plan 2026-11-09 99food): orderIndex is its number; a dispute is a cancel or a refund request (disputeKind).
   */
  platformData?: {
    displayId?: string;
    orderIndex?: number;
    deliveryType?: number;
    payType?: number;
    shopPaidMoney?: number | null;
    cashConfirmedAt?: string;
    disputeKind?: 'cancel' | 'refund';
    disputeReason?: string | null;
    disputeReasons?: Array<{ base_reason_id?: string | number; base_reason?: string }>;
  } | null;
  disputeId?: string | null;
  disputeExpiresAt?: string | null;
}

/** The iFood or 99Food reason picker: refusing a new order or cancelling an accepted one */
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

// Only what works today (plan 2026-10-23 api-de-pedidos; iFood plan 2026-10-24; 99Food plan 2026-11-09)
const PLATFORM_CONFIG: Record<string, { label: string; color: string; logo: string; text?: string }> = {
  delivery_site: { label: 'Cardápio digital', color: 'bg-orange-600', logo: '🛒' },
  gastrux_api: { label: 'API do Gastrux', color: 'bg-slate-700', logo: '🔗' },
  ifood: { label: 'iFood', color: 'bg-red-600', logo: '🍔' },
  ninety_nine_food: { label: '99Food', color: 'bg-yellow-400', logo: '🛵', text: 'text-gray-900' },
};

// The board columns in strong colors, readable from across the kitchen (2026-11-03)
const COLUMN_COLOR: Record<string, string> = { novos: 'bg-orange-600', preparo: 'bg-amber-500', prontos: 'bg-green-600', entrega: 'bg-cyan-600' };

const isIfood = (o: ExternalOrder) => o.integration.platform === 'ifood';
const isNinetynine = (o: ExternalOrder) => o.integration.platform === 'ninety_nine_food';
/** The platforms that cancel only with a reason of their own list and hear every change */
const isPlatform = (o: ExternalOrder) => isIfood(o) || isNinetynine(o);
const WORDS = {
  ifood: { name: 'iFood', the: 'o iFood', of: 'do iFood', on: 'no iFood', to: 'ao iFood', The: 'O iFood' },
  ninety_nine_food: { name: '99Food', the: 'a 99Food', of: 'da 99Food', on: 'na 99Food', to: 'à 99Food', The: 'A 99Food' },
};
const words = (o: ExternalOrder) => WORDS[o.integration.platform as keyof typeof WORDS] ?? WORDS.ifood;
const orderCode = (o: ExternalOrder) => {
  if (isIfood(o) && o.platformData?.displayId) return o.platformData.displayId;
  if (isNinetynine(o) && o.platformData?.orderIndex) return String(o.platformData.orderIndex);
  return o.externalOrderId;
};
/** 99Food asks for both on screen: its number and the order code */
const orderTitle = (o: ExternalOrder) => (isNinetynine(o) ? `99Food #${orderCode(o)}` : `#${orderCode(o)}`);
/** "Recebi o dinheiro": a cash order taken by 99Food's courier, accepted and not yet out */
const cashToConfirm = (o: ExternalOrder) =>
  isNinetynine(o) && o.platformData?.deliveryType === 1 && o.platformData?.payType === 2 && !o.platformData?.cashConfirmedAt
  && ['CONFIRMED', 'PREPARING', 'READY'].includes(o.status);
/** 99Food's "Outro motivo" goes only with a typed reason */
const NEEDS_TEXT = '1080';

const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'PICKED_UP'];
/** A customer's request still waiting for the answer: the order shows under "Ativos" even when delivered (99Food refunds) */
const openDispute = (o: ExternalOrder) => !!o.disputeId && (!o.disputeExpiresAt || new Date(o.disputeExpiresAt).getTime() > Date.now());
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
  // Lista or Quadro (por etapa), remembered on this device (2026-10-26)
  const [view, setView] = useState<'list' | 'board'>('list');
  useEffect(() => {
    try { if (localStorage.getItem('gx-delivery-view') === 'board') setView('board'); } catch {}
  }, []);
  const chooseView = (v: 'list' | 'board') => {
    setView(v);
    try { localStorage.setItem('gx-delivery-view', v); } catch {}
  };
  // The bell (2026-11-03): rings for every order that arrives and again every few seconds while one waits for
  // "Aceitar". The old beep rang once and only from the second waiting order on, so the first one was silent.
  const seenRef = useRef<Set<string> | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;
  useEffect(() => {
    try { if (localStorage.getItem('gx-delivery-sound') === 'off') setSoundEnabled(false); } catch {}
    // The browser lets the page play sound only after a touch on it
    const unlock = () => { unlockSound().then(setSoundOn); };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => { window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  }, []);
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try { localStorage.setItem('gx-delivery-sound', next ? 'on' : 'off'); } catch {}
    if (next) unlockSound().then((ok) => { setSoundOn(ok); if (ok) ringBell(); });
  };
  const playNotificationSound = useCallback(() => {
    if (soundEnabledRef.current) ringBell();
  }, []);
  // A clock for the "Expira em" of the iFood and 99Food orders
  const [now, setNow] = useState(() => new Date());

  const fetchOrders = useCallback(async (showLoader = false) => {
    try {
      if (showLoader) setLoading(true);
      const res = await fetch('/api/admin/integrations/orders?limit=100');
      if (!res.ok) throw new Error('Erro');
      const data = await res.json();
      const fetched = data.orders || [];
      setAutoAccept(data.autoAccept !== false);
      setCanChangeSettings(!!data.canChangeSettings);
      // Every order that arrives rings, accepted by itself or not (an iFood order is confirmed at once)
      const arrived = newArrivals(seenRef.current, fetched);
      seenRef.current = new Set([...(seenRef.current ?? []), ...fetched.map((o: ExternalOrder) => o.id)]);
      if (arrived.length > 0) {
        playNotificationSound();
        for (const o of arrived) {
          const plat = PLATFORM_CONFIG[o.integration.platform]?.label ?? o.integration.platform;
          toast.success(`🔔 Pedido novo #${orderCode(o)} (${plat})`, { duration: 8000 });
        }
      }
      setOrders(fetched);
    } catch {
      if (showLoader) toast.error('Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  }, [playNotificationSound]);

  useEffect(() => { fetchOrders(true); }, [fetchOrders]);

  const pendingCount = orders.filter((o) => o.status === 'PENDING').length;
  // While an order waits for "Aceitar": the bell again every 6 s, the count in the tab title and a clock for "Expira em"
  useEffect(() => {
    if (pendingCount === 0) return;
    const bell = setInterval(() => playNotificationSound(), 6000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(bell); clearInterval(clock); };
  }, [pendingCount, playNotificationSound]);
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) Pedidos? novos? · /, '');
    document.title = pendingTitle(base, pendingCount);
    return () => { document.title = base; };
  }, [pendingCount]);

  /** "Expira em 07:42" on an iFood or 99Food order waiting for "Aceitar" */
  const expiry = (order: ExternalOrder) => {
    const deadline = acceptDeadline(order);
    if (!deadline) return null;
    const c = countdown(deadline, now);
    return (
      <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold ${c.urgent ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-900'}`}>
        <Clock className="h-3 w-3" /> {c.over ? `Prazo ${words(order).of} acabou` : `Expira em ${c.label}`}
      </span>
    );
  };

  // Auto-refresh every 10s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchOrders(false), 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchOrders]);

  const [reasonPick, setReasonPick] = useState<ReasonPick | null>(null);
  // 99Food refund request: the reason (from 99Food's list) picked to refuse it, per order
  const [refusal, setRefusal] = useState<Record<string, string>>({});
  // "Saiu para entrega": who takes it, for the driver settlement in the Caixa (spec 2026-10-26)
  const [dispatch, setDispatch] = useState<{ order: ExternalOrder; driver: string } | null>(null);

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

  // iFood and 99Food take a refusal or a cancel only with one of their reasons (plan 2026-10-24 ifood, 2026-11-09 99food)
  const openReasons = async (order: ExternalOrder, mode: 'reject' | 'cancel') => {
    setReasonPick({ order, mode, reasons: null, code: '', text: '' });
    const res = await fetch(`/api/admin/integrations/orders/${order.id}/cancel-reasons`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || `${words(order).The} não mandou os motivos`); setReasonPick(null); return; }
    setReasonPick((p) => (p && p.order.id === order.id ? { ...p, reasons: body.reasons } : p));
  };

  const confirmReason = async () => {
    if (!reasonPick) return;
    const { order, mode, code, reasons } = reasonPick;
    const typed = reasonPick.text.trim();
    // 99Food's "Outro motivo" needs the typed reason: its label is not one
    const text = typed || (isNinetynine(order) && code === NEEDS_TEXT ? '' : reasons?.find((r) => r.cancelCodeId === code)?.description || '');
    const w = words(order);
    const ok = await send(order.id, { action: mode, cancelCode: code, reason: text }, mode === 'reject' ? `Pedido recusado ${w.on}` : `Cancelamento enviado ${w.to}`);
    if (ok) setReasonPick(null);
  };

  // "Recebi o dinheiro" (plan 2026-11-09 99food): the store got the cash from 99Food's courier
  const confirmCash = async (order: ExternalOrder) => {
    setUpdatingId(order.id);
    try {
      const res = await fetch(`/api/admin/integrations/orders/${order.id}/cash`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível confirmar o dinheiro'); return; }
      toast.success('Pagamento em dinheiro confirmado na 99Food');
      fetchOrders(false);
    } catch {
      toast.error('Sem conexão: tente de novo');
    } finally {
      setUpdatingId(null);
    }
  };

  // Accept creates the kitchen order; reject needs a reason (plan 2026-10-23 api-de-pedidos)
  const act = async (orderId: string, action: 'accept' | 'reject') => {
    const order = orders.find((o) => o.id === orderId);
    if (action === 'reject' && order && isPlatform(order)) { openReasons(order, 'reject'); return; }
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

  const updateStatus = async (orderId: string, newStatus: OrderStatus, driverName?: string) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`/api/admin/integrations/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(driverName === undefined ? { status: newStatus } : { status: newStatus, driverName }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); toast.error(body.error || 'Erro ao atualizar pedido'); return; }
      const driver = driverName === undefined ? {} : { driverName: driverName.trim() || null };
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus, ...driver } : o));
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
    if (statusFilter === 'active' && !ACTIVE_STATUSES.includes(o.status) && !openDispute(o)) return false;
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
            {/* Loja aberta/fechada (spec 2026-11-07 quadro-de-pedidos) */}
            <StoreToggle />
            <Button variant="outline" size="sm" onClick={toggleSound} aria-label={soundEnabled ? 'Desligar o som dos pedidos' : 'Ligar o som dos pedidos'}>
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              <span className="ml-1">{soundEnabled ? 'Som ligado' : 'Som desligado'}</span>
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

        {soundEnabled && !soundOn && (
          <button
            type="button"
            onClick={() => unlockSound().then((ok) => { setSoundOn(ok); if (ok) ringBell(); })}
            className="w-full rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 p-3 text-left text-sm text-amber-900"
          >
            <Bell className="inline h-4 w-4 mr-1" />
            <strong>Toque aqui para ligar o sino dos pedidos.</strong> O navegador só deixa tocar som depois de um toque na tela. Deixe esta tela aberta durante o expediente.
          </button>
        )}

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => { setStatusFilter('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="sticky top-2 z-40 w-full rounded-lg bg-amber-500 px-4 py-3 text-left text-white shadow-lg animate-pulse"
          >
            <span className="text-lg font-bold">
              <Bell className="inline h-5 w-5 mr-2" />
              {pendingCount === 1 ? '1 pedido esperando o "Aceitar"' : `${pendingCount} pedidos esperando o "Aceitar"`}
            </span>
            {orders.some((o) => isIfood(o) && acceptDeadline(o)) && <span className="block text-sm">Pedido do iFood sem resposta é cancelado pelo iFood em 8 minutos.</span>}
            {orders.some((o) => isNinetynine(o) && acceptDeadline(o)) && <span className="block text-sm">Pedido da 99Food sem resposta é cancelado pela 99Food em 5 minutos.</span>}
          </button>
        )}

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
          <div className="inline-flex rounded-md border bg-white dark:bg-gray-800 p-0.5 self-start" role="group" aria-label="Ver como">
            <button type="button" className={`px-3 py-1.5 text-sm rounded ${view === 'list' ? 'bg-gray-900 text-white' : ''}`} aria-pressed={view === 'list'} onClick={() => chooseView('list')}>Lista</button>
            <button type="button" className={`px-3 py-1.5 text-sm rounded ${view === 'board' ? 'bg-gray-900 text-white' : ''}`} aria-pressed={view === 'board'} onClick={() => chooseView('board')}>Quadro</button>
          </div>
          {view === 'list' && <select
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
          </select>}
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
          >
            <option value="all">Todas Plataformas</option>
            <option value="delivery_site">🛒 Cardápio digital</option>
            <option value="gastrux_api">🔗 API do Gastrux</option>
            <option value="ifood">🍔 iFood</option>
            <option value="ninety_nine_food">🛵 99Food</option>
          </select>
        </div>

        {/* Board: the active orders by stage, the one waiting longest on top */}
        {view === 'board' && !loading ? (
          <div className="flex gap-3 overflow-x-auto pb-2 snap-x lg:grid lg:grid-cols-4 lg:overflow-visible">
            {boardColumns(orders.filter(o => {
              if (platformFilter !== 'all' && o.integration.platform !== platformFilter) return false;
              if (!searchQuery) return true;
              const q = searchQuery.toLowerCase();
              return o.customerName.toLowerCase().includes(q) || o.externalOrderId.toLowerCase().includes(q) || o.deliveryAddress.toLowerCase().includes(q);
            })).map((col) => (
              <section key={col.key} aria-label={col.label} className="snap-start shrink-0 w-[80vw] sm:w-72 lg:w-auto rounded-lg bg-gray-100 dark:bg-gray-800 p-2 space-y-2">
                <h2 className={`text-base font-bold px-3 py-2 rounded-md text-white flex items-center justify-between ${COLUMN_COLOR[col.key] ?? 'bg-gray-600'}`}>
                  {col.label} <span className="text-lg">{col.orders.length}</span>
                </h2>
                {col.orders.length === 0 && <p className="text-xs text-muted-foreground px-1 py-4 text-center">Nada aqui</p>}
                {col.orders.map((order) => {
                  const platCfg = PLATFORM_CONFIG[order.integration.platform] || { label: order.integration.platform, color: 'bg-gray-500', logo: '⚪' };
                  const nextStatus = NEXT_STATUS[order.status];
                  const isUpdating = updatingId === order.id;
                  const items = parseItems(order.items);
                  const pay = paymentHint(order);
                  return (
                    <Card key={order.id} className={`p-3 space-y-1.5 ${order.status === 'PENDING' ? 'ring-2 ring-amber-400' : ''}`}>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span title={isNinetynine(order) ? `Código ${order.externalOrderId}` : platCfg.label}>{platCfg.logo} <span className="font-bold text-sm">{orderTitle(order)}</span></span>
                        <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{timeSince(order.orderReceivedAt)}</span>
                      </div>
                      {expiry(order)}
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{order.customerName}</span>
                        <span className="font-semibold shrink-0">{formatBRL(order.totalAmount)}</span>
                      </div>
                      {items.length > 0 && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{items.map((i: any) => `${i.quantity || 1}x ${i.name || i.productName || 'Item'}`).join(', ')}</p>
                      )}
                      {(pay || order.driverName) && (
                        <p className="text-xs">{pay}{pay && order.driverName ? ' · ' : ''}{order.driverName ? `Entregador: ${order.driverName}` : ''}</p>
                      )}
                      {order.status === 'PENDING' ? (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white" disabled={isUpdating} onClick={() => act(order.id, 'accept')}>Aceitar</Button>
                          <Button size="sm" variant="outline" className="text-red-600" disabled={isUpdating} onClick={() => act(order.id, 'reject')}>Recusar</Button>
                        </div>
                      ) : nextStatus ? (
                        <Button
                          size="sm"
                          className="w-full"
                          disabled={isUpdating}
                          onClick={() => (nextStatus === 'PICKED_UP' ? setDispatch({ order, driver: order.driverName ?? '' }) : updateStatus(order.id, nextStatus))}
                        >
                          <ArrowRight className="h-4 w-4 mr-1" /> {STATUS_CONFIG[nextStatus].label}
                        </Button>
                      ) : null}
                    </Card>
                  );
                })}
              </section>
            ))}
          </div>
        ) : loading ? (
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
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${platCfg.color} ${platCfg.text ?? 'text-white'}`}>
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
                          {expiry(order)}
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="font-bold text-sm truncate max-w-[16rem]" title={order.externalOrderId}>{orderTitle(order)}</span>
                          <span className="text-sm">{order.customerName}</span>
                        </div>
                        {isNinetynine(order) && <div className="text-xs text-muted-foreground">Código {order.externalOrderId}</div>}
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

                    {/* iFood or 99Food: the customer asked to cancel; the answer goes back to the platform */}
                    {order.disputeId && order.platformData?.disputeKind !== 'refund' && (
                      <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm space-y-2" onClick={(e) => e.stopPropagation()}>
                        <p className="font-medium text-red-800 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" /> O cliente pediu para cancelar este pedido
                          {order.disputeExpiresAt ? ` (responda até ${new Date(order.disputeExpiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})` : ''}
                        </p>
                        {order.platformData?.disputeReason && <p className="text-red-800">Motivo do cliente: {order.platformData.disputeReason}</p>}
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={isUpdating} onClick={() => send(order.id, { action: 'dispute-accept' }, `Cancelamento aceito: ${words(order).the} cancela o pedido`)}>
                            Aceitar o cancelamento
                          </Button>
                          <Button size="sm" variant="outline" disabled={isUpdating} onClick={() => send(order.id, { action: 'dispute-reject' }, 'Pedido mantido')}>
                            Manter o pedido
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 99Food: the customer asked for money back; refusing needs one of 99Food's reasons */}
                    {order.disputeId && order.platformData?.disputeKind === 'refund' && (
                      <div className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm space-y-2" onClick={(e) => e.stopPropagation()}>
                        <p className="font-medium text-red-800 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" /> Pedido de devolução
                          {order.disputeExpiresAt ? ` (responda até ${new Date(order.disputeExpiresAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})` : ''}
                        </p>
                        {order.platformData?.disputeReason && <p className="text-red-800">Motivo do cliente: {order.platformData.disputeReason}</p>}
                        <select
                          aria-label="Motivo da recusa"
                          value={refusal[order.id] ?? ''}
                          onChange={(e) => setRefusal({ ...refusal, [order.id]: e.target.value })}
                          className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
                        >
                          <option value="">Motivo para recusar (lista da 99Food)…</option>
                          {(order.platformData?.disputeReasons ?? []).filter((r) => r?.base_reason_id != null).map((r) => (
                            <option key={String(r.base_reason_id)} value={String(r.base_reason_id)}>{r.base_reason}</option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <Button size="sm" variant="destructive" disabled={isUpdating} onClick={() => send(order.id, { action: 'dispute-accept' }, 'Devolução aceita')}>
                            Aceitar a devolução
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isUpdating || !refusal[order.id]}
                            onClick={() => send(order.id, { action: 'dispute-reject', baseReasonId: refusal[order.id] }, 'Devolução recusada')}
                          >
                            Recusar a devolução
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 99Food courier pays the store in cash: 99Food asks the store to confirm it */}
                    {cashToConfirm(order) && (
                      <div className="mt-3 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm flex items-center justify-between gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                        <span>
                          {order.platformData?.shopPaidMoney != null
                            ? <>Receber <strong>{formatBRL(order.platformData.shopPaidMoney)}</strong> do entregador</>
                            : 'Dinheiro: a 99Food informa o valor quando o entregador for designado'}
                        </span>
                        <Button size="sm" disabled={isUpdating} onClick={() => confirmCash(order)}>Recebi o dinheiro</Button>
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
                        {order.driverName && <span>Entregador: <strong>{order.driverName}</strong></span>}
                      </div>

                      {/* Status Actions */}
                      {nextStatus && order.status !== 'PENDING' && (
                        <Button
                          size="sm"
                          disabled={isUpdating}
                          onClick={() => (nextStatus === 'PICKED_UP' ? setDispatch({ order, driver: order.driverName ?? '' }) : updateStatus(order.id, nextStatus))}
                          className="w-full"
                        >
                          <ArrowRight className="h-4 w-4 mr-1" />
                          Avançar para: {STATUS_CONFIG[nextStatus].label}
                        </Button>
                      )}

                      {['CONFIRMED', 'PREPARING', 'READY'].includes(order.status) && (!isPlatform(order) || canChangeSettings) && (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={isUpdating}
                          onClick={() => (isPlatform(order) ? openReasons(order, 'cancel') : updateStatus(order.id, 'CANCELLED'))}
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

      {dispatch && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setDispatch(null)}>
          <Card role="dialog" aria-label="Saiu para entrega" className="w-full max-w-sm p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">Saiu para entrega</h2>
            <label htmlFor="driver-name" className="text-sm text-muted-foreground block">Quem vai levar? (opcional: serve para o acerto no Caixa)</label>
            <input
              id="driver-name"
              list="driver-names"
              autoFocus
              maxLength={60}
              value={dispatch.driver}
              onChange={(e) => setDispatch({ ...dispatch, driver: e.target.value })}
              placeholder="Nome do entregador"
              className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
            />
            <datalist id="driver-names">
              {[...new Set(orders.map((o) => o.driverName).filter(Boolean))].map((n) => <option key={n as string} value={n as string} />)}
            </datalist>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setDispatch(null)}>Voltar</Button>
              <Button
                size="sm"
                disabled={updatingId === dispatch.order.id}
                onClick={async () => { const d = dispatch; setDispatch(null); await updateStatus(d.order.id, 'PICKED_UP', d.driver); }}
              >
                Saiu para entrega
              </Button>
            </div>
          </Card>
        </div>
      )}

      {reasonPick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={() => setReasonPick(null)}>
          <Card className="w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <p className="font-medium">
              {reasonPick.mode === 'reject' ? 'Recusar' : 'Cancelar'} o pedido {isNinetynine(reasonPick.order) ? orderTitle(reasonPick.order) : `iFood #${orderCode(reasonPick.order)}`}
            </p>
            {reasonPick.reasons === null ? (
              <p className="text-sm text-muted-foreground">Buscando os motivos {words(reasonPick.order).of}…</p>
            ) : (
              <>
                <label className="text-sm font-medium block">Motivo (lista {words(reasonPick.order).of})</label>
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
                  placeholder={isNinetynine(reasonPick.order) && reasonPick.code === NEEDS_TEXT ? 'Escreva o motivo' : 'Detalhe (opcional)'}
                  onChange={(e) => setReasonPick({ ...reasonPick, text: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-800"
                />
                {reasonPick.mode === 'cancel' && (
                  <p className="text-xs text-muted-foreground">A cozinha cancela o pedido quando {words(reasonPick.order).the} confirmar o cancelamento.</p>
                )}
              </>
            )}
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setReasonPick(null)}>Voltar</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!reasonPick.code || updatingId === reasonPick.order.id || (isNinetynine(reasonPick.order) && reasonPick.code === NEEDS_TEXT && !reasonPick.text.trim())}
                onClick={confirmReason}
              >
                {reasonPick.mode === 'reject' ? 'Recusar' : 'Cancelar'} {words(reasonPick.order).on}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
