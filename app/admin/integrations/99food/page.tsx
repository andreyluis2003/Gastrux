'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface State {
  configured: boolean;
  available: boolean;
  connected: boolean;
  store: { appShopId: string; name: string } | null;
  paused: boolean;
  status: { syncStatus: string; syncError: string | null } | null;
  lastOrderAt: string | null;
  /** The store picked here, waiting for the Gastrux staff to confirm it */
  request: { appShopId: string; name: string; requestedAt: string | null } | null;
}

type Store = { appShopId: string; name: string };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nenhum ainda');

/** The badge: paused here first, then what the 99Food last said about the store (shopStatus sub_biz_status) */
function badge(s: State): { label: string; className: string } {
  if (!s.connected) return { label: 'Desconectada', className: 'bg-gray-100 text-gray-700' };
  if (s.paused) return { label: 'Pausada', className: 'bg-amber-100 text-amber-800' };
  if (s.status?.syncStatus === 'FAILED') return { label: s.status.syncError || 'Com erro', className: 'bg-red-100 text-red-700' };
  if (s.status?.syncStatus === 'PARTIAL') return { label: s.status.syncError || 'Fechada na 99Food', className: 'bg-amber-100 text-amber-800' };
  if (s.status?.syncStatus === 'SUCCESS') return { label: 'Aberta na 99Food', className: 'bg-green-100 text-green-800' };
  return { label: 'Conectada', className: 'bg-green-100 text-green-800' };
}

/** Configurações > 99Food (plan 2026-11-09 99food, Task 6): connect, pause and disconnect the 99Food store */
export default function NinetynineFoodPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [stores, setStores] = useState<Store[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/integrations/99food', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar a 99Food'); return; }
    setState(body);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/integrations/99food', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'A 99Food não respondeu, tente de novo'); return null; }
      return body;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    // the tab opens before the request so the browser does not block it as a pop-up
    const tab = window.open('', '_blank');
    const body = await act({ action: 'start' });
    if (body?.url) {
      if (tab) tab.location.href = body.url; else window.location.href = body.url;
      setOpened(true);
      setStores(null);
    } else {
      tab?.close();
    }
  };

  const findStores = async () => {
    const body = await act({ action: 'stores' });
    if (body) setStores(body.stores ?? []);
  };

  const select = async (s: Store) => {
    const body = await act({ action: 'select', appShopId: s.appShopId });
    if (body?.request) {
      toast.success(`Pedido enviado para a loja "${body.request.name}"`);
      setStores(null); setOpened(false);
      load();
    }
  };

  const cancelRequest = async () => {
    if (!window.confirm('Cancelar o pedido de ligação da loja da 99Food?')) return;
    if (await act({ action: 'cancel' })) load();
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar a 99Food? Os pedidos da 99Food param de chegar no Gastrux.')) return;
    const res = await fetch('/api/admin/integrations/99food', { method: 'DELETE' });
    if (!res.ok) { toast.error('Não foi possível desconectar'); return; }
    toast.success('99Food desconectada');
    load();
  };

  const b = state ? badge(state) : null;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">99Food</h1>
        <p className="text-sm text-muted-foreground">
          Os pedidos da 99Food chegam sozinhos em Vender &gt; Pedidos de delivery. O status (aceito, pronto, entregue) volta
          para a 99Food.
        </p>
      </div>

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}
      {state === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {state && !state.available && (
        <Card className="p-4 text-sm">
          A 99Food integrada é do plano Business. <Link href="/pricing" className="underline font-medium">Ver planos</Link>
        </Card>
      )}

      {state && state.available && b && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{state.store ? state.store.name : 'Nenhuma loja conectada'}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}>{b.label}</span>
          </div>
          {state.connected && <p className="text-xs text-muted-foreground">Último pedido: {when(state.lastOrderAt)}</p>}
          {state.connected && state.paused && (
            <p className="text-xs text-amber-800">Pausada: a loja fica fechada na 99Food até você retomar (ou até o fim do dia).</p>
          )}
          {state.connected && (
            <>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await act({ action: state.paused ? 'resume' : 'pause' })) load(); }}>
                  {state.paused ? 'Retomar' : 'Pausar'}
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={disconnect}>Desconectar</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Desconectar aqui para de trazer os pedidos. Para tirar a autorização do Gastrux, faça também no portal da 99Food.
              </p>
            </>
          )}
        </Card>
      )}

      {state && !state.configured && !state.connected && (
        <Card className="p-4 text-sm">
          A conexão com a 99Food não está ligada neste servidor. Fale com o suporte do Gastrux pelo chat. Enquanto isso, os
          pedidos da 99Food continuam no app da 99Food.
        </Card>
      )}

      {state?.configured && state.available && !state.connected && state.request && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-medium">Loja escolhida: {state.request.name}</p>
          <p className="text-sm">Aguardando a confirmação da equipe Gastrux. Costuma levar até 1 dia útil.</p>
          <Button variant="outline" className="w-fit" disabled={busy} onClick={cancelRequest}>Cancelar pedido</Button>
        </Card>
      )}

      {state?.configured && state.available && !state.connected && !state.request && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-medium">Conectar a loja da 99Food</p>
          <ol className="list-none text-sm space-y-1">
            <li>1. Toque em Abrir a 99Food e autorize o Gastrux na sua loja (precisa ser o administrador da loja na 99Food).</li>
            <li>2. Volte aqui e escolha sua loja.</li>
          </ol>
          <p className="text-xs text-muted-foreground">A loja precisa já estar aprovada na 99Food.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={start}>Abrir a 99Food</Button>
            <Button variant={opened ? 'default' : 'outline'} disabled={busy} onClick={findStores}>Escolher minha loja</Button>
          </div>
          {stores && stores.length === 0 && (
            <p className="text-sm text-amber-800">
              Não encontramos sua loja. Confira se o telefone da loja na 99Food é o mesmo do seu cadastro no Gastrux, ou fale com o suporte.
            </p>
          )}
          {stores && stores.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">Qual é a loja deste restaurante?</p>
              {stores.map((s) => (
                <Button key={s.appShopId} variant="outline" className="w-full justify-start" disabled={busy} onClick={() => select(s)}>
                  {s.name}
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
