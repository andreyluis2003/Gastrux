'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface ToggleState { closed: boolean; reason?: 'manual' | 'horario' | null; opens?: string | null }

/**
 * Loja aberta / fechada (spec 2026-11-07 quadro-de-pedidos §A; by the hours: spec 2026-11-08 loja-pelo-horario).
 * Closed: no new orders from the delivery site, WhatsApp or the order API (and iFood when closed by hand); the
 * dining room goes on. Closed by the hours, it says when it opens and is not opened by hand. `state` lets a parent
 * that already loaded it skip the first request.
 */
export function StoreToggle({ state, onChange }: { state?: ToggleState | null; onChange?: (s: ToggleState) => void }) {
  const [s, setS] = useState<ToggleState | null>(state ?? null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/pedidos/loja', { cache: 'no-store' });
    if (res.ok) setS(await res.json());
  }, []);
  useEffect(() => { if (state) setS(state); else load(); }, [state, load]);

  if (!s) return null;

  if (s.closed && s.reason === 'horario') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-2 rounded-full border border-red-300 bg-red-50 px-3 py-1.5 font-semibold text-red-700">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
          Fechada pelo horário{s.opens ? ` · abre ${s.opens}` : ''}
        </span>
        <Link href="/admin/settings" className="text-xs underline text-muted-foreground">Mudar horário</Link>
      </div>
    );
  }

  const toggle = async () => {
    const next = !s.closed;
    if (next && !window.confirm('Fechar a loja? O site de delivery, o WhatsApp, a API de pedidos, o iFood e a 99Food param de receber pedidos novos. O salão continua normal.')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/pedidos/loja', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fechada: next }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível mudar'); return; }
      const after: ToggleState = body.state ?? { closed: next, reason: next ? 'manual' : null };
      setS(after);
      onChange?.(after);
      const ifood = body.ifood === 'paused' ? ' O iFood foi pausado.' : body.ifood === 'resumed' ? ' O iFood voltou.' : '';
      // The 99Food is told in the background; a failure comes in the sino
      const ninetynine = body.ninetynine === 'pending' ? (next ? ' Pausando a 99Food.' : ' Reabrindo a 99Food.') : '';
      toast.success((after.closed ? (after.reason === 'horario' ? `Loja fechada pelo horário${after.opens ? ` (abre ${after.opens})` : ''}.` : 'Loja fechada.') : 'Loja aberta.') + ifood + ninetynine);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={!s.closed}
      disabled={busy}
      onClick={toggle}
      title={s.closed ? 'Tocar para abrir a loja' : 'Tocar para fechar a loja'}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold',
        s.closed ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-800'
      )}
    >
      <span className={cn('h-2.5 w-2.5 rounded-full', s.closed ? 'bg-red-500' : 'bg-green-500')} />
      {s.closed ? 'Loja fechada' : 'Loja aberta'}
    </button>
  );
}
