'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { brl } from '@/components/caixa/money';
import { toCents } from '@/lib/comanda/line-total';
import type { LineDetails, Modifier } from '@/components/vender/use-comanda';

/**
 * The item sheet (spec 2026-10-07, 4.2): quantity, modifiers, note. For a line the kitchen already
 * has, only the details and "Remover com motivo".
 */
export function ItemSheet({ title, modifiers, initial, sent, saveLabel, onSave, onRemove, onClose }: {
  title: string;
  modifiers: Modifier[];
  initial: LineDetails;
  sent: boolean;
  saveLabel: string;
  onSave: (d: LineDetails) => Promise<boolean>;
  onRemove?: () => void;
  onClose: () => void;
}) {
  const [d, setD] = useState<LineDetails>(initial);
  const [saving, setSaving] = useState(false);
  const byCategory = modifiers.reduce((acc, m) => {
    const c = m.category || 'Adicionais';
    (acc[c] ||= []).push(m);
    return acc;
  }, {} as Record<string, Modifier[]>);
  const toggle = (id: string) =>
    setD((x) => ({ ...x, modifierIds: x.modifierIds.includes(id) ? x.modifierIds.filter((i) => i !== id) : [...x.modifierIds, id] }));

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="bg-white w-full lg:max-w-lg rounded-t-2xl lg:rounded-2xl p-5 max-h-[85vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{title}</h2>

        {sent ? (
          <p className="text-sm text-slate-600">A cozinha já recebeu este item. Para tirar da conta, use “Remover com motivo”.</p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <Button variant="outline" size="icon" aria-label="Menos" onClick={() => setD((x) => ({ ...x, quantity: Math.max(1, x.quantity - 1) }))}><Minus className="h-4 w-4" /></Button>
              <span className="text-2xl font-bold w-10 text-center">{d.quantity}</span>
              <Button variant="outline" size="icon" aria-label="Mais" onClick={() => setD((x) => ({ ...x, quantity: x.quantity + 1 }))}><Plus className="h-4 w-4" /></Button>
            </div>

            {Object.entries(byCategory).map(([cat, mods]) => (
              <div key={cat}>
                <p className="text-xs font-semibold text-slate-500 mb-1">{cat}</p>
                <div className="flex flex-wrap gap-2">
                  {mods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => toggle(m.id)}
                      className={`px-3 py-2 rounded-lg text-sm border ${d.modifierIds.includes(m.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
                    >
                      {m.name}{toCents(m.priceAdjustment) ? ` +${brl(toCents(m.priceAdjustment))}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <label htmlFor="item-notes" className="text-xs font-semibold text-slate-500">Observação</label>
              <textarea
                id="item-notes"
                maxLength={140}
                className="w-full border rounded-md p-2 text-sm"
                placeholder="Ex.: sem cebola, bem passado"
                value={d.notes}
                onChange={(e) => setD((x) => ({ ...x, notes: e.target.value }))}
              />
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-2 justify-end">
          {onRemove && <Button variant="outline" className="text-red-600 mr-auto" onClick={onRemove}>{sent ? 'Remover com motivo' : 'Remover'}</Button>}
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          {!sent && (
            <Button disabled={saving} onClick={async () => { setSaving(true); const ok = await onSave(d); setSaving(false); if (ok) onClose(); }}>
              {saveLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
