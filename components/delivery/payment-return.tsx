'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';

type ReturnState = 'checking' | 'approved' | 'failed' | 'notFound' | 'timeout';

/** The webhook is what confirms the payment: poll gently, and stop after a bounded time. */
const POLL_FAST_MS = 3000;
const POLL_SLOW_MS = 8000;
const FAST_WINDOW_MS = 60 * 1000;
const GIVE_UP_AFTER_MS = 10 * 60 * 1000;

/** Statuses (lowercased by the status route) that will not turn into an approval. */
const FAILED_STATUSES = ['declined', 'cancelled', 'chargeback'];

interface Props {
  restaurantId: string;
  paymentId: string;
  orderNumber: string;
}

/**
 * Shown when the customer comes back from Mercado Pago's card checkout
 * (?payment=<our Payment.id>&n=<order number>). It asks OUR server for the
 * payment status; the webhook is what actually marks the payment as paid, and
 * the order is only confirmed once the payment is approved.
 */
export function PaymentReturn({ restaurantId, paymentId, orderNumber }: Props) {
  const [state, setState] = useState<ReturnState>('checking');
  // Bumped by "Verificar novamente" to restart the polling after a timeout.
  const [round, setRound] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const schedule = () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed >= GIVE_UP_AFTER_MS) {
        if (!cancelled) setState('timeout');
        return;
      }
      timer = setTimeout(check, elapsed < FAST_WINDOW_MS ? POLL_FAST_MS : POLL_SLOW_MS);
    };

    const check = async () => {
      try {
        const res = await fetch(`/api/pagamentos/mp/pix/status?paymentId=${encodeURIComponent(paymentId)}`, {
          cache: 'no-store',
        });
        if (cancelled) return;
        if (res.status === 404 || res.status === 400) {
          setState('notFound');
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.approved) {
          setState('approved');
          return;
        }
        if (FAILED_STATUSES.includes(data.status)) {
          setState('failed');
          return;
        }
      } catch {
        /* network hiccup or non-JSON answer: keep polling until the deadline */
      }
      if (!cancelled) schedule();
    };

    setState('checking');
    timer = setTimeout(check, 0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId, round]);

  const backToMenu = () => {
    window.location.href = `/delivery/${restaurantId}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center p-4">
      <Card className="p-8 text-center max-w-md w-full space-y-4" aria-live="polite">
        {state === 'checking' && (
          <>
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-orange-600" />
            <h2 className="text-xl font-bold">Confirmando seu pagamento...</h2>
            <p className="text-sm text-gray-600">
              Pedido #{orderNumber}. Estamos aguardando a confirmação do pagamento, isso leva só alguns instantes.
              Não pague novamente e não feche esta página.
            </p>
          </>
        )}
        {state === 'approved' && (
          <>
            <CheckCircle className="h-14 w-14 mx-auto text-green-600" />
            <h2 className="text-2xl font-bold text-green-800">Pagamento confirmado!</h2>
            <p className="text-gray-600">
              Seu pedido <span className="font-bold">#{orderNumber}</span> foi recebido pelo restaurante.
            </p>
          </>
        )}
        {state === 'failed' && (
          <>
            <XCircle className="h-14 w-14 mx-auto text-red-600" />
            <h2 className="text-xl font-bold text-red-700">Pagamento não aprovado</h2>
            <p className="text-sm text-gray-600">
              O pagamento do pedido #{orderNumber} não foi aprovado e o pedido não foi confirmado. Volte ao cardápio para
              fazer um novo pedido ou fale com o restaurante.
            </p>
          </>
        )}
        {state === 'notFound' && (
          <>
            <XCircle className="h-14 w-14 mx-auto text-gray-500" />
            <h2 className="text-xl font-bold">Não encontramos este pagamento</h2>
            <p className="text-sm text-gray-600">
              O link pode estar incompleto ou vencido. Se você já pagou o pedido #{orderNumber}, fale com o restaurante
              antes de tentar de novo.
            </p>
          </>
        )}
        {state === 'timeout' && (
          <>
            <Clock className="h-14 w-14 mx-auto text-orange-500" />
            <h2 className="text-xl font-bold">Pagamento em confirmação</h2>
            <p className="text-sm text-gray-600">
              Ainda estamos confirmando o pagamento do pedido #{orderNumber}. Se você já pagou, não pague novamente: o
              pedido será confirmado assim que o pagamento for aprovado, o que pode levar alguns minutos. Se demorar
              muito, fale com o restaurante.
            </p>
            <Button variant="outline" className="w-full" onClick={() => setRound((r) => r + 1)}>
              Verificar novamente
            </Button>
          </>
        )}
        <Button className="w-full" onClick={backToMenu}>
          Voltar ao cardápio
        </Button>
      </Card>
    </div>
  );
}
