'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown on the payments dashboard while the restaurant has no active Mercado
 * Pago connection: without it, online PIX is unavailable to its customers.
 */
export function MpConnectBanner() {
  const [state, setState] = useState<'hidden' | 'connect' | 'reconnect'>('hidden');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pagamentos/mp/connect')
      .then((res) => (res.ok ? res.json() : null))
      .then((status) => {
        if (cancelled || !status || !status.configured || status.connected) return;
        setState(status.needsReconnect ? 'reconnect' : 'connect');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'hidden') return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-900 flex-1">
        {state === 'reconnect'
          ? 'Sua conexão com o Mercado Pago expirou. Reconecte para voltar a receber PIX online.'
          : 'Conecte seu Mercado Pago para continuar recebendo PIX online dos seus clientes.'}
      </p>
      <Link href="/dashboard/pagamentos/conectar">
        <Button size="sm">{state === 'reconnect' ? 'Reconectar' : 'Conectar agora'}</Button>
      </Link>
    </div>
  );
}
