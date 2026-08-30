'use client';

import { useEffect, useState } from 'react';
import { BackButton } from '@/components/ui/back-button';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Calendar, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface UsageData {
  date: string;
  count: number;
  limit: number;
  percentage: number;
}

export default function UsagePage() {
  const [usage, setUsage] = useState<UsageData[]>([]);
  const [currentStatus, setCurrentStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchUsageData();
  }, [days]);

  async function fetchUsageData() {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/transaction-limit-status?days=${days}`
      );
      if (response.ok) {
        const data = await response.json();
        setCurrentStatus(data);
      }

      setUsage([]);
    } catch (error) {
      console.error('Erro ao buscar dados de uso:', error);
      toast.error('Erro ao carregar dados de uso');
    } finally {
      setLoading(false);
    }
  }

  const getTierLabel = (tier: string) => {
    const labels: Record<string, string> = {
      starter: 'Starter (Grátis)',
      pro: 'Pro',
      business: 'Business',
      enterprise: 'Enterprise',
    };
    return labels[tier] || tier;
  };

  const getPercentageColor = (percentage: number) => {
    if (percentage >= 100) return 'text-red-600 bg-red-50';
    if (percentage >= 80) return 'text-orange-600 bg-orange-50';
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <BackButton />
              <div>
                <h1 className="text-xl font-bold text-gray-900 sm:text-3xl">
                  Uso de Transações
                </h1>
                <p className="text-sm text-gray-600">
                  Monitore seu consumo diário de transações
                </p>
              </div>
            </div>
            <Button
              onClick={fetchUsageData}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="h-32 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : currentStatus ? (
          <div className="space-y-6">
            {/* Status Cards */}
            <div className="grid gap-6 md:grid-cols-3">
              {/* Plano */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">Seu Plano</h3>
                  <TrendingUp className="h-4 w-4 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {getTierLabel(currentStatus.tier)}
                </p>
              </Card>

              {/* Limite Diario */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-gray-600">
                    Limite Diario
                  </h3>
                  <Calendar className="h-4 w-4 text-gray-400" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {currentStatus.limit === 999999 ? (
                    <span className="text-green-600">Ilimitado</span>
                  ) : (
                    `${currentStatus.limit} transações`
                  )}
                </p>
              </Card>

              {/* Status Atual */}
              <Card
                className={`p-6 ${getPercentageColor(
                  (currentStatus.limit - currentStatus.remaining) /
                    currentStatus.limit *
                    100
                )}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Usado Hoje</h3>
                  {currentStatus.remaining <= 0 && (
                    <AlertCircle className="h-4 w-4" />
                  )}
                </div>
                <p className="text-2xl font-bold">
                  {currentStatus.current_count} / {currentStatus.limit}
                </p>
                <p className="text-sm mt-2">
                  {currentStatus.remaining} restantes
                </p>
              </Card>
            </div>

            {/* Status Message */}
            <Card className="border-l-4 border-blue-500 bg-blue-50 p-4">
              <p className="text-sm text-blue-900">
                {currentStatus.message}
              </p>
            </Card>

            {/* Upgrade CTA */}
            {currentStatus.tier === 'starter' && (
              <Card className="border-l-4 border-amber-500 bg-amber-50 p-6">
                <div className="space-y-3">
                  <h3 className="font-semibold text-amber-900">
                    Quer mais transações?
                  </h3>
                  <p className="text-sm text-amber-800">
                    Atualize para o plano Pro ou Business para obter transações
                    ilimitadas e outros recursos avançados.
                  </p>
                  <Button
                    asChild
                    className="gap-2 bg-amber-600 hover:bg-amber-700"
                  >
                    <a href="/pricing">Ver Planos</a>
                  </Button>
                </div>
              </Card>
            )}

            {/* Info */}
            <Card className="border-l-4 border-gray-400 bg-gray-50 p-4">
              <p className="text-xs text-gray-600">
                Os contadores sao resetados diariamente a meia-noite.
                Registros de mais de 30 dias sao automaticamente removidos do
                histórico.
              </p>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
