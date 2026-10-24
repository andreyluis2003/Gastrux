'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface State {
  mode: 'centralized' | 'distributed';
  available: boolean;
  connected: boolean;
  merchant: { id: string; name: string } | null;
  paused: boolean;
  stale: boolean;
  lastPolledAt: string | null;
  lastOrderAt: string | null;
  syncStatus: string | null;
  syncError: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nenhum ainda');

function badge(s: State): { label: string; className: string } {
  if (!s.connected) return { label: 'Desconectada', className: 'bg-gray-100 text-gray-700' };
  if (s.paused) return { label: 'Pausada', className: 'bg-amber-100 text-amber-800' };
  if (s.syncStatus === 'FAILED') return { label: 'Com erro', className: 'bg-red-100 text-red-700' };
  if (s.stale) return { label: 'Desconectada', className: 'bg-gray-100 text-gray-700' };
  return { label: 'Conectada', className: 'bg-green-100 text-green-800' };
}

/** Configurações > iFood (plan 2026-10-24 ifood, Task 7): connect, pause and disconnect the iFood store */
export default function IfoodPage() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<{ userCode: string; verificationUrlComplete: string } | null>(null);
  const [authorizationCode, setAuthorizationCode] = useState('');
  const [merchants, setMerchants] = useState<Array<{ id: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/integrations/ifood', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar o iFood'); return; }
    setState(body);
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/integrations/ifood', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'O iFood não respondeu, tente de novo'); return null; }
      return body;
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const body = await act({ action: 'start' });
    if (body) { setCode(body); setMerchants(null); }
  };

  const linked = (body: any) => {
    if (body?.merchants) { setMerchants(body.merchants); return; }
    if (body?.merchant) {
      toast.success(`Loja "${body.merchant.name}" conectada`);
      setCode(null); setMerchants(null); setAuthorizationCode('');
      load();
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar o iFood? Os pedidos do iFood param de chegar no Gastrux e a loja fecha no iFood.')) return;
    const res = await fetch('/api/admin/integrations/ifood', { method: 'DELETE' });
    if (!res.ok) { toast.error('Não foi possível desconectar'); return; }
    toast.success('iFood desconectado');
    load();
  };

  const b = state ? badge(state) : null;

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">iFood</h1>
        <p className="text-sm text-muted-foreground">
          Os pedidos do iFood chegam sozinhos em Vender &gt; Pedidos de delivery e vão para a cozinha quando você aceita. O
          status (em preparo, pronto, saiu para entrega) volta para o iFood.
        </p>
      </div>

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}
      {state === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}

      {state && !state.available && (
        <Card className="p-4 text-sm">
          O iFood integrado é do plano Business. <Link href="/pricing" className="underline font-medium">Ver planos</Link>
        </Card>
      )}

      {state && b && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium">{state.merchant ? state.merchant.name : 'Nenhuma loja conectada'}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.className}`}>{b.label}</span>
          </div>
          {state.connected && (
            <p className="text-xs text-muted-foreground">
              Último pedido: {when(state.lastOrderAt)} · última conversa com o iFood: {when(state.lastPolledAt)}
            </p>
          )}
          {state.syncStatus === 'FAILED' && state.syncError && <p className="text-xs text-red-600 break-words">{state.syncError}</p>}
          {state.connected && state.paused && (
            <p className="text-xs text-amber-800">Pausada: o Gastrux não busca pedidos e o iFood fecha a loja em alguns minutos.</p>
          )}
          {state.connected && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => { if (await act({ action: state.paused ? 'resume' : 'pause' })) load(); }}>
                {state.paused ? 'Retomar' : 'Pausar'}
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={disconnect}>Desconectar</Button>
            </div>
          )}
        </Card>
      )}

      {state?.available && !state.connected && state.mode === 'centralized' && (
        <Card className="p-4 text-sm">Modo de teste: a equipe do Gastrux liga a loja de teste do iFood a este restaurante.</Card>
      )}

      {state?.available && !state.connected && state.mode === 'distributed' && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-medium">Conectar a loja do iFood</p>
          <ol className="list-decimal pl-5 text-sm space-y-1">
            <li>Clique em <strong>Conectar iFood</strong>.</li>
            <li>Abra o link e digite o código no Portal do Parceiro do iFood (entre com a conta da loja).</li>
            <li>Cole aqui o código de autorização que o Portal mostrar.</li>
          </ol>
          {!code && <Button disabled={busy} onClick={start}>Conectar iFood</Button>}
          {code && (
            <div className="space-y-3">
              <div className="rounded border bg-gray-50 p-3 text-sm space-y-1">
                <p>Código: <code className="text-base font-bold">{code.userCode}</code></p>
                <a href={code.verificationUrlComplete} target="_blank" rel="noopener noreferrer" className="underline">Abrir o Portal do Parceiro</a>
              </div>
              <div className="flex gap-2">
                <Input placeholder="Código de autorização" value={authorizationCode} maxLength={200} onChange={(e) => setAuthorizationCode(e.target.value)} />
                <Button disabled={busy || !authorizationCode.trim()} onClick={async () => linked(await act({ action: 'finish', authorizationCode }))}>Concluir</Button>
              </div>
              <Button size="sm" variant="ghost" disabled={busy} onClick={start}>Gerar outro código</Button>
            </div>
          )}
          {merchants && (
            <div className="space-y-2">
              <p className="text-sm">Esta conta tem mais de uma loja. Qual é a deste restaurante?</p>
              {merchants.map((m) => (
                <Button key={m.id} variant="outline" className="w-full justify-start" disabled={busy} onClick={async () => linked(await act({ action: 'select', merchantId: m.id }))}>
                  {m.name}
                </Button>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
