'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, TrendingUp } from 'lucide-react';

interface LimitStatus {
  remaining: number;
  limit: number;
  tier: string;
  currentCount?: number;
}

/**
 * Badge que mostra o status do limite de transações do plano do usuário
 * Aparece quando o usuário está perto do limite ou já atingiu
 */
export function TransactionLimitBadge() {
  const [status, setStatus] = useState<LimitStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStatus() {
      try {
        const response = await fetch('/api/transaction-limit-status');
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.error('Erro ao buscar status:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    // Atualizar a cada minuto
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !status) return null;

  const isNearLimit = status.remaining <= 10 && status.remaining > 0;
  const isAtLimit = status.remaining <= 0;
  const isNoLimit =
    status.limit >= 999999; // Planos pagos têm limite muito alto

  // Não mostrar para planos ilimitados
  if (isNoLimit) return null;

  if (isAtLimit) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-red-700 border border-red-200">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold">Limite Atingido</span>
          <span className="text-xs opacity-90">
            {status.limit} transações/dia usadas
          </span>
        </div>
      </div>
    );
  }

  if (isNearLimit) {
    const percentageUsed = Math.round(
      ((status.limit - status.remaining) / status.limit) * 100
    );
    return (
      <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-yellow-700 border border-yellow-200">
        <AlertCircle className="h-4 w-4 flex-shrink-0" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold">Limite Próximo</span>
          <span className="text-xs opacity-90">
            {status.remaining} de {status.limit} restantes ({percentageUsed}% usado)
          </span>
        </div>
      </div>
    );
  }

  // Mostrar status de transações normais apenas para plano Starter
  if (status.tier === 'starter' && status.limit === 50) {
    const percentageUsed = Math.round(
      ((status.limit - status.remaining) / status.limit) * 100
    );
    return (
      <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700 border border-blue-200">
        <TrendingUp className="h-4 w-4 flex-shrink-0" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold">Transações</span>
          <span className="text-xs opacity-90">
            {status.remaining} de {status.limit} disponíveis ({percentageUsed}% usado)
          </span>
        </div>
      </div>
    );
  }

  return null;
}
