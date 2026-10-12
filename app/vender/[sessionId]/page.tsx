'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { useComanda, type ComandaLine } from '@/components/vender/use-comanda';
import { MenuPanel } from '@/components/vender/menu-panel';
import { ItemSheet } from '@/components/vender/item-sheet';
import { ComandaPanel } from '@/components/vender/comanda-panel';
import { ContaDialog } from '@/components/vender/conta-dialog';
import { MesaActions } from '@/components/vender/mesa-actions';
import { ReopenBill } from '@/components/vender/reopen-bill';
import { SALE_TOAST } from '@/components/comanda/counter-sale';
import { isUnsent, openFor, openedLabel, sessionLabel, type MenuEntry } from '@/lib/vender/rules';

const DESKTOP = '(min-width: 1024px)';

/** The quick comanda (spec 2026-10-07, 4.2) */
export default function ComandaRapidaPage() {
  const router = useRouter();
  const sessionId = String(useParams()?.sessionId ?? '');
  const c = useComanda(sessionId);
  const [sheet, setSheet] = useState<{ entry?: MenuEntry; line?: ComandaLine } | null>(null);
  const [showList, setShowList] = useState(false);
  const [showConta, setShowConta] = useState(false);
  const [desktop, setDesktop] = useState(true);
  const [attending, setAttending] = useState(false);

  // The balcão's "Venda registrada" notice does not cover this comanda (2026-10-12)
  useEffect(() => { toast.dismiss(SALE_TOAST); }, []);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const set = () => setDesktop(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  // A tap on a free table opens its comanda at once: left with nothing on it (no item, none waiting
  // offline), it frees the table when the waiter leaves (owner, 2026-10-12). The server checks again
  // that it is empty, so another device or a QR order at the same time never loses anything.
  const emptyRef = useRef(false);
  emptyRef.current = c.session?.status === 'OPEN' && c.lines.length === 0 && c.online;
  const releasedRef = useRef(false);
  const releaseIfEmpty = useCallback(async () => {
    if (!emptyRef.current || releasedRef.current) return;
    releasedRef.current = true;
    await fetch(`/api/comanda/sessions/${sessionId}/release`, { method: 'POST', keepalive: true }).catch(() => null);
  }, [sessionId]);
  useEffect(() => {
    const onHide = () => { void releaseIfEmpty(); };
    window.addEventListener('pagehide', onHide);
    return () => { window.removeEventListener('pagehide', onHide); void releaseIfEmpty(); };
  }, [releaseIfEmpty]);
  // "Atendido" (owner, 2026-10-12): the staff went to the table; the call leaves the map without a payment
  async function markAttended() {
    setAttending(true);
    try {
      const res = await fetch(`/api/comanda/sessions/${sessionId}/waiter-attended`, { method: 'POST' });
      if (!res.ok) { toast.error((await res.json().catch(() => ({}))).error || 'Não foi possível marcar como atendido'); return; }
      c.refresh();
    } catch {
      toast.error('Sem conexão: tente de novo');
    } finally {
      setAttending(false);
    }
  }
  async function backToSalao() {
    await releaseIfEmpty();
    router.push('/vender');
  }

  if (c.loading) return <div className="p-6">Carregando...</div>;
  if (!c.session) {
    return (
      <div className="p-6">
        Comanda não encontrada. <Button variant="link" onClick={() => router.push('/vender')}>Voltar ao salão</Button>
      </div>
    );
  }

  const s = c.session;
  async function onSend() {
    const ok = await c.sendToKitchen();
    // On a phone the waiter's next step is another table; on the counter computer, stay (spec 4.2)
    if (ok && !desktop) router.push('/vender');
  }

  const panel = (
    <ComandaPanel
      lines={c.lines}
      totalCents={c.totalCents}
      newCount={c.newCount}
      isClosed={c.isClosed}
      onLine={(line) => { setShowList(false); setSheet({ line }); }}
      onSend={onSend}
      onConta={() => { setShowList(false); setShowConta(true); }}
    />
  );

  const sheetLine = sheet?.line;
  const sheetSent = sheetLine ? !isUnsent(sheetLine) : false;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto pb-28 lg:pb-6">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" aria-label="Voltar ao salão" onClick={backToSalao}><ArrowLeft className="h-6 w-6" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{sessionLabel(s)}</h1>
          <p className="text-sm text-slate-500">
            {s.openedAt ? openedLabel(s.openedAt, new Date()) : ''}{s.user?.name ? ` · ${s.user.name}` : ''}
            {c.isClosed ? ' · conta fechada' : ''}
          </p>
        </div>
        {!c.isClosed && (
          <div className="ml-auto">
            <MesaActions sessionId={sessionId} lines={c.lines} onDone={(goTo) => (goTo ? router.push(goTo) : c.refresh())} />
          </div>
        )}
        {/* Only a bill closed with its payments (not a cancelled comanda) can be reopened */}
        {s.status === 'CLOSED' && (
          <div className="ml-auto">
            <ReopenBill sessionId={sessionId} onDone={() => c.refresh()} />
          </div>
        )}
      </div>

      {/* Pay at the table: the table asked for the waiter to pay; "Atendido" dismisses it without a payment */}
      {s.payAtWaiterRequestedAt && !c.isClosed && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="font-semibold">Esta mesa chamou o garçom para pagar · {openFor(s.payAtWaiterRequestedAt, new Date())}</span>
          <Button size="sm" variant="outline" disabled={attending} onClick={markAttended}>Atendido</Button>
        </div>
      )}

      {(c.staleSince || !c.online) && (
        <div role="status" className="mb-4 rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          Sem internet: esta é a comanda como estava
          {c.staleSince ? ` às ${new Date(c.staleSince).toLocaleTimeString('pt-BR')}` : ' na última atualização'}. O que você
          fizer agora fica guardado neste aparelho e é enviado quando a conexão voltar.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MenuPanel groups={c.groups} disabled={c.isClosed} onTap={c.quickAdd} onDetails={(entry) => setSheet({ entry })} />
        </div>
        <div className="hidden lg:block">
          <div className="sticky top-4 rounded-xl border bg-white p-4">{panel}</div>
        </div>
      </div>

      {/* Phone: fixed bar (spec 4.2) */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t p-3 flex items-center gap-2">
        <button className="flex-1 text-left" onClick={() => setShowList(true)}>
          <div className="text-xs text-slate-500 flex items-center gap-1">{c.lines.length} {c.lines.length === 1 ? 'item' : 'itens'} <ChevronUp className="h-3 w-3" /></div>
          <div className="text-lg font-bold">{brl(c.totalCents)}</div>
        </button>
        <Button disabled={c.newCount === 0 || c.isClosed} onClick={onSend}>Enviar{c.newCount ? ` (${c.newCount})` : ''}</Button>
        {/* Conta straight from the bar (2026-10-12: it took "Ver comanda" first); the left side opens the list */}
        <Button variant="outline" disabled={c.lines.length === 0} onClick={() => setShowConta(true)}>Conta</Button>
      </div>

      {showList && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setShowList(false)}>
          <div className="bg-white w-full rounded-t-2xl p-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>{panel}</div>
        </div>
      )}

      {sheet?.entry && (
        <ItemSheet
          title={sheet.entry.name}
          modifiers={c.modifiers}
          initial={{ quantity: 1, modifierIds: [], notes: '' }}
          sent={false}
          saveLabel="Lançar"
          onSave={(d) => c.addWithDetails(sheet.entry!, d)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheetLine && (
        <ItemSheet
          title={sheetLine.recipe.name}
          modifiers={c.modifiers}
          initial={{
            quantity: sheetLine.quantity,
            modifierIds: (sheetLine.modifiers ?? []).map((m) => m.modifierId).filter((x): x is string => !!x),
            notes: sheetLine.specialInstructions ?? '',
          }}
          sent={sheetSent}
          saveLabel="Salvar"
          onSave={(d) => c.saveLine(sheetLine, d)}
          onRemove={c.isClosed ? undefined : async () => { await c.removeLine(sheetLine); setSheet(null); }}
          onClose={() => setSheet(null)}
        />
      )}

      {showConta && (
        <ContaDialog sessionId={sessionId} onClosed={() => { c.refresh(); }} onCancel={() => { setShowConta(false); c.refresh(); }} />
      )}
    </div>
  );
}
