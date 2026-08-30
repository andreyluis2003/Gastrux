'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Gift, Users, TrendingUp, Coins, Loader2, Star, Award } from 'lucide-react';
import { toast } from 'sonner';
import { formatBRL } from '@/lib/formatters';

interface CashbackStats {
  totalAccounts: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  totalPointsActive: number;
  recentTransactions: any[];
}

export default function CashbackPage() {
  const [stats, setStats] = useState<CashbackStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/cashback/stats');
        if (res.ok) {
          setStats(await res.json());
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="h-6 w-6 text-purple-600" /> Cashback</h1>
          <p className="text-sm text-gray-500">Sistema de créditos e fidelidade</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Users className="h-4 w-4 text-blue-600" /><span className="text-xs text-gray-500">Clientes</span></div>
          <p className="text-xl font-bold">{loading ? '-' : stats?.totalAccounts || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Coins className="h-4 w-4 text-green-600" /><span className="text-xs text-gray-500">Pontos Emitidos</span></div>
          <p className="text-xl font-bold">{loading ? '-' : stats?.totalPointsIssued || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Star className="h-4 w-4 text-yellow-600" /><span className="text-xs text-gray-500">Pontos Ativos</span></div>
          <p className="text-xl font-bold">{loading ? '-' : stats?.totalPointsActive || 0}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Award className="h-4 w-4 text-purple-600" /><span className="text-xs text-gray-500">Resgatados</span></div>
          <p className="text-xl font-bold">{loading ? '-' : stats?.totalPointsRedeemed || 0}</p>
        </Card>
      </div>

      {/* Config */}
      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Configuração do Cashback</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-purple-50 rounded-lg p-4">
            <p className="text-sm text-purple-700 font-medium">Taxa de Cashback</p>
            <p className="text-3xl font-bold text-purple-800">5%</p>
            <p className="text-xs text-purple-600 mt-1">De cada pedido vira crédito</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-700 font-medium">Valor do Ponto</p>
            <p className="text-3xl font-bold text-green-800">R$ 1,00</p>
            <p className="text-xs text-green-600 mt-1">1 ponto = R$ 1,00 de desconto</p>
          </div>
        </div>
      </Card>

      {/* Recent transactions */}
      <Card className="p-6">
        <h2 className="font-bold text-lg mb-4">Transações Recentes</h2>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-purple-600" /></div>
        ) : stats?.recentTransactions && stats.recentTransactions.length > 0 ? (
          <div className="space-y-2">
            {stats.recentTransactions.map((t: any, i: number) => (
              <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${t.type === 'EARNING' ? 'bg-green-50' : 'bg-red-50'}`}>
                <div>
                  <p className="text-sm font-medium">{t.reason}</p>
                  <p className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <span className={`font-bold ${t.type === 'EARNING' ? 'text-green-600' : 'text-red-600'}`}>
                  {t.type === 'EARNING' ? '+' : ''}{t.amount} pts
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">Nenhuma transação ainda. O cashback é creditado automaticamente ao completar pedidos.</p>
        )}
      </Card>

      <Card className="p-4 bg-purple-50 border-purple-200">
        <h3 className="font-bold text-sm text-purple-800 mb-2">Como funciona</h3>
        <ul className="text-sm text-purple-700 space-y-1">
          <li>• Cliente recebe 5% do valor do pedido em pontos automaticamente</li>
          <li>• Pontos podem ser usados como desconto em pedidos futuros</li>
          <li>• Mínimo de 10 pontos para resgate</li>
          <li>• Pontos expiram em 12 meses</li>
        </ul>
      </Card>
    </div>
  );
}
