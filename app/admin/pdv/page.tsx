'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CreditCard, Plus, Settings, RefreshCw, BarChart3, ShoppingCart,
  TrendingUp, DollarSign, Clock, CheckCircle2, AlertCircle, Trash2,
  Copy, Eye, EyeOff, Loader2, Link2, ArrowUpRight
} from 'lucide-react';
import { toast } from 'sonner';

type TabType = 'dashboard' | 'config' | 'transactions';

const PROVIDERS = [
  { id: 'STONE', name: 'Stone', color: '#00A868', desc: 'Maquininha líder no Brasil' },
  { id: 'SAIPOS', name: 'Saipos', color: '#FF6B00', desc: 'Super Integradora' },
  { id: 'TOTVS', name: 'TOTVS Chef', color: '#003E7E', desc: 'ERP Enterprise' },
  { id: 'SQUARE', name: 'Square', color: '#006AFF', desc: 'POS Internacional' },
  { id: 'GENERIC', name: 'Genérico', color: '#6B7280', desc: 'Qualquer sistema via webhook' },
];

const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

export default function PDVPage() {
  const [tab, setTab] = useState<TabType>('dashboard');
  const [settings, setSettings] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('7d');
  const [showForm, setShowForm] = useState(false);
  const [formProvider, setFormProvider] = useState('STONE');
  const [formData, setFormData] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileStats, setReconcileStats] = useState<any>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pos/settings');
      const data = await res.json();
      setSettings(data.settings || []);
    } catch { toast.error('Erro ao carregar configurações'); }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/pos/transactions?period=${period}&limit=100`);
      const data = await res.json();
      setTransactions(data);
    } catch { toast.error('Erro ao carregar transações'); }
  }, [period]);

  const fetchReconcileStats = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pos/reconcile');
      const data = await res.json();
      setReconcileStats(data);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchSettings(), fetchTransactions(), fetchReconcileStats()])
      .finally(() => setLoading(false));
  }, [fetchSettings, fetchTransactions, fetchReconcileStats]);

  useEffect(() => { fetchTransactions(); }, [period, fetchTransactions]);

  const handleSaveProvider = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pos/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: formProvider, ...formData }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success(`${formProvider} configurado com sucesso!`);
      setShowForm(false);
      setFormData({});
      await fetchSettings();
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remover essa integração PDV?')) return;
    try {
      await fetch(`/api/admin/pos/settings?id=${id}`, { method: 'DELETE' });
      toast.success('Integração removida');
      await fetchSettings();
    } catch { toast.error('Erro ao remover'); }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch('/api/admin/pos/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      toast.success(`Reconciliado: ${data.reconciled} transações`);
      await Promise.all([fetchTransactions(), fetchReconcileStats()]);
    } catch { toast.error('Erro na reconciliação'); }
    finally { setReconciling(false); }
  };

  const copyWebhook = (secret: string) => {
    const url = `${window.location.origin}/api/admin/pos/webhook`;
    navigator.clipboard.writeText(url);
    toast.success('URL do webhook copiada!');
  };

  const stats = transactions?.stats;
  const configured = settings.filter((s: any) => s.isConfigured);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <CreditCard className="w-8 h-8 text-green-600" />
                Integração PDV
              </h1>
              <p className="text-gray-500 mt-1">Conecte sua maquininha e controle vendas em tempo real</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { fetchSettings(); fetchTransactions(); fetchReconcileStats(); }}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white dark:bg-gray-900 rounded-lg p-1 shadow-sm border">
            {[
              { id: 'dashboard' as TabType, label: 'Dashboard', icon: <BarChart3 className="w-4 h-4" /> },
              { id: 'config' as TabType, label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
              { id: 'transactions' as TabType, label: 'Transações', icon: <ShoppingCart className="w-4 h-4" /> },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-md text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-green-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            </div>
          ) : (
            <>
              {/* Dashboard Tab */}
              {tab === 'dashboard' && (
                <div className="space-y-6">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Faturamento', value: formatBRL(stats?.total || 0), icon: <DollarSign className="w-5 h-5" />, color: 'text-green-600 bg-green-50' },
                      { label: 'Transações', value: stats?.count || 0, icon: <ShoppingCart className="w-5 h-5" />, color: 'text-blue-600 bg-blue-50' },
                      { label: 'Ticket Médio', value: formatBRL(stats?.average || 0), icon: <TrendingUp className="w-5 h-5" />, color: 'text-purple-600 bg-purple-50' },
                      { label: 'Descontos', value: formatBRL(stats?.discount || 0), icon: <ArrowUpRight className="w-5 h-5" />, color: 'text-orange-600 bg-orange-50' },
                      { label: 'Pendente Reconciliar', value: reconcileStats?.pending || 0, icon: <Clock className="w-5 h-5" />, color: 'text-amber-600 bg-amber-50' },
                    ].map((kpi, i) => (
                      <Card key={i} className="shadow-sm hover:shadow-md transition-shadow">
                        <CardContent className="pt-4 pb-4">
                          <div className={`inline-flex p-2 rounded-lg ${kpi.color} mb-2`}>{kpi.icon}</div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                          <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mt-1">{kpi.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Period Filter */}
                  <div className="flex gap-2 items-center">
                    <span className="text-sm text-gray-500">Período:</span>
                    {['7d', '30d', '90d'].map(p => (
                      <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${period === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'}`}
                      >
                        {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
                      </button>
                    ))}
                  </div>

                  {/* Charts Row */}
                  <div className="grid md:grid-cols-2 gap-6">
                    {/* By Payment Method */}
                    <Card className="shadow-sm">
                      <CardHeader><CardTitle className="text-base">Por Método de Pagamento</CardTitle></CardHeader>
                      <CardContent>
                        {stats?.byPaymentMethod?.length > 0 ? (
                          <div className="space-y-3">
                            {stats.byPaymentMethod.map((m: any, i: number) => {
                              const pct = stats.total > 0 ? (m.total / stats.total) * 100 : 0;
                              return (
                                <div key={i}>
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">{m.method}</span>
                                    <span className="text-gray-500">{formatBRL(m.total)} ({m.count}x)</span>
                                  </div>
                                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                                    <div className="bg-green-500 h-2 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-sm text-gray-400 text-center py-8">Sem dados no período</p>}
                      </CardContent>
                    </Card>

                    {/* By Provider */}
                    <Card className="shadow-sm">
                      <CardHeader><CardTitle className="text-base">Por Provider</CardTitle></CardHeader>
                      <CardContent>
                        {stats?.byProvider?.length > 0 ? (
                          <div className="space-y-3">
                            {stats.byProvider.map((p: any, i: number) => {
                              const prov = PROVIDERS.find(pr => pr.id === p.provider);
                              const pct = stats.total > 0 ? (p.total / stats.total) * 100 : 0;
                              return (
                                <div key={i}>
                                  <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium" style={{ color: prov?.color }}>{prov?.name || p.provider}</span>
                                    <span className="text-gray-500">{formatBRL(p.total)} ({p.count}x)</span>
                                  </div>
                                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: prov?.color || '#6B7280' }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : <p className="text-sm text-gray-400 text-center py-8">Sem dados no período</p>}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Reconciliation */}
                  {(reconcileStats?.pending || 0) > 0 && (
                    <Card className="shadow-sm border-amber-200 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-800">
                      <CardContent className="pt-4 pb-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <AlertCircle className="w-5 h-5 text-amber-600" />
                          <div>
                            <p className="font-medium text-amber-800 dark:text-amber-200">
                              {reconcileStats.pending} transações pendentes de reconciliação
                            </p>
                            <p className="text-xs text-amber-600">A reconciliação deduz ingredientes do estoque automaticamente</p>
                          </div>
                        </div>
                        <Button size="sm" onClick={handleReconcile} disabled={reconciling}>
                          {reconciling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                          Reconciliar
                        </Button>
                      </CardContent>
                    </Card>
                  )}

                  {/* Connected Providers */}
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center justify-between">
                        Providers Conectados
                        <span className="text-xs font-normal bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          {configured.length} ativo{configured.length !== 1 ? 's' : ''}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {configured.length === 0 ? (
                        <div className="text-center py-8">
                          <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                          <p className="text-gray-500 mb-4">Nenhum PDV configurado ainda</p>
                          <Button onClick={() => { setTab('config'); setShowForm(true); }}>
                            <Plus className="w-4 h-4 mr-1" /> Conectar PDV
                          </Button>
                        </div>
                      ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {configured.map((s: any) => {
                            const prov = PROVIDERS.find(p => p.id === s.provider);
                            return (
                              <div key={s.id} className="border rounded-lg p-4 flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: prov?.color }}>
                                  {prov?.name?.[0] || '?'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm">{prov?.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {s.lastSyncAt ? `Sync: ${formatDate(s.lastSyncAt)}` : 'Aguardando dados'}
                                  </p>
                                </div>
                                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Config Tab */}
              {tab === 'config' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Integrações Configuradas</h2>
                    <Button onClick={() => setShowForm(!showForm)}>
                      <Plus className="w-4 h-4 mr-1" /> Nova Integração
                    </Button>
                  </div>

                  {/* New Integration Form */}
                  {showForm && (
                    <Card className="shadow-md border-green-200">
                      <CardHeader>
                        <CardTitle className="text-base">Conectar Novo PDV</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">Provider</label>
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                            {PROVIDERS.map(p => (
                              <button
                                key={p.id}
                                onClick={() => { setFormProvider(p.id); setFormData({}); }}
                                className={`border rounded-lg p-3 text-center transition-all ${
                                  formProvider === p.id ? 'border-green-500 bg-green-50 dark:bg-green-900/20 ring-2 ring-green-500/20' : 'hover:border-gray-300'
                                }`}
                              >
                                <div className="w-8 h-8 rounded mx-auto mb-1 flex items-center justify-center text-white font-bold text-xs" style={{ backgroundColor: p.color }}>
                                  {p.name[0]}
                                </div>
                                <p className="text-xs font-medium">{p.name}</p>
                                <p className="text-[10px] text-gray-500">{p.desc}</p>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Provider-specific fields */}
                        {formProvider === 'STONE' && (
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Stone API Key *</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" placeholder="sk_live_..." onChange={e => setFormData({ ...formData, stoneApiKey: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Stone Code</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="123456" onChange={e => setFormData({ ...formData, stoneStoneCode: e.target.value })} />
                            </div>
                          </div>
                        )}
                        {formProvider === 'SAIPOS' && (
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Saipos API Key *</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" placeholder="saipos_key_..." onChange={e => setFormData({ ...formData, saiposApiKey: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Store ID</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="store_123" onChange={e => setFormData({ ...formData, saiposStoreId: e.target.value })} />
                            </div>
                          </div>
                        )}
                        {formProvider === 'TOTVS' && (
                          <div className="grid sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">TOTVS API Key *</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" onChange={e => setFormData({ ...formData, totvsApiKey: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Tenant ID</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" onChange={e => setFormData({ ...formData, totvsTenantId: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Unit ID</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" onChange={e => setFormData({ ...formData, totvsUnitId: e.target.value })} />
                            </div>
                          </div>
                        )}
                        {formProvider === 'SQUARE' && (
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Access Token *</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" onChange={e => setFormData({ ...formData, squareAccessToken: e.target.value })} />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-gray-600 mb-1 block">Location ID</label>
                              <input className="w-full border rounded-lg px-3 py-2 text-sm" onChange={e => setFormData({ ...formData, squareLocationId: e.target.value })} />
                            </div>
                          </div>
                        )}
                        {formProvider === 'GENERIC' && (
                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-4">
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              <strong>Integração Genérica via Webhook</strong> — Após configurar, você receberá uma URL de webhook.
                              Configure seu sistema PDV para enviar vendas para essa URL no formato JSON documentado.
                            </p>
                          </div>
                        )}

                        <div className="flex gap-2 pt-2">
                          <Button onClick={handleSaveProvider} disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                            Salvar
                          </Button>
                          <Button variant="outline" onClick={() => { setShowForm(false); setFormData({}); }}>Cancelar</Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Existing integrations */}
                  {settings.length === 0 && !showForm ? (
                    <Card className="shadow-sm">
                      <CardContent className="py-12 text-center">
                        <CreditCard className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-700 mb-2">Nenhum PDV conectado</h3>
                        <p className="text-gray-500 mb-4 max-w-md mx-auto">
                          Conecte sua maquininha Stone, Saipos, TOTVS ou qualquer sistema via webhook para sincronizar vendas automaticamente.
                        </p>
                        <Button onClick={() => setShowForm(true)}>
                          <Plus className="w-4 h-4 mr-1" /> Conectar Primeiro PDV
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-4">
                      {settings.map((s: any) => {
                        const prov = PROVIDERS.find(p => p.id === s.provider);
                        return (
                          <Card key={s.id} className="shadow-sm">
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: prov?.color }}>
                                    {prov?.name?.[0]}
                                  </div>
                                  <div>
                                    <h3 className="font-semibold">{prov?.name}</h3>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      {s.isConfigured ? (
                                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Conectado</span>
                                      ) : (
                                        <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pendente</span>
                                      )}
                                      {s.syncEnabled && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Sync ativo</span>}
                                      {s.autoReconcile && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Auto-reconciliação</span>}
                                    </div>
                                  </div>
                                </div>
                                <Button variant="outline" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(s.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>

                              {/* Webhook URL */}
                              <div className="bg-gray-50 dark:bg-gray-900 border rounded-lg p-3 mb-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-gray-500 flex items-center gap-1"><Link2 className="w-3 h-3" /> Webhook URL</span>
                                  <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => copyWebhook(s.webhookSecret)}>
                                    <Copy className="w-3 h-3 mr-1" /> Copiar
                                  </Button>
                                </div>
                                <code className="text-xs text-gray-600 dark:text-gray-400 block break-all">
                                  POST /api/admin/pos/webhook
                                </code>
                                <div className="flex items-center gap-1 mt-2">
                                  <span className="text-xs text-gray-500">Secret:</span>
                                  <code className="text-xs text-gray-600">
                                    {showSecrets[s.id] ? s.webhookSecret : '•'.repeat(16)}
                                  </code>
                                  <button onClick={() => setShowSecrets({ ...showSecrets, [s.id]: !showSecrets[s.id] })}>
                                    {showSecrets[s.id] ? <EyeOff className="w-3 h-3 text-gray-400" /> : <Eye className="w-3 h-3 text-gray-400" />}
                                  </button>
                                </div>
                              </div>

                              <p className="text-xs text-gray-500">
                                Headers: <code className="bg-gray-100 px-1 rounded">x-webhook-secret: {'<secret>'}</code> • <code className="bg-gray-100 px-1 rounded">x-pos-provider: {s.provider}</code>
                              </p>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Transactions Tab */}
              {tab === 'transactions' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Transações Recentes</h2>
                    <div className="flex gap-2">
                      {['7d', '30d', '90d'].map(p => (
                        <button
                          key={p}
                          onClick={() => setPeriod(p)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium ${period === p ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                          {p === '7d' ? '7 dias' : p === '30d' ? '30 dias' : '90 dias'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {transactions?.items?.length === 0 ? (
                    <Card className="shadow-sm">
                      <CardContent className="py-12 text-center">
                        <ShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">Nenhuma transação no período</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {transactions?.items?.map((tx: any) => {
                        const prov = PROVIDERS.find(p => p.id === tx.provider);
                        return (
                          <Card key={tx.id} className="shadow-sm hover:shadow-md transition-shadow">
                            <CardContent className="pt-4 pb-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: prov?.color || '#6B7280' }}>
                                    {prov?.name?.[0] || '?'}
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{formatBRL(tx.amount)}</p>
                                    <p className="text-xs text-gray-500">{tx.paymentMethod} • {formatDate(tx.transactionDate)}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {tx.reconciled ? (
                                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Reconciliado
                                    </span>
                                  ) : (
                                    <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Pendente</span>
                                  )}
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    tx.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                                    tx.status === 'REFUNDED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                  }`}>{tx.status}</span>
                                </div>
                              </div>
                              {tx.saleItems?.length > 0 && (
                                <div className="mt-2 bg-gray-50 dark:bg-gray-900 rounded-lg p-2">
                                  {tx.saleItems.map((si: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-xs py-1 border-b border-gray-100 last:border-0">
                                      <span className="text-gray-700 dark:text-gray-300">{si.quantity}x {si.name}</span>
                                      <span className="text-gray-500">{formatBRL(si.totalPrice)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {(tx.customerName || tx.tableNumber || tx.operatorName) && (
                                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                  {tx.customerName && <span>Cliente: {tx.customerName}</span>}
                                  {tx.tableNumber && <span>Mesa: {tx.tableNumber}</span>}
                                  {tx.operatorName && <span>Operador: {tx.operatorName}</span>}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
