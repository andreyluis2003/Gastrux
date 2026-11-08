'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Loja aberta / fechada (spec 2026-11-07 quadro-de-pedidos §A). Closed: no new orders from the delivery site,
 * WhatsApp, the order API or iFood; the dining room goes on. `state` lets a parent that already loaded it skip
 * the first request.
 */
export function StoreToggle({ state, onChange }: { state?: { closed: boolean } | null; onChange?: (closed: boolean) => void }) {
  const [closed, setClosed] = useState<boolean | null>(state ? state.closed : null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/pedidos/loja', { cache: 'no-store' });
    if (res.ok) setClosed(!!(await res.json()).closed);
  }, []);
  useEffect(() => { if (state) setClosed(state.closed); else load(); }, [state, load]);

  const toggle = async () => {
    if (closed === null) return;
    const next = !closed;
    if (next && !window.confirm('Fechar a loja? O site de delivery, o WhatsApp, a API de pedidos e o iFood param de receber pedidos novos. O salão continua normal.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pedidos/loja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fechada: next }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível mudar'); return; }
      setClosed(next);
      onChange?.(next);
      const ifood = body.ifood === 'paused' ? ' O iFood foi pausado.' : body.ifood === 'resumed' ? ' O iFood voltou.' : '';
      toast.success((next ? 'Loja fechada.' : 'Loja aberta.') + ifood);
    } finally {
      setBusy(false);
    }
  };

  if (closed === null) return null;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!closed}
      disabled={busy}
      onClick={toggle}
      title={closed ? 'Tocar para abrir a loja' : 'Tocar para fechar a loja'}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
        closed ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-800'
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', closed ? 'bg-red-500' : 'bg-green-500')} />
      {closed ? 'Loja fechada' : 'Loja aberta'}
    </button>
  );
}
