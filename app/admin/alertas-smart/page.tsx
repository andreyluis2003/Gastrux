'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { Bell, AlertTriangle, Info, CheckCircle, Loader2, XCircle, Package, TrendingUp, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

interface SmartAlert {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  dismissed: boolean;
  createdAt: string;
}

interface AlertStats {
  total: number;
  active: number;
  byType: { type: string; count: number }[];
  alerts: SmartAlert[];
}

function buildStats(raw: any): AlertStats {
  const alerts: SmartAlert[] = Array.isArray(raw?.alerts) ? raw.alerts : [];
  const active = alerts.filter(a => !a.dismissed).length;
  const typeMap: Record<string, number> = {};
  alerts.forEach(a => { typeMap[a.type] = (typeMap[a.type] || 0) + 1; });
  const byType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));
  return { total: raw?.total ?? alerts.length, active, byType, alerts };
}

const severityConfig: Record<string, { color: string; bg: string; icon: any }> = {
  CRITICAL: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
  HIGH: { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle },
  MEDIUM: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: Info },
  LOW: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Info },
};

const typeLabels: Record<string, { label: string; icon: any }> = {
  LOW_STOCK: { label: 'Estoque Baixo', icon: Package },
  EXPIRING_SOON: { label: 'Vencimento Próximo', icon: AlertTriangle },
  PRICE_INCREASE: { label: 'Aumento de Preço', icon: TrendingUp },
  HIGH_WASTE: { label: 'Desperdício Alto', icon: AlertTriangle },
  REORDER_NEEDED: { label: 'Reposição Necessária', icon: ShoppingCart },
  DEMAND_SPIKE: { label: 'Pico de Demanda', icon: TrendingUp },
};

export default function AlertasSmartPage() {
  const [data, setData] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/alertas/smart');
      if (res.ok) setData(buildStats(await res.json()));
    } catch { /* ignore */ }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function dismiss(id: string) {
    try {
      const res = await fetch('/api/alertas/smart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alertId: id }) });
      if (res.ok) {
        toast.success('Alerta dispensado');
        load();
      }
    } catch { toast.error('Erro ao dispensar'); }
  }

  const filteredAlerts = data?.alerts.filter(a => filter === 'all' || a.type === filter) || [];

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="h-6 w-6 text-amber-600" /> Alertas Inteligentes</h1>
          <p className="text-sm text-gray-500">Notificações automáticas de estoque, preços e desperdício</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-amber-600" /></div>
      ) : !data ? (
        <Card className="p-8 text-center text-gray-500">Nenhum dado disponível.</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Bell className="h-4 w-4 text-amber-600" /><span className="text-xs text-gray-500">Total</span></div>
              <p className="text-xl font-bold">{data.total}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><AlertTriangle className="h-4 w-4 text-red-600" /><span className="text-xs text-gray-500">Ativos</span></div>
              <p className="text-xl font-bold text-red-700">{data.active}</p>
            </Card>
            {data.byType.slice(0, 2).map((bt, i) => (
              <Card key={i} className="p-4">
                <div className="flex items-center gap-2 mb-1"><span className="text-xs text-gray-500">{typeLabels[bt.type]?.label || bt.type}</span></div>
                <p className="text-xl font-bold">{bt.count}</p>
              </Card>
            ))}
          </div>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === 'all' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>Todos</button>
            {data.byType.map(bt => (
              <button key={bt.type} onClick={() => setFilter(bt.type)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === bt.type ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                {typeLabels[bt.type]?.label || bt.type} ({bt.count})
              </button>
            ))}
          </div>

          {/* Alert List */}
          <div className="space-y-2">
            {filteredAlerts.length > 0 ? filteredAlerts.map(alert => {
              const cfg = severityConfig[alert.severity] || severityConfig.LOW;
              const SevIcon = cfg.icon;
              return (
                <Card key={alert.id} className={`p-4 border ${alert.dismissed ? 'opacity-50' : ''} ${cfg.bg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <SevIcon className={`h-5 w-5 mt-0.5 ${cfg.color}`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{alert.title}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color} bg-white/50`}>{alert.severity}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{new Date(alert.createdAt).toLocaleString('pt-BR')}</p>
                      </div>
                    </div>
                    {!alert.dismissed && (
                      <Button variant="outline" size="sm" onClick={() => dismiss(alert.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" /> Dispensar
                      </Button>
                    )}
                  </div>
                </Card>
              );
            }) : (
              <Card className="p-8 text-center text-gray-500">Nenhum alerta {filter !== 'all' ? 'deste tipo' : ''} encontrado. Excelente!</Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
