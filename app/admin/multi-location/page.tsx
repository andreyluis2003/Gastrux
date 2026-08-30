// @ts-nocheck
'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  Building2, Plus, MapPin, TrendingUp, ShoppingBag, Users, X, Loader2,
  ArrowRightLeft, BarChart3, AlertTriangle, Bell, RefreshCw, ChevronDown,
  DollarSign, Percent, Crown, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

type Tab = 'dashboard' | 'alerts' | 'sync';

const fmtBRL = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: 'Ativa', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  TRIAL: { label: 'Trial', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  SUSPENDED: { label: 'Suspensa', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const SEVERITY_STYLES = {
  critical: { bg: 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800', icon: 'text-red-600', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  warning: { bg: 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800', icon: 'text-yellow-600', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  info: { bg: 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800', icon: 'text-blue-600', badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
};

export default function MultiLocationPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [dashData, setDashData] = useState<any>(null);
  const [alertsData, setAlertsData] = useState<any>(null);
  const [syncData, setSyncData] = useState<any>(null);
  const [period, setPeriod] = useState('30');
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', city: '', state: '', address: '', phone: '', email: '' });

  // Sync state
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [selectedRecipes, setSelectedRecipes] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/multi-location/dashboard?period=${period}`);
      if (res.ok) setDashData(await res.json());
    } catch { toast.error('Erro ao carregar dashboard'); }
    setLoading(false);
  }, [period]);

  const loadAlerts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/multi-location/cross-alerts');
      if (res.ok) setAlertsData(await res.json());
    } catch { toast.error('Erro ao carregar alertas'); }
  }, []);

  const loadSyncData = useCallback(async (sid?: string) => {
    try {
      const url = sid ? `/api/admin/multi-location/sync-recipes?sourceId=${sid}` : '/api/admin/multi-location/sync-recipes';
      const res = await fetch(url);
      if (res.ok) {
        const d = await res.json();
        setSyncData(d);
        if (sid) setSourceId(sid);
      }
    } catch { toast.error('Erro ao carregar receitas'); }
  }, []);

  useEffect(() => {
    loadDashboard();
    loadAlerts();
    loadSyncData();
  }, [loadDashboard, loadAlerts, loadSyncData]);

  const handleSwitch = async (restaurantId: string) => {
    setSwitching(restaurantId);
    try {
      const res = await fetch('/api/admin/multi-location/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Unidade alterada! Recarregando...');
      window.location.reload();
    } catch { toast.error('Erro ao trocar unidade'); setSwitching(null); }
  };

  const handleCreate = async () => {
    if (!form.name) { toast.error('Nome obrigatório'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/multi-location', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Nova unidade criada!');
      setShowForm(false);
      setForm({ name: '', city: '', state: '', address: '', phone: '', email: '' });
      loadDashboard();
    } catch (e: any) { toast.error(e.message || 'Erro ao criar'); }
    setSaving(false);
  };

  const handleSync = async () => {
    if (!sourceId || !targetId || selectedRecipes.size === 0) {
      toast.error('Selecione origem, destino e receitas');
      return;
    }
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/multi-location/sync-recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId, targetId, recipeIds: Array.from(selectedRecipes) }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(data);
        toast.success(`${data.synced} receita(s) sincronizada(s)!`);
        setSelectedRecipes(new Set());
      } else {
        toast.error(data.error || 'Erro na sincronização');
      }
    } catch { toast.error('Erro na sincronização'); }
    setSyncing(false);
  };

  const locations = dashData?.locations || [];
  const consolidated = dashData?.consolidated || {};
  const alerts = alertsData?.alerts || [];
  const restaurants = syncData?.restaurants || [];
  const syncRecipes = syncData?.recipes || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Building2 className="w-7 h-7 text-violet-500" />
              Multi-Loja Inteligente
            </h1>
            <p className="text-sm text-muted-foreground">{consolidated.totalLocations || 0} unidade(s) • Visão consolidada</p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="gap-2">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancelar' : 'Nova Unidade'}
        </Button>
      </div>

      {/* New location form */}
      {showForm && (
        <Card className="p-5 space-y-4 border-violet-200 dark:border-violet-800">
          <h3 className="font-semibold text-lg">Criar Nova Unidade</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div><label className="text-xs font-medium block mb-1">Nome *</label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Filial Centro" /></div>
            <div><label className="text-xs font-medium block mb-1">Cidade</label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="São Paulo" /></div>
            <div><label className="text-xs font-medium block mb-1">Estado</label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="SP" maxLength={2} /></div>
            <div><label className="text-xs font-medium block mb-1">Endereço</label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua..." /></div>
            <div><label className="text-xs font-medium block mb-1">Telefone</label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
            <div><label className="text-xs font-medium block mb-1">Email</label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="filial@email.com" /></div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Criar Unidade
            </Button>
          </div>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-lg p-1">
        {[
          { key: 'dashboard' as Tab, label: 'Dashboard', icon: BarChart3 },
          { key: 'alerts' as Tab, label: `Alertas Cruzados${alerts.length > 0 ? ` (${alerts.length})` : ''}`, icon: Bell },
          { key: 'sync' as Tab, label: 'Sincronizar Fichas', icon: RefreshCw },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
              tab === t.key ? 'bg-white dark:bg-gray-800 shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* TAB: Dashboard */}
      {tab === 'dashboard' && (
        <>
          {/* Period selector */}
          <div className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            {[{ v: '7', l: '7d' }, { v: '30', l: '30d' }, { v: '90', l: '90d' }].map(opt => (
              <button key={opt.v} onClick={() => setPeriod(opt.v)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${period === opt.v ? 'bg-white dark:bg-gray-800 shadow-sm' : 'text-muted-foreground'}`}
              >{opt.l}</button>
            ))}
          </div>

          {/* Consolidated KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Receita Total</p>
                  <p className="text-lg font-bold">{fmtBRL(consolidated.totalRevenue || 0)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pedidos Total</p>
                  <p className="text-lg font-bold">{consolidated.totalOrders || 0}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ticket Médio</p>
                  <p className="text-lg font-bold">{fmtBRL(consolidated.avgTicket || 0)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <Percent className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">CMV Médio</p>
                  <p className="text-lg font-bold">{(consolidated.avgCmv || 0).toFixed(1)}%</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <Crown className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Melhor Unidade</p>
                  <p className="text-sm font-bold truncate max-w-[120px]">{consolidated.bestLocation || '-'}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Location Ranking */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-violet-500" />
              Ranking de Unidades
            </h2>
            {locations.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhuma unidade cadastrada</p>
              </div>
            ) : (
              <div className="space-y-3">
                {locations.map((loc: any, idx: number) => {
                  const st = STATUS_MAP[loc.status] || STATUS_MAP.ACTIVE;
                  const maxRev = locations[0]?.metrics?.totalRevenue || 1;
                  const pct = (loc.metrics.totalRevenue / maxRev) * 100;
                  return (
                    <div key={loc.id} className="p-4 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                            idx === 0 ? 'bg-yellow-100 text-yellow-700' : idx === 1 ? 'bg-gray-100 text-gray-600' : 'bg-orange-50 text-orange-600'
                          }`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-semibold text-sm">{loc.name}</p>
                            {(loc.city || loc.state) && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[loc.city, loc.state].filter(Boolean).join(', ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={st.color + ' text-xs'}>{st.label}</Badge>
                          <Button variant="outline" size="sm" onClick={() => handleSwitch(loc.id)}
                            disabled={switching === loc.id} className="gap-1 text-xs">
                            {switching === loc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRightLeft className="w-3 h-3" />}
                            Acessar
                          </Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground">Receita</span>
                          <p className="font-bold text-sm">{fmtBRL(loc.metrics.totalRevenue)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Pedidos</span>
                          <p className="font-bold text-sm">{loc.metrics.totalOrders} ({loc.metrics.ordersToday} hoje)</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ticket Médio</span>
                          <p className="font-bold text-sm">{fmtBRL(loc.metrics.avgTicket)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">CMV</span>
                          <p className={`font-bold text-sm ${loc.metrics.cmvPercent > 35 ? 'text-red-600' : loc.metrics.cmvPercent > 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {loc.metrics.cmvPercent.toFixed(1)}%
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Receitas / Insumos</span>
                          <p className="font-bold text-sm">{loc.metrics.recipes} / {loc.metrics.ingredients}</p>
                        </div>
                      </div>
                      {/* Revenue bar */}
                      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {/* TAB: Cross Alerts */}
      {tab === 'alerts' && (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <Card className="p-12 text-center">
              <Bell className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
              <p className="font-medium text-muted-foreground">Nenhum alerta cruzado detectado</p>
              <p className="text-sm text-muted-foreground">
                {(alertsData?.totalLocations || 0) < 2
                  ? 'Cadastre pelo menos 2 unidades para ativar alertas cruzados'
                  : 'Todas as unidades estão operando dentro dos parâmetros normais'
                }
              </p>
            </Card>
          ) : (
            alerts.map((alert: any) => {
              const style = SEVERITY_STYLES[alert.severity as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.info;
              return (
                <Card key={alert.id} className={`p-5 border ${style.bg}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${style.icon}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm">{alert.title}</h3>
                        <Badge className={`${style.badge} text-xs`}>
                          {alert.severity === 'critical' ? 'Crítico' : alert.severity === 'warning' ? 'Atenção' : 'Info'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{alert.message}</p>
                      {alert.locations?.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {alert.locations.map((l: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              <Building2 className="w-3 h-3 mr-1" />
                              {l}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* TAB: Sync Recipes */}
      {tab === 'sync' && (
        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-violet-500" />
              Sincronizar Fichas Técnicas
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Copie receitas e ingredientes de uma unidade para outra. Ingredientes necessários são criados automaticamente no destino.
            </p>

            {restaurants.length < 2 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Cadastre pelo menos 2 unidades para usar a sincronização</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Unidade Origem</label>
                    <select
                      value={sourceId}
                      onChange={(e) => { setSourceId(e.target.value); loadSyncData(e.target.value); setSelectedRecipes(new Set()); }}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecione a origem...</option>
                      {restaurants.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium block mb-1">Unidade Destino</label>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Selecione o destino...</option>
                      {restaurants.filter((r: any) => r.id !== sourceId).map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {sourceId && syncRecipes.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{syncRecipes.length} receitas disponíveis</p>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (selectedRecipes.size === syncRecipes.length) setSelectedRecipes(new Set());
                        else setSelectedRecipes(new Set(syncRecipes.map((r: any) => r.id)));
                      }}>
                        {selectedRecipes.size === syncRecipes.length ? 'Desmarcar todas' : 'Selecionar todas'}
                      </Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto border rounded-lg divide-y">
                      {syncRecipes.map((r: any) => (
                        <label key={r.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedRecipes.has(r.id)}
                            onChange={() => {
                              const ns = new Set(selectedRecipes);
                              if (ns.has(r.id)) ns.delete(r.id); else ns.add(r.id);
                              setSelectedRecipes(ns);
                            }}
                            className="rounded"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{r.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Código: {r.code} • {r.ingredients?.length || 0} ingredientes
                              {r.sellingPrice ? ` • ${fmtBRL(Number(r.sellingPrice))}` : ''}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        {selectedRecipes.size} receita(s) selecionada(s)
                      </p>
                      <Button onClick={handleSync} disabled={syncing || !targetId || selectedRecipes.size === 0}
                        className="gap-2 bg-violet-500 hover:bg-violet-600 text-white">
                        {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Sincronizar
                      </Button>
                    </div>
                  </>
                )}

                {sourceId && syncRecipes.length === 0 && (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>Nenhuma receita encontrada nesta unidade</p>
                  </div>
                )}

                {/* Sync Result */}
                {syncResult && (
                  <Card className="p-4 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
                    <h3 className="font-semibold text-sm mb-2">✅ Resultado da Sincronização</h3>
                    <div className="flex gap-4 text-sm mb-2">
                      <span className="text-green-600 font-medium">{syncResult.synced} sincronizada(s)</span>
                      {syncResult.skipped > 0 && <span className="text-yellow-600">{syncResult.skipped} ignorada(s)</span>}
                    </div>
                    <div className="space-y-1">
                      {syncResult.details?.map((d: string, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground">• {d}</p>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
