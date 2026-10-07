'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { useComanda, type ComandaLine } from '@/components/vender/use-comanda';
import { MenuPanel } from '@/components/vender/menu-panel';
import { ItemSheet } from '@/components/vender/item-sheet';
import { ComandaPanel } from '@/components/vender/comanda-panel';
import { CloseBillDialog } from '@/components/vender/close-bill-dialog';
import { isUnsent, openFor, sessionLabel, type MenuEntry } from '@/lib/vender/rules';

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

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const set = () => setDesktop(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

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
      sentToKitchenAt={s.sentToKitchenAt}
      totalCents={c.totalCents}
      newCount={c.newCount}
      isClosed={c.isClosed}
      onLine={(line) => { setShowList(false); setSheet({ line }); }}
      onSend={onSend}
      onConta={() => { setShowList(false); setShowConta(true); }}
    />
  );

  const sheetLine = sheet?.line;
  const sheetSent = sheetLine ? !isUnsent(sheetLine, s.sentToKitchenAt) : false;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto pb-28 lg:pb-6">
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" aria-label="Voltar ao salão" onClick={() => router.push('/vender')}><ArrowLeft className="h-6 w-6" /></Button>
        <div>
          <h1 className="text-2xl font-bold">{sessionLabel(s)}</h1>
          <p className="text-sm text-slate-500">
            {s.openedAt ? `aberta há ${openFor(s.openedAt, new Date())}` : ''}{s.user?.name ? ` · ${s.user.name}` : ''}
            {c.isClosed ? ' · conta fechada' : ''}
          </p>
        </div>
      </div>

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
        <Button variant="outline" onClick={() => setShowList(true)}>Ver comanda</Button>
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
        <CloseBillDialog
          sessionId={sessionId}
          totalCents={c.totalCents}
          // A close made offline counts as closed here too: the dialog must not offer to close (and charge) again
          status={c.isClosed ? 'CLOSED' : s.status}
          hasItems={c.lines.length > 0}
          mutate={c.mutate}
          onClosed={() => { c.refresh(); }}
          onCancel={() => setShowConta(false)}
        />
      )}
    </div>
  );
}
