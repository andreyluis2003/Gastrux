'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Request {
  restaurantId: string; restaurantName: string; restaurantPhone: string | null;
  appShopId: string; storeName: string; requestedAt: string | null;
  requestedBy: { name: string | null; email: string; whatsapp: string | null } | null;
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');

/**
 * Plataforma Gastrux > Lojas da 99Food (plan 2026-11-09 99food, Task 6): the restaurants that picked their 99Food store
 * wait here; the staff checks with the restaurant (phones do not prove who owns the store) and confirms or refuses.
 */
export default function PlatformNinetynineLinksPage() {
  const [requests, setRequests] = useState<Request[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/platform/99food-link', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error || 'Não foi possível carregar'); return; }
    setRequests(body.requests ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (r: Request, payload: Record<string, unknown>, ok: string) => {
    setBusy(r.restaurantId);
    try {
      const res = await fetch('/api/admin/platform/99food-link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(body.error || 'Não foi possível'); return; }
      toast.success(ok);
      load();
    } finally {
      setBusy(null);
    }
  };

  const confirm = (r: Request) => {
    if (!window.confirm(`Ligar a loja "${r.storeName}" da 99Food a ${r.restaurantName}? Confira antes com o restaurante que a loja é dele.`)) return;
    send(r, { restaurantId: r.restaurantId, appShopId: r.appShopId }, 'Loja ligada');
  };
  const refuse = (r: Request) => {
    if (!window.confirm(`Recusar o pedido de ${r.restaurantName}? O restaurante recebe um aviso para falar com o suporte.`)) return;
    send(r, { action: 'refuse', restaurantId: r.restaurantId }, 'Pedido recusado');
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Lojas da 99Food</h1>
        <p className="text-sm text-muted-foreground">
          Restaurantes que escolheram a loja da 99Food e esperam a confirmação. Confira com o restaurante que a loja é dele
          antes de ligar.
        </p>
      </div>
      {error && <Card className="p-4 text-sm text-red-600">{error}</Card>}
      {requests === null && !error && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {requests && requests.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhum pedido esperando.</Card>}
      {requests?.map((r) => (
        <Card key={r.restaurantId} className="p-4 space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{r.restaurantName}</p>
            <span className="text-xs text-muted-foreground">Pedido em {when(r.requestedAt)}</span>
          </div>
          <p className="text-sm">Loja da 99Food: <strong>{r.storeName || 'sem nome'}</strong> (app_shop_id {r.appShopId})</p>
          <p className="text-xs text-muted-foreground">
            Telefone do restaurante: {r.restaurantPhone || '—'}
            {r.requestedBy && <> · Pedido por {r.requestedBy.name || r.requestedBy.email} ({r.requestedBy.email}{r.requestedBy.whatsapp ? `, ${r.requestedBy.whatsapp}` : ''})</>}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" disabled={busy === r.restaurantId} onClick={() => confirm(r)}>Confirmar ligação</Button>
            <Button size="sm" variant="outline" disabled={busy === r.restaurantId} onClick={() => refuse(r)}>Recusar</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
