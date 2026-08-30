'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import {
  CreditCard, Save, Loader2, Zap, Copy, CheckCircle2, Receipt, DollarSign,
} from 'lucide-react';

type Provider = 'SQUARE' | 'SUMUP' | 'STONE';

interface Settings {
  id?: string;
  provider: Provider;
  squareAccessToken?: string | null;
  squareLocationId?: string | null;
  squareMerchantId?: string | null;
  sumupApiKey?: string | null;
  sumupMerchantId?: string | null;
  stoneApiKey?: string | null;
  stoneStoneCode?: string | null;
  stoneMerchantId?: string | null;
  deviceSerial?: string | null;
  isConfigured?: boolean;
  webhookSecret?: string | null;
}

interface Transaction {
  id: string;
  transactionId: string;
  provider: Provider;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: string;
  transactionDate: string;
}

interface Stats {
  count: number;
  total: number;
  average: number;
  byPaymentMethod: { method: string; count: number; total: number }[];
}

export default function POSIntegrationsPage() {
  const [tab, setTab] = useState<Provider>('SQUARE');
  const [settings, setSettings] = useState<Settings>({ provider: 'SQUARE' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, tRes] = await Promise.all([
        fetch('/api/admin/pos/settings'),
        fetch('/api/admin/pos/transactions?limit=50'),
      ]);
      if (sRes.ok) {
        const d = await sRes.json();
        setSettings(d.settings);
        setTab((d.settings.provider || 'SQUARE') as Provider);
      }
      if (tRes.ok) {
        const d = await tRes.json();
        setTransactions(d.items || []);
        setStats(d.stats || null);
      }
    } catch (e) {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/pos/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, provider: tab }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setSettings(d.settings);
      toast.success('Configurações salvas');
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const copyWebhook = (provider: string) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${base}/api/pos/webhook/${provider.toLowerCase()}`;
    navigator.clipboard.writeText(url).then(() => toast.success('URL copiada'));
  };

  const providers: { key: Provider; name: string; desc: string }[] = [
    { key: 'SQUARE', name: 'Square', desc: 'Maquininha Square (EUA/Canada)' },
    { key: 'SUMUP', name: 'SumUp', desc: 'Maquininha SumUp (Brasil)' },
    { key: 'STONE', name: 'Stone', desc: 'Maquininha Stone (Brasil)' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <CreditCard className="h-7 w-7 text-blue-600" />
            Integração com Maquininha
          </h1>
          <p className="text-gray-600 mt-1">
            Conecte Square, SumUp ou Stone para registrar vendas automaticamente.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
        ) : (
          <>
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Transações</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.count}</p>
                    </div>
                    <Receipt className="h-8 w-8 text-blue-500" />
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Total</p>
                      <p className="text-2xl font-bold text-gray-900">{fmtBRL(stats.total)}</p>
                    </div>
                    <DollarSign className="h-8 w-8 text-emerald-500" />
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500">Ticket Médio</p>
                      <p className="text-2xl font-bold text-gray-900">{fmtBRL(stats.average)}</p>
                    </div>
                    <Zap className="h-8 w-8 text-amber-500" />
                  </div>
                </Card>
              </div>
            )}

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setTab(p.key)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                    tab === p.key
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {p.name}
                </button>
              ))}
            </div>

            {/* Provider config */}
            <Card className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold text-lg text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {providers.find((p) => p.key === tab)?.name}
                  </h2>
                  <p className="text-sm text-gray-600">{providers.find((p) => p.key === tab)?.desc}</p>
                </div>
                {settings.provider === tab && settings.isConfigured && (
                  <Badge className="bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Configurado
                  </Badge>
                )}
              </div>

              {tab === 'SQUARE' && (
                <div className="space-y-3">
                  <div>
                    <Label>Access Token</Label>
                    <Input
                      type="text"
                      value={settings.squareAccessToken || ''}
                      onChange={(e) => setSettings({ ...settings, squareAccessToken: e.target.value })}
                      placeholder="EAAA..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Location ID</Label>
                      <Input
                        value={settings.squareLocationId || ''}
                        onChange={(e) => setSettings({ ...settings, squareLocationId: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Merchant ID</Label>
                      <Input
                        value={settings.squareMerchantId || ''}
                        onChange={(e) => setSettings({ ...settings, squareMerchantId: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {tab === 'SUMUP' && (
                <div className="space-y-3">
                  <div>
                    <Label>API Key</Label>
                    <Input
                      type="text"
                      value={settings.sumupApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, sumupApiKey: e.target.value })}
                      placeholder="sup_sk_..."
                    />
                  </div>
                  <div>
                    <Label>Merchant ID</Label>
                    <Input
                      value={settings.sumupMerchantId || ''}
                      onChange={(e) => setSettings({ ...settings, sumupMerchantId: e.target.value })}
                    />
                  </div>
                  <Card className="p-3 bg-blue-50 border-blue-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-blue-900">
                        <strong>Webhook URL:</strong>
                        <div className="font-mono text-xs mt-1 break-all">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/api/pos/webhook/sumup
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => copyWebhook('SUMUP')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              {tab === 'STONE' && (
                <div className="space-y-3">
                  <div>
                    <Label>API Key</Label>
                    <Input
                      type="text"
                      value={settings.stoneApiKey || ''}
                      onChange={(e) => setSettings({ ...settings, stoneApiKey: e.target.value })}
                      placeholder="stone_sk_..."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Código Stone</Label>
                      <Input
                        value={settings.stoneStoneCode || ''}
                        onChange={(e) => setSettings({ ...settings, stoneStoneCode: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Merchant ID</Label>
                      <Input
                        value={settings.stoneMerchantId || ''}
                        onChange={(e) => setSettings({ ...settings, stoneMerchantId: e.target.value })}
                      />
                    </div>
                  </div>
                  <Card className="p-3 bg-emerald-50 border-emerald-200">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-emerald-900">
                        <strong>Webhook URL:</strong>
                        <div className="font-mono text-xs mt-1 break-all">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/api/pos/webhook/stone
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => copyWebhook('STONE')}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                </div>
              )}

              <div>
                <Label>Serial do Dispositivo (opcional)</Label>
                <Input
                  value={settings.deviceSerial || ''}
                  onChange={(e) => setSettings({ ...settings, deviceSerial: e.target.value })}
                  placeholder="Ex: SN-12345"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={save} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
                  {saving ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando...</>) : (<><Save className="mr-2 h-4 w-4" /> Salvar</>)}
                </Button>
              </div>
            </Card>

            {/* Payment methods */}
            {stats && stats.byPaymentMethod.length > 0 && (
              <Card className="p-5">
                <h3 className="font-semibold text-lg text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Por metodo de pagamento</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {stats.byPaymentMethod.map((m) => (
                    <div key={m.method} className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 uppercase font-medium">{m.method}</p>
                      <p className="text-lg font-bold text-gray-900">{fmtBRL(m.total)}</p>
                      <p className="text-xs text-gray-500">{m.count} transacoes</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Transactions */}
            <Card className="p-5">
              <h3 className="font-semibold text-lg text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Transações recentes</h3>
              {transactions.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma transação registrada ainda.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 text-gray-600">Data</th>
                        <th className="text-left py-2 text-gray-600">Provedor</th>
                        <th className="text-left py-2 text-gray-600">Método</th>
                        <th className="text-left py-2 text-gray-600">Status</th>
                        <th className="text-right py-2 text-gray-600">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map((t) => (
                        <tr key={t.id} className="border-b hover:bg-gray-50">
                          <td className="py-2">{new Date(t.transactionDate).toLocaleString('pt-BR')}</td>
                          <td className="py-2">
                            <Badge variant="outline">{t.provider}</Badge>
                          </td>
                          <td className="py-2">{t.paymentMethod}</td>
                          <td className="py-2">
                            <Badge
                              className={
                                t.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700'
                                : t.status === 'FAILED' ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                              }
                            >{t.status}</Badge>
                          </td>
                          <td className="py-2 text-right font-medium">{fmtBRL(t.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
