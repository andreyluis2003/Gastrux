'use client';

import { Send, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { lineTotalCents } from '@/lib/comanda/line-total';
import { isUnsent } from '@/lib/vender/rules';
import type { ComandaLine } from '@/components/vender/use-comanda';

/** The comanda list with total, "Enviar para cozinha (N)" and "Conta" (spec 2026-10-07, 4.2) */
export function ComandaPanel({ lines, totalCents, newCount, isClosed, onLine, onSend, onConta }: {
  lines: ComandaLine[];
  totalCents: number;
  newCount: number;
  isClosed: boolean;
  onLine: (line: ComandaLine) => void;
  onSend: () => void;
  onConta: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {lines.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhum item. Toque no cardápio para lançar.</p>
      ) : (
        <ul className="space-y-2">
          {lines.map((l) => {
            const fresh = isUnsent(l);
            return (
              <li key={l.id}>
                <button
                  onClick={() => !l.pending && onLine(l)}
                  className={`w-full text-left rounded-lg p-3 border ${fresh ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-sm">{l.quantity}x {l.recipe.name}</span>
                    <span className="text-sm">{brl(lineTotalCents(l.price, l.quantity, (l.modifiers ?? []).map((m) => m.priceAdjustment)))}</span>
                  </div>
                  {(l.modifiers ?? []).map((m, i) => <div key={i} className="text-xs text-slate-500">+ {m.modifier?.name ?? 'Adicional'}</div>)}
                  {l.specialInstructions && <div className="text-xs text-slate-700 italic">“{l.specialInstructions}”</div>}
                  <div className="text-xs mt-1 text-slate-500">{l.pending ? 'guardado neste aparelho' : fresh ? 'a enviar' : 'na cozinha'}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex justify-between items-center border-t pt-3">
        <span className="font-semibold">Total</span>
        <span className="text-2xl font-bold text-emerald-700">{brl(totalCents)}</span>
      </div>
      <Button size="lg" className="gap-2" disabled={newCount === 0 || isClosed} onClick={onSend}>
        <Send className="h-5 w-5" /> Enviar para cozinha{newCount ? ` (${newCount})` : ''}
      </Button>
      <Button size="lg" variant="outline" className="gap-2" disabled={lines.length === 0} onClick={onConta}>
        <Receipt className="h-5 w-5" /> Conta
      </Button>
    </div>
  );
}
