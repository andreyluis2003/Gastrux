'use client';

import { useState } from 'react';
import { DENOMINATIONS_CENTS } from '@/lib/caixa/rules';
import { brl } from './money';

/** Optional note-and-coin calculator: quantities per denomination -> total in cents. */
export function CashCounter({ onTotal }: { onTotal: (cents: number) => void }) {
  const [qty, setQty] = useState<Record<number, string>>({});
  const total = DENOMINATIONS_CENTS.reduce((s, d) => s + d * (parseInt(qty[d] || '0', 10) || 0), 0);
  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="grid grid-cols-3 gap-2 text-sm">
        {DENOMINATIONS_CENTS.map((d) => (
          <label key={d} className="flex items-center gap-1">
            <span className="w-16 text-right">{brl(d)}</span> ×
            <input aria-label={`Quantidade de ${brl(d)}`} inputMode="numeric" className="w-14 border rounded px-1 h-8" value={qty[d] ?? ''}
              onChange={(e) => setQty((p) => ({ ...p, [d]: e.target.value.replace(/\D/g, '') }))} />
          </label>
        ))}
      </div>
      <div className="flex justify-between items-center">
        <span className="text-sm">Total contado: <strong>{brl(total)}</strong></span>
        <button type="button" className="text-sm underline" onClick={() => onTotal(total)}>Usar este valor</button>
      </div>
    </div>
  );
}
