'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CashBar } from '@/components/vender/cash-bar';
import { SalaoGrid } from '@/components/vender/salao-grid';
import { CounterSale } from '@/components/comanda/counter-sale';
import { useOutbox } from '@/components/offline/outbox-provider';
import type { Salao, SalaoTable } from '@/lib/vender/salao';

/**
 * Vender: the room at a glance (spec 2026-10-07, 4.1). One tap on a free table opens its comanda; on
 * a busy one, goes into it. Refreshes every 10 s while visible, so waiters see each other's tables.
 */
export default function VenderPage() {
  const router = useRouter();
  const { online } = useOutbox();
  const [salao, setSalao] = useState<Salao | null>(null);
  const [stale, setStale] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [byName, setByName] = useState(false);
  const [name, setName] = useState('');
  const [counter, setCounter] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vender/salao', { cache: 'no-store' });
      if (!res.ok) return;
      setSalao(await res.json());
      setStale(res.headers.get('x-gastrux-cache') === 'stale');
    } catch {
      setStale(true);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 10_000);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  async function openSession(body: { tableId?: string; customerName?: string }) {
    if (!online) {
      toast.error('Sem internet: não dá para abrir uma comanda nova agora. Use a Venda balcão, que fica guardada neste aparelho.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/comanda/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao abrir a comanda');
      router.push(`/vender/${data.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  function onTable(t: SalaoTable) {
    if (t.session) router.push(`/vender/${t.session.id}`);
    else if (!busy) openSession({ tableId: t.id });
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <CashBar />

      {(stale || !online) && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 text-sm">
          Sem internet: mostrando o salão como estava na última atualização.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="lg" onClick={() => setByName((v) => !v)} className="gap-2"><Plus className="h-5 w-5" /> Comanda por nome</Button>
        <Button size="lg" variant="outline" onClick={() => setCounter((v) => !v)} className="gap-2"><ShoppingBag className="h-5 w-5" /> Venda balcão</Button>
      </div>

      {byName && (
        <form
          className="flex gap-2"
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) openSession({ customerName: name.trim() }); }}
        >
          <Input autoFocus placeholder="Nome do cliente" value={name} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={!name.trim() || busy}>Abrir</Button>
        </form>
      )}

      {counter && <CounterSale onDone={() => { setCounter(false); load(); }} />}

      <div className="flex items-center gap-2 border-b">
        <span className="px-3 py-2 font-semibold border-b-2 border-blue-600">Mesas</span>
        <Link href="/admin/integrations/orders" className="px-3 py-2 text-slate-600">
          Delivery{salao?.deliveryNew ? <span className="ml-1 rounded-full bg-red-600 text-white text-xs px-2">{salao.deliveryNew}</span> : null}
        </Link>
      </div>

      {salao && salao.sections.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {[{ id: null as string | null, name: 'Todas' }, ...salao.sections].map((s) => (
            <button
              key={s.id ?? 'all'}
              onClick={() => setSection(s.id)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${section === s.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {!salao ? (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[...Array(12)].map((_, i) => <div key={i} className="h-[88px] rounded-xl bg-slate-100 animate-pulse" />)}
        </div>
      ) : (
        <>
          <SalaoGrid salao={salao} section={section} onOpenTable={onTable} onOpenSession={(s) => router.push(`/vender/${s.id}`)} />
          {salao.tables.length === 0 && (
            <p className="text-sm text-slate-500">
              Nenhuma mesa cadastrada. <Link className="underline" href="/admin/tables">Cadastrar mesas</Link> ou use Comanda por nome.
            </p>
          )}
        </>
      )}
    </div>
  );
}
