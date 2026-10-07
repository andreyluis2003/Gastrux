'use client';

import { useRef, useState } from 'react';
import { MoreHorizontal, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { brl } from '@/components/caixa/money';
import { toCents } from '@/lib/comanda/line-total';
import type { MenuEntry, MenuGroup } from '@/lib/vender/rules';

const HOLD_MS = 500;

/** Menu by category (spec 2026-10-07, 4.2): a tap adds one unit; holding or "⋯" opens the item sheet first */
export function MenuPanel({ groups, disabled, onTap, onDetails }: {
  groups: MenuGroup[];
  disabled: boolean;
  onTap: (entry: MenuEntry) => void;
  onDetails: (entry: MenuEntry) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const current = active ?? groups[0]?.id;
  const query = q.trim().toLowerCase();
  const shown = query
    ? groups.map((g) => ({ ...g, items: g.items.filter((i) => i.name.toLowerCase().includes(query)) })).filter((g) => g.items.length)
    : groups.filter((g) => g.id === current);

  const press = (entry: MenuEntry) => {
    held.current = false;
    holdTimer.current = setTimeout(() => { held.current = true; onDetails(entry); }, HOLD_MS);
  };
  const release = (entry: MenuEntry) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (!held.current && !disabled) onTap(entry);
    held.current = true;
  };
  const cancel = () => { if (holdTimer.current) clearTimeout(holdTimer.current); held.current = true; };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input className="pl-9" placeholder="Buscar no cardápio" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!query && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setActive(g.id)}
              className={`px-3 py-2 rounded-full text-sm whitespace-nowrap ${current === g.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}
            >
              {g.emoji ? `${g.emoji} ` : ''}{g.name}
            </button>
          ))}
        </div>
      )}
      {shown.map((g) => (
        <div key={g.id}>
          {query && <h3 className="text-xs font-semibold text-slate-500 mb-1">{g.name}</h3>}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
            {g.items.map((entry) => (
              <div key={entry.id} className="relative">
                <button
                  disabled={disabled}
                  onPointerDown={() => press(entry)}
                  onPointerUp={() => release(entry)}
                  onPointerLeave={cancel}
                  onPointerCancel={cancel}
                  onContextMenu={(e) => e.preventDefault()}
                  // Pointer events drive tap/hold; the keyboard (a computer at the counter) adds with Enter or Space
                  onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); onTap(entry); } }}
                  className="w-full min-h-[72px] rounded-xl border bg-white p-3 pr-9 text-left active:bg-blue-50 disabled:opacity-50 select-none"
                >
                  <div className="font-semibold text-sm leading-tight line-clamp-2">{entry.name}</div>
                  <div className="text-sm text-emerald-700 mt-1">{brl(toCents(entry.price))}</div>
                </button>
                <button
                  aria-label={`Detalhes de ${entry.name}`}
                  disabled={disabled}
                  onClick={() => onDetails(entry)}
                  className="absolute top-1 right-1 p-2 text-slate-400 hover:text-slate-700"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      {groups.length === 0 && <p className="text-sm text-slate-500">Cardápio vazio. Cadastre os itens em Cardápio digital.</p>}
    </div>
  );
}
