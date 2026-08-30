'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/ui/back-button';
import { toast } from 'sonner';
import { TrendingUp, DollarSign, Package, Clock, ShoppingBag, Loader2 } from 'lucide-react';

interface PlatformStats {
  platform: string;
  orders: number;
  revenue: number;
  avgTicket: number;
}

interface Analytics {
  platforms: PlatformStats[];
  totals: {
    orders: number;
    revenue: number;
    avgTicket: number;
    orders7d: number;
    revenue7d: number;
  };
  statusBreakdown: Record<string, number>;
  integrationsCount: number;
  integrationsActive: number;
}

const PLATFORM_META: Record<string, { label: string; color: string }> = {
  ifood: { label: 'iFood', color: 'bg-red-100 text-red-700' },
  uber_eats: { label: 'Uber Eats', color: 'bg-emerald-100 text-emerald-700' },
  rappi: { label: 'Rappi', color: 'bg-orange-100 text-orange-700' },
};

export default function DeliveryAnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Analytics | null>(null);

  const toNum = (v: unknown): number => {
    if (v == null) return 0;
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const fmtBRL = (v: unknown) =>
    toNum(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/delivery/analytics');
        if (!res.ok) throw new Error();
        const d = await res.json();
        setData(d);
      } catch (e) {
        toast.error('Erro ao carregar analytics');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!data) return null;

  // Safe fallbacks for all numeric/array fields
  const totals = {
    orders: toNum(data.totals?.orders),
    revenue: toNum(data.totals?.revenue),
    avgTicket: toNum(data.totals?.avgTicket),
    orders7d: toNum(data.totals?.orders7d),
    revenue7d: toNum(data.totals?.revenue7d),
  };
  const platforms: PlatformStats[] = Array.isArray(data.platforms) ? data.platforms : [];
  const statusBreakdown: Record<string, number> = data.statusBreakdown || {};

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <BackButton />
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <ShoppingBag className="h-7 w-7 text-emerald-600" />
            Analytics de Delivery
          </h1>
          <p className="text-gray-600 mt-1">Performance das plataformas de delivery (ultimos 30 dias)</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Pedidos 30d</p>
                <p className="text-2xl font-bold text-gray-900">{totals.orders}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Receita 30d</p>
                <p className="text-xl font-bold text-gray-900">{fmtBRL(totals.revenue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-emerald-500" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Ticket medio</p>
                <p className="text-xl font-bold text-gray-900">{fmtBRL(totals.avgTicket)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-amber-500" />
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Ultimos 7d</p>
                <p className="text-2xl font-bold text-gray-900">{totals.orders7d}</p>
                <p className="text-xs text-gray-500">{fmtBRL(totals.revenue7d)}</p>
              </div>
              <Clock className="h-8 w-8 text-violet-500" />
            </div>
          </Card>
        </div>

        {/* Platforms */}
        <Card className="p-5">
          <h3 className="font-semibold text-lg text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Performance por plataforma</h3>
          {platforms.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma integracao configurada.</p>
          ) : (
            <div className="space-y-3">
              {platforms
                .map((p) => ({
                  ...p,
                  orders: toNum(p?.orders),
                  revenue: toNum(p?.revenue),
                  avgTicket: toNum(p?.avgTicket),
                }))
                .sort((a, b) => b.revenue - a.revenue)
                .map((p) => {
                  const meta = PLATFORM_META[p.platform] || { label: p.platform, color: 'bg-gray-100 text-gray-700' };
                  const share = totals.revenue > 0 ? (p.revenue / totals.revenue) * 100 : 0;
                  return (
                    <div key={p.platform} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={meta.color}>{meta.label}</Badge>
                        <span className="text-sm text-gray-500">{share.toFixed(1)}% da receita</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <p className="text-gray-500 text-xs">Pedidos</p>
                          <p className="font-semibold">{p.orders}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Receita</p>
                          <p className="font-semibold">{fmtBRL(p.revenue)}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 text-xs">Ticket Medio</p>
                          <p className="font-semibold">{fmtBRL(p.avgTicket)}</p>
                        </div>
                      </div>
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                          style={{ width: `${Math.min(share, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </Card>

        {/* Status Breakdown */}
        <Card className="p-5">
          <h3 className="font-semibold text-lg text-gray-900 mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>Pedidos por status (30d)</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(statusBreakdown).map(([status, count]) => (
              <div key={status} className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">{status}</p>
                <p className="text-xl font-bold text-gray-900">{count}</p>
              </div>
            ))}
            {Object.keys(statusBreakdown).length === 0 && (
              <p className="text-sm text-gray-500 col-span-full">Sem pedidos nos ultimos 30 dias.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
