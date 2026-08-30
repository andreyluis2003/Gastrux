'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText, Settings, Receipt, CheckCircle2, XCircle, Clock,
  AlertCircle, Loader2, RefreshCw, Plus, Shield, Building2,
  Hash, FileCheck
} from 'lucide-react';
import { toast } from 'sonner';

type TabType = 'dashboard' | 'config' | 'documents' | 'logs';

const UF_LIST = ['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const CRT_OPTIONS = [
  { value: '1', label: '1 - Simples Nacional' },
  { value: '2', label: '2 - Simples Nacional (excesso)' },
  { value: '3', label: '3 - Regime Normal (Lucro Presumido/Real)' },
];
const NFE_PROVIDERS = [
  { value: 'focusnfe', label: 'Focus NFe', desc: 'Mais popular no Brasil' },
  { value: 'nfeio', label: 'NFe.io', desc: 'API moderna' },
  { value: 'taxgroup', label: 'TaxGroup', desc: 'Enterprise' },
];

function formatBRL(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}
function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}
function formatCNPJ(v: string) {
  const d = v.replace(/\D/g, '');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

export default function FiscalPage() {
  const [tab, setTab] = useState<TabType>('dashboard');
  const [config, setConfig] = useState<any>(null);
  const [docs, setDocs] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [form, setForm] = useState<any>({});
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueForm, setIssueForm] = useState<any>({ documentType: 'NFCe', items: [{ description: '', quantity: 1, unitPrice: 0 }] });

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/fiscal/config');
      const data = await res.json();
      setConfig(data.config);
      if (data.config) setForm(data.config);
    } catch { toast.error('Erro ao carregar config fiscal'); }
  }, []);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/fiscal/documents');
      setDocs(await res.json());
    } catch {}
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/fiscal/logs');
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {}
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchConfig(), fetchDocs(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchConfig, fetchDocs, fetchLogs]);

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      const method = config ? 'PATCH' : 'POST';
      const res = await fetch('/api/admin/fiscal/config', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      const data = await res.json();
      setConfig(data.config);
      toast.success('Configuração fiscal salva!');
    } catch (err: any) { toast.error(err.message || 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const handleIssue = async () => {
    setIssuing(true);
    try {
      const items = issueForm.items.map((i: any) => ({
        ...i,
        totalPrice: (Number(i.quantity) || 1) * (Number(i.unitPrice) || 0),
      }));
      const res = await fetch('/api/admin/fiscal/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...issueForm, items }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      toast.success('Documento fiscal emitido!');
      setShowIssueForm(false);
      setIssueForm({ documentType: 'NFCe', items: [{ description: '', quantity: 1, unitPrice: 0 }] });
      await Promise.all([fetchDocs(), fetchLogs()]);
    } catch (err: any) { toast.error(err.message || 'Erro ao emitir'); }
    finally { setIssuing(false); }
  };

  const addItem = () => {
    setIssueForm({ ...issueForm, items: [...issueForm.items, { description: '', quantity: 1, unitPrice: 0 }] });
  };

  const updateItem = (idx: number, field: string, value: any) => {
    const items = [...issueForm.items];
    items[idx] = { ...items[idx], [field]: value };
    setIssueForm({ ...issueForm, items });
  };

  const removeItem = (idx: number) => {
    if (issueForm.items.length <= 1) return;
    setIssueForm({ ...issueForm, items: issueForm.items.filter((_: any, i: number) => i !== idx) });
  };

  const docStats = docs?.stats || {};

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <AdminSidebar />
      <main className="flex-1 md:ml-64 p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                <Receipt className="w-8 h-8 text-indigo-600" />
                Compliance Fiscal
              </h1>
              <p className="text-gray-500 mt-1">Emissão de NFC-e / NF-e via Focus NFe, NFe.io ou TaxGroup</p>
            </div>
            <div className="flex gap-2">
              {config?.active && (
                <Button onClick={() => { setTab('documents'); setShowIssueForm(true); }}>
                  <Plus className="w-4 h-4 mr-1" /> Emitir NFC-e
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { fetchConfig(); fetchDocs(); fetchLogs(); }}>
                <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-white dark:bg-gray-900 rounded-lg p-1 shadow-sm border">
            {[
              { id: 'dashboard' as TabType, label: 'Visão Geral', icon: <FileText className="w-4 h-4" /> },
              { id: 'config' as TabType, label: 'Configuração', icon: <Settings className="w-4 h-4" /> },
              { id: 'documents' as TabType, label: 'Documentos', icon: <Receipt className="w-4 h-4" /> },
              { id: 'logs' as TabType, label: 'Logs', icon: <FileCheck className="w-4 h-4" /> },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-md text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {t.icon} <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <>
              {/* Dashboard */}
              {tab === 'dashboard' && (
                <div className="space-y-6">
                  {/* Status */}
                  <Card className={`shadow-sm ${config?.active ? 'border-green-200' : 'border-yellow-200'}`}>
                    <CardContent className="pt-4 pb-4 flex items-center gap-4">
                      {config?.active ? (
                        <CheckCircle2 className="w-10 h-10 text-green-500" />
                      ) : (
                        <AlertCircle className="w-10 h-10 text-yellow-500" />
                      )}
                      <div>
                        <h3 className="font-semibold text-lg">
                          {config ? (config.active ? 'Compliance Fiscal Ativo' : 'Configuração Incompleta') : 'Não Configurado'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          {config ? (
                            <>
                              {config.nfeProvider === 'focusnfe' ? 'Focus NFe' : config.nfeProvider === 'nfeio' ? 'NFe.io' : 'TaxGroup'}
                              {' • '}{config.environment === 'sandbox' ? 'Sandbox (Teste)' : 'Produção'}
                              {' • CNPJ: '}{config.cnpj ? formatCNPJ(config.cnpj) : 'Não informado'}
                            </>
                          ) : 'Configure o CNPJ e a API Key do provider fiscal'}
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                    {[
                      { label: 'Total Emitidos', value: docStats.total || 0, icon: <FileText className="w-5 h-5" />, color: 'text-indigo-600 bg-indigo-50' },
                      { label: 'Autorizados', value: docStats.authorized || 0, icon: <CheckCircle2 className="w-5 h-5" />, color: 'text-green-600 bg-green-50' },
                      { label: 'Pendentes', value: docStats.pending || 0, icon: <Clock className="w-5 h-5" />, color: 'text-yellow-600 bg-yellow-50' },
                      { label: 'Rejeitados', value: docStats.rejected || 0, icon: <XCircle className="w-5 h-5" />, color: 'text-red-600 bg-red-50' },
                      { label: 'Cancelados', value: docStats.cancelled || 0, icon: <XCircle className="w-5 h-5" />, color: 'text-gray-600 bg-gray-50' },
                    ].map((kpi, i) => (
                      <Card key={i} className="shadow-sm">
                        <CardContent className="pt-4 pb-4">
                          <div className={`inline-flex p-2 rounded-lg ${kpi.color} mb-2`}>{kpi.icon}</div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide">{kpi.label}</p>
                          <p className="text-xl font-bold text-gray-900 dark:text-white mt-1">{kpi.value}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Company Info */}
                  {config && (
                    <Card className="shadow-sm">
                      <CardHeader><CardTitle className="text-base flex items-center gap-2"><Building2 className="w-5 h-5" /> Dados da Empresa</CardTitle></CardHeader>
                      <CardContent>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-gray-500">Razão Social</p>
                            <p className="font-medium text-sm">{config.companyName || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">Nome Fantasia</p>
                            <p className="font-medium text-sm">{config.tradeName || '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">CNPJ</p>
                            <p className="font-medium text-sm">{config.cnpj ? formatCNPJ(config.cnpj) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500">UF / CRT</p>
                            <p className="font-medium text-sm">{config.uf} / {CRT_OPTIONS.find(c => c.value === config.crt)?.label || config.crt}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {!config && (
                    <Card className="shadow-sm">
                      <CardContent className="py-12 text-center">
                        <Shield className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                        <h3 className="text-lg font-semibold text-gray-700 mb-2">Configure o Compliance Fiscal</h3>
                        <p className="text-gray-500 mb-4 max-w-md mx-auto">
                          Cadastre os dados fiscais do seu restaurante para emitir NFC-e e NF-e automaticamente.
                        </p>
                        <Button onClick={() => setTab('config')}><Settings className="w-4 h-4 mr-1" /> Configurar Agora</Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* Config Tab */}
              {tab === 'config' && (
                <Card className="shadow-sm">
                  <CardHeader><CardTitle className="text-base">Configuração Fiscal</CardTitle></CardHeader>
                  <CardContent className="space-y-6">
                    {/* Company */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" /> Dados da Empresa</h3>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">CNPJ *</label>
                          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="00.000.000/0000-00" value={form.cnpj || ''} onChange={e => setForm({ ...form, cnpj: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Inscrição Estadual</label>
                          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.stateRegistration || ''} onChange={e => setForm({ ...form, stateRegistration: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Razão Social</label>
                          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.companyName || ''} onChange={e => setForm({ ...form, companyName: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Nome Fantasia</label>
                          <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.tradeName || ''} onChange={e => setForm({ ...form, tradeName: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">UF</label>
                          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.uf || 'SP'} onChange={e => setForm({ ...form, uf: e.target.value })}>
                            {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">CRT (Regime Tributário)</label>
                          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.crt || '1'} onChange={e => setForm({ ...form, crt: e.target.value })}>
                            {CRT_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Provider */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Provider Fiscal</h3>
                      <div className="grid sm:grid-cols-3 gap-3 mb-4">
                        {NFE_PROVIDERS.map(p => (
                          <button
                            key={p.value}
                            onClick={() => setForm({ ...form, nfeProvider: p.value })}
                            className={`border rounded-lg p-4 text-left transition-all ${
                              form.nfeProvider === p.value ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20' : 'hover:border-gray-300'
                            }`}
                          >
                            <p className="font-medium text-sm">{p.label}</p>
                            <p className="text-xs text-gray-500">{p.desc}</p>
                          </button>
                        ))}
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">API Key *</label>
                          <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" placeholder="Chave de API do provider" value={form.nfeApiKey || ''} onChange={e => setForm({ ...form, nfeApiKey: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Senha do Certificado Digital (A1)</label>
                          <input className="w-full border rounded-lg px-3 py-2 text-sm" type="password" placeholder="Senha do .pfx" value={form.certificatePassword || ''} onChange={e => setForm({ ...form, certificatePassword: e.target.value })} />
                        </div>
                      </div>
                    </div>

                    {/* Settings */}
                    <div>
                      <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2"><Hash className="w-4 h-4" /> Numeração e Comportamento</h3>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Série NFC-e</label>
                          <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.seriesNFCe || 1} onChange={e => setForm({ ...form, seriesNFCe: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Série NF-e</label>
                          <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.seriesNFe || 1} onChange={e => setForm({ ...form, seriesNFe: parseInt(e.target.value) || 1 })} />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-1 block">Ambiente</label>
                          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.environment || 'sandbox'} onChange={e => setForm({ ...form, environment: e.target.value })}>
                            <option value="sandbox">Sandbox (Teste)</option>
                            <option value="production">Produção</option>
                          </select>
                        </div>
                        <div className="flex items-end">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" className="rounded" checked={form.autoIssueOnSale || false} onChange={e => setForm({ ...form, autoIssueOnSale: e.target.checked })} />
                            <span className="text-sm">Emitir automaticamente nas vendas</span>
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button onClick={handleSaveConfig} disabled={saving}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                        {config ? 'Atualizar' : 'Salvar Configuração'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Documents Tab */}
              {tab === 'documents' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Documentos Fiscais</h2>
                    {config?.active && (
                      <Button onClick={() => setShowIssueForm(!showIssueForm)}>
                        <Plus className="w-4 h-4 mr-1" /> Emitir Documento
                      </Button>
                    )}
                  </div>

                  {/* Issue Form */}
                  {showIssueForm && (
                    <Card className="shadow-md border-indigo-200">
                      <CardHeader><CardTitle className="text-base">Emitir Documento Fiscal</CardTitle></CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Tipo</label>
                            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={issueForm.documentType} onChange={e => setIssueForm({ ...issueForm, documentType: e.target.value })}>
                              <option value="NFCe">NFC-e (Consumidor)</option>
                              <option value="NFe">NF-e (Empresa)</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">CPF/CNPJ do Cliente</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Opcional" value={issueForm.customerCPF || ''} onChange={e => setIssueForm({ ...issueForm, customerCPF: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-gray-600 mb-1 block">Nome do Cliente</label>
                            <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Opcional" value={issueForm.customerName || ''} onChange={e => setIssueForm({ ...issueForm, customerName: e.target.value })} />
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-600 mb-2 block">Itens</label>
                          {issueForm.items.map((item: any, idx: number) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 mb-2">
                              <div className="col-span-5">
                                <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Descrição" value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)} />
                              </div>
                              <div className="col-span-2">
                                <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Qtd" value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="col-span-3">
                                <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Preço unit." value={item.unitPrice} onChange={e => updateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)} />
                              </div>
                              <div className="col-span-2 flex items-center gap-1">
                                <span className="text-sm font-medium text-gray-700">{formatBRL((item.quantity || 0) * (item.unitPrice || 0))}</span>
                                {issueForm.items.length > 1 && (
                                  <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><XCircle className="w-4 h-4" /></button>
                                )}
                              </div>
                            </div>
                          ))}
                          <Button variant="outline" size="sm" onClick={addItem}>
                            <Plus className="w-3 h-3 mr-1" /> Adicionar Item
                          </Button>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <p className="font-semibold">
                            Total: {formatBRL(issueForm.items.reduce((s: number, i: any) => s + (i.quantity || 0) * (i.unitPrice || 0), 0))}
                          </p>
                          <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setShowIssueForm(false)}>Cancelar</Button>
                            <Button onClick={handleIssue} disabled={issuing}>
                              {issuing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Receipt className="w-4 h-4 mr-1" />}
                              Emitir
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Document List */}
                  {(docs?.documents?.length || 0) === 0 ? (
                    <Card className="shadow-sm">
                      <CardContent className="py-12 text-center">
                        <Receipt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">Nenhum documento fiscal emitido</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {docs.documents.map((doc: any) => (
                        <Card key={doc.id} className="shadow-sm hover:shadow-md transition-shadow">
                          <CardContent className="pt-4 pb-4">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                  doc.status === 'authorized' ? 'bg-green-100 text-green-600' :
                                  doc.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                                  doc.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {doc.status === 'authorized' ? <CheckCircle2 className="w-5 h-5" /> :
                                   doc.status === 'pending' ? <Clock className="w-5 h-5" /> :
                                   <XCircle className="w-5 h-5" />}
                                </div>
                                <div>
                                  <p className="font-medium text-sm">
                                    {doc.documentType} #{doc.documentNumber} (Série {doc.documentSeries})
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {formatDate(doc.createdAt)}
                                    {doc.customerName && ` • ${doc.customerName}`}
                                    {doc.customerCPF && ` • CPF: ${doc.customerCPF}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="font-semibold text-sm">{formatBRL(doc.totalAmount)}</p>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  doc.status === 'authorized' ? 'bg-green-100 text-green-700' :
                                  doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  doc.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {doc.status === 'authorized' ? 'Autorizada' :
                                   doc.status === 'pending' ? 'Pendente' :
                                   doc.status === 'rejected' ? 'Rejeitada' : doc.status}
                                </span>
                              </div>
                            </div>
                            {doc.accessKey && (
                              <p className="text-xs text-gray-400 mt-1 font-mono break-all">Chave: {doc.accessKey}</p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Logs Tab */}
              {tab === 'logs' && (
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold">Logs de Atividade Fiscal</h2>
                  {logs.length === 0 ? (
                    <Card className="shadow-sm"><CardContent className="py-8 text-center text-gray-500">Nenhum log registrado</CardContent></Card>
                  ) : (
                    logs.map((log: any) => (
                      <Card key={log.id} className="shadow-sm">
                        <CardContent className="pt-3 pb-3 flex items-center gap-3">
                          <div className={`w-8 h-8 rounded flex items-center justify-center text-xs ${
                            log.eventType === 'AUTHORIZATION' ? 'bg-green-100 text-green-600' :
                            log.eventType === 'REJECTION' ? 'bg-red-100 text-red-600' :
                            'bg-blue-100 text-blue-600'
                          }`}>
                            {log.eventType === 'AUTHORIZATION' ? <CheckCircle2 className="w-4 h-4" /> :
                             log.eventType === 'REJECTION' ? <XCircle className="w-4 h-4" /> :
                             <FileText className="w-4 h-4" />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">{log.description}</p>
                            <p className="text-xs text-gray-500">{formatDate(log.createdAt)} {log.statusCode ? `• Status: ${log.statusCode}` : ''}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))
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
