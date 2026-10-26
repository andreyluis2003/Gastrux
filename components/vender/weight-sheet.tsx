'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { brl } from '@/components/caixa/money';
import { kgLabel, parseWeightGrams, weightLineCents } from '@/lib/comanda/weight';

/**
 * The weight of a product sold by weight (spec 2026-10-25 venda-por-peso): the cashier types what the
 * scale shows ("0,350", "350 g") and sees the value before adding. The server prices the line again.
 */
export function WeightSheet({ name, pricePerKg, onAdd, onClose }: {
  name: string;
  pricePerKg: number | string;
  onAdd: (grams: number) => Promise<boolean>;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const grams = parseWeightGrams(text);
  const add = async () => {
    if (!grams || saving) return;
    setSaving(true);
    const ok = await onAdd(grams);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Peso de ${name}`}
        className="bg-white w-full lg:max-w-sm rounded-t-2xl lg:rounded-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="text-sm text-slate-500">{brl(Math.round(Number(pricePerKg) * 100))}/kg</p>
        </div>
        <div>
          <label htmlFor="weight-input" className="text-xs font-semibold text-slate-500">Peso (kg ou g)</label>
          <Input
            id="weight-input"
            autoFocus
            inputMode="decimal"
            placeholder="Ex.: 0,350 ou 350 g"
            className="text-2xl h-14"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          />
          <p className="text-sm mt-2 min-h-[1.25rem]">
            {grams
              ? <>{kgLabel(grams)} = <strong>{brl(weightLineCents(pricePerKg, grams))}</strong></>
              : text.trim() ? <span className="text-red-600">Peso inválido (de 1 g a 50 kg)</span> : null}
          </p>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Voltar</Button>
          <Button disabled={!grams || saving} onClick={add}>Lançar</Button>
        </div>
      </div>
    </div>
  );
}
