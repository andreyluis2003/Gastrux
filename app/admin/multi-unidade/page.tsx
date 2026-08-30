'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Building2, DollarSign, ShoppingCart, TrendingUp, Loader2, Users, BarChart3 } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface UnitData {
  locationId: string;
  locationName: string;
  totalRevenue: number;
  totalOrders: number;
  avgTicket: number;
  totalIngredients: number;
  totalStaff: number;
}

interface ConsolidatedData {
  units: UnitData[];
  totals: { revenue: number; orders: number; avgTicket: number; ingredients: number; staff: number };
}

export default function MultiUnidadePage() {
  const [data, setData] = useState<ConsolidatedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/multi-unidade/consolidado');
        if (res.ok) {
          const raw = await res.json();
          // Map API response to component's expected format
          if (raw.restaurants && raw.consolidated) {
            const mapped: ConsolidatedData = {
              units: raw.restaurants.map((r: any) => ({
                locationId: r.id,
                locationName: r.name,
                totalRevenue: r.revenue || 0,
                totalOrders: r.orderCount || 0,
                avgTicket: r.avgTicket || 0,
                totalIngredients: 0,
                totalStaff: r.staffCount || 0,
              })),
              totals: {
                revenue: raw.consolidated.totalRevenue || 0,
                orders: raw.consolidated.totalOrders || 0,
                avgTicket: raw.consolidated.totalOrders > 0 ? (raw.consolidated.totalRevenue / raw.consolidated.totalOrders) : 0,
                ingredients: 0,
                staff: raw.consolidated.totalStaff || 0,
              },
            };
            setData(mapped);
          } else if (raw.units) {
            setData(raw);
          }
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const maxRevenue = data?.units ? Math.max(...data.units.map(u => u.totalRevenue), 1) : 1;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6 text-violet-600" /> Multi-Unidade</h1>
          <p className="text-sm text-gray-500">Consolidação de dados entre filiais</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>
      ) : !data || data.units.length === 0 ? (
        <Card className="p-8 text-center">
          <Building2 className="h-12 w-12 text-violet-300 mx-auto mb-3" />
          <h2 className="font-bold text-lg">Painel Multi-Unidade</h2>
          <p className="text-gray-500 mt-2">Configure múltiplas unidades para ver a consolidação de dados aqui. O sistema agrupa automaticamente dados de todas as filiais vinculadas à sua conta.</p>
        </Card>
      ) : (
        <>
          {/* Consolidated KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Building2 className="h-4 w-4 text-violet-600" /><span className="text-xs text-gray-500">Unidades</span></div>
              <p className="text-xl font-bold">{data.units.length}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-green-600" /><span className="text-xs text-gray-500">Receita Total</span></div>
              <p className="text-xl font-bold text-green-700">{formatBRL(data.totals.revenue)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><ShoppingCart className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Pedidos Total</span></div>
              <p className="text-xl font-bold">{data.totals.orders}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-orange-600" /><span className="text-xs text-gray-500">Ticket Médio</span></div>
              <p className="text-xl font-bold">{formatBRL(data.totals.avgTicket)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-purple-600" /><span className="text-xs text-gray-500">Funcionários</span></div>
              <p className="text-xl font-bold">{data.totals.staff}</p>
            </Card>
          </div>

          {/* Revenue by Unit */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Receita por Unidade</h2>
            <div className="space-y-3">
              {data.units.sort((a, b) => b.totalRevenue - a.totalRevenue).map((unit, i) => (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{unit.locationName}</span>
                    <span className="text-gray-600">{formatBRL(unit.totalRevenue)}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div className="bg-violet-500 h-3 rounded-full transition-all" style={{ width: `${(unit.totalRevenue / maxRevenue) * 100}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Unit Details Table */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Detalhes por Unidade</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">Unidade</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Receita</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Pedidos</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Ticket Médio</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Insumos</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Equipe</th>
                  </tr>
                </thead>
                <tbody>
                  {data.units.map((unit, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 font-medium">{unit.locationName}</td>
                      <td className="py-3 text-right text-green-700">{formatBRL(unit.totalRevenue)}</td>
                      <td className="py-3 text-right">{unit.totalOrders}</td>
                      <td className="py-3 text-right">{formatBRL(unit.avgTicket)}</td>
                      <td className="py-3 text-right">{unit.totalIngredients}</td>
                      <td className="py-3 text-right">{unit.totalStaff}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
