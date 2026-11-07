'use client';

import { cn } from '@/lib/utils';

/** Monday first, as restaurants plan the week; values are 0 (Sunday) ... 6 (Saturday) */
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * The weekdays an item is offered to customers (spec 2026-11-06 cardapio-rapido §4). An empty list means every
 * day: the screen shows all seven on.
 */
export function DayPicker({ value, onChange }: { value: number[]; onChange: (days: number[]) => void }) {
  const on = (d: number) => !value.length || value.includes(d);
  const toggle = (d: number) => {
    const current = value.length ? value : ORDER;
    const next = current.includes(d) ? current.filter((x) => x !== d) : [...current, d];
    // Every day stored as empty; turning the last one off is not allowed (an item never offered is "Esgotar")
    if (!next.length) return;
    onChange(next.length === 7 ? [] : next.sort((a, b) => a - b));
  };
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Dias da semana">
      {ORDER.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={on(d)}
          onClick={() => toggle(d)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium',
            on(d) ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-600'
          )}
        >
          {LABEL[d]}
        </button>
      ))}
    </div>
  );
}
