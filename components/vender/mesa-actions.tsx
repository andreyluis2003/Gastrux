'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Salao } from '@/lib/vender/salao';
import type { ComandaLine } from '@/components/vender/use-comanda';

type Mode = 'menu' | 'transfer' | 'merge' | 'move';

/**
 * The comanda's ⋯ menu (spec 2026-10-07, 4.4): transfer the table, merge another comanda here, move
 * some lines. Needs the internet (a move is never queued).
 */
export function MesaActions({ sessionId, lines, onDone }: { sessionId: string; lines: ComandaLine[]; onDone: (goTo?: string) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [salao, setSalao] = useState<Salao | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function openMode(m: Mode) {
    setMode(m);
    if (m !== 'menu') {
      // Fresh every time: another device may have opened or closed a table meanwhile
      const res = await fetch('/api/vender/salao', { cache: 'no-store' });
      if (res.ok) setSalao(await res.json());
    }
  }

  async function post(path: string, body: unknown) {
    setBusy(true);
    try {
      const res = await fetch(`/api/comanda/sessions/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { res, out: await res.json().catch(() => ({})) };
    } catch {
      return { res: { ok: false } as Response, out: { error: 'Sem conexão: tente de novo' } };
    } finally {
      setBusy(false);
    }
  }

  async function transfer(tableId: string, tableNumber: number) {
    const { res, out } = await post(`${sessionId}/transfer`, { tableId });
    if (res.ok) { toast.success(`Comanda transferida para a mesa ${tableNumber}`); setMode(null); onDone(); return; }
    if (out.code === 'TABLE_BUSY' && window.confirm(`A mesa ${tableNumber} já tem comanda. Juntar as duas?`)) {
      const merged = await post(`${out.targetSessionId}/merge`, { sourceSessionId: sessionId });
      if (merged.res.ok) { toast.success(`Comandas juntadas na mesa ${tableNumber}`); setMode(null); onDone(`/vender/${out.targetSessionId}`); return; }
      toast.error(merged.out.error || 'Não foi possível juntar');
      return;
    }
    if (out.code !== 'TABLE_BUSY') toast.error(out.error || 'Não foi possível transferir');
  }

  async function merge(sourceSessionId: string, label: string) {
    if (!window.confirm(`Juntar ${label} nesta comanda?`)) return;
    const { res, out } = await post(`${sessionId}/merge`, { sourceSessionId });
    if (res.ok) { toast.success(`${label} juntada nesta comanda`); setMode(null); onDone(); return; }
    toast.error(out.error || 'Não foi possível juntar');
  }

  async function move(target: { tableId?: string; targetSessionId?: string }, label: string) {
    const { res, out } = await post(`${sessionId}/move-items`, { itemIds: picked, ...target });
    if (res.ok) {
      toast.success(`${picked.length} ${picked.length === 1 ? 'item transferido' : 'itens transferidos'} para ${label}`);
      setPicked([]); setMode(null); onDone();
      return;
    }
    toast.error(out.error || 'Não foi possível transferir os itens');
  }

  const others = salao
    ? [...salao.tables.filter((t) => t.session && t.session.id !== sessionId).map((t) => t.session!), ...salao.others.filter((s) => s.id !== sessionId)]
    : [];

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Mais ações da mesa" onClick={() => openMode('menu')}><MoreHorizontal className="h-6 w-6" /></Button>
      {mode && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={() => setMode(null)}>
          <div role="dialog" aria-label="Ações da mesa" className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[85vh] overflow-y-auto space-y-3" onClick={(e) => e.stopPropagation()}>
            {mode === 'menu' && (
              <>
                <h2 className="text-lg font-bold">Mesa</h2>
                <Button variant="outline" className="w-full justify-start" onClick={() => openMode('transfer')}>Transferir mesa</Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => openMode('merge')}>Juntar outra mesa ou comanda aqui</Button>
                <Button variant="outline" className="w-full justify-start" disabled={!lines.length} onClick={() => openMode('move')}>Transferir itens</Button>
              </>
            )}
            {mode === 'transfer' && (
              <>
                <h2 className="text-lg font-bold">Transferir para qual mesa?</h2>
                {!salao ? <p>Carregando...</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {salao.tables.filter((t) => t.session?.id !== sessionId).map((t) => (
                      <button key={t.id} disabled={busy} onClick={() => transfer(t.id, t.number)} className={`min-h-[64px] rounded-xl border-2 p-2 text-left ${t.session ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="font-bold">Mesa {t.number}</div>
                        <div className="text-xs">{t.session ? 'Ocupada (juntar)' : 'Livre'}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {mode === 'merge' && (
              <>
                <h2 className="text-lg font-bold">Juntar qual comanda aqui?</h2>
                {!salao ? <p>Carregando...</p> : others.length === 0 ? <p className="text-sm text-slate-500">Nenhuma outra comanda aberta.</p> : (
                  <div className="grid grid-cols-2 gap-2">
                    {others.map((s) => (
                      <button key={s.id} disabled={busy} onClick={() => merge(s.id, s.label)} className="min-h-[64px] rounded-xl border-2 border-emerald-300 bg-emerald-50 p-2 text-left">
                        <div className="font-bold">{s.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            {mode === 'move' && (
              <>
                <h2 className="text-lg font-bold">Quais itens?</h2>
                <ul className="space-y-1">
                  {lines.filter((l) => !l.pending).map((l) => (
                    <li key={l.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={picked.includes(l.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, l.id] : p.filter((x) => x !== l.id)))} />
                        {l.quantity}x {l.recipe.name}
                      </label>
                    </li>
                  ))}
                </ul>
                <h3 className="font-semibold pt-2">Para onde?</h3>
                {!salao ? <p>Carregando...</p> : (
                  <div className="grid grid-cols-3 gap-2">
                    {salao.tables.filter((t) => t.session?.id !== sessionId).map((t) => (
                      <button key={t.id} disabled={busy || !picked.length} onClick={() => move({ tableId: t.id }, `a mesa ${t.number}`)} className="min-h-[56px] rounded-xl border-2 border-slate-200 p-2 text-left disabled:opacity-50">
                        <div className="font-bold">Mesa {t.number}</div>
                        <div className="text-xs">{t.session ? 'Ocupada' : 'Livre'}</div>
                      </button>
                    ))}
                    {salao.others.filter((s) => s.id !== sessionId).map((s) => (
                      <button key={s.id} disabled={busy || !picked.length} onClick={() => move({ targetSessionId: s.id }, s.label)} className="min-h-[56px] rounded-xl border-2 border-slate-200 p-2 text-left disabled:opacity-50">
                        <div className="font-bold">{s.label}</div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <div className="flex justify-end"><Button variant="ghost" onClick={() => (mode === 'menu' ? setMode(null) : setMode('menu'))}>Voltar</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
