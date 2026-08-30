'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Truck, DollarSign, TrendingUp, TrendingDown, Users, Loader2, Package, ArrowUpDown } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';

interface SupplierDashboard {
  totalSuppliers: number;
  activeSuppliers: number;
  comparisons: {
    ingredientName: string;
    unit: string;
    suppliers: { name: string; price: number; leadDays: number }[];
    bestPrice: number;
    avgPrice: number;
  }[];
  recentTrends: { supplierName: string; ingredientName: string; oldPrice: number; newPrice: number; changePercent: number }[];
}

export default function FornecedoresPainelPage() {
  const [data, setData] = useState<SupplierDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/fornecedores/dashboard');
        if (res.ok) {
          const raw = await res.json();
          // Normalize API response to match interface
          const suppliers = raw.suppliers || [];
          const comparisons = (raw.priceComparison || raw.comparisons || []).map((c: any) => ({
            ingredientName: c.name || c.ingredientName,
            unit: c.unit || 'kg',
            suppliers: (c.suppliers || []).map((s: any) => ({ name: s.supplierName || s.name, price: s.price || 0, leadDays: s.leadDays || 0 })),
            bestPrice: Math.min(...(c.suppliers || []).map((s: any) => s.price || 0), Infinity),
            avgPrice: (c.suppliers || []).length > 0 ? (c.suppliers || []).reduce((sum: number, s: any) => sum + (s.price || 0), 0) / (c.suppliers || []).length : 0,
          }));
          const recentTrends = (raw.priceTrends || raw.recentTrends || []).map((t: any) => ({
            supplierName: t.supplierName || '', ingredientName: t.ingredientName || t.ingredient?.name || '',
            oldPrice: t.oldPrice || 0, newPrice: t.newPrice || 0, changePercent: t.changePercent || 0,
          }));
          setData({
            totalSuppliers: raw.totalSuppliers || suppliers.length,
            activeSuppliers: suppliers.filter((s: any) => s.status === 'ACTIVE').length,
            comparisons,
            recentTrends,
          });
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6 text-indigo-600" /> Painel de Fornecedores</h1>
          <p className="text-sm text-gray-500">Cotações e comparativo de preços</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>
      ) : !data ? (
        <Card className="p-8 text-center text-gray-500">Nenhum dado de fornecedores encontrado.</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-indigo-600" /><span className="text-xs text-gray-500">Total Fornecedores</span></div>
              <p className="text-xl font-bold">{data.totalSuppliers}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-green-600" /><span className="text-xs text-gray-500">Ativos</span></div>
              <p className="text-xl font-bold text-green-700">{data.activeSuppliers}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Package className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Comparativos</span></div>
              <p className="text-xl font-bold">{data.comparisons.length}</p>
            </Card>
          </div>

          {/* Price Comparisons */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4 flex items-center gap-2"><ArrowUpDown className="h-5 w-5" /> Comparativo de Preços por Insumo</h2>
            {data.comparisons.length > 0 ? (
              <div className="space-y-4">
                {data.comparisons.map((comp, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-bold">{comp.ingredientName}</h3>
                      <span className="text-xs text-gray-500">Média: {formatBRL(comp.avgPrice)}/{comp.unit}</span>
                    </div>
                    <div className="grid gap-2">
                      {comp.suppliers.map((s, j) => (
                        <div key={j} className={`flex items-center justify-between p-2 rounded-lg ${s.price === comp.bestPrice ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                          <div className="flex items-center gap-2">
                            {s.price === comp.bestPrice && <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">Melhor</span>}
                            <span className="text-sm font-medium">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-sm text-gray-500">{s.leadDays}d entrega</span>
                            <span className={`font-bold ${s.price === comp.bestPrice ? 'text-green-700' : 'text-gray-700'}`}>{formatBRL(s.price)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">Cadastre fornecedores e vincule a insumos para ver comparativos.</p>
            )}
          </Card>

          {/* Price Trends */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Variações de Preço Recentes</h2>
            {data.recentTrends.length > 0 ? (
              <div className="space-y-2">
                {data.recentTrends.map((t, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${t.changePercent > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                    <div>
                      <p className="text-sm font-medium">{t.ingredientName}</p>
                      <p className="text-xs text-gray-500">{t.supplierName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">{formatBRL(t.oldPrice)} →</span>
                      <span className="font-bold">{formatBRL(t.newPrice)}</span>
                      <span className={`flex items-center text-xs font-medium ${t.changePercent > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {t.changePercent > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                        {t.changePercent > 0 ? '+' : ''}{t.changePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">Nenhuma variação de preço registrada.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
