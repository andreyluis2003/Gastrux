'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface CountPart {
  recipeId: string;
  quantity: number;
}

/**
 * "Na contagem do dia, conta como" (spec 2026-10-26 lanchonete): a combo or a cento of salgados counts as
 * items of the daily count. Shown only when the restaurant has counted items.
 */
export function CountPartsField({ recipeId, value, onChange }: { recipeId: string; value: CountPart[]; onChange: (v: CountPart[]) => void }) {
  const [counted, setCounted] = useState<Array<{ id: string; name: string }> | null>(null);

  useEffect(() => {
    fetch('/api/recipes', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => setCounted((Array.isArray(rows) ? rows : []).filter((r) => r.dailyCount && r.active !== false && r.id !== recipeId).map((r) => ({ id: r.id, name: r.name }))))
      .catch(() => setCounted([]));
  }, [recipeId]);

  if (!counted || (counted.length === 0 && value.length === 0)) return null;
  const free = counted.filter((c) => !value.some((v) => v.recipeId === c.id));
  const set = (i: number, patch: Partial<CountPart>) => onChange(value.map((v, j) => (j === i ? { ...v, ...patch } : v)));

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div>
        <p className="font-medium">Na contagem do dia, conta como</p>
        <p className="text-sm text-muted-foreground">
          Para combos e centos: cada venda deste item entra como vendido nos itens da contagem. Ex.: um combo com coxinha conta 1 Coxinha; um cento, 100.
        </p>
      </div>
      {value.map((p, i) => (
        <div key={p.recipeId} className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={1000}
            step={1}
            aria-label="Quantidade na contagem"
            className="w-24"
            value={p.quantity}
            onChange={(e) => set(i, { quantity: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
          />
          <span className="flex-1 text-sm">{counted.find((c) => c.id === p.recipeId)?.name ?? 'Item que saiu da contagem'}</span>
          <Button type="button" variant="ghost" size="sm" aria-label="Tirar" onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {free.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            aria-label="Adicionar item da contagem"
            className="border rounded-md h-9 px-2 text-sm flex-1"
            value=""
            onChange={(e) => e.target.value && onChange([...value, { recipeId: e.target.value, quantity: 1 }])}
          >
            <option value="">Adicionar item da contagem…</option>
            {free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <Plus className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
