// @ts-nocheck
'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react';

type VerificationState = 'checking' | 'success' | 'pending' | 'error';

const MP_POLL_INTERVAL_MS = 2000;
const MP_POLL_TIMEOUT_MS = 30000;

export default function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('session_id'); // Stripe
  const mpSubscriptionId = searchParams.get('subscription_id'); // Mercado Pago
  const [state, setState] = useState<VerificationState>('checking');
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    if (sessionId) {
      verifyStripeSession(sessionId);
    } else if (mpSubscriptionId) {
      pollMercadoPagoSubscription();
    } else {
      setState('error');
    }

    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, mpSubscriptionId]);

  async function verifyStripeSession(id: string) {
    try {
      const res = await fetch(`/api/billing/checkout-session/status?session_id=${encodeURIComponent(id)}`);
      const data = await res.json();
      if (cancelled.current) return;
      if (res.ok && data.complete && (data.subscriptionStatus === 'active' || data.subscriptionStatus === 'trialing')) {
        setState('success');
      } else if (res.ok && data.complete) {
        // Checkout finished but the subscription webhook hasn't landed yet -
        // wait for it the same way the Mercado Pago branch does.
        pollConfirmation();
      } else {
        setState('pending');
      }
    } catch (error) {
      console.error('Stripe session verification error:', error);
      if (!cancelled.current) setState('error');
    }
  }

  async function pollMercadoPagoSubscription() {
    pollConfirmation();
  }

  async function pollConfirmation() {
    const startedAt = Date.now();
    while (!cancelled.current && Date.now() - startedAt < MP_POLL_TIMEOUT_MS) {
      try {
        const res = await fetch('/api/conta/subscription');
        const data = await res.json();
        if (cancelled.current) return;
        if (data?.subscription?.status === 'active' || data?.subscription?.status === 'trialing') {
          setState('success');
          return;
        }
      } catch (error) {
        console.error('Subscription polling error:', error);
      }
      await new Promise((resolve) => setTimeout(resolve, MP_POLL_INTERVAL_MS));
    }
    if (!cancelled.current) setState('pending');
  }

  if (state === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 mx-auto mb-4 animate-spin" />
          <p className="text-white">Confirmando seu pagamento...</p>
        </div>
      </div>
    );
  }

  if (state === 'pending') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <div className="p-8 text-center">
            <div className="mb-4 flex justify-center">
              <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Confirmando pagamento</h1>
            <p className="text-slate-600 mb-6">
              Recebemos seu pedido e estamos aguardando a confirmação do pagamento.
              Isso pode levar alguns minutos — você será notificado assim que a assinatura for ativada.
            </p>
            <div className="space-y-3">
              <Button onClick={() => router.push('/dashboard/billing')} className="w-full">
                Ver status da assinatura
              </Button>
              <Button onClick={() => router.push('/dashboard')} variant="outline" className="w-full">
                Ir para Dashboard
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <div className="p-8 text-center">
            <div className="mb-4 flex justify-center">
              <AlertTriangle className="w-16 h-16 text-amber-500" />
            </div>
            <h1 className="text-3xl font-bold mb-2">Não foi possível confirmar</h1>
            <p className="text-slate-600 mb-6">
              Não encontramos os dados desse checkout. Se você concluiu o pagamento, confira o status da sua assinatura.
            </p>
            <div className="space-y-3">
              <Button onClick={() => router.push('/dashboard/billing')} className="w-full">
                Ver status da assinatura
              </Button>
              <Button onClick={() => router.push('/pricing')} variant="outline" className="w-full">
                Voltar para planos
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <div className="p-8 text-center">
          <div className="mb-4 flex justify-center">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Assinatura ativada!</h1>
          <p className="text-slate-600 mb-6">
            Sua assinatura foi confirmada com sucesso.
          </p>
          <div className="space-y-3">
            <Button onClick={() => router.push('/dashboard')} className="w-full">
              Ir para Dashboard
            </Button>
            <Button onClick={() => router.push('/dashboard/billing')} variant="outline" className="w-full">
              Ver Assinatura
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
