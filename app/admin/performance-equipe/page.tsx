'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Activity, Clock, Users, Star, Loader2, Trophy, ChefHat, BarChart3 } from 'lucide-react';

interface StaffPerf {
  name: string;
  role: string;
  ordersProcessed: number;
  avgPrepTime: number;
  satisfaction: number;
}

interface PerfData {
  staff: StaffPerf[];
  overview: { totalOrders: number; avgPrepTime: number; avgSatisfaction: number; totalStaff: number };
}

export default function PerformanceEquipePage() {
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/performance/equipe');
        if (res.ok) {
          const raw = await res.json();
          // Map API response to component's expected format
          const mapped: PerfData = {
            staff: raw.staff || [],
            overview: {
              totalOrders: raw.summary?.totalOrders || 0,
              avgPrepTime: raw.prepTime?.avgActual || raw.summary?.avgPrepTimeMinutes || 0,
              avgSatisfaction: raw.prepTime?.onTimeRate || 0,
              totalStaff: raw.summary?.staffCount || 0,
            },
          };
          setData(mapped);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const maxOrders = data ? Math.max(...data.staff.map(s => s.ordersProcessed), 1) : 1;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-6 w-6 text-emerald-600" /> Performance da Equipe</h1>
          <p className="text-sm text-gray-500">KPIs de tempo de preparo e produtividade</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-emerald-600" /></div>
      ) : !data ? (
        <Card className="p-8 text-center text-gray-500">Nenhum dado de performance disponível.</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-emerald-600" /><span className="text-xs text-gray-500">Equipe</span></div>
              <p className="text-xl font-bold">{data.overview.totalStaff}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><BarChart3 className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Pedidos Total</span></div>
              <p className="text-xl font-bold">{data.overview.totalOrders}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Clock className="h-4 w-4 text-orange-600" /><span className="text-xs text-gray-500">Tempo Médio</span></div>
              <p className="text-xl font-bold">{data.overview.avgPrepTime.toFixed(0)} min</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Star className="h-4 w-4 text-yellow-600" /><span className="text-xs text-gray-500">Satisfação</span></div>
              <p className="text-xl font-bold">{data.overview.avgSatisfaction.toFixed(1)}⭐</p>
            </Card>
          </div>

          {/* Ranking */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><Trophy className="h-5 w-5 text-yellow-500" /> Ranking de Produtividade</h2>
            <div className="space-y-3">
              {data.staff.sort((a, b) => b.ordersProcessed - a.ordersProcessed).map((s, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-200 text-yellow-800' : i === 1 ? 'bg-gray-200 text-gray-700' : i === 2 ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-gray-500">{s.ordersProcessed} pedidos</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className="bg-emerald-500 h-2.5 rounded-full transition-all" style={{ width: `${(s.ordersProcessed / maxOrders) * 100}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
              {data.staff.length === 0 && <p className="text-gray-400 text-sm text-center">Nenhum funcionário com dados de performance.</p>}
            </div>
          </Card>

          {/* Detailed Table */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><ChefHat className="h-5 w-5" /> Detalhes da Equipe</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">Nome</th>
                    <th className="pb-2 font-medium text-gray-500">Função</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Pedidos</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Tempo Médio</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Satisfação</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staff.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-3 font-medium">{s.name}</td>
                      <td className="py-3 text-gray-600">{s.role}</td>
                      <td className="py-3 text-right">{s.ordersProcessed}</td>
                      <td className="py-3 text-right">{s.avgPrepTime.toFixed(0)} min</td>
                      <td className="py-3 text-right">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${s.satisfaction >= 4 ? 'bg-green-100 text-green-800' : s.satisfaction >= 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                          {s.satisfaction.toFixed(1)} ⭐
                        </span>
                      </td>
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
