'use client';

import { useEffect, useState } from 'react';
import { X, Star, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { STRIPE_PRICING_TIERS } from '@/lib/stripe-config';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTier: string;
  remaining: number;
  limit: number;
}

/**
 * Modal que aparece quando usuário Starter atinge limite de transações
 * Sugere upgrade para plano Pro ou Business
 */
export function UpgradeModal({
  isOpen,
  onClose,
  currentTier,
  remaining,
  limit,
}: UpgradeModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isOpen) return null;

  const isStarter = currentTier === 'starter';
  const isAtLimit = remaining <= 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-bold text-gray-900">
              {isAtLimit ? 'Limite Atingido' : 'Proxima do Limite'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          {/* Current Status */}
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-gray-600 mb-2">
              Seu plano <strong>{STRIPE_PRICING_TIERS.STARTER.name}</strong> permite:
            </p>
            <p className="text-2xl font-bold text-red-600">
              {limit} transações/dia
            </p>
            <p className="text-sm text-gray-600 mt-2">
              {isAtLimit ? (
                <span className="text-red-600 font-semibold">
                  Voce atingiu seu limite hoje!
                </span>
              ) : (
                <span>
                  Você tem apenas <strong>{remaining}</strong> transações restantes
                </span>
              )}
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-gray-900">Com um plano pago você ganha:</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                <span className="text-sm text-gray-700">Transações ilimitadas</span>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                <span className="text-sm text-gray-700">Mais ingredientes e usuários</span>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                <span className="text-sm text-gray-700">Recursos avançados</span>
              </div>
              <div className="flex items-start gap-2">
                <ArrowRight className="h-4 w-4 text-green-600 mt-1 flex-shrink-0" />
                <span className="text-sm text-gray-700">Prioridade em suporte</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-6 py-4 flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
          >
            Fechar
          </Button>
          <Button
            asChild
            className="flex-1 bg-blue-600 hover:bg-blue-700"
          >
            <Link href="/pricing">
              Ver Planos
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
