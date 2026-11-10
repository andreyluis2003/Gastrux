'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock } from 'lucide-react';
import { BackButton } from '@/components/ui/back-button';
import { StoreToggle, type ToggleState } from '@/components/orders/store-toggle';
import { brl } from '@/components/caixa/money';
import { cn } from '@/lib/utils';
import { CHANNEL_LABEL, STAGES, type BoardCard, type Channel } from '@/lib/orders/board-shared';

const REFRESH_MS = 15_000;
const FILTER_KEY = 'gx-pedidos-canal';
const CHANNELS: Channel[] = ['salao', 'balcao', 'site', 'whatsapp', 'ifood', 'ninetynine', 'api'];
const STAGE_COLOR: Record<string, string> = {
  novo: 'bg-amber-500', preparo: 'bg-sky-600', pronto: 'bg-emerald-600', entrega: 'bg-violet-600',
};
const CHANNEL_COLOR: Record<Channel, string> = {
  salao: 'bg-slate-100 text-slate-800', balcao: 'bg-slate-100 text-slate-800', site: 'bg-orange-100 text-orange-800',
  whatsapp: 'bg-green-100 text-green-800', ifood: 'bg-red-100 text-red-700', ninetynine: 'bg-yellow-100 text-yellow-800', api: 'bg-indigo-100 text-indigo-800', outros: 'bg-gray-100 text-gray-700',
};

const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));

/**
 * Vender > Todos os pedidos (spec 2026-11-07 quadro-de-pedidos §B): every open order of every channel, by stage,
 * with the channel filter and Loja aberta/fechada on top. Read only: a card opens the screen that handles it.
 */
export default function TodosOsPedidosPage() {
  const [cards, setCards] = useState<BoardCard[] | null>(null);
  const [store, setStore] = useState<ToggleState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Channel | 'todos'>('todos');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    try { const f = localStorage.getItem(FILTER_KEY); if (f && (f === 'todos' || CHANNELS.includes(f as Channel))) setFilter(f as Channel | 'todos'); } catch {}
  }, []);
  const choose = (f: Channel | 'todos') => { setFilter(f); try { localStorage.setItem(FILTER_KEY, f); } catch {} };

  const load = useCallback(async () => {
    const res = await fetch('/api/pedidos/quadro', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar os pedidos'); return; }
    setError(null);
    setCards(body.cards);
    setStore(body.store);
    setNow(Date.now());
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const c = setInterval(() => setNow(Date.now()), 30_000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { todos: cards?.length ?? 0 };
    for (const c of cards ?? []) m[c.channel] = (m[c.channel] ?? 0) + 1;
    return m;
  }, [cards]);
  const shown = (cards ?? []).filter((c) => filter === 'todos' || c.channel === filter);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BackButton href="/vender" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Todos os pedidos</h1>
            <p className="text-sm text-muted-foreground">Salão, balcão, site, WhatsApp, iFood e API numa tela. Toque num pedido para abrir.</p>
          </div>
        </div>
        <StoreToggle state={store} onChange={setStore} />
      </div>

      {store?.closed && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {store.reason === 'horario'
            ? `Fechada pelo horário de funcionamento${store.opens ? ` (abre ${store.opens})` : ''}: o site, o WhatsApp e a API de pedidos não recebem pedidos novos. O salão continua normal.`
            : 'Loja fechada: o site, o WhatsApp, a API de pedidos e o iFood não recebem pedidos novos. O salão continua normal.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por canal">
        {(['todos', ...CHANNELS] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => choose(f)}
            className={cn('rounded-full border px-3 py-1 text-sm', filter === f ? 'border-primary bg-primary text-primary-foreground' : 'bg-white text-slate-700')}
          >
            {f === 'todos' ? 'Todos' : CHANNEL_LABEL[f]} <span className="opacity-70">({counts[f] ?? 0})</span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {cards === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {cards !== null && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((s) => {
            const list = shown.filter((c) => c.stage === s.id);
            return (
              <section key={s.id} className="rounded-lg border bg-white">
                <h2 className={cn('rounded-t-lg px-3 py-2 text-sm font-bold text-white', STAGE_COLOR[s.id])}>
                  {s.title} ({list.length})
                </h2>
                <div className="space-y-2 p-2">
                  {list.length === 0 && <p className="px-1 py-3 text-xs text-muted-foreground">Nenhum pedido</p>}
                  {list.map((c) => {
                    const mins = minutesSince(c.createdAt, now);
                    return (
                      <Link key={c.id} href={c.href} className="block rounded border p-2 hover:bg-slate-50">
                        <div className="flex items-start justify-between gap-2">
                          <span className="min-w-0 text-sm font-semibold leading-tight line-clamp-2">{c.label}</span>
                          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', CHANNEL_COLOR[c.channel])}>{CHANNEL_LABEL[c.channel]}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{c.number}</span>
                          <span>{c.items} {c.items === 1 ? 'item' : 'itens'}</span>
                          {c.totalCents !== null && <span className="font-medium text-slate-800">{brl(c.totalCents)}</span>}
                          <span className={cn('inline-flex items-center gap-1', mins >= 30 && 'font-semibold text-red-600')}>
                            <Clock className="h-3 w-3" /> {mins < 1 ? 'agora' : `${mins} min`}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
