// @ts-nocheck
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CreditCard, Wallet, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GatewayChoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tierId: string;
  tierName: string;
  billing: 'monthly' | 'annual';
  mercadoPagoEnabled: boolean;
}

async function startCheckout(endpoint: string, tierId: string, billing: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tierId, billing }),
  });
  const data = await response.json();
  if (!response.ok || !data.url) {
    throw new Error(data.error || 'Erro ao criar sessão de checkout');
  }
  window.location.href = data.url;
}

export function GatewayChoiceDialog({
  open,
  onOpenChange,
  tierId,
  tierName,
  billing,
  mercadoPagoEnabled,
}: GatewayChoiceDialogProps) {
  const [loading, setLoading] = useState<'stripe' | 'mercadopago' | null>(null);

  const handleChoice = async (gateway: 'stripe' | 'mercadopago') => {
    setLoading(gateway);
    try {
      await startCheckout(
        gateway === 'stripe' ? '/api/billing/checkout-session' : '/api/billing/mp/checkout-session',
        tierId,
        billing
      );
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao processar checkout');
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como você quer pagar o plano {tierName}?</DialogTitle>
          <DialogDescription>
            Escolha a forma de pagamento para continuar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {mercadoPagoEnabled && (
            <button
              type="button"
              onClick={() => handleChoice('mercadopago')}
              disabled={loading !== null}
              className={cn(
                'w-full flex items-center gap-4 p-4 rounded-xl border-2 border-blue-500 bg-blue-50 dark:bg-blue-950/20 text-left transition hover:bg-blue-100 dark:hover:bg-blue-950/40 disabled:opacity-60'
              )}
            >
              <Wallet className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  Cartão brasileiro via Mercado Pago
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Recomendado — pagamento nacional, sem taxas internacionais
                </p>
              </div>
              {loading === 'mercadopago' ? (
                <span className="text-xs text-slate-500">Processando...</span>
              ) : (
                <ArrowRight className="w-4 h-4 text-blue-600 flex-shrink-0" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleChoice('stripe')}
            disabled={loading !== null}
            className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            <CreditCard className="w-6 h-6 text-slate-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-slate-900 dark:text-slate-100">
                Cartão internacional via Stripe
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Para quem prefere ou precisa de cartão emitido fora do Brasil
              </p>
            </div>
            {loading === 'stripe' ? (
              <span className="text-xs text-slate-500">Processando...</span>
            ) : (
              <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
