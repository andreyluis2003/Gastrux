'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { BackButton } from '@/components/ui/back-button';
import { Button } from '@/components/ui/button';
import { UserPlus, Gift, Users, DollarSign, Loader2, Copy, CheckCircle } from 'lucide-react';
import { formatBRL } from '@/lib/formatters';
import { toast } from 'sonner';

interface ReferralStats {
  totalReferrals: number;
  successfulConversions: number;
  totalCashbackGiven: number;
  conversionRate: number;
  recentReferrals: { referrerName: string; referredName: string; status: string; cashback: number; date: string }[];
}

export default function IndicacaoPage() {
  const [data, setData] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/indicacao');
        if (res.ok) {
          const json = await res.json();
          setData({
            totalReferrals: json?.totalReferrals ?? 0,
            successfulConversions: json?.successfulConversions ?? 0,
            totalCashbackGiven: json?.totalCashbackGiven ?? 0,
            conversionRate: json?.conversionRate ?? 0,
            recentReferrals: Array.isArray(json?.recentReferrals) ? json.recentReferrals : [],
          });
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserPlus className="h-6 w-6 text-pink-600" /> Programa de Indicação</h1>
          <p className="text-sm text-gray-500">Indique amigos e ganhe cashback</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-pink-600" /></div>
      ) : !data ? (
        <Card className="p-8 text-center text-gray-500">Nenhum dado disponível.</Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><UserPlus className="h-4 w-4 text-pink-600" /><span className="text-xs text-gray-500">Indicações</span></div>
              <p className="text-xl font-bold">{data.totalReferrals}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><CheckCircle className="h-4 w-4 text-green-600" /><span className="text-xs text-gray-500">Convertidas</span></div>
              <p className="text-xl font-bold text-green-700">{data.successfulConversions}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><DollarSign className="h-4 w-4 text-purple-600" /><span className="text-xs text-gray-500">Cashback Total</span></div>
              <p className="text-xl font-bold text-purple-700">{formatBRL(data.totalCashbackGiven)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-1"><Gift className="h-4 w-4 text-orange-600" /><span className="text-xs text-gray-500">Taxa Conversão</span></div>
              <p className="text-xl font-bold">{(data.conversionRate ?? 0).toFixed(1)}%</p>
            </Card>
          </div>

          {/* How it works */}
          <Card className="p-6 bg-pink-50 border-pink-200">
            <h2 className="font-bold text-lg text-pink-800 mb-3">Como Funciona</h2>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center mx-auto mb-2"><span className="font-bold text-pink-700">1</span></div>
                <p className="text-sm text-pink-700">Cliente compartilha seu código de indicação com amigos</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center mx-auto mb-2"><span className="font-bold text-pink-700">2</span></div>
                <p className="text-sm text-pink-700">Amigo faz primeiro pedido usando o código</p>
              </div>
              <div className="text-center">
                <div className="w-10 h-10 rounded-full bg-pink-200 flex items-center justify-center mx-auto mb-2"><span className="font-bold text-pink-700">3</span></div>
                <p className="text-sm text-pink-700">Ambos recebem cashback como crédito</p>
              </div>
            </div>
          </Card>

          {/* Recent Referrals */}
          <Card className="p-6">
            <h2 className="font-bold text-lg mb-4">Indicações Recentes</h2>
            {data.recentReferrals.length > 0 ? (
              <div className="space-y-2">
                {data.recentReferrals.map((r, i) => (
                  <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${r.status === 'CONVERTED' ? 'bg-green-50' : 'bg-gray-50'}`}>
                    <div>
                      <p className="text-sm font-medium">{r.referrerName} → {r.referredName}</p>
                      <p className="text-xs text-gray-500">{new Date(r.date).toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'CONVERTED' ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                        {r.status === 'CONVERTED' ? 'Convertida' : 'Pendente'}
                      </span>
                      {r.cashback > 0 && <span className="text-sm font-bold text-green-600">+{formatBRL(r.cashback)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400 text-sm text-center py-4">Nenhuma indicação registrada ainda.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
