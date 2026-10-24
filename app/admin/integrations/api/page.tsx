'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Key {
  id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null;
  callbackUrl: string | null; callbackSecret: string; createdBy: string | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca');

/** Configurações > API de pedidos (plan 2026-10-23 api-de-pedidos): keys for other systems to send delivery orders */
export default function OrderApiPage() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [callbacks, setCallbacks] = useState<Record<string, string>>({});
  const [shownSecret, setShownSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/integrations/api-keys', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar as chaves'); return; }
    setKeys(body.keys);
    setAvailable(body.available !== false);
    setCallbacks(Object.fromEntries(body.keys.map((k: Key) => [k.id, k.callbackUrl ?? ''])));
  }, []);
  useEffect(() => { load(); }, [load]);

  const createKey = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/integrations/api-keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível criar a chave'); return; }
      setCreated({ name, key: body.key });
      setName('');
      load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (k: Key) => {
    if (!window.confirm(`Revogar a chave "${k.name}"? O sistema que usa esta chave para de mandar pedidos na hora.`)) return;
    const res = await fetch(`/api/admin/integrations/api-keys/${k.id}`, { method: 'DELETE' });
    if (!res.ok) { toast.error('Não foi possível revogar'); return; }
    toast.success('Chave revogada');
    load();
  };

  const saveCallback = async (k: Key) => {
    const res = await fetch(`/api/admin/integrations/api-keys/${k.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callbackUrl: callbacks[k.id] || null }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(body.error || 'Não foi possível salvar'); return; }
    toast.success(callbacks[k.id] ? 'Endereço de aviso salvo' : 'Avisos desligados');
    load();
  };

  const copy = (text: string) => { navigator.clipboard?.writeText(text); toast.success('Copiado'); };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">API de pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Chaves para o seu site, bot de WhatsApp ou outro sistema mandar pedidos de delivery direto para o Gastrux. Os
          pedidos aparecem em Vender &gt; Pedidos de delivery. Como usar:{' '}
          <Link href="/desenvolvedores" className="underline" target="_blank">página para desenvolvedores</Link>.
        </p>
      </div>

      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}

      {!available && (
        <Card className="p-4 text-sm">
          A API de pedidos é dos planos Pro e Business. <Link href="/pricing" className="underline font-medium">Ver planos</Link>
        </Card>
      )}

      {created && (
        <Card className="p-4 space-y-2 border-amber-300 bg-amber-50">
          <p className="text-sm font-medium">Chave "{created.name}" criada. Copie agora: ela não aparece de novo.</p>
          <div className="flex gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1 text-sm border">{created.key}</code>
            <Button size="sm" onClick={() => copy(created.key)}>Copiar</Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setCreated(null)}>Já copiei</Button>
        </Card>
      )}

      {available && (
        <Card className="p-4 space-y-2">
          <p className="text-sm font-medium">Nova chave</p>
          <div className="flex gap-2">
            <Input placeholder='Nome, como "Site da loja"' value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Button disabled={busy || !name.trim()} onClick={createKey}>Criar chave</Button>
          </div>
        </Card>
      )}

      {keys === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {keys?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma chave ainda.</p>}
      {keys?.map((k) => (
        <Card key={k.id} className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{k.name}</p>
              <p className="text-xs text-muted-foreground">
                <code>{k.prefix}…</code> · criada em {when(k.createdAt)}{k.createdBy ? ` por ${k.createdBy}` : ''} · último uso {when(k.lastUsedAt)}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => revoke(k)}>Revogar</Button>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Endereço de aviso (opcional): recebe cada mudança de status do pedido</label>
            <div className="flex gap-2">
              <Input placeholder="https://seu-sistema.com.br/gastrux" value={callbacks[k.id] ?? ''} onChange={(e) => setCallbacks((c) => ({ ...c, [k.id]: e.target.value }))} />
              <Button size="sm" variant="outline" onClick={() => saveCallback(k)}>Salvar</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada aviso vem assinado no cabeçalho <code>x-gastrux-signature</code>.{' '}
              {shownSecret === k.id ? (
                <>Segredo: <code className="break-all">{k.callbackSecret}</code> <button className="underline" onClick={() => copy(k.callbackSecret)}>copiar</button></>
              ) : (
                <button className="underline" onClick={() => setShownSecret(k.id)}>Mostrar o segredo da assinatura</button>
              )}
            </p>
          </div>
        </Card>
      ))}
    </div>
  );
}
